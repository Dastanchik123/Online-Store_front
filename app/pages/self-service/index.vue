<script setup>
// Касса самообслуживания — гость без логина, поэтому НЕТ middleware и
// НЕТ обычного layout (никакого admin/CRM меню, только сама касса).
definePageMeta({
  layout: false,
});

const route = useRoute();
const productsStore = useProductsStore();
const ui = useUiStore();
const { getImageUrl } = useImageUrl();
const { createOrder, getPaymentStatus, cancelOrder } = useSelfService();
const { printReceipt } = usePrinter();

// Терминал кассы — для мультикассового self-service (?terminal=SS2 в URL,
// иначе берётся сохранённый в этом браузере/киоске, иначе SS1 по умолчанию)
const terminalId = ref("SS1");
onMounted(() => {
  const fromQuery = String(route.query.terminal || "").trim();
  if (fromQuery) {
    terminalId.value = fromQuery;
    localStorage.setItem("self_service_terminal_id", fromQuery);
  } else {
    terminalId.value = localStorage.getItem("self_service_terminal_id") || "SS1";
  }
});

// ───── Каталог: переиспользуем существующий cache-first Pinia store ─────
const loadingCatalog = ref(true);
onMounted(async () => {
  try {
    await Promise.all([productsStore.fetchProducts(), productsStore.fetchCategories()]);
  } catch (e) {
    ui.error("Не удалось загрузить каталог. Проверьте соединение.");
  } finally {
    loadingCatalog.value = false;
  }
});

const searchQuery = ref("");
const activeCategoryId = ref(null);

const visibleProducts = computed(() => {
  let list = productsStore.products.filter((p) => p.is_active);

  if (activeCategoryId.value) {
    list = list.filter((p) => p.category_id === activeCategoryId.value);
  }

  const q = searchQuery.value.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        String(p.sku || "").toLowerCase().includes(q),
    );
  }

  return list;
});

const formatMoney = (v) =>
  Number(v || 0).toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// ───── Корзина: локальное состояние экрана, НЕ глобальный cart-store ─────
// (тот завязан на серверную корзину авторизованного покупателя — здесь
// гость без логина, корзина живёт только пока открыта касса)
const cart = ref([]);

const cartTotal = computed(() =>
  cart.value.reduce((sum, item) => sum + item.price * item.quantity, 0),
);
const cartItemsCount = computed(() =>
  cart.value.reduce((sum, item) => sum + item.quantity, 0),
);

function addToCart(product) {
  if (!product.in_stock) {
    ui.warning("Этого товара сейчас нет в наличии");
    return;
  }
  const existing = cart.value.find((i) => i.product_id === product.id);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.value.push({
      product_id: product.id,
      name: product.name,
      sku: product.sku,
      price: Number(product.sale_price || product.price),
      quantity: 1,
      image: product.image,
    });
  }
}

function incrementItem(item) {
  item.quantity += 1;
}
function decrementItem(item) {
  if (item.quantity <= 1) {
    removeItem(item);
  } else {
    item.quantity -= 1;
  }
}
function removeItem(item) {
  cart.value = cart.value.filter((i) => i !== item);
}
function clearCart() {
  cart.value = [];
}

// ───── Штрихкод: SKU и есть баркод в этом проекте (см. cashier/pos.vue) ─────
useBarcodeScanner((code) => {
  if (screen.value !== "catalog") return;
  const trimmed = code.trim();
  const found = productsStore.products.find(
    (p) => String(p.sku).toLowerCase() === trimmed.toLowerCase(),
  );
  if (found) {
    addToCart(found);
  } else {
    ui.error(`Товар не найден: ${trimmed}`);
  }
});

// ───── Экраны: catalog → payment → success (+ error-состояния внутри payment) ─────
const screen = ref("catalog"); // catalog | payment | success
const checkingOut = ref(false);
const currentOrder = ref(null);
const currentPayment = ref(null);
const qrDataUrl = ref("");
const paymentState = ref("pending"); // pending | paid | expired | cancelled
let pollTimer = null;
let successTimer = null;

