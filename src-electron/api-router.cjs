// ─────────────────────────────────────────────────────────────
//  Локальный API-роутер: эндпоинт → SQL по локальной SQLite.
//  Ответы повторяют формат Laravel-бэкенда, чтобы фронт не видел разницы.
//
//  Стратегии:
//    'local'    — local-first: выполняется всегда, сеть не нужна
//    'fallback' — network-first: выполняется только когда сеть недоступна
// ─────────────────────────────────────────────────────────────
const { randomUUID } = require('crypto');
const { getSetting, setSetting, getStoreSetting } = require('./database.cjs');

// Результат: { handled: true, status, data } или { handled: false }
const NOT_HANDLED = { handled: false };

function ok(data, status = 200) {
  return { handled: true, status, data };
}
function fail(message, status = 400, extra = {}) {
  return { handled: true, status, data: { message, ...extra } };
}

// Единый вид товара «как с сервера»: id = server_id, плюс uuid
function shapeProduct(p) {
  if (!p) return null;
  return {
    id: p.server_id,
    uuid: p.uuid,
    category_uuid: p.category_uuid,
    name: p.name,
    sku: p.sku,
    barcode: p.barcode,
    price: p.price,
    sale_price: p.sale_price ?? p.price,
    purchase_price: p.purchase_price,
    stock_quantity: p.stock_quantity,
    in_stock: !!p.in_stock,
    is_active: !!p.is_active,
    is_hot: !!p.is_hot,
    hot_order: p.hot_order,
    hot_group: p.hot_group,
    image: p.image,
    updated_at: p.updated_at,
  };
}

function shapeUser(u) {
  if (!u) return null;
  return {
    id: u.server_id,
    uuid: u.uuid,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
  };
}

// ─── Handlers ────────────────────────────────────────────────

function posProducts(db) {
  const rows = db
    .prepare('SELECT * FROM products WHERE is_active = 1 ORDER BY name ASC')
    .all();
  return ok(rows.map(shapeProduct));
}

function posProductsSearch(db, query) {
  const q = (query.q || '').trim();
  if (!q) return ok([]);
  const like = `%${q.toLowerCase()}%`;
  const rows = db
    .prepare(`
      SELECT * FROM products
      WHERE is_active = 1 AND (lower_ru(name) LIKE ? OR lower_ru(sku) LIKE ? OR barcode = ?)
      LIMIT 10
    `)
    .all(like, like, q);
  return ok(rows.map(shapeProduct));
}

function posStaff(db) {
  const rows = db
    .prepare(`SELECT * FROM users WHERE role IN ('admin','purchaser','cashier')`)
    .all();
  return ok(rows.map((u) => ({ id: u.server_id, uuid: u.uuid, name: u.name, role: u.role })));
}

function posSummary(db, query) {
  const today = new Date().toISOString().slice(0, 10);
  let staffUuid = null;
  if (query.staff_id) {
    const staff = db
      .prepare('SELECT uuid FROM users WHERE server_id = ? OR uuid = ?')
      .get(Number(query.staff_id) || -1, String(query.staff_id));
    staffUuid = staff ? staff.uuid : '__none__';
  }

  const where = staffUuid
    ? `WHERE date(created_at) = ? AND staff_uuid = ?`
    : `WHERE date(created_at) = ?`;
  const params = staffUuid ? [today, staffUuid] : [today];

  const row = db
    .prepare(`
      SELECT
        COALESCE(SUM(cash_received), 0) AS cash_total,
        COALESCE(SUM(transfer_received), 0) AS transfer_total,
        COUNT(*) AS sales_count
      FROM orders ${where}
    `)
    .get(...params);

  return ok({
    cash_total: Number(row.cash_total),
    transfer_total: Number(row.transfer_total),
    total: Number(row.cash_total) + Number(row.transfer_total),
    pending_cash: 0,
    pending_transfer: 0,
    sales_count: row.sales_count,
    offline: true,
  });
}

