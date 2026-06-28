const { app, BrowserWindow, ipcMain, ipcRenderer } = require('electron');
const path = require('path');

const { initDb, getSetting, setSetting } = require('./src-electron/database.cjs');
const { randomUUID } = require('crypto');
const axios = require('axios');

let db;
let syncInProgress = false;
let lastSyncAt = null;
let lastSyncError = null;

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

  win.loadURL('http://localhost:3000');
  // win.webContents.openDevTools();
}

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────
function getApiBase() {
  return getSetting(db, 'api_base') || 'http://localhost:8000/api';
}
function getToken() {
  return getSetting(db, 'auth_token');
}

// ─────────────────────────────────────────────
//  IPC: Printers
// ─────────────────────────────────────────────
ipcMain.handle('get-printers', async () => {
  const win = BrowserWindow.getAllWindows()[0];
  return await win.webContents.getPrintersAsync();
});

// ─────────────────────────────────────────────
//  IPC: Print HTML
// ─────────────────────────────────────────────
ipcMain.on('print-html', (event, { html, printerName }) => {
  const printWin = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false },
  });

  printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

  printWin.webContents.once('did-finish-load', () => {
    const options = printerName
      ? { silent: true, deviceName: printerName, printBackground: true }
      : { silent: false, printBackground: true };

    printWin.webContents.print(options, (success, errorType) => {
      if (!success) console.error('Print failed:', errorType);
      printWin.destroy();
    });
  });
});

// ─────────────────────────────────────────────
//  IPC: Auth — save token to local DB
// ─────────────────────────────────────────────
ipcMain.handle('auth-save-session', async (event, { token, user, apiBase }) => {
  setSetting(db, 'auth_token', token);
  if (apiBase) setSetting(db, 'api_base', apiBase);

  // Upsert user into local users table
  if (user) {
    db.prepare(`
      INSERT INTO users (uuid, name, email, role, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(uuid) DO UPDATE SET
        name=excluded.name, email=excluded.email,
        role=excluded.role, updated_at=excluded.updated_at
    `).run(
      user.uuid || String(user.id),
      user.name,
      user.email,
      user.role || 'cashier',
      new Date().toISOString()
    );
  }

  // Immediately pull catalog after login
  await syncCloudToLocal();
  return { success: true };
});

ipcMain.handle('auth-clear-session', async () => {
  setSetting(db, 'auth_token', '');
  return { success: true };
});

// ─────────────────────────────────────────────
//  IPC: Offline Auth
// ─────────────────────────────────────────────
ipcMain.handle('db-login', async (event, { email, password }) => {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return { success: false, message: 'Пользователь не найден локально' };
  // Password hash check would use bcrypt in production
  return { success: true, user };
});

// ─────────────────────────────────────────────
//  IPC: Products
// ─────────────────────────────────────────────
ipcMain.handle('db-get-products', async () => {
  return db.prepare('SELECT * FROM products ORDER BY name ASC').all();
});

ipcMain.handle('db-get-products-by-barcode', async (event, barcode) => {
  return db.prepare('SELECT * FROM products WHERE barcode = ?').get(barcode) || null;
});