async function checkout() {
  if (cart.value.length === 0 || checkingOut.value) return;
  checkingOut.value = true;
  try {
    const clientUuid = crypto.randomUUID();
    const payload = cart.value.map((i) => ({ product_id: i.product_id, quantity: i.quantity }));
    const res = await createOrder(payload, terminalId.value, clientUuid);

    currentOrder.value = res.order;
    currentPayment.value = res.payment;
    paymentState.value = "pending";
    screen.value = "payment";

    if (res.payment?.qr_value) {
      const QRCode = (await import("qrcode")).default;
      qrDataUrl.value = await QRCode.toDataURL(res.payment.qr_value, { width: 260, margin: 1 });
    }

    startPolling();
  } catch (e) {
    ui.error(e?.data?.message || "Не удалось создать заказ. Попробуйте ещё раз.");
  } finally {
    checkingOut.value = false;
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    if (!currentOrder.value) return;
    try {
      const res = await getPaymentStatus(currentOrder.value.uuid);
      currentOrder.value = res.order;
      if (res.status === "paid") {
        paymentState.value = "paid";
        stopPolling();
        await onPaid();
      } else if (res.status === "expired" || res.status === "cancelled") {
        paymentState.value = res.status;
        stopPolling();
      }
    } catch (e) {
      // сеть моргнула — просто попробуем на следующем тике
    }
  }, 2000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function onPaid() {
  try {
    await printReceipt(currentOrder.value, "thermal");
  } catch (e) {
    // печать не должна блокировать показ экрана успеха
  }
  screen.value = "success";
  successTimer = setTimeout(resetToCatalog, 8000);
}

async function cancelPayment() {
  stopPolling();
  if (currentOrder.value) {
    try {
      await cancelOrder(currentOrder.value.uuid);
    } catch (e) {
      // заказ мог уже истечь сам — не страшно
    }
  }
  screen.value = "catalog"; // корзина остаётся — можно сразу попробовать снова
}

function resetToCatalog() {
  if (successTimer) clearTimeout(successTimer);
  stopPolling();
  clearCart();
  currentOrder.value = null;
  currentPayment.value = null;
  qrDataUrl.value = "";
  paymentState.value = "pending";
  screen.value = "catalog";
}

onUnmounted(() => {
  stopPolling();
  if (successTimer) clearTimeout(successTimer);
});
</script>

<template>
  <div class="ss-kiosk">
    <header class="ss-header">
      <div class="ss-title">Касса самообслуживания</div>
      <div class="ss-terminal">{{ terminalId }}</div>
    </header>

    <!-- ══════════ Каталог + корзина ══════════ -->
    <div v-if="screen === 'catalog'" class="ss-body">
      <div class="ss-catalog">
        <div class="ss-search">
          <i class="bi bi-search"></i>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Найти товар по названию или коду..."
          />
        </div>

        <div class="ss-categories">
          <button
            class="ss-cat-btn"
            :class="{ active: !activeCategoryId }"
            @click="activeCategoryId = null"
          >
            Все товары
          </button>
          <button
            v-for="cat in productsStore.categories"
            :key="cat.id"
            class="ss-cat-btn"
            :class="{ active: activeCategoryId === cat.id }"
            @click="activeCategoryId = cat.id"
          >
            {{ cat.name }}
          </button>
        </div>

        <div v-if="loadingCatalog" class="ss-loading">Загрузка каталога...</div>
        <div v-else-if="visibleProducts.length === 0" class="ss-empty">Товары не найдены</div>
        <div v-else class="ss-product-grid">
          <button
            v-for="product in visibleProducts"
            :key="product.id"
            class="ss-product-tile"
            :disabled="!product.in_stock"
            @click="addToCart(product)"
          >
            <div class="ss-product-img">
              <img v-if="product.image" :src="getImageUrl(product.image)" :alt="product.name" />
              <i v-else class="bi bi-image"></i>
              <span v-if="!product.in_stock" class="ss-out-badge">Нет в наличии</span>
            </div>
            <div class="ss-product-name">{{ product.name }}</div>
            <div class="ss-product-price">
              {{ formatMoney(product.sale_price || product.price) }} сом
            </div>
          </button>
        </div>
      </div>

      <aside class="ss-cart">
        <div class="ss-cart-title">Корзина</div>
        <div v-if="cart.length === 0" class="ss-cart-empty">
          Отсканируйте или выберите товар
        </div>
        <div v-else class="ss-cart-items">
          <div v-for="item in cart" :key="item.product_id" class="ss-cart-item">
            <div class="ss-cart-item-info">
              <div class="ss-cart-item-name">{{ item.name }}</div>
              <div class="ss-cart-item-price">{{ formatMoney(item.price) }} сом</div>
            </div>
            <div class="ss-qty-stepper">
              <button @click="decrementItem(item)"><i class="bi bi-dash"></i></button>
              <span>{{ item.quantity }}</span>
              <button @click="incrementItem(item)"><i class="bi bi-plus"></i></button>
            </div>
            <button class="ss-remove-btn" @click="removeItem(item)">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>

        <div class="ss-cart-footer">
          <div class="ss-cart-total">
            <span>ИТОГО:</span>
            <span>{{ formatMoney(cartTotal) }} сом</span>
          </div>
          <button
            class="ss-pay-btn"
            :disabled="cart.length === 0 || checkingOut"
            @click="checkout"
          >
            <span v-if="checkingOut">Оформляем...</span>
            <span v-else>ОПЛАТИТЬ ({{ cartItemsCount }})</span>
          </button>
          <button v-if="cart.length > 0" class="ss-clear-btn" @click="clearCart">
            Очистить корзину
          </button>
        </div>
      </aside>
    </div>

    <!-- ══════════ Экран оплаты ══════════ -->
    <div v-else-if="screen === 'payment'" class="ss-payment-screen">
      <div class="ss-payment-card">
        <template v-if="paymentState === 'pending'">
          <h2>Оплата</h2>
          <div class="ss-payment-amount">{{ formatMoney(currentOrder?.total) }} сом</div>
          <img v-if="qrDataUrl" :src="qrDataUrl" alt="QR для оплаты" class="ss-qr" />
          <p class="ss-payment-hint">Отсканируйте QR-код телефоном и подтвердите оплату</p>
          <div class="ss-payment-waiting">
            <span class="ss-spinner"></span> Ожидание оплаты...
          </div>
          <button class="ss-back-btn" @click="cancelPayment">НАЗАД</button>
        </template>

        <template v-else-if="paymentState === 'expired' || paymentState === 'cancelled'">
          <h2>Время оплаты истекло</h2>
          <p class="ss-payment-hint">Вернитесь в корзину и попробуйте ещё раз.</p>
          <button class="ss-back-btn ss-back-btn--primary" @click="screen = 'catalog'">
            К КОРЗИНЕ
          </button>
        </template>
      </div>
    </div>

    <!-- ══════════ Экран успеха ══════════ -->
    <div v-else-if="screen === 'success'" class="ss-success-screen">
      <div class="ss-success-card">
        <i class="bi bi-check-circle-fill ss-success-icon"></i>
        <h2>Оплата успешна</h2>
        <div class="ss-success-order">Заказ №{{ currentOrder?.order_number }}</div>
        <div class="ss-success-amount">{{ formatMoney(currentOrder?.total) }} сом</div>
        <p>Спасибо за покупку!</p>
        <button class="ss-back-btn ss-back-btn--primary" @click="resetToCatalog">
          НОВАЯ ПОКУПКА
        </button>
      </div>
    </div>

    <UiToastContainer />
  </div>
</template>

<style scoped>
.ss-kiosk {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: #f1f5f9;
  font-family: "Inter", Arial, sans-serif;
  overflow: hidden;
}

.ss-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: #0f172a;
  color: #fff;
  flex-shrink: 0;
}
.ss-title { font-size: 1.4rem; font-weight: 800; }
.ss-terminal { font-size: 0.9rem; opacity: 0.6; }