// Создание продажи. Принимает тело онлайн-формата PosController@store:
//   { items: [{product_id|product_uuid, quantity, price, name?}], cash_amount,
//     transfer_amount, user_id|user_uuid, staff_uuid?, is_debt, due_date, discount, terminal_id }
function posCreateSale(db, body, ctx) {
  const items = body.items || [];
  if (!items.length) return fail('Нет позиций в чеке', 422);

  // Резолвим товары: по product_uuid либо по server_id (product_id)
  const resolved = [];
  for (const item of items) {
    let product = null;
    if (item.product_uuid || item.uuid) {
      product = db
        .prepare('SELECT * FROM products WHERE uuid = ?')
        .get(item.product_uuid || item.uuid);
    }
    if (!product && item.product_id) {
      product = db.prepare('SELECT * FROM products WHERE server_id = ?').get(item.product_id);
    }
    if (!product) {
      return fail(`Товар не найден в локальной базе (id: ${item.product_id || item.product_uuid})`, 422);
    }
    resolved.push({ item, product });
  }

  // Валидации из настроек магазина (кэш с сервера)
  const allowPriceChange = getStoreSetting(db, 'pos_allow_price_change', '1');
  for (const { item, product } of resolved) {
    const originalPrice = Number(product.sale_price ?? product.price);
    const sellingPrice = Number(item.price);
    const costPrice = Number(product.purchase_price || 0);

    if ((allowPriceChange === '0' || allowPriceChange === 'false') && Math.abs(sellingPrice - originalPrice) > 0.01) {
      return fail(`Изменение цены запрещено настройками системы для товара: ${product.name}`, 422);
    }
    if (sellingPrice < costPrice) {
      return fail(`Цена товара '${product.name}' (${sellingPrice} сом) ниже себестоимости (${costPrice} сом). Продажа невозможна.`, 422);
    }
  }

  const isDebt = !!body.is_debt;
  if (isDebt) {
    const allowDebt = getStoreSetting(db, 'pos_allow_debt', '1');
    if (allowDebt === 'false' || allowDebt === '0') {
      return fail('Продажа в долг запрещена настройками системы', 422);
    }
  }

  const totalAmount = resolved.reduce((s, { item }) => s + Number(item.price) * Number(item.quantity), 0);
  const discount = Number(body.discount || 0);
  const orderTotal = totalAmount - discount;
  const rawCash = Number(body.cash_amount || 0);
  const rawTransfer = Number(body.transfer_amount || 0);
  const storeTransfer = Math.min(rawTransfer, orderTotal);
  const storeCash = Math.min(rawCash, Math.max(0, orderTotal - storeTransfer));
  const paymentMethod = rawTransfer > 0 ? (rawCash > 0 ? 'mixed' : 'transfer') : 'cash';

  // user/staff → uuid
  let userUuid = body.user_uuid || null;
  if (!userUuid && body.user_id) {
    const u = db.prepare('SELECT uuid FROM users WHERE server_id = ?').get(body.user_id);
    userUuid = u ? u.uuid : null;
  }
  let staffUuid = body.staff_uuid || ctx.currentUserUuid || null;
  if (!staffUuid && body.staff_id) {
    const s = db.prepare('SELECT uuid FROM users WHERE server_id = ?').get(body.staff_id);
    staffUuid = s ? s.uuid : null;
  }

  const orderUuid = randomUUID();
  const terminalPrefix = body.terminal_id || getSetting(db, 'terminal_id') || 'k1';
  const nowIso = new Date().toISOString();

  const transaction = db.transaction(() => {
    // Локальная нумерация чеков по префиксу кассы: k1-1, k1-2...
    const lastOrder = db
      .prepare(`
        SELECT order_number FROM orders
        WHERE order_number LIKE ?
        ORDER BY CAST(SUBSTR(order_number, INSTR(order_number, '-') + 1) AS INTEGER) DESC
        LIMIT 1
      `)
      .get(`${terminalPrefix}-%`);

    let nextNumber = 1;
    if (lastOrder && lastOrder.order_number) {
      const parts = lastOrder.order_number.split('-');
      if (parts.length > 1) nextNumber = parseInt(parts[1], 10) + 1;
    }
    const orderNumber = `${terminalPrefix}-${nextNumber}`;

    db.prepare(`
      INSERT INTO orders (
        uuid, order_number, user_uuid, staff_uuid, subtotal, total_amount, total,
        discount, payment_method, cash_received, transfer_received,
        is_debt, due_date, is_financed, status, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'delivered', ?, ?)
    `).run(
      orderUuid, orderNumber, userUuid, staffUuid,
      totalAmount, totalAmount, orderTotal,
      discount, paymentMethod, storeCash, storeTransfer,
      isDebt ? 1 : 0, body.due_date || null,
      `Оффлайн продажа (POS - ${terminalPrefix})`, nowIso
    );

    const stmtItem = db.prepare(`
      INSERT INTO order_items (uuid, order_uuid, product_uuid, product_name, product_sku, quantity, price_at_sale, total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const shapedItems = [];
    for (const { item, product } of resolved) {
      const itemUuid = randomUUID();
      const lineTotal = Number(item.price) * Number(item.quantity);
      stmtItem.run(itemUuid, orderUuid, product.uuid, product.name, product.sku, item.quantity, item.price, lineTotal);
      db.prepare(`
        UPDATE products
        SET stock_quantity = stock_quantity - ?,
            sales_count = COALESCE(sales_count, 0) + ?,
            in_stock = CASE WHEN stock_quantity - ? > 0 THEN 1 ELSE 0 END
        WHERE uuid = ?
      `).run(item.quantity, item.quantity, item.quantity, product.uuid);

      shapedItems.push({
        uuid: itemUuid,
        product_uuid: product.uuid,
        product_id: product.server_id,
        product_name: product.name,
        name: product.name,
        sku: product.sku,
        quantity: item.quantity,
        price: item.price,
        total: lineTotal,
        product: shapeProduct(db.prepare('SELECT * FROM products WHERE uuid = ?').get(product.uuid)),
      });
    }

    // Outbox: формат payload совместим с /sync/push (SyncController)
    db.prepare(`
      INSERT INTO sync_queue (entity_type, entity_uuid, payload)
      VALUES ('SALE', ?, ?)
    `).run(orderUuid, JSON.stringify({
      uuid: orderUuid,
      order_number: orderNumber,
      user_uuid: userUuid,
      staff_uuid: staffUuid,
      total_amount: totalAmount,
      discount,
      payment_method: paymentMethod,
      cash_amount: storeCash,
      transfer_amount: storeTransfer,
      is_debt: isDebt,
      due_date: body.due_date || null,
      created_at: nowIso,
      items: shapedItems.map((i) => ({
        uuid: i.uuid,
        product_uuid: i.product_uuid,
        name: i.product_name,
        sku: i.sku,
        quantity: i.quantity,
        price: i.price,
      })),
    }));

    return { orderNumber, shapedItems };
  });

  try {
    const { orderNumber, shapedItems } = transaction();
    // Форма ответа повторяет PosController@store (order JSON, 201)
    return ok({
      id: orderUuid,
      uuid: orderUuid,
      order_number: orderNumber,
      user_uuid: userUuid,
      staff_uuid: staffUuid,
      subtotal: totalAmount,
      discount,
      total: orderTotal,
      status: 'delivered',
      payment_status: isDebt && (storeCash + storeTransfer) < orderTotal ? 'pending' : 'paid',
      payment_method: paymentMethod,
      cash_received: storeCash,
      transfer_received: storeTransfer,
      created_at: nowIso,
      items: shapedItems,
      offline: true,
    }, 201);
  } catch (e) {
    return fail(e.message, 500);
  }
}

// Подтверждение финансов: для локальных (ещё не синхронизированных) заказов —
// no-op, т.к. /sync/push и так создаёт финтранзакции. Числовые id — на сервер.
function posConfirmSale(db, id) {
  if (/^\d+$/.test(String(id))) return NOT_HANDLED; // числовой id — серверный заказ

  const order = db.prepare('SELECT * FROM orders WHERE uuid = ?').get(id);
  if (!order) return fail('Заказ не найден локально', 404);
  db.prepare('UPDATE orders SET is_financed = 1 WHERE uuid = ?').run(id);
  return ok({ message: 'Данные будут внесены в финансовый отчет при синхронизации', offline: true });
}

function couponValidate(db, body) {
  const code = (body.code || '').trim();
  const amount = Number(body.amount || 0);
  if (!code) return fail('Купон не найден', 404);

  const coupon = db.prepare('SELECT * FROM coupons WHERE code = ?').get(code);
  if (!coupon) return fail('Купон не найден', 404);

  const expired = coupon.expires_at && new Date(coupon.expires_at) < new Date();
  if (!coupon.is_active || expired) return fail('Купон недействителен или истек', 400);

  if (amount < Number(coupon.min_order_amount || 0)) {
    return fail(`Минимальная сумма заказа для этого купона: ${coupon.min_order_amount}`, 400);
  }

  return ok({ valid: true, code: coupon.code, type: coupon.type, value: coupon.value });
}

// GET /users?search=&role= — форма Laravel paginate
function usersIndex(db, query) {
  const perPage = Number(query.per_page || 15);
  const page = Number(query.page || 1);
  const conditions = [];
  const params = [];

  if (query.search) {
    const like = `%${String(query.search).toLowerCase()}%`;
    conditions.push('(lower_ru(name) LIKE ? OR lower_ru(email) LIKE ? OR phone LIKE ?)');
    params.push(like, like, `%${query.search}%`);
  }
  if (query.role) {
    conditions.push('role = ?');
    params.push(query.role);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) AS cnt FROM users ${where}`).get(...params).cnt;
  const rows = db
    .prepare(`SELECT * FROM users ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
    .all(...params, perPage, (page - 1) * perPage);

  return ok({
    current_page: page,
    data: rows.map(shapeUser),
    per_page: perPage,
    total,
    last_page: Math.max(1, Math.ceil(total / perPage)),
  });
}

// GET /products?is_hot=&search=&per_page=&sort=&direction= — форма Laravel paginate
function productsIndex(db, query) {
  const perPage = Number(query.per_page || 15);
  const page = Number(query.page || 1);
  const conditions = ['is_active = 1'];
  const params = [];

  if (query.search) {
    const like = `%${String(query.search).toLowerCase()}%`;
    conditions.push('(lower_ru(name) LIKE ? OR lower_ru(sku) LIKE ? OR barcode LIKE ?)');
    params.push(like, like, `%${query.search}%`);
  }
  if (query.is_hot === 'true' || query.is_hot === '1') conditions.push('is_hot = 1');
  const where = `WHERE ${conditions.join(' AND ')}`;

  const sortWhitelist = { name: 'name', price: 'price', hot_order: 'hot_order', updated_at: 'updated_at' };
  const sortCol = sortWhitelist[query.sort] || 'name';
  const dir = String(query.direction).toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  const total = db.prepare(`SELECT COUNT(*) AS cnt FROM products ${where}`).get(...params).cnt;
  const rows = db
    .prepare(`SELECT * FROM products ${where} ORDER BY ${sortCol} ${dir} LIMIT ? OFFSET ?`)
    .all(...params, perPage, (page - 1) * perPage);

  return ok({
    current_page: page,
    data: rows.map(shapeProduct),
    per_page: perPage,
    total,
    last_page: Math.max(1, Math.ceil(total / perPage)),
  });
}

function findProductByAnyId(db, id) {
  const isNumeric = /^\d+$/.test(String(id));
  return isNumeric
    ? db.prepare('SELECT * FROM products WHERE server_id = ?').get(Number(id))
    : db.prepare('SELECT * FROM products WHERE uuid = ?').get(String(id));
}

function productShow(db, id) {
  const product = findProductByAnyId(db, id);
  if (!product) return fail('Товар не найден', 404);
  return ok(shapeProduct(product));
}

// ─── Заказы (офлайн-просмотр истории + повторная печать чека) ───
// Локальная продажа без json → синтезируем форму сервера из order_items
function shapeLocalOrder(db, o) {
  if (o.json) {
    const parsed = JSON.parse(o.json);
    if (!o.synced_at) parsed.offline = true;
    return parsed;
  }
  const items = db.prepare('SELECT * FROM order_items WHERE order_uuid = ?').all(o.uuid);
  const staff = o.staff_uuid ? db.prepare('SELECT * FROM users WHERE uuid = ?').get(o.staff_uuid) : null;
  const user = o.user_uuid ? db.prepare('SELECT * FROM users WHERE uuid = ?').get(o.user_uuid) : null;
  return {
    id: o.server_id || o.uuid,
    uuid: o.uuid,
    order_number: o.order_number,
    subtotal: o.subtotal,
    discount: o.discount,
    total: o.total,
    status: o.status,
    payment_method: o.payment_method,
    payment_status: o.is_debt ? 'pending' : 'paid',
    cash_received: o.cash_received,
    transfer_received: o.transfer_received,
    notes: o.notes,
    created_at: o.created_at,
    user: shapeUser(user),
    staff: staff ? { id: staff.server_id, name: staff.name } : null,
    items: items.map((i) => ({
      uuid: i.uuid,
      product_name: i.product_name,
      product_sku: i.product_sku,
      quantity: i.quantity,
      price: i.price_at_sale,
      total: i.total,
      product: shapeProduct(db.prepare('SELECT * FROM products WHERE uuid = ?').get(i.product_uuid)),
    })),
    offline: !o.synced_at,
  };
}

function ordersIndex(db, query) {
  const perPage = Number(query.per_page || 15);
  const page = Number(query.page || 1);
  const conditions = [];
  const params = [];

  if (query.source === 'pos') conditions.push(`notes LIKE '%POS%'`);
  else if (query.source === 'online') conditions.push(`(notes IS NULL OR notes NOT LIKE '%POS%')`);
  if (query.status) { conditions.push('status = ?'); params.push(query.status); }
  if (query.search) {
    conditions.push('lower_ru(order_number) LIKE ?');
    params.push(`%${String(query.search).toLowerCase()}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) AS cnt FROM orders ${where}`).get(...params).cnt;
  const rows = db
    .prepare(`SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, perPage, (page - 1) * perPage);

  return ok({
    current_page: page,
    data: rows.map((o) => shapeLocalOrder(db, o)),
    per_page: perPage,
    total,
    last_page: Math.max(1, Math.ceil(total / perPage)),
  });
}

function orderShow(db, id) {
  const isNumeric = /^\d+$/.test(String(id));
  const order = isNumeric
    ? db.prepare('SELECT * FROM orders WHERE server_id = ?').get(Number(id))
    : db.prepare('SELECT * FROM orders WHERE uuid = ?').get(String(id));
  if (!order) return fail('Заказ не найден', 404);
  return ok(shapeLocalOrder(db, order));
}

// ─── Поставщики / закупки / долги (кэш серверных строк) ───
function suppliersIndex(db, query) {
  const perPage = Number(query.per_page || 15);
  const page = Number(query.page || 1);
  const total = db.prepare('SELECT COUNT(*) AS cnt FROM suppliers').get().cnt;
  const rows = db
    .prepare('SELECT json FROM suppliers ORDER BY updated_at DESC LIMIT ? OFFSET ?')
    .all(perPage, (page - 1) * perPage);
  return ok({
    current_page: page,
    data: rows.map((r) => JSON.parse(r.json)),
    per_page: perPage,
    total,
    last_page: Math.max(1, Math.ceil(total / perPage)),
  });
}

function purchasesIndex(db, query) {
  const perPage = Number(query.per_page || 15);
  const page = Number(query.page || 1);
  const conditions = [];
  const params = [];
  if (query.supplier_id) { conditions.push('supplier_id = ?'); params.push(Number(query.supplier_id)); }
  if (query.status) { conditions.push('status = ?'); params.push(query.status); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) AS cnt FROM purchases ${where}`).get(...params).cnt;
  const rows = db
    .prepare(`SELECT * FROM purchases ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, perPage, (page - 1) * perPage);
  return ok({
    current_page: page,
    data: rows.map((r) => {
      const parsed = JSON.parse(r.json);
      if (!r.synced_at) parsed.offline = true;
      return parsed;
    }),
    per_page: perPage,
    total,
    last_page: Math.max(1, Math.ceil(total / perPage)),
  });
}

