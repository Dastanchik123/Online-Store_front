import { registerSW } from "virtual:pwa-register";

// Регистрация service worker (pwa/sw.ts) и события, нужные компонентам
// app/components/pwa/*. Вне build:laravel virtual:pwa-register — заглушка
// (pwa.disable в nuxt.config.ts), регистрации не происходит.
export default defineNuxtPlugin(() => {
  const { needRefresh, installEvent, isOnline } = usePwa();

  isOnline.value = navigator.onLine;
  window.addEventListener("online", () => (isOnline.value = true));
  window.addEventListener("offline", () => (isOnline.value = false));

  // Electron-касса открывает этот же сайт: SW ей не нужен (продажи только
  // онлайн), а баннер обновления посреди чека — вредит. Снимаем и тот SW,
  // что мог остаться от открытия сайта до появления этой проверки.
  if ((window as any).electronAPI || (window as any).Capacitor) {
    navigator.serviceWorker?.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    });
    return;
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    // Свой баннер вместо мини-инфобара Chrome (components/pwa/InstallPrompt.vue)
    e.preventDefault();
    installEvent.value = e;
  });
  window.addEventListener("appinstalled", () => (installEvent.value = null));

  if (!("serviceWorker" in navigator)) return;

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      needRefresh.value = true;
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // Открытое неделями приложение (особенно standalone на iOS, где
      // вкладку не перезагружают) иначе не узнало бы о новой версии
      setInterval(() => {
        if (navigator.onLine && !registration.installing) registration.update();
      }, 60 * 60 * 1000);
    },
  });
  _pwaInternal.setUpdateSW(updateSW);
});
