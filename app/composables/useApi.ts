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
  // /coupons не кэшируем: это админский список, после создания/удаления
  // купона страница получала из кэша старый список
  /^\/blog(\?|$)/,
];
const memApiCache = new Map<string, { t: number; data: any }>();

const isCacheableEndpoint = (endpoint: string) =>
  API_CACHEABLE.some((re) => re.test(endpoint));

// Кэш раздельный для каждого пользователя: ответы для персонала (например,
// с закупочной ценой) не должны достаться следующему человеку за тем же
// компьютером. Ключ: "<id пользователя | guest>:<endpoint>".
const cacheScope = (): string => {
  try {
    return String(JSON.parse(localStorage.getItem("user") || "null")?.id ?? "guest");
  } catch {
    return "guest";
  }
};
const cacheKey = (endpoint: string) => `${cacheScope()}:${endpoint}`;
// endpoint из ключа "<scope>:<endpoint>"
const endpointOfKey = (key: string) => key.slice(key.indexOf(":") + 1);

const readApiCache = (endpoint: string): { t: number; data: any } | null => {
  const key = cacheKey(endpoint);
  const hit = memApiCache.get(key);
  if (hit) return hit;
  try {
    const raw = localStorage.getItem(API_CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.t > API_CACHE_MAX_STALE_MS) return null;
    memApiCache.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
};

const writeApiCache = (endpoint: string, data: any) => {
  const key = cacheKey(endpoint);
  const entry = { t: Date.now(), data };
  memApiCache.set(key, entry);
  try {
    localStorage.setItem(API_CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // квота localStorage — живём только с памятью
  }
};

// Выход из аккаунта — кэш ответов удаляется целиком
export const clearApiCache = () => {
  memApiCache.clear();
  if (typeof localStorage === "undefined") return;
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(API_CACHE_PREFIX)) localStorage.removeItem(k);
    }
  } catch {}
};

// POST /products → пометить '/products*' устаревшими; '/banners-admin' и
// '/blog-admin' метят публичные '/banners*' и '/blog*'.
// Не удаляем записи, а «состариваем»: страница по-прежнему рисуется мгновенно
// из кеша, но следующий GET обязательно уйдёт в сеть и подтянет свежее фоном.
// Некоторые ресурсы меняют товары не через /products напрямую: закупка
// обновляет остаток/цену, продажа и инвентаризация — остаток
const CROSS_INVALIDATE: Record<string, string[]> = {
  purchases: ["products"],
  pos: ["products"],
  orders: ["products"],
  inventory: ["products"],
  "self-service": ["products"],
};

const markApiCacheStale = (mutatedEndpoint: string) => {
  const seg = (mutatedEndpoint.split("?")[0].split("/")[1] || "").replace(/-admin$/, "");
  if (!seg) return;
  const prefixes = ["/" + seg, ...(CROSS_INVALIDATE[seg] || []).map((s) => "/" + s)];
  const staleT = Date.now() - API_CACHE_FRESH_MS;
  for (const key of [...memApiCache.keys()]) {
    if (prefixes.some((p) => endpointOfKey(key).startsWith(p))) {
      const hit = memApiCache.get(key);
      if (hit) memApiCache.set(key, { ...hit, t: staleT });
    }
  }
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (
        k &&
        k.startsWith(API_CACHE_PREFIX) &&
        prefixes.some((p) => endpointOfKey(k.slice(API_CACHE_PREFIX.length)).startsWith(p))
      ) {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        localStorage.setItem(k, JSON.stringify({ ...parsed, t: staleT }));
      }
    }
  } catch {}
};

// В same-origin сборке (build:laravel) apiBase — относительный путь "/api",
// это корректно для fetch() в браузере, но Node-процесс Electron (axios в
// labelTemplateSync.cjs) не может резолвить относительный URL без известного origin
export const resolveApiBase = (base: string): string => {
  if (!base || typeof window === "undefined") return base;
  try {
    return new URL(base, window.location.origin).toString().replace(/\/$/, "");
  } catch {
    return base;
  }
};

