// Состояние связи с сервером. Касса работает только онлайн, поэтому кассир
// должен сразу видеть, что продажи сейчас не проводятся (баннер в pos.vue).
// Связь «пропадает», когда запрос useApi не дошёл до сервера; пока её нет,
// раз в несколько секунд пингуем /api/ping, пока сервер не ответит.
const PING_INTERVAL_MS = 5000;
const PING_TIMEOUT_MS = 4000;

let pingTimer: ReturnType<typeof setTimeout> | null = null;
let browserListenersAttached = false;

// Запрос не дошёл до Laravel: нет сети, таймаут, или прокси fly.dev
// ответил сам (502/503/504), потому что приложение недоступно. 503 с JSON
// {message} — это ответ самого Laravel (например, «QR-оплата недоступна»
// при сбое GoPay): связь есть, кассиру нужно показать это сообщение.
export const isNetworkError = (error: any): boolean =>
  !error?.status ||
  ([502, 503, 504].includes(error.status) && typeof error.data?.message !== "string");

export const useServerConnection = () => {
  const isServerReachable = useState<boolean>("server_reachable", () => true);
  const apiBase = useRuntimeConfig().public.apiBase as string;

  const markOnline = () => {
    isServerReachable.value = true;
  };

  const checkNow = async (): Promise<boolean> => {
    try {
      await $fetch(`${apiBase}/ping`, { timeout: PING_TIMEOUT_MS, retry: 0 });
      markOnline();
      return true;
    } catch {
      return false;
    }
  };

  const schedulePing = () => {
    if (pingTimer || !import.meta.client) return;
    pingTimer = setTimeout(async () => {
      pingTimer = null;
      if (!(await checkNow())) schedulePing();
    }, PING_INTERVAL_MS);
  };

  const markOffline = () => {
    isServerReachable.value = false;
    schedulePing();
  };

  if (import.meta.client && !browserListenersAttached) {
    browserListenersAttached = true;
    window.addEventListener("offline", markOffline);
    window.addEventListener("online", () => {
      checkNow().then((ok) => {
        if (!ok) schedulePing();
      });
    });
  }

  return {
    isServerReachable: readonly(isServerReachable),
    markOnline,
    markOffline,
    checkNow,
  };
};
