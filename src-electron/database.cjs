const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');
const fs = require('fs');

const dbPath = path.join(app.getPath('userData'), 'pos_local.db');

function initDb() {
  const db = new Database(dbPath);
  
  // Enable WAL for better concurrency
  db.pragma('journal_mode = WAL');

  // 1. Users table (Offline Auth)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      uuid TEXT PRIMARY KEY,
      name TEXT,
      email TEXT,
      password_hash TEXT,
      role TEXT,
      tenant_id INTEGER,
      updated_at DATETIME
    )
  `).run();

  // 2. Categories
  db.prepare(`
    CREATE TABLE IF NOT EXISTS categories (
      uuid TEXT PRIMARY KEY,
      name TEXT,
      image TEXT,
      updated_at DATETIME
    )
  `).run();

  // 3. Products
  db.prepare(`
    CREATE TABLE IF NOT EXISTS products (
      uuid TEXT PRIMARY KEY,
      category_uuid TEXT,
      name TEXT,
      sku TEXT,
      barcode TEXT,
      price DECIMAL(15,2),
      purchase_price DECIMAL(15,2),
      stock_quantity INTEGER,
      image TEXT,
      updated_at DATETIME
    )
  `).run();

  // 4. Orders (Offline Sales)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS orders (
      uuid TEXT PRIMARY KEY,
      order_number TEXT,
      user_uuid TEXT,
      total_amount DECIMAL(15,2),
      discount DECIMAL(15,2),
      payment_method TEXT,
      status TEXT,
      created_at DATETIME,
      synced_at DATETIME DEFAULT NULL
    )
  `).run();

  // Ensure order_number column exists
  try {
    db.prepare('ALTER TABLE orders ADD COLUMN order_number TEXT').run();
  } catch (e) { }

  // 5. Order Items
  db.prepare(`
    CREATE TABLE IF NOT EXISTS order_items (
      uuid TEXT PRIMARY KEY,
      order_uuid TEXT,
      product_uuid TEXT,
      quantity INTEGER,
      price_at_sale DECIMAL(15,2)
    )
  `).run();

  // 6. Sync Queue
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

  // 7. App Settings (token, api_base, last_sync_at)
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

module.exports = { initDb, getSetting, setSetting };
