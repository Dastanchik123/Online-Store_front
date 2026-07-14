const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const { initDb, getSetting, setSetting } = require('./src-electron/database.cjs');
const { handleLocalApi } = require('./src-electron/api-router.cjs');
const sync = require('./src-electron/sync.cjs');
const { randomUUID } = require('crypto');

let db;

// ─────────────────────────────────────────────
//  Window
// ─────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'electron-preload.cjs'),
    },
  });

  win.loadURL('https://online-store-back.fly.dev');
  // win.webContents.openDevTools();
}

function notifyRenderer(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload);
  }
}

// ─────────────────────────────────────────────
//  IPC: Local API — фронт вызывает apiFetch, мы отвечаем из SQLite
// ─────────────────────────────────────────────
ipcMain.handle('local-api', async (event, request) => {
  if (!db) return { handled: false };
  const result = handleLocalApi(db, request, {
    currentUserUuid: getSetting(db, 'current_user_uuid'),
  });

  // после локальной записи — подтолкнуть синхронизацию (сработает, когда есть сеть)
  if (result.handled && String(request.method).toUpperCase() !== 'GET' && result.status < 400) {
    sync.scheduleSync();
  }
  return result;
});

// ─────────────────────────────────────────────
//  IPC: Printers
// ─────────────────────────────────────────────
ipcMain.handle('get-printers', async () => {
  const win = BrowserWindow.getAllWindows()[0];
  return await win.webContents.getPrintersAsync();
});

ipcMain.on('print-html', (event, { html, printerName, pageWidthMm, pageHeightMm }) => {
  const printWin = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false },
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
});

// ─────────────────────────────────────────────
//  IPC: Auth
// ─────────────────────────────────────────────
// Сохранить ws-конфиг (из runtimeConfig фронта); при изменении — переподключить realtime
function applyWsConfig({ wsHost, wsPort, wsKey, wsTLS, apiBase }) {
  if (apiBase) setSetting(db, 'api_base', String(apiBase));
  if (!wsHost) return;
  const changed =
    getSetting(db, 'ws_host') !== String(wsHost) ||
    getSetting(db, 'ws_port') !== String(wsPort) ||
    getSetting(db, 'ws_key') !== String(wsKey) ||
    getSetting(db, 'ws_tls') !== (wsTLS ? '1' : '0');
  setSetting(db, 'ws_host', String(wsHost));
  if (wsPort) setSetting(db, 'ws_port', String(wsPort));
  if (wsKey) setSetting(db, 'ws_key', String(wsKey));
  setSetting(db, 'ws_tls', wsTLS ? '1' : '0');
  if (changed) sync.reconnectRealtime();
}

// Вызывается фронтом при каждой загрузке страницы (echo-плагин)
ipcMain.handle('ws-config-save', async (event, config) => {
  applyWsConfig(config || {});
  return { success: true };
});

ipcMain.handle('auth-save-session', async (event, { token, user, apiBase, wsHost, wsPort, wsKey, wsTLS }) => {
  setSetting(db, 'auth_token', token);
  applyWsConfig({ wsHost, wsPort, wsKey, wsTLS, apiBase });

  if (user) {
    const userUuid = user.uuid || String(user.id);
    setSetting(db, 'current_user_uuid', userUuid);
    db.prepare(`
      INSERT INTO users (uuid, server_id, name, email, phone, role, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(uuid) DO UPDATE SET
        server_id=excluded.server_id, name=excluded.name, email=excluded.email,
        phone=excluded.phone, role=excluded.role, updated_at=excluded.updated_at
    `).run(
      userUuid,
      user.id || null,
      user.name,
      user.email,
      user.phone || null,
      user.role || 'cashier',
      new Date().toISOString()
    );
  }

  // Сразу тянем каталог после входа
  try {
    await sync.syncCloudToLocal();
  } catch (e) {
    console.error('[Auth] initial pull failed:', e.message);
  }
  return { success: true };
});

ipcMain.handle('auth-clear-session', async () => {
  setSetting(db, 'auth_token', '');
  setSetting(db, 'current_user_uuid', '');
  return { success: true };
});

ipcMain.handle('db-login', async (event, { email, password }) => {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return { success: false, message: 'Пользователь не найден локально' };
  return { success: true, user };
});

// ─────────────────────────────────────────────
//  IPC: Legacy-каналы (старый код фронта продолжает работать)
// ─────────────────────────────────────────────
ipcMain.handle('db-get-products', async () => {
  return db.prepare('SELECT * FROM products WHERE is_active = 1 ORDER BY name ASC').all();
});

ipcMain.handle('db-get-products-by-barcode', async (event, barcode) => {
  return db.prepare('SELECT * FROM products WHERE barcode = ?').get(barcode) || null;
});

// Старый канал сохранения продажи — теперь тонкая обёртка над роутером
ipcMain.handle('db-save-order', async (event, orderData) => {
  const result = handleLocalApi(db, {
    endpoint: '/pos/sales',
    method: 'POST',
    body: {
      ...orderData,
      cash_amount: orderData.cash_amount ?? (orderData.payment_method === 'cash' ? orderData.total_amount - (orderData.discount || 0) : 0),
      transfer_amount: orderData.transfer_amount ?? (orderData.payment_method === 'transfer' ? orderData.total_amount - (orderData.discount || 0) : 0),
    },
    phase: 'pre',
  }, { currentUserUuid: getSetting(db, 'current_user_uuid') });

  if (!result.handled || result.status >= 400) {
    return { success: false, error: result.data?.message || 'Не удалось сохранить продажу' };
  }
  sync.scheduleSync();
  return { id: result.data.uuid, uuid: result.data.uuid, order_number: result.data.order_number };
});

ipcMain.handle('get-terminal-id', () => getSetting(db, 'terminal_id') || 'k1');
ipcMain.handle('set-terminal-id', (event, id) => setSetting(db, 'terminal_id', id));

// ─────────────────────────────────────────────
//  IPC: Sync
// ─────────────────────────────────────────────
ipcMain.handle('sync-get-status', async () => sync.getStatus());

ipcMain.handle('sync-now', async () => {
  await sync.runSync();
  return { success: true };
});

// ─────────────────────────────────────────────
//  App lifecycle
// ─────────────────────────────────────────────
app.whenReady().then(() => {
  try {
    db = initDb();
  } catch (e) {
    console.error('CRITICAL: Failed to initialize local database:', e);
  }

  sync.init(db, {
    onDataChanged: () => notifyRenderer('data-changed', { at: new Date().toISOString() }),
  });

  createWindow();

  // Realtime-подписка на Soketi: события sервера мгновенно запускают sync
  sync.connectRealtime();

  // Страховочный интервал на случай пропущенных websocket-событий
  setInterval(() => {
    if (require('electron').net.isOnline()) {
      sync.runSync().catch((e) => console.error('[Sync Interval]', e.message));
    }
  }, 2 * 60 * 1000);

  // Первый прогон вскоре после запуска
  sync.scheduleSync(3000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