.ss-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

.ss-catalog {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px;
  min-width: 0;
  overflow: hidden;
}

.ss-search {
  position: relative;
  margin-bottom: 16px;
  flex-shrink: 0;
}
.ss-search i {
  position: absolute;
  left: 18px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
  font-size: 1.3rem;
}
.ss-search input {
  width: 100%;
  padding: 18px 18px 18px 52px;
  font-size: 1.2rem;
  border: none;
  border-radius: 14px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}
.ss-search input:focus { outline: 3px solid #38bdf8; }

.ss-categories {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 12px;
  flex-shrink: 0;
}
.ss-cat-btn {
  flex-shrink: 0;
  padding: 12px 22px;
  border: none;
  border-radius: 30px;
  background: #fff;
  font-size: 1rem;
  font-weight: 600;
  color: #475569;
  white-space: nowrap;
}
.ss-cat-btn.active { background: #0ea5e9; color: #fff; }

.ss-loading, .ss-empty {
  margin: auto;
  font-size: 1.2rem;
  color: #94a3b8;
}

.ss-product-grid {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 14px;
  align-content: start;
}
.ss-product-tile {
  background: #fff;
  border: none;
  border-radius: 16px;
  padding: 10px;
  text-align: left;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  cursor: pointer;
}
.ss-product-tile:disabled { opacity: 0.5; cursor: not-allowed; }
.ss-product-tile:active:not(:disabled) { transform: scale(0.97); }
.ss-product-img {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 10px;
  background: #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  margin-bottom: 8px;
}
.ss-product-img img { width: 100%; height: 100%; object-fit: cover; }
.ss-product-img i { font-size: 2rem; color: #cbd5e1; }
.ss-out-badge {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}
.ss-product-name {
  font-size: 0.92rem;
  font-weight: 600;
  color: #0f172a;
  line-height: 1.25;
  min-height: 2.3em;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ss-product-price { margin-top: 4px; font-weight: 800; color: #0ea5e9; font-size: 1.05rem; }

.ss-cart {
  width: 380px;
  flex-shrink: 0;
  background: #fff;
  display: flex;
  flex-direction: column;
  box-shadow: -2px 0 10px rgba(0, 0, 0, 0.05);
}
.ss-cart-title {
  padding: 20px 20px 12px;
  font-size: 1.2rem;
  font-weight: 800;
  color: #0f172a;
  flex-shrink: 0;
}
.ss-cart-empty {
  margin: auto;
  color: #94a3b8;
  text-align: center;
  padding: 0 20px;
}
.ss-cart-items { flex: 1; overflow-y: auto; padding: 0 16px; }
.ss-cart-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 4px;
  border-bottom: 1px solid #f1f5f9;
}
.ss-cart-item-info { flex: 1; min-width: 0; }
.ss-cart-item-name {
  font-size: 0.9rem;
  font-weight: 600;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ss-cart-item-price { font-size: 0.85rem; color: #64748b; }
.ss-qty-stepper {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #f1f5f9;
  border-radius: 10px;
  padding: 4px;
}
.ss-qty-stepper button {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: #fff;
  font-size: 1rem;
  color: #0ea5e9;
}
.ss-qty-stepper span { min-width: 20px; text-align: center; font-weight: 700; }
.ss-remove-btn {
  border: none;
  background: none;
  color: #ef4444;
  font-size: 1.1rem;
  padding: 8px;
}

.ss-cart-footer {
  padding: 16px 20px 20px;
  border-top: 1px solid #f1f5f9;
  flex-shrink: 0;
}
.ss-cart-total {
  display: flex;
  justify-content: space-between;
  font-size: 1.3rem;
  font-weight: 800;
  color: #0f172a;
  margin-bottom: 14px;
}
.ss-pay-btn {
  width: 100%;
  padding: 20px;
  border: none;
  border-radius: 16px;
  background: #0ea5e9;
  color: #fff;
  font-size: 1.3rem;
  font-weight: 800;
  letter-spacing: 0.02em;
}
.ss-pay-btn:disabled { background: #cbd5e1; }
.ss-clear-btn {
  width: 100%;
  margin-top: 10px;
  padding: 12px;
  border: none;
  background: none;
  color: #94a3b8;
  font-size: 0.95rem;
}

/* ══════════ Оплата / Успех ══════════ */
.ss-payment-screen, .ss-success-screen {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ss-payment-card, .ss-success-card {
  background: #fff;
  border-radius: 24px;
  padding: 40px 50px;
  text-align: center;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
  max-width: 420px;
}
.ss-payment-card h2, .ss-success-card h2 { font-size: 1.6rem; font-weight: 800; margin-bottom: 16px; }
.ss-payment-amount, .ss-success-amount { font-size: 2rem; font-weight: 800; color: #0ea5e9; margin-bottom: 20px; }
.ss-qr { width: 220px; height: 220px; margin: 0 auto 16px; }
.ss-payment-hint { color: #64748b; margin-bottom: 16px; }
.ss-payment-waiting {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #0ea5e9;
  font-weight: 600;
  margin-bottom: 20px;
}
.ss-spinner {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 3px solid rgba(14, 165, 233, 0.25);
  border-top-color: #0ea5e9;
  animation: ss-spin 0.7s linear infinite;
}
@keyframes ss-spin { to { transform: rotate(360deg); } }

.ss-back-btn {
  width: 100%;
  padding: 16px;
  border: 2px solid #e2e8f0;
  border-radius: 14px;
  background: none;
  color: #64748b;
  font-weight: 700;
  font-size: 1.05rem;
}
.ss-back-btn--primary { background: #0ea5e9; color: #fff; border: none; }

.ss-success-icon { font-size: 4rem; color: #22c55e; margin-bottom: 10px; }
.ss-success-order { color: #64748b; margin-bottom: 6px; }
.ss-success-card p { color: #64748b; margin-bottom: 24px; }

@media (max-width: 900px) {
  .ss-body { flex-direction: column; }
  .ss-cart { width: 100%; max-height: 45vh; }
}
</style>
