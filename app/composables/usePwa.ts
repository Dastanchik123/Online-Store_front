// Общее состояние PWA для компонентов app/components/pwa/*. Заполняется в
// app/plugins/pwa.client.ts; на сервере (SSR/prerender) всё в false.
const needRefresh = ref(false);
const installEvent = shallowRef<any>(null);
const isOnline = ref(true);
let updateSW: ((reload?: boolean) => Promise<void>) | null = null;

const INSTALL_DISMISSED_KEY = "pwa-install-dismissed";

export const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true);

// iPadOS 13+ представляется как Mac — отличаем по тач-экрану
export const isIos = () =>
  typeof navigator !== "undefined" &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

// На iOS «На экран Домой» есть только в Safari; Chrome/Firefox/Яндекс на
// iOS (CriOS/FxiOS/YaBrowser) и встроенные браузеры (Instagram, Telegram)
// такого пункта не показывают
export const isIosSafari = () =>
  isIos() && !/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|Instagram|FBAN|FBAV|Telegram/.test(navigator.userAgent);

export const _pwaInternal = {
  setUpdateSW(fn: (reload?: boolean) => Promise<void>) {
    updateSW = fn;
  },
};

export const usePwa = () => {
  const applyUpdate = async () => {
    needRefresh.value = false;
    // Отправляет SKIP_WAITING в waiting-SW и перезагружает страницу, как
    // только он стал активным (pwa/sw.ts)
    if (updateSW) await updateSW(true);
    else window.location.reload();
  };

  const installDismissed = () => {
    try {
      return localStorage.getItem(INSTALL_DISMISSED_KEY) === "1";
    } catch {
      return false;
    }
  };

  const dismissInstall = () => {
    try {
      localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
    } catch {}
  };

  const promptInstall = async () => {
    const event = installEvent.value;
    if (!event) return false;
    installEvent.value = null;
    event.prompt();
    const choice = await event.userChoice;
    return choice?.outcome === "accepted";
  };

  return {
    needRefresh,
    installEvent,
    isOnline,
    applyUpdate,
    promptInstall,
    installDismissed,
    dismissInstall,
  };
};

// Выход из аккаунта: просим SW выбросить кэш страниц (stores/auth.ts)
export const clearPwaUserCaches = () => {
  if (typeof navigator === "undefined" || !navigator.serviceWorker?.controller) return;
  navigator.serviceWorker.controller.postMessage({ type: "CLEAR_USER_CACHES" });
};
