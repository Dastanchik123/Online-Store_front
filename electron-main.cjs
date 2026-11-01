// Труба stdout/stderr может закрыться раньше процесса (запуск из терминала с | и т.п.) —
// без этого console.log на закрытую трубу валит весь main process необработанным EPIPE.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (err) => {
    if (err.code === 'EPIPE') return;
    throw err;
  });
}

const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const path = require('path');

const { getSetting, setSetting } = require('./src-electron/localSettings.cjs');
const { syncLabelTemplates } = require('./src-electron/labelTemplateSync.cjs');
const receiptPrinter = require('./src-electron/receiptPrinter.cjs');
const { startAutoUpdate } = require('./src-electron/autoUpdate.cjs');

// ─────────────────────────────────────────────
//  Window
// ─────────────────────────────────────────────
// Касса работает только онлайн: Electron — это оболочка над сайтом с тихой
// печатью и доступом к сканерам/весам, без локальной БД и синхронизации.
// --self-service — стартовое окно сразу открывает кассу самообслуживания вместо
// обычного логина. Для необслуживаемого киоска: npm run electron:self-service
// --local — грузит локальный dev-фронт (npm run dev, localhost:3000) вместо
// прод-сайта на fly.dev, для разработки/отладки Electron-специфичных вещей
// (печать, IPC): npm run electron:local
// Прод-витрина — kurulush-store.fly.dev (см. SITE_URL в nuxt.config.ts);
// старый online-store-back.fly.dev отдаёт устаревшую сборку фронта.
// app-config.json кладёт scripts/electron-stage.cjs при сборке с
// ELECTRON_START_URL (npm run dist:win:local) — exe, открывающий локальный фронт.
function readBuiltInBaseUrl() {
  try {
    const cfg = JSON.parse(require('fs').readFileSync(path.join(__dirname, 'app-config.json'), 'utf8'));
    return cfg.startUrl ? String(cfg.startUrl).replace(/\/+$/, '') : null;
  } catch (e) {
    return null;
  }
}
const PROD_URL = 'https://kurulush-store.fly.dev';
const BASE_URL = process.argv.includes('--local')
  ? 'http://localhost:3000'
  : readBuiltInBaseUrl() || PROD_URL;
const START_URL = process.argv.includes('--self-service') ? `${BASE_URL}/self-service` : BASE_URL;

// Электрон доверяет только своему сайту: окно с preload (window.electronAPI —
// печать, токен киоска, локальные настройки) открывается только для этого
// origin, всё остальное — в системном браузере (Electron Security Checklist,
// пп. 13–14, 17).
const ALLOWED_ORIGIN = new URL(BASE_URL).origin;

function isAllowedUrl(url) {
  try {
    return new URL(url).origin === ALLOWED_ORIGIN;
  } catch (e) {
    return false;
  }
}

function openExternally(url) {
  if (/^https?:\/\//i.test(url)) {
    shell.openExternal(url);
  }
}

// Процесс кассы один (общие принтер, настройки терминала и вход), но каждый
// повторный запуск открывает в нём новое окно: с --self-service — окно
// самообслуживания. app.exit, а не app.quit: quit асинхронный, и до выхода
// второй процесс успел бы открыть своё окно.
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
}
// Windows не отдаёт фокус фоновому процессу: голый win.focus() лишь мигает
// кнопкой в панели задач, и пользователю кажется, что повторный запуск
// «сразу закрылся». Кратко поднимаем окно поверх всех, чтобы оно вышло вперёд.
app.on('second-instance', (_event, argv) => {
  if (!app.isReady()) return;
  const win = createWindow(argv.includes('--self-service') ? `${BASE_URL}/self-service` : BASE_URL);
  win.setAlwaysOnTop(true);
  win.focus();
  app.focus({ steal: true });
  win.setAlwaysOnTop(false);
});