// Офлайн-создание закупки: outbox PURCHASE_CREATE + пересчёт остатков локально
function purchaseCreate(db, body) {
  const items = body.items || [];
  if (!body.supplier_id || !items.length) return fail('Укажите поставщика и позиции', 422);

  const supplier = db.prepare('SELECT * FROM suppliers WHERE server_id = ?').get(Number(body.supplier_id));
  let totalAmount = 0;
  for (const i of items) totalAmount += Number(i.quantity) * Number(i.buy_price);
  const paidAmount = Number(body.paid_amount || 0);

  const purchaseUuid = randomUUID();
  const nowIso = new Date().toISOString();

  const itemsShaped = items.map((i) => {
    const product = db.prepare('SELECT * FROM products WHERE server_id = ?').get(Number(i.product_id));
    return {
      product_id: i.product_id,
      product: product ? { id: product.server_id, name: product.name, sku: product.sku } : null,
      quantity: i.quantity,
      buy_price: i.buy_price,
      total: Number(i.quantity) * Number(i.buy_price),
    };
  });

  const shaped = {
    id: purchaseUuid,
    uuid: purchaseUuid,
    supplier_id: body.supplier_id,
    supplier: supplier ? { id: supplier.server_id, name: supplier.name } : null,
    total_amount: totalAmount,
    paid_amount: paidAmount,
    status: 'completed',
    notes: body.notes || null,
    items: itemsShaped,
    created_at: nowIso,
    offline: true,
  };

  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO purchases (uuid, supplier_id, status, json, created_at, updated_at)
      VALUES (?, ?, 'completed', ?, ?, ?)
    `).run(purchaseUuid, Number(body.supplier_id), JSON.stringify(shaped), nowIso, nowIso);

    // приход товара — увеличиваем локальные остатки
    for (const i of items) {
      db.prepare(`
        UPDATE products SET stock_quantity = stock_quantity + ?, in_stock = 1, purchase_price = ?
        WHERE server_id = ?
      `).run(Number(i.quantity), Number(i.buy_price), Number(i.product_id));
    }

    db.prepare(`
      INSERT INTO sync_queue (entity_type, entity_uuid, payload)
      VALUES ('PURCHASE_CREATE', ?, ?)
    `).run(purchaseUuid, JSON.stringify({
      supplier_id: body.supplier_id,
      items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity, buy_price: i.buy_price })),
      paid_amount: paidAmount,
      notes: body.notes || null,
      created_at: nowIso,
    }));
  });

  try {
    transaction();
    return ok(shaped, 201);
  } catch (e) {
    return fail(e.message, 500);
  }
}

function debtsIndex(db, query) {
  const perPage = Number(query.per_page || 15);
  const page = Number(query.page || 1);
  const conditions = [];
  const params = [];
  if (query.status && query.status !== 'all') {
    if (query.status === 'active') conditions.push(`status IN ('active','partial')`);
    else { conditions.push('status = ?'); params.push(query.status); }
  }
  if (query.search) {
    const like = `%${String(query.search).toLowerCase()}%`;
    conditions.push('(lower_ru(user_name) LIKE ? OR user_phone LIKE ?)');
    params.push(like, `%${query.search}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) AS cnt FROM debts ${where}`).get(...params).cnt;
  const rows = db
    .prepare(`SELECT json FROM debts ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
    .all(...params, perPage, (page - 1) * perPage);
  return ok({
    current_page: page,
    data: rows.map((r) => JSON.parse(r.json)),
    per_page: perPage,
    total,
    last_page: Math.max(1, Math.ceil(total / perPage)),
  });
}