export const useApi = () => {
  const config = useRuntimeConfig();
  const baseURL = config.public.apiBase;
  const connection = import.meta.client ? useServerConnection() : null;

  const getAuthToken = () => {
    if (import.meta.client) {
      return localStorage.getItem("auth_token");
    }
    return null;
  };

  const apiFetch = async (endpoint: string, options: any = {}) => {
    // onRefresh — колбек страницы: вызывается со свежими данными, когда
    // фоновое SWR-обновление завершилось (в $fetch не передаётся)
    // noCache — принудительно идти в сеть, минуя SWR (когда результат
    // сразу используется для записи, устаревшие данные недопустимы)
    const { onRefresh, noCache, ...fetchOptions } = options;
    options = fetchOptions;

    const method = String(options.method || "GET").toUpperCase();

    // Ключ SWR-кэша — с учётом query/params: иначе "/products" со
    // страницей 2 и страницей 3 делили одну запись, и «Показать ещё»
    // возвращал из кэша ту же страницу повторно
    const queryObj = options.query || options.params;
    let cacheEndpoint = endpoint;
    if (queryObj && typeof queryObj === "object") {
      const qs = new URLSearchParams(
        Object.entries(queryObj)
          .filter(([, v]) => v !== undefined && v !== null && v !== "")
          .map(([k, v]) => [k, String(v)]),
      ).toString();
      if (qs) cacheEndpoint += (endpoint.includes("?") ? "&" : "?") + qs;
    }

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

      // Явно переданный Authorization (например, device-токен кассы
      // самообслуживания, см. useSelfService.ts) не должен затираться обычным
      // auth_token залогиненного сотрудника — иначе self-service ловит 401
      // всякий раз, когда в этом же браузере где-то рядом открыта админка.
      if (token && !headers.Authorization) {
        headers.Authorization = `Bearer ${token}`;
      }

      return await $fetch(`${baseURL}${endpoint}`, {
        ...options,
        headers,
        method: options.method || "GET",
      });
    };

    // SWR-кэш: кэшируемые GET рисуются мгновенно, обновляются фоном
    const swrEligible =
      import.meta.client &&
      method === "GET" &&
      isCacheableEndpoint(endpoint) &&
      !noCache;
    if (swrEligible) {
      const cached = readApiCache(cacheEndpoint);
      if (cached) {
        if (Date.now() - cached.t >= API_CACHE_FRESH_MS) {
          // устарел — отдаём кэш сразу, свежее подтянем в фоне
          // и отдадим странице через onRefresh, чтобы она перерисовалась
          networkFetch()
            .then((data) => {
              writeApiCache(cacheEndpoint, data);
              if (typeof onRefresh === "function") onRefresh(data);
            })
            .catch(() => {});
        }
        return cached.data;
      }
    }

    try {
      const response = await networkFetch();
      connection?.markOnline();

      if (swrEligible) writeApiCache(cacheEndpoint, response);
      // мутация → пометить кэш ресурса устаревшим: список отрисуется
      // мгновенно из кеша, а свежие данные подтянутся фоном
      if (import.meta.client && method !== "GET") markApiCacheStale(endpoint);

      return response;
    } catch (error: any) {
      if (isNetworkError(error)) {
        connection?.markOffline();
      } else {
        // Сервер ответил (пусть и ошибкой) — значит, связь есть
        connection?.markOnline();
      }

      if (error.status === 401) {
        // /self-service/* — гостевой device-токен киоска, не auth_token
        // покупателя/сотрудника. 401 там означает "касса не привязана/отозвана"
        // и обрабатывается на самой странице self-service (экран пейринга),
        // а не разлогином — иначе один и тот же localStorage на этом браузере
        // выкидывал бы залогиненного админа/кассира из его сессии всякий раз,
        // когда где-то рядом открыта self-service со старым/отозванным токеном.
        const isSelfServiceEndpoint = endpoint.startsWith("/self-service");
        if (import.meta.client && !isSelfServiceEndpoint) {
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
