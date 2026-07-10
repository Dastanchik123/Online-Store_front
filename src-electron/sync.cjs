// ─────────────────────────────────────────────────────────────
//  Sync-движок: SQLite ⇄ Laravel.
//  - push: outbox (sync_queue) → POST /sync/push
//  - pull: GET /sync/pull?since=… → upsert в SQLite
//  - realtime: pusher-js (Soketi) канал 'pos-sync' → мгновенный runSync
// ─────────────────────────────────────────────────────────────
const axios = require('axios');
const { getSetting, setSetting } = require('./database.cjs');

let db = null;
let syncInProgress = false;
let lastSyncAt = null;
let lastSyncError = null;
let pusher = null;
let syncDebounceTimer = null;
let onDataChanged = null; // колбэк — уведомить renderer, что данные обновились

function init(database, opts = {}) {
  db = database;
  onDataChanged = opts.onDataChanged || null;
}

function getApiBase() {
  return getSetting(db, 'api_base') || 'http://localhost:8000/api';
}
function getToken() {
  return getSetting(db, 'auth_token');
}

// ─── Pull: сервер → SQLite ──────────────────────────────────
async function syncCloudToLocal() {
  const token = getToken();
  if (!token) return;

  const lastSync = getSetting(db, 'last_sync_at');
  const params = lastSync ? `?since=${encodeURIComponent(lastSync)}` : '';

  const response = await axios.get(`${getApiBase()}/sync/pull${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
  });

  const { products, categories, users, coupons, settings, server_time } = response.data;

  const transaction = db.transaction(() => {
    const stmtCat = db.prepare(`
      INSERT INTO categories (uuid, server_id, name, image, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(uuid) DO UPDATE SET
        server_id=excluded.server_id, name=excluded.name,
        image=excluded.image, updated_at=excluded.updated_at
    `);
    for (const cat of (categories || [])) {
      stmtCat.run(cat.uuid || String(cat.id), cat.id, cat.name, cat.image, cat.updated_at);
    }

    const stmtProd = db.prepare(`
      INSERT INTO products (
        uuid, server_id, category_uuid, name, sku, barcode,
        price, sale_price, purchase_price, stock_quantity, image,
        is_active, in_stock, is_hot, hot_order, hot_group, sales_count, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(uuid) DO UPDATE SET
        server_id=excluded.server_id, category_uuid=excluded.category_uuid,
        name=excluded.name, sku=excluded.sku, barcode=excluded.barcode,
        price=excluded.price, sale_price=excluded.sale_price,
        purchase_price=excluded.purchase_price, stock_quantity=excluded.stock_quantity,
        image=excluded.image, is_active=excluded.is_active, in_stock=excluded.in_stock,
        is_hot=excluded.is_hot, hot_order=excluded.hot_order, hot_group=excluded.hot_group,
        sales_count=excluded.sales_count, updated_at=excluded.updated_at
    `);
    for (const p of (products || [])) {
      stmtProd.run(
        p.uuid || String(p.id),
        p.id,
        p.category_uuid || String(p.category_id || ''),
        p.name, p.sku, p.barcode,
        p.price, p.sale_price ?? p.price, p.purchase_price,
        p.stock_quantity, p.image,
        p.is_active === false ? 0 : 1,
        p.in_stock === false ? 0 : 1,
        p.is_hot ? 1 : 0, p.hot_order ?? null, p.hot_group ?? null,
        p.sales_count ?? 0,
        p.updated_at
      );
    }

    if (users && users.length) {
      const stmtUser = db.prepare(`
        INSERT INTO users (uuid, server_id, name, email, phone, role, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(uuid) DO UPDATE SET
          server_id=excluded.server_id, name=excluded.name, email=excluded.email,
          phone=excluded.phone, role=excluded.role, updated_at=excluded.updated_at
      `);
      for (const u of users) {
        stmtUser.run(u.uuid || String(u.id), u.id, u.name, u.email, u.phone, u.role, u.updated_at);
      }
    }

    // Заказы с сервера: json целиком; локальные несинхронизированные не трогаем
    if (response.data.orders && response.data.orders.length) {
      const stmtOrder = db.prepare(`
        INSERT INTO orders (uuid, server_id, order_number, total, discount, payment_method, status, notes, created_at, synced_at, json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(uuid) DO UPDATE SET
          server_id=excluded.server_id, order_number=excluded.order_number,
          total=excluded.total, discount=excluded.discount,
          payment_method=excluded.payment_method, status=excluded.status,
          notes=excluded.notes, json=excluded.json,
          synced_at=COALESCE(orders.synced_at, excluded.synced_at)
      `);
      for (const o of response.data.orders) {
        stmtOrder.run(
          o.uuid || `srv-${o.id}`, o.id, o.order_number,
          o.total, o.discount, o.payment_method, o.status, o.notes,
          o.created_at, new Date().toISOString(), JSON.stringify(o)
        );
      }
    }

    if (response.data.suppliers && response.data.suppliers.length) {
      const stmtSup = db.prepare(`
        INSERT INTO suppliers (server_id, name, json, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(server_id) DO UPDATE SET
          name=excluded.name, json=excluded.json, updated_at=excluded.updated_at
      `);
      for (const s of response.data.suppliers) {
        stmtSup.run(s.id, s.name, JSON.stringify(s), s.updated_at);
      }
    }

    if (response.data.purchases && response.data.purchases.length) {
      const stmtPur = db.prepare(`
        INSERT INTO purchases (uuid, server_id, supplier_id, status, json, created_at, updated_at, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(uuid) DO UPDATE SET
          server_id=excluded.server_id, supplier_id=excluded.supplier_id,
          status=excluded.status, json=excluded.json,
          created_at=excluded.created_at, updated_at=excluded.updated_at,
          synced_at=COALESCE(purchases.synced_at, excluded.synced_at)
      `);
      for (const p of response.data.purchases) {
        stmtPur.run(
          p.uuid || `srv-${p.id}`, p.id, p.supplier_id, p.status,
          JSON.stringify(p), p.created_at, p.updated_at, new Date().toISOString()
        );
      }
    }

    if (response.data.debts && response.data.debts.length) {
      const stmtDebt = db.prepare(`
        INSERT INTO debts (server_id, user_id, user_name, user_phone, status, json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(server_id) DO UPDATE SET
          user_id=excluded.user_id, user_name=excluded.user_name,
          user_phone=excluded.user_phone, status=excluded.status,
          json=excluded.json, updated_at=excluded.updated_at
      `);
      for (const d of response.data.debts) {
        stmtDebt.run(
          d.id, d.user_id, d.user?.name || null, d.user?.phone || null,
          d.status, JSON.stringify(d), d.updated_at
        );
      }
    }

    if (coupons && coupons.length) {
      const stmtCoupon = db.prepare(`
        INSERT INTO coupons (uuid, server_id, code, type, value, min_order_amount, is_active, expires_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(uuid) DO UPDATE SET
          server_id=excluded.server_id, code=excluded.code, type=excluded.type,
          value=excluded.value, min_order_amount=excluded.min_order_amount,
          is_active=excluded.is_active, expires_at=excluded.expires_at, updated_at=excluded.updated_at
      `);
      for (const c of coupons) {
        stmtCoupon.run(
          c.uuid || String(c.id), c.id, c.code, c.type, c.value,
          c.min_order_amount ?? 0, c.is_active ? 1 : 0, c.expires_at, c.updated_at
        );
      }
    }
  });
  transaction();

  // Чистка «призраков»: сервер удаляет записи жёстко, по спискам живых id
  // убираем из SQLite всё, чего на сервере больше нет.
  // Локально созданные и ещё не синхронизированные строки (server_id IS NULL) не трогаем.
  const aliveIds = response.data.alive_ids;
  if (aliveIds) {
    const purge = db.transaction(() => {
      for (const [table, ids] of [['products', aliveIds.products], ['categories', aliveIds.categories], ['coupons', aliveIds.coupons]]) {
        if (!Array.isArray(ids)) continue;
        const placeholders = ids.length ? ids.map(() => '?').join(',') : 'NULL';
        // 1) есть server_id, но на сервере записи больше нет
        let removed = db.prepare(`
          DELETE FROM ${table}
          WHERE server_id IS NOT NULL AND server_id NOT IN (${placeholders})
        `).run(...ids).changes;
        // 2) server_id NULL и это не ожидающая отправки локальная запись
        //    (строки из старых версий приложения, где server_id не заполнялся)
        removed += db.prepare(`
          DELETE FROM ${table}
          WHERE server_id IS NULL AND uuid NOT IN (
            SELECT entity_uuid FROM sync_queue WHERE entity_type LIKE '%_CREATE'
          )
        `).run().changes;
        if (removed > 0) console.log(`[Sync] Purge ${table}: удалено ${removed} несуществующих на сервере`);
      }
    });
    purge();
  }

  // Кэш настроек магазина — отдельно (не внутри той же транзакции обязательности нет)
  if (settings && typeof settings === 'object') {
    setSetting(db, 'cache_store_settings', JSON.stringify(settings));
  }

  if (server_time) setSetting(db, 'last_sync_at', server_time);
  console.log(`[Sync] Pull OK: ${(categories || []).length} cat, ${(products || []).length} prod, ${(users || []).length} users, ${(coupons || []).length} coupons`);
}

// ─── Push: outbox → сервер ──────────────────────────────────
async function syncLocalToCloud() {
  const token = getToken();
  if (!token) return;

  const pending = db.prepare(`
    SELECT * FROM sync_queue
    WHERE attempts < 5
    ORDER BY created_at ASC LIMIT 50
  `).all();

  if (pending.length === 0) return;

  // Продажи — legacy-формат (orders), остальное — operations
  const orders = [];
  const operations = [];
  for (const p of pending) {
    const data = JSON.parse(p.payload);
    if (p.entity_type === 'SALE') {
      data.uuid = p.entity_uuid;
      orders.push(data);
    } else {
      operations.push({ op_uuid: p.entity_uuid, type: p.entity_type, payload: data });
    }
  }

  const response = await axios.post(`${getApiBase()}/sync/push`, { orders, operations }, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 30000,
  });

  const { results, operation_results } = response.data;

  const transaction = db.transaction(() => {
    for (const res of (results || [])) {
      if (res.status === 'success') {
        db.prepare('DELETE FROM sync_queue WHERE entity_uuid = ?').run(res.uuid);
        db.prepare('UPDATE orders SET synced_at = ? WHERE uuid = ?')
          .run(new Date().toISOString(), res.uuid);
        // сервер мог переназначить номер чека при конфликте нумерации
        if (res.order_number) {
          db.prepare('UPDATE orders SET order_number = ? WHERE uuid = ?')
            .run(res.order_number, res.uuid);
        }
      } else {
        db.prepare('UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE entity_uuid = ?')
          .run(res.message, res.uuid);
      }
    }
    for (const res of (operation_results || [])) {
      if (res.status === 'success') {
        db.prepare('DELETE FROM sync_queue WHERE entity_uuid = ?').run(res.op_uuid);
      } else {
        db.prepare('UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE entity_uuid = ?')
          .run(res.message, res.op_uuid);
      }
    }
  });
  transaction();
  const okCount = (results || []).concat(operation_results || []).filter((r) => r.status === 'success').length;
  console.log(`[Sync] Push OK: ${okCount}/${pending.length}`);
}

// ─── Цикл синхронизации ─────────────────────────────────────
async function runSync() {
  if (syncInProgress || !db) return;
  if (!getToken()) return;

  syncInProgress = true;
  try {
    await syncLocalToCloud();
    await syncCloudToLocal();
    lastSyncAt = new Date().toISOString();
    lastSyncError = null;
    if (onDataChanged) onDataChanged();
  } catch (e) {
    lastSyncError = e.message;
    console.error('[Sync] Cycle Error:', e.message);
  } finally {
    syncInProgress = false;
  }
}

// Синхронизация «скоро»: дебаунс для шквала событий
function scheduleSync(delayMs = 1500) {
  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(() => {
    runSync().catch((e) => console.error('[Sync] scheduled:', e.message));
  }, delayMs);
}

function getStatus() {
  const queueSize = db
    ? db.prepare('SELECT COUNT(*) as cnt FROM sync_queue').get().cnt
    : 0;
  return {
    inProgress: syncInProgress,
    lastSyncAt,
    lastSyncError,
    queueSize,
    hasToken: !!getToken(),
    realtime: !!(pusher && pusher.connection && pusher.connection.state === 'connected'),
  };
}

// ─── Realtime: Soketi (pusher-протокол) ─────────────────────
function connectRealtime() {
  if (pusher) return;
  let Pusher;
  try {
    const mod = require('pusher-js');
    Pusher = mod.Pusher || mod.default || mod; // Node-сборка: именованный экспорт { Pusher }
  } catch (e) {
    console.warn('[Sync] pusher-js не установлен, realtime отключён');
    return;
  }

  // wsHost по умолчанию берём из api_base
  let defaultHost = '127.0.0.1';
  try {
    defaultHost = new URL(getApiBase()).hostname;
  } catch (e) {}

  const wsHost = getSetting(db, 'ws_host') || defaultHost;
  const wsPort = Number(getSetting(db, 'ws_port') || 6001);
  const wsKey = getSetting(db, 'ws_key') || 'local-app-key';
  const wsTLS = getSetting(db, 'ws_tls') === '1';

  pusher = new Pusher(wsKey, {
    cluster: 'mt1',
    wsHost,
    wsPort,
    wssPort: wsPort,
    forceTLS: wsTLS,
    disableStats: true,
    enabledTransports: wsTLS ? ['ws', 'wss'] : ['ws'],
  });

  pusher.connection.bind('connected', () => {
    console.log(`[Sync] Realtime connected (ws://${wsHost}:${wsPort})`);
    // при (пере)подключении сразу догоняем сервер
    scheduleSync(500);
  });
  pusher.connection.bind('error', (err) => {
    console.warn('[Sync] Realtime error:', err?.error?.data?.message || 'connection error');
  });

  const channel = pusher.subscribe('pos-sync');
  channel.bind('updated', (payload) => {
    console.log('[Sync] Realtime event:', payload?.scope || 'updated');
    scheduleSync();
  });
}

// Переподключение с новыми настройками (после логина ws-конфиг мог смениться)
function reconnectRealtime() {
  if (pusher) {
    try { pusher.disconnect(); } catch (e) {}
    pusher = null;
  }
  connectRealtime();
}

module.exports = { init, runSync, scheduleSync, getStatus, connectRealtime, reconnectRealtime, syncCloudToLocal };