// Офлайн-погашение долга: outbox DEBT_PAY + правка локального кэша
function debtPay(db, id, body) {
  const amount = Number(body.amount || 0);
  if (amount <= 0) return fail('Сумма должна быть больше нуля', 422);

  const row = db.prepare('SELECT * FROM debts WHERE server_id = ?').get(Number(id));
  if (!row) return fail('Долг не найден локально', 404);

  const debt = JSON.parse(row.json);
  debt.paid_amount = Number(debt.paid_amount) + amount;
  debt.remaining_amount = Number(debt.total_amount) - debt.paid_amount;
  if (debt.remaining_amount <= 0) {
    debt.status = 'paid';
    debt.remaining_amount = 0;
  } else {
    debt.status = 'partial';
  }
  debt.payments = debt.payments || [];
  debt.payments.push({
    amount,
    payment_method: body.payment_method || 'cash',
    created_at: new Date().toISOString(),
    offline: true,
  });

  const transaction = db.transaction(() => {
    db.prepare('UPDATE debts SET status = ?, json = ? WHERE server_id = ?')
      .run(debt.status, JSON.stringify(debt), Number(id));
    db.prepare(`
      INSERT INTO sync_queue (entity_type, entity_uuid, payload)
      VALUES ('DEBT_PAY', ?, ?)
    `).run(randomUUID(), JSON.stringify({
      debt_id: Number(id),
      amount,
      payment_method: body.payment_method || 'cash',
      created_at: new Date().toISOString(),
    }));
  });

  try {
    transaction();
    return ok(debt);
  } catch (e) {
    return fail(e.message, 500);
  }
}

