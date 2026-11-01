// Автообновление кассы с GitHub Releases (electron-updater, настройки
// публикации — build.publish в package.json). Новая версия скачивается в
// фоне и ставится при следующем закрытии приложения; кассиру показываем
// системное уведомление. Работает только в установленной (NSIS) версии:
// портативная и запуск из исходников (npm run electron) не обновляются.
const { app } = require('electron');

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

function startAutoUpdate() {
  if (!app.isPackaged) return;

  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (e) {
    console.warn('[AutoUpdate] electron-updater недоступен:', e.message);
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', (err) => console.warn('[AutoUpdate] ошибка:', err?.message || err));
  autoUpdater.on('update-downloaded', (info) => console.log('[AutoUpdate] скачана версия', info?.version));

  const check = () =>
    autoUpdater.checkForUpdatesAndNotify().catch((err) => console.warn('[AutoUpdate] проверка не удалась:', err?.message || err));

  check();
  setInterval(check, CHECK_INTERVAL_MS);
}

module.exports = { startAutoUpdate };
