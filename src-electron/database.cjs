const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

const dbPath = path.join(app.getPath('userData'), 'pos_local.db');

// Добавляет колонку, если её ещё нет (SQLite не умеет IF NOT EXISTS для колонок)
function ensureColumn(db, table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
}

function initDb() {
  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');

  // LIKE в SQLite регистронезависим только для латиницы —
  // для поиска по кириллице используем lower_ru(col) LIKE lower_ru(?)
  db.function('lower_ru', { deterministic: true }, (s) =>
    s == null ? null : String(s).toLowerCase()
  );

  // 1. Users (офлайн-авторизация + клиенты для кассы)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      uuid TEXT PRIMARY KEY,
      server_id INTEGER,
      name TEXT,
      email TEXT,
      phone TEXT,
      password_hash TEXT,
      role TEXT,
      tenant_id INTEGER,
      updated_at DATETIME
    )
  `).run();
  ensureColumn(db, 'users', 'server_id', 'INTEGER');
  ensureColumn(db, 'users', 'phone', 'TEXT');

  // 2. Categories
  db.prepare(`
    CREATE TABLE IF NOT EXISTS categories (
      uuid TEXT PRIMARY KEY,
      server_id INTEGER,
      name TEXT,
      image TEXT,
      updated_at DATETIME
    )
  `).run();
  ensureColumn(db, 'categories', 'server_id', 'INTEGER');

  // 3. Products
  db.prepare(`
    CREATE TABLE IF NOT EXISTS products (
      uuid TEXT PRIMARY KEY,
      server_id INTEGER,
      category_uuid TEXT,
      name TEXT,
      sku TEXT,
      barcode TEXT,
      price DECIMAL(15,2),
      sale_price DECIMAL(15,2),
      purchase_price DECIMAL(15,2),
      stock_quantity INTEGER,
      image TEXT,
      is_active INTEGER DEFAULT 1,
      in_stock INTEGER DEFAULT 1,
      is_hot INTEGER DEFAULT 0,
      hot_order INTEGER,
      hot_group TEXT,
      sales_count INTEGER DEFAULT 0,
      updated_at DATETIME
    )
  `).run();
  ensureColumn(db, 'products', 'server_id', 'INTEGER');
  ensureColumn(db, 'products', 'sale_price', 'DECIMAL(15,2)');
  ensureColumn(db, 'products', 'is_active', 'INTEGER DEFAULT 1');
  ensureColumn(db, 'products', 'in_stock', 'INTEGER DEFAULT 1');
  ensureColumn(db, 'products', 'is_hot', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'products', 'hot_order', 'INTEGER');
  ensureColumn(db, 'products', 'hot_group', 'TEXT');
  ensureColumn(db, 'products', 'sales_count', 'INTEGER DEFAULT 0');
  db.prepare('CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_products_server_id ON products(server_id)').run();

  // 4. Orders (офлайн-продажи)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS orders (
      uuid TEXT PRIMARY KEY,
      order_number TEXT,
      user_uuid TEXT,
      staff_uuid TEXT,
      subtotal DECIMAL(15,2),
      total_amount DECIMAL(15,2),
      total DECIMAL(15,2),
      discount DECIMAL(15,2),
      payment_method TEXT,
      cash_received DECIMAL(15,2) DEFAULT 0,
      transfer_received DECIMAL(15,2) DEFAULT 0,
      is_debt INTEGER DEFAULT 0,
      due_date DATETIME,
      is_financed INTEGER DEFAULT 1,
      status TEXT,
      notes TEXT,
      created_at DATETIME,
      synced_at DATETIME DEFAULT NULL
    )
  `).run();
  ensureColumn(db, 'orders', 'order_number', 'TEXT');
  ensureColumn(db, 'orders', 'staff_uuid', 'TEXT');
  ensureColumn(db, 'orders', 'subtotal', 'DECIMAL(15,2)');
  ensureColumn(db, 'orders', 'total', 'DECIMAL(15,2)');
  ensureColumn(db, 'orders', 'cash_received', 'DECIMAL(15,2) DEFAULT 0');
  ensureColumn(db, 'orders', 'transfer_received', 'DECIMAL(15,2) DEFAULT 0');
  ensureColumn(db, 'orders', 'is_debt', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'orders', 'due_date', 'DATETIME');
  ensureColumn(db, 'orders', 'is_financed', 'INTEGER DEFAULT 1');
  ensureColumn(db, 'orders', 'notes', 'TEXT');

  // 5. Order Items
  db.prepare(`
    CREATE TABLE IF NOT EXISTS order_items (
      uuid TEXT PRIMARY KEY,
      order_uuid TEXT,
      product_uuid TEXT,
      product_name TEXT,
      product_sku TEXT,
      quantity INTEGER,
      price_at_sale DECIMAL(15,2),
      total DECIMAL(15,2)
    )
  `).run();
  ensureColumn(db, 'order_items', 'product_name', 'TEXT');
  ensureColumn(db, 'order_items', 'product_sku', 'TEXT');
  ensureColumn(db, 'order_items', 'total', 'DECIMAL(15,2)');

  // Заказы, пришедшие с сервера, храним ещё и целиком (json) —
  // так ответы GET /orders неотличимы от серверных (relations и т.д.)
  ensureColumn(db, 'orders', 'server_id', 'INTEGER');
  ensureColumn(db, 'orders', 'json', 'TEXT');

  // 5b. Suppliers (кэш серверных строк)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS suppliers (
      server_id INTEGER PRIMARY KEY,
      name TEXT,
      json TEXT,
      updated_at DATETIME
    )
  `).run();

  // 5c. Purchases (кэш + офлайн-создание)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS purchases (
      uuid TEXT PRIMARY KEY,
      server_id INTEGER,
      supplier_id INTEGER,
      status TEXT,
      json TEXT,
      created_at DATETIME,
      updated_at DATETIME,
      synced_at DATETIME
    )
  `).run();

  // 5d. Customer debts (кэш + офлайн-погашение)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS debts (
      server_id INTEGER PRIMARY KEY,
      user_id INTEGER,
      user_name TEXT,
      user_phone TEXT,
      status TEXT,
      json TEXT,
      updated_at DATETIME
    )
  `).run();

  // 6. Coupons (валидация купонов офлайн)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS coupons (
      uuid TEXT PRIMARY KEY,
      server_id INTEGER,
      code TEXT,
      type TEXT,
      value DECIMAL(15,2),
      min_order_amount DECIMAL(15,2) DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      expires_at DATETIME,
      updated_at DATETIME
    )
  `).run();

  // 7. Sync Queue (outbox — исходящие изменения)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT,
      entity_uuid TEXT,
      payload TEXT,
      attempts INTEGER DEFAULT 0,
      last_error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // 8. App Settings (token, api_base, last_sync_at, кэш настроек магазина)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `).run();

  return db;
}

function getSetting(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(db, key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

// Кэш настроек магазина (из /sync/pull → settings)
function getStoreSetting(db, key, fallback = null) {
  try {
    const raw = getSetting(db, 'cache_store_settings');
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed[key] !== undefined ? parsed[key] : fallback;
  } catch (e) {
    return fallback;
  }
}

module.exports = { initDb, getSetting, setSetting, getStoreSetting };