// ─── Офлайн-CRUD товаров (JSON-запросы; фото — только онлайн) ───
const PRODUCT_FIELDS = ['name', 'sku', 'barcode', 'price', 'sale_price', 'purchase_price', 'stock_quantity', 'is_active', 'is_hot', 'hot_order', 'hot_group'];

function productCreate(db, body) {
  if (!body.name) return fail('Название товара обязательно', 422);
  const uuid = randomUUID();
  const nowIso = new Date().toISOString();

  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO products (uuid, name, sku, barcode, price, sale_price, purchase_price, stock_quantity, is_active, in_stock, is_hot, hot_order, hot_group, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuid, body.name, body.sku || null, body.barcode || null,
      Number(body.price || 0), Number(body.sale_price ?? body.price ?? 0),
      Number(body.purchase_price || 0), Number(body.stock_quantity || 0),
      body.is_active === false ? 0 : 1,
      Number(body.stock_quantity || 0) > 0 ? 1 : 0,
      body.is_hot ? 1 : 0, body.hot_order ?? null, body.hot_group ?? null, nowIso
    );
    db.prepare(`INSERT INTO sync_queue (entity_type, entity_uuid, payload) VALUES ('PRODUCT_CREATE', ?, ?)`)
      .run(uuid, JSON.stringify({ ...pickFields(body, PRODUCT_FIELDS), uuid, category_id: body.category_id || null }));
  });

  try {
    transaction();
    return ok(shapeProduct(db.prepare('SELECT * FROM products WHERE uuid = ?').get(uuid)), 201);
  } catch (e) {
    return fail(e.message, 500);
  }
}