// ─────────────────────────────────────────────
//  IPC: Save offline order
// ─────────────────────────────────────────────
ipcMain.handle('db-save-order', async (event, orderData) => {
  const orderUuid = randomUUID();
  const { items, total_amount, discount, payment_method, user_uuid } = orderData;

  // Получаем префикс кассы (например, k1, k2)
  const terminalPrefix = getSetting(db, 'terminal_id') || 'k1';

  const transaction = db.transaction(() => {
    // Находим последний номер для этого префикса в локальной базе
    // Мы ищем формат 'k1-123'
    const lastOrder = db.prepare(`
      SELECT order_number FROM orders 
      WHERE order_number LIKE ? 
      ORDER BY CAST(SUBSTR(order_number, INSTR(order_number, '-') + 1) AS INTEGER) DESC 
      LIMIT 1
    `).get(`${terminalPrefix}-%`);

    let nextNumber = 1;
    if (lastOrder && lastOrder.order_number) {
      const parts = lastOrder.order_number.split('-');
      if (parts.length > 1) {
        nextNumber = parseInt(parts[1], 10) + 1;
      }
    }

    const orderNumber = `${terminalPrefix}-${nextNumber}`;

    db.prepare(`
      INSERT INTO orders (uuid, order_number, user_uuid, total_amount, discount, payment_method, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'online_pending', ?)
    `).run(orderUuid, orderNumber, user_uuid, total_amount, discount || 0, payment_method, new Date().toISOString());

    const stmtItem = db.prepare(`
      INSERT INTO order_items (uuid, order_uuid, product_uuid, quantity, price_at_sale)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const item of items) {
      stmtItem.run(randomUUID(), orderUuid, item.product_uuid, item.quantity, item.price);
      db.prepare('UPDATE products SET stock_quantity = stock_quantity - ? WHERE uuid = ?')
        .run(item.quantity, item.product_uuid);
    }
    
    // Добавляем в очередь синхронизации
    db.prepare(`
      INSERT INTO sync_queue (entity_type, entity_uuid, payload)
      VALUES (?, ?, ?)
    `).run('order', orderUuid, JSON.stringify({
      ...orderData,
      uuid: orderUuid,
      order_number: orderNumber,
      created_at: new Date().toISOString()
    }));

    return { id: orderUuid, uuid: orderUuid, order_number: orderNumber };
  });

  try {
    return transaction();
  } catch (e) {
    console.error('Offline Order Error:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-terminal-id', () => getSetting(db, 'terminal_id') || 'k1');
ipcMain.handle('set-terminal-id', (event, id) => setSetting(db, 'terminal_id', id));

// ─────────────────────────────────────────────
//  IPC: Sync status
// ─────────────────────────────────────────────
ipcMain.handle('sync-get-status', async () => {
  const queueSize = db.prepare('SELECT COUNT(*) as cnt FROM sync_queue').get().cnt;
  return {
    inProgress: syncInProgress,
    lastSyncAt,
    lastSyncError,
    queueSize,
    hasToken: !!getToken(),
  };
});

ipcMain.handle('sync-now', async () => {
  if (syncInProgress) return { success: false, message: 'Синхронизация уже идёт' };
  await runSync();
  return { success: true };
});

// ─────────────────────────────────────────────
//  Sync: Cloud → Local (Pull catalog)
// ─────────────────────────────────────────────
async function syncCloudToLocal() {
  const token = getToken();
  const apiBase = getApiBase();
  if (!token) return;

  try {
    const lastSync = getSetting(db, 'last_sync_at');
    const params = lastSync ? `?since=${lastSync}` : '';

    const response = await axios.get(`${apiBase}/sync/pull${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    });

    const { products, categories, server_time } = response.data;

    const transaction = db.transaction(() => {
      const stmtCat = db.prepare(`
        INSERT INTO categories (uuid, name, image, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(uuid) DO UPDATE SET
          name=excluded.name, image=excluded.image, updated_at=excluded.updated_at
      `);
      for (const cat of (categories || [])) {
        stmtCat.run(cat.uuid || String(cat.id), cat.name, cat.image, cat.updated_at);
      }

      const stmtProd = db.prepare(`
        INSERT INTO products (uuid, category_uuid, name, sku, barcode, price, purchase_price, stock_quantity, image, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(uuid) DO UPDATE SET
          category_uuid=excluded.category_uuid, name=excluded.name, sku=excluded.sku,
          barcode=excluded.barcode, price=excluded.price, purchase_price=excluded.purchase_price,
          stock_quantity=excluded.stock_quantity, image=excluded.image, updated_at=excluded.updated_at
      `);
      for (const prod of (products || [])) {
        stmtProd.run(
          prod.uuid || String(prod.id),
          prod.category_uuid || String(prod.category_id),
          prod.name, prod.sku, prod.barcode,
          prod.sale_price ?? prod.price,
          prod.purchase_price,
          prod.stock_quantity,
          prod.image,
          prod.updated_at
        );
      }
    });

    transaction();
    if (server_time) setSetting(db, 'last_sync_at', server_time);
    console.log(`[Sync] Pull OK: ${(categories||[]).length} categories, ${(products||[]).length} products`);
  } catch (e) {
    console.error('[Sync] Pull Error:', e.message);
    throw e;
  }
}

// ─────────────────────────────────────────────
//  Sync: Local → Cloud (Push offline orders)
// ─────────────────────────────────────────────
async function syncLocalToCloud() {
  const token = getToken();
  const apiBase = getApiBase();
  if (!token) return;

  const pending = db.prepare(`
    SELECT * FROM sync_queue
    WHERE entity_type = 'SALE' AND attempts < 5
    ORDER BY created_at ASC LIMIT 50
  `).all();

  if (pending.length === 0) return;

  const orders = pending.map(p => {
    const data = JSON.parse(p.payload);
    data.uuid = p.entity_uuid;
    return data;
  });

  const response = await axios.post(`${apiBase}/sync/push`, { orders }, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
  });

  const { results } = response.data;

  const transaction = db.transaction(() => {
    for (const res of results) {
      if (res.status === 'success') {
        db.prepare('DELETE FROM sync_queue WHERE entity_uuid = ?').run(res.uuid);
        db.prepare('UPDATE orders SET synced_at = ? WHERE uuid = ?')
          .run(new Date().toISOString(), res.uuid);
      } else {
        db.prepare('UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE entity_uuid = ?')
          .run(res.message, res.uuid);
      }
    }
  });
  transaction();
  console.log(`[Sync] Push OK: ${results.filter(r => r.status === 'success').length}/${results.length} synced`);
}

// ─────────────────────────────────────────────
//  Sync runner
// ─────────────────────────────────────────────
async function runSync() {
  if (syncInProgress) return;
  const token = getToken();
  if (!token) return; // not logged in yet

  syncInProgress = true;
  try {
    await syncLocalToCloud();
    await syncCloudToLocal();
    lastSyncAt = new Date().toISOString();
    lastSyncError = null;
  } catch (e) {
    lastSyncError = e.message;
    console.error('[Sync] Cycle Error:', e.message);
  } finally {
    syncInProgress = false;
  }
}

// ─────────────────────────────────────────────
//  App lifecycle
// ─────────────────────────────────────────────
app.whenReady().then(() => {
  try {
    db = initDb();
  } catch (e) {
    console.error('CRITICAL: Failed to initialize local database:', e);
    // Continue anyway or notify user
  }
  createWindow();

  // Background sync every 2 minutes
  setInterval(() => {
    if (require('electron').net.isOnline()) {
      runSync().catch(e => console.error('[Sync Interval]', e.message));
    }
  }, 2 * 60 * 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