// ─────────────────────────────────────────────
//  Разрешения: камера (сканирование на ТСД), буфер обмена, уведомления
// ─────────────────────────────────────────────
// Касса — доверенное окружение, браузерные запросы разрешений в киоске
// некому подтверждать, поэтому нужное разрешаем сразу — но только своему
// сайту и только то, чем касса реально пользуется. Сканеры штрихкодов
// работают как клавиатура: доступ к COM/HID/USB (Web Serial/HID/USB) не нужен.
const ALLOWED_PERMISSIONS = new Set([
  'media', 'clipboard-read', 'clipboard-sanitized-write', 'notifications', 'fullscreen',
]);

function setupPermissions() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission) && isAllowedUrl(wc.getURL()));
  });
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) =>
    ALLOWED_PERMISSIONS.has(permission) && requestingOrigin === ALLOWED_ORIGIN
  );
  ses.setDevicePermissionHandler(() => false);
}

function createWindow(url = START_URL) {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'electron-preload.cjs'),
    },
  });

  win.loadURL(url);
  // win.webContents.openDevTools();

  // Ссылки с target="_blank" (например «Открыть кассу» на self-service-sales)
  // открываем новым окном с preload — иначе печать чека падала бы в
  // браузерный window.print(). Чужие сайты (соцсети, страница оплаты) —
  // только в системном браузере, без доступа к electronAPI.
  win.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (isAllowedUrl(targetUrl)) {
      createWindow(targetUrl);
    } else {
      openExternally(targetUrl);
    }
    return { action: 'deny' };
  });

  // Ctrl+N — ещё одно окно кассы, чтобы, например, поправить товар, не уходя
  // со страницы, на которой работаешь (в стандартном меню Electron пункта
  // «Новое окно» нет)
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.control && !input.alt && !input.shift && input.key.toLowerCase() === 'n') {
      event.preventDefault();
      createWindow(BASE_URL);
    }
  });

  // Переход в этом же окне на чужой сайт тоже уводим в системный браузер
  win.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isAllowedUrl(targetUrl)) {
      event.preventDefault();
      openExternally(targetUrl);
    }
  });

  return win;
}

// IPC принимаем только от страниц своего сайта (Security Checklist, п. 17)
function trusted(handler) {
  return (event, ...args) => {
    const frameUrl = event.senderFrame?.url || '';
    if (!isAllowedUrl(frameUrl)) {
      throw new Error(`IPC отклонён: недоверенный источник ${frameUrl}`);
    }
    return handler(event, ...args);
  };
}

// ─────────────────────────────────────────────
//  IPC: Printers
// ─────────────────────────────────────────────
ipcMain.handle('get-printers', trusted(async (event) => {
  return await event.sender.getPrintersAsync();
}));

ipcMain.on('print-html', trusted((event, { html, printerName, pageWidthMm, pageHeightMm }) => {
  const printWin = new BrowserWindow({
    show: false,
    // Печатаемый HTML — данные, а не наш код: изоляция и песочница
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });

  printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

  printWin.webContents.once('did-finish-load', () => {
    const options = printerName
      ? { silent: true, deviceName: printerName, printBackground: true }
      : { silent: false, printBackground: true };

    // Без явного pageSize принтер печатает на своей бумаге по умолчанию
    // (A4 и т.п.), и разрыв страниц из CSS (page-break-after) не разбивает
    // вывод на отдельные листы — несколько этикеток слипаются на одном.
    // Задаём размер листа в микронах (1мм = 1000мкм) по размеру этикетки.
    if (pageWidthMm && pageHeightMm) {
      options.pageSize = {
        width: Math.round(pageWidthMm * 1000),
        height: Math.round(pageHeightMm * 1000),
      };
      // На случай, если у драйвера принтера по умолчанию включены поля
      // страницы или "несколько страниц на лист" — это тоже может слепить
      // этикетки в один физический лист даже при верном pageSize.
      options.margins = { marginType: 'none' };
      options.pagesPerSheet = 1;
    }

    printWin.webContents.print(options, (success, errorType) => {
      if (!success) console.error('Print failed:', errorType);
      printWin.destroy();
    });
  });
}));