function productUpdate(db, id, body) {
  const product = findProductByAnyId(db, id);
  if (!product) return fail('Товар не найден', 404);

  const fields = pickFields(body, PRODUCT_FIELDS);
  if (!Object.keys(fields).length) return fail('Нет полей для обновления', 422);

  const transaction = db.transaction(() => {
    const sets = Object.keys(fields).map((k) => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE products SET ${sets}, updated_at = @updated_at WHERE uuid = @uuid`)
      .run({ ...fields, updated_at: new Date().toISOString(), uuid: product.uuid });
    db.prepare(`INSERT INTO sync_queue (entity_type, entity_uuid, payload) VALUES ('PRODUCT_UPDATE', ?, ?)`)
      .run(randomUUID(), JSON.stringify({ uuid: product.uuid, server_id: product.server_id, fields, category_id: body.category_id }));
  });

  try {
    transaction();
    return ok(shapeProduct(db.prepare('SELECT * FROM products WHERE uuid = ?').get(product.uuid)));
  } catch (e) {
    return fail(e.message, 500);
  }
}

function productDelete(db, id) {
  const product = findProductByAnyId(db, id);
  if (!product) return fail('Товар не найден', 404);

  const transaction = db.transaction(() => {
    db.prepare('UPDATE products SET is_active = 0 WHERE uuid = ?').run(product.uuid);
    db.prepare(`INSERT INTO sync_queue (entity_type, entity_uuid, payload) VALUES ('PRODUCT_DELETE', ?, ?)`)
      .run(randomUUID(), JSON.stringify({ uuid: product.uuid, server_id: product.server_id }));
  });

  try {
    transaction();
    return ok({ message: 'Товар удалён (будет синхронизировано)' });
  } catch (e) {
    return fail(e.message, 500);
  }
}

function pickFields(obj, allowed) {
  const out = {};
  for (const key of allowed) {
    if (obj[key] !== undefined) {
      out[key] = typeof obj[key] === 'boolean' ? (obj[key] ? 1 : 0) : obj[key];
    }
  }
  return out;
}

function settingsPublic(db) {
  const raw = getSetting(db, 'cache_store_settings');
  if (!raw) return NOT_HANDLED; // кэша ещё нет — пусть сходит в сеть
  try {
    return ok(JSON.parse(raw));
  } catch (e) {
    return NOT_HANDLED;
  }
}

// ─── Таблица маршрутов ───────────────────────────────────────
// strategy: 'local' — всегда локально; 'fallback' — только без сети
const ROUTES = [
  { method: 'GET',  pattern: /^\/pos\/products$/,               strategy: 'local',    run: (db, m, q) => posProducts(db) },
  { method: 'GET',  pattern: /^\/pos\/products\/search$/,       strategy: 'local',    run: (db, m, q) => posProductsSearch(db, q) },
  { method: 'GET',  pattern: /^\/pos\/staff$/,                  strategy: 'fallback', run: (db, m, q) => posStaff(db) },
  { method: 'GET',  pattern: /^\/pos\/summary$/,                strategy: 'fallback', run: (db, m, q) => posSummary(db, q) },
  { method: 'POST', pattern: /^\/pos\/sales$/,                  strategy: 'local',    run: (db, m, q, b, ctx) => posCreateSale(db, b, ctx) },
  { method: 'POST', pattern: /^\/pos\/sales\/([^/]+)\/confirm$/, strategy: 'local',   run: (db, m) => posConfirmSale(db, m[1]) },
  { method: 'POST', pattern: /^\/coupons\/validate$/,           strategy: 'local',    run: (db, m, q, b) => couponValidate(db, b) },
  { method: 'GET',  pattern: /^\/users$/,                       strategy: 'fallback', run: (db, m, q) => usersIndex(db, q) },
  { method: 'GET',  pattern: /^\/products$/,                    strategy: 'fallback', run: (db, m, q) => productsIndex(db, q) },
  { method: 'GET',  pattern: /^\/products\/([^/]+)$/,           strategy: 'fallback', run: (db, m) => productShow(db, m[1]) },
  { method: 'POST', pattern: /^\/products$/,                    strategy: 'fallback', run: (db, m, q, b) => productCreate(db, b) },
  { method: 'PUT',  pattern: /^\/products\/([^/]+)$/,           strategy: 'fallback', run: (db, m, q, b) => productUpdate(db, m[1], b) },
  { method: 'DELETE', pattern: /^\/products\/([^/]+)$/,         strategy: 'fallback', run: (db, m) => productDelete(db, m[1]) },
  { method: 'GET',  pattern: /^\/orders$/,                      strategy: 'fallback', run: (db, m, q) => ordersIndex(db, q) },
  { method: 'GET',  pattern: /^\/orders\/([^/]+)$/,             strategy: 'fallback', run: (db, m) => orderShow(db, m[1]) },
  { method: 'GET',  pattern: /^\/suppliers$/,                   strategy: 'fallback', run: (db, m, q) => suppliersIndex(db, q) },
  { method: 'GET',  pattern: /^\/purchases$/,                   strategy: 'fallback', run: (db, m, q) => purchasesIndex(db, q) },
  { method: 'POST', pattern: /^\/purchases$/,                   strategy: 'fallback', run: (db, m, q, b) => purchaseCreate(db, b) },
  { method: 'GET',  pattern: /^\/accounting\/debts$/,           strategy: 'fallback', run: (db, m, q) => debtsIndex(db, q) },
  { method: 'POST', pattern: /^\/accounting\/debts\/(\d+)\/pay$/, strategy: 'fallback', run: (db, m, q, b) => debtPay(db, m[1], b) },
  { method: 'GET',  pattern: /^\/settings\/public$/,            strategy: 'fallback', run: (db) => settingsPublic(db) },
];

// phase: 'pre' — до сети (только strategy 'local'); 'fallback' — сеть упала (все)
function handleLocalApi(db, { endpoint, method = 'GET', body = null, phase = 'pre' }, ctx = {}) {
  const [pathPart, queryPart] = String(endpoint).split('?');
  const query = Object.fromEntries(new URLSearchParams(queryPart || ''));
  const httpMethod = String(method).toUpperCase();

  for (const route of ROUTES) {
    if (route.method !== httpMethod) continue;
    const match = pathPart.match(route.pattern);
    if (!match) continue;
    if (phase === 'pre' && route.strategy !== 'local') continue;

    try {
      return route.run(db, match, query, body || {}, ctx);
    } catch (e) {
      console.error(`[LocalAPI] ${httpMethod} ${pathPart} error:`, e.message);
      return NOT_HANDLED; // при внутренней ошибке — пусть попробует сеть
    }
  }
  return NOT_HANDLED;
}

module.exports = { handleLocalApi };
