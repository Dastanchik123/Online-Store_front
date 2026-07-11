// ─── SWR-кэш GET-ответов (stale-while-revalidate) ───────────────────
// Повторное открытие страницы рисуется мгновенно из кэша, свежие данные
// подтягиваются фоном. Любая мутация (POST/PUT/DELETE) сбрасывает кэш ресурса.
const API_CACHE_PREFIX = "apiCache:";
const API_CACHE_FRESH_MS = 15_000; // младше — сеть вообще не трогаем
const API_CACHE_MAX_STALE_MS = 24 * 60 * 60 * 1000;
const API_CACHEABLE: RegExp[] = [
  /^\/products(\?|$)/,
  /^\/categories(\?|$)/,
  /^\/settings\/public$/,
  /^\/banners(\?|$)/,
  /^\/coupons(\?|$)/,
  /^\/blog(\?|$)/,
];
const memApiCache = new Map<string, { t: number; data: any }>();

const isCacheableEndpoint = (endpoint: string) =>
  API_CACHEABLE.some((re) => re.test(endpoint));

const readApiCache = (endpoint: string): { t: number; data: any } | null => {
  const hit = memApiCache.get(endpoint);
  if (hit) return hit;
  try {
    const raw = localStorage.getItem(API_CACHE_PREFIX + endpoint);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.t > API_CACHE_MAX_STALE_MS) return null;
    memApiCache.set(endpoint, parsed);
    return parsed;
  } catch {
    return null;
  }
};

const writeApiCache = (endpoint: string, data: any) => {
  const entry = { t: Date.now(), data };
  memApiCache.set(endpoint, entry);
  try {
    localStorage.setItem(API_CACHE_PREFIX + endpoint, JSON.stringify(entry));
  } catch {
    // квота localStorage — живём только с памятью
  }
};

// POST /products → пометить '/products*' устаревшими; '/banners-admin' и
// '/blog-admin' метят публичные '/banners*' и '/blog*'.
// Не удаляем записи, а «состариваем»: страница по-прежнему рисуется мгновенно
// из кеша, но следующий GET обязательно уйдёт в сеть и подтянет свежее фоном.
const markApiCacheStale = (mutatedEndpoint: string) => {
  const seg = (mutatedEndpoint.split("?")[0].split("/")[1] || "").replace(/-admin$/, "");
  if (!seg) return;
  const prefix = "/" + seg;
  const staleT = Date.now() - API_CACHE_FRESH_MS;
  for (const key of [...memApiCache.keys()]) {
    if (key.startsWith(prefix)) {
      const hit = memApiCache.get(key);
      if (hit) memApiCache.set(key, { ...hit, t: staleT });
    }
  }
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(API_CACHE_PREFIX + prefix)) {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        localStorage.setItem(k, JSON.stringify({ ...parsed, t: staleT }));
      }
    }
  } catch {}
};