// Печать чека с ответом в UI (в отличие от print-html, который работает
// «отправил и забыл»). Режим (драйвер / растр ESC/POS) — локальная настройка
// терминала; при сбое растра main сам откатывается на драйвер,
// см. src-electron/receiptPrinter.cjs.
function getReceiptPrintConfig() {
  const saved = getSetting('receipt_print_config');
  return { ...receiptPrinter.DEFAULT_CONFIG, ...(saved && typeof saved === 'object' ? saved : {}) };
}

ipcMain.handle('print-receipt', trusted((event, { html, printerName } = {}) =>
  receiptPrinter.printReceipt(event.sender, { html: String(html || ''), printerName }, getReceiptPrintConfig())
));
// Экран кассы запрашивает конфиг при открытии — заодно заранее поднимаем
// фоновый хелпер печати, чтобы первый чек не ждал старта PowerShell.
ipcMain.handle('get-receipt-print-config', trusted(() => {
  receiptPrinter.warmUp();
  return getReceiptPrintConfig();
}));
ipcMain.handle('set-receipt-print-config', trusted((event, config) => {
  const next = getReceiptPrintConfig();
  if (['driver', 'raster'].includes(config?.mode)) next.mode = config.mode;
  if (config?.density in receiptPrinter.DENSITY_THRESHOLDS) next.density = config.density;
  if (typeof config?.cut === 'boolean') next.cut = config.cut;
  setSetting('receipt_print_config', next);
  return next;
}));

// ─────────────────────────────────────────────
//  IPC: Форматы этикеток
// ─────────────────────────────────────────────
// Синк встроенных форматов этикеток в settings.label_templates_all —
// POST /settings на бэке требует role==='admin', поэтому фронт вызывает это
// только после входа; для кассиров — no-op (см. labelTemplateSync.cjs)
ipcMain.handle('label-templates-sync', trusted(async (event, { token, apiBase, role } = {}) => {
  try {
    return await syncLabelTemplates({ token, apiBase, role });
  } catch (e) {
    console.error('[LabelTemplates] sync failed:', e.message);
    return { skipped: true, reason: 'error', error: e.message };
  }
}));

// ─────────────────────────────────────────────
//  IPC: Локальные настройки терминала
// ─────────────────────────────────────────────
// Дефолтный формат этикетки и привязка форматов к конкретным принтерам —
// чисто локальные настройки терминала (разные кассы могут стоять с разной
// шириной ленты), поэтому в файле терминала, а не в Laravel-настройках.
ipcMain.handle('get-label-default-template-id', trusted(() => getSetting('label_default_template_id') || ''));
ipcMain.handle('set-label-default-template-id', trusted((event, id) => setSetting('label_default_template_id', id || '')));

ipcMain.handle('get-label-printer-config', trusted(() => {
  const config = getSetting('label_printer_config');
  return config && typeof config === 'object' ? config : {};
}));
ipcMain.handle('set-label-printer-config', trusted((event, config) => setSetting('label_printer_config', config || {})));

ipcMain.handle('get-self-service-terminal-id', trusted(() => getSetting('self_service_terminal_id') || 'SS1'));
ipcMain.handle('set-self-service-terminal-id', trusted((event, id) => setSetting('self_service_terminal_id', id)));

// Device-токен киоска self-service — выдаётся один раз при пейринге
// (см. SelfServiceDeviceController@pair), хранится в файле терминала, а не
// localStorage, чтобы пережить очистку данных браузера.
ipcMain.handle('get-self-service-device-token', trusted(() => getSetting('self_service_device_token') || null));
ipcMain.handle('set-self-service-device-token', trusted((event, token) => setSetting('self_service_device_token', token)));

// ─────────────────────────────────────────────
//  App lifecycle
// ─────────────────────────────────────────────
app.whenReady().then(() => {
  setupPermissions();
  createWindow();
  startAutoUpdate();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => receiptPrinter.stopHelper());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