export const useApi = () => {
  const config = useRuntimeConfig();
  const baseURL = config.public.apiBase;

  const getAuthToken = () => {
    if (import.meta.client) {
      return localStorage.getItem("auth_token");
    }
    return null;
  };

  // ─── Local-first (Electron): запрос сначала идёт в локальную SQLite ───
  const getElectronAPI = (): any =>
    import.meta.client ? (window as any).electronAPI : null;

  // Вызов локального роутера в main-процессе.
  // phase 'pre' — до сети (POS-критичные маршруты), 'fallback' — сеть упала.
  const tryLocalApi = async (
    endpoint: string,
    options: any,
    phase: "pre" | "fallback",
  ) => {
    const electron = getElectronAPI();
    if (!electron?.localApi) return null;
    if (options.body instanceof FormData) return null; // файлы — только сеть

    try {
      const result = await electron.localApi({
        endpoint,
        method: options.method || "GET",
        body: options.body || null,
        phase,
      });
      if (!result?.handled) return null;

      if (result.status >= 400) {
        // бросаем ошибку в формате $fetch, чтобы существующие catch работали
        const err: any = new Error(result.data?.message || "Local API error");
        err.status = result.status;
        err.statusCode = result.status;
        err.data = result.data;
        throw err;
      }
      return { data: result.data };
    } catch (e: any) {
      if (e?.status) throw e; // осмысленная ошибка локальной валидации — наружу
      return null; // сбой IPC — молча уходим в сеть
    }
  };

  const apiFetch = async (endpoint: string, options: any = {}) => {
    // onRefresh — колбек страницы: вызывается со свежими данными, когда
    // фоновое SWR-обновление завершилось (в $fetch не передаётся)
    const { onRefresh, ...fetchOptions } = options;
    options = fetchOptions;

    // 1) POS-критичные маршруты обслуживаются локально (работают без сети)
    const localPre = await tryLocalApi(endpoint, options, "pre");
    if (localPre) return localPre.data;

    const method = String(options.method || "GET").toUpperCase();

    const networkFetch = async () => {
      const token = getAuthToken();
      const headers: any = {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(options.headers || {}),
      };

      if (options.body instanceof FormData) {
        delete headers["Content-Type"];
      }

      if (
        headers["Content-Type"] === undefined ||
        headers["Content-Type"] === null
      ) {
        delete headers["Content-Type"];
      }

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      return await $fetch(`${baseURL}${endpoint}`, {
        ...options,
        headers,
        method: options.method || "GET",
      });
    };

    // 2) SWR-кэш: кэшируемые GET рисуются мгновенно, обновляются фоном
    const swrEligible =
      import.meta.client && method === "GET" && isCacheableEndpoint(endpoint);
    if (swrEligible) {
      const cached = readApiCache(endpoint);
      if (cached) {
        if (Date.now() - cached.t >= API_CACHE_FRESH_MS) {
          // устарел — отдаём кэш сразу, свежее подтянем в фоне
          // и отдадим странице через onRefresh, чтобы она перерисовалась
          networkFetch()
            .then((data) => {
              writeApiCache(endpoint, data);
              if (typeof onRefresh === "function") onRefresh(data);
            })
            .catch(() => {});
        }
        return cached.data;
      }
    }

    try {
      const response = await networkFetch();

      if (swrEligible) writeApiCache(endpoint, response);
      // мутация → пометить кэш ресурса устаревшим: список отрисуется
      // мгновенно из кеша, а свежие данные подтянутся фоном
      if (import.meta.client && method !== "GET") markApiCacheStale(endpoint);

      return response;
    } catch (error: any) {
      // 2) Сеть недоступна / сервер лежит → пробуем локальную SQLite
      const isNetworkFailure = !error.status || error.status >= 502;
      if (isNetworkFailure) {
        const localFallback = await tryLocalApi(endpoint, options, "fallback");
        if (localFallback) {
          console.warn(`[useApi] Offline fallback → SQLite: ${endpoint}`);
          return localFallback.data;
        }
      }

      if (error.status === 401) {
        
        if (import.meta.client) {
          localStorage.removeItem("auth_token");
          localStorage.removeItem("user");
          navigateTo("/auth/login");
        }
      } else if (error.status === 404) {
        
        console.error("Resource not found:", endpoint);
      } else if (error.status === 422) {
        
        console.error("Validation error:", error.data?.errors);
      } else if (error.status === 429) {
        
        const retryAfter = error.response?.headers?.get("Retry-After");
        console.error(`Rate limited. Try again after ${retryAfter || 60}s`);
      } else if (error.status === 403) {
        
        console.error("Access forbidden");
      } else if (error.status >= 500) {
        
        console.error("Server error:", error.data?.message);
      }

      
      throw error;
    }
  };

  const downloadFile = async (endpoint: string, fileName: string) => {
    const token = getAuthToken();
    const headers: any = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${baseURL}${endpoint}`, {
        headers,
      });

      if (!response.ok) {
        
        const errorData = await response.json().catch(() => null);
        const errorMessage =
          errorData?.message || `Server error: ${response.status}`;
        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download error:", error);
      throw error;
    }
  };

  const printFile = async (endpoint: string) => {
    const token = getAuthToken();
    const headers: any = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${baseURL}${endpoint}`, {
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errorMessage =
          errorData?.message || `Server error: ${response.status}`;
        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.src = url;
      document.body.appendChild(iframe);

      iframe.onload = () => {
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (e) {
            console.error("Print error:", e);
            window.open(url, "_blank");
          }
        }, 500);
      };

      
      setTimeout(() => {
        try {
          document.body.removeChild(iframe);
          window.URL.revokeObjectURL(url);
        } catch (e) {}
      }, 60000);
    } catch (error) {
      console.error("Print error:", error);
      throw error;
    }
  };

  return {
    apiFetch,
    downloadFile,
    printFile,
    baseURL,
    getAuthToken,
  };
};
