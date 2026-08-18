<script setup>
// Касса самообслуживания — гость без логина, поэтому НЕТ middleware и
// НЕТ обычного layout (никакого admin/CRM меню, только сама касса).
definePageMeta({
  layout: false,
});

const route = useRoute();
const { getProducts } = useProducts();
const ui = useUiStore();
const { getImageUrl } = useImageUrl();
const {
  createOrder,
  getPaymentStatus,
  cancelOrder,
  getDeviceToken,
  clearDeviceToken,
  pairDevice,
} = useSelfService();
const { printReceipt, printers, activePrinter, isConnected, initPrinter, setPrinter, testPrint } = usePrinter();

// ───── Настройка принтера — своя кнопка/модалка на кассе самообслуживания,
// т.к. здесь нет layout кассира и его модалки настройки принтера ─────
const showPrinterModal = ref(false);

// Терминал кассы — для мультикассового self-service (?terminal=SS2 в URL,
// иначе берётся сохранённое значение, иначе SS1 по умолчанию). В Electron
// (выделенный киоск) хранится в SQLite через IPC — переживает переустановку/
// очистку данных браузера, в отличие от localStorage. В обычном браузере
// (без Electron) — fallback на localStorage этого устройства.
const terminalId = ref("SS1");
onMounted(async () => {
  await initPrinter();

  const fromQuery = String(route.query.terminal || "").trim();
  const electron = window.electronAPI;

  if (fromQuery) {
    terminalId.value = fromQuery;
    if (electron?.setSelfServiceTerminalId) {
      await electron.setSelfServiceTerminalId(fromQuery);
    } else {
      localStorage.setItem("self_service_terminal_id", fromQuery);
    }
  } else if (electron?.getSelfServiceTerminalId) {
    terminalId.value = (await electron.getSelfServiceTerminalId()) || "SS1";
  } else {
    terminalId.value = localStorage.getItem("self_service_terminal_id") || "SS1";
  }
});

// ───── Каталог: свой полный список (per_page=-1), а не постранично —
// иначе поиск и сканер штрихкода видят только первую страницу (15 штук
// по умолчанию) и не находят товары, которых там не оказалось ─────
const loadingCatalog = ref(true);
const catalogProducts = ref([]);
async function fetchCatalog() {
  const res = await getProducts({ per_page: -1, is_active: true });
  catalogProducts.value = res.data || [];
}
onMounted(async () => {
  try {
    await Promise.all([fetchCatalog(), fetchHotProducts()]);
  } catch (e) {
    ui.error("Не удалось загрузить каталог. Проверьте соединение.");
  } finally {
    loadingCatalog.value = false;
  }
});

const searchQuery = ref("");

// Полный каталог на кассе не выводим списком — товары добавляются через
// горячие группы слева или сканер штрихкода; результаты поиска — выпадашкой
// под полем ввода (как на обычной кассе, см. cashier/pos.vue)
const visibleProducts = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return [];

  return catalogProducts.value.filter(
    (p) => p.name?.toLowerCase().includes(q) || String(p.sku || "").toLowerCase().includes(q),
  );
});

// ───── Экранная клавиатура для моноблоков (см. components/pos/OnScreenKeyboard.vue) —
// жёстко привязана к фокусу поля поиска, без отдельной кнопки закрытия ─────
const isSearchFocused = ref(false);

// Именно функция в <script>, а не inline `setTimeout(...)` в шаблоне — Vue
// не разрешает браузерные глобалы (setTimeout/window/document) в inline-
// выражениях шаблона, компилятор трактует их как _ctx.setTimeout и падает с
// "_ctx.setTimeout is not a function" (клавиатура из-за этого не закрывалась).
function scheduleSearchBlur() {
  setTimeout(() => {
    isSearchFocused.value = false;
  }, 200);
}

function handleVkbdChar(ch) {
  searchQuery.value += ch;
}
function handleVkbdBackspace() {
  searchQuery.value = searchQuery.value.slice(0, -1);
}
function handleVkbdSpace() {
  handleVkbdChar(" ");
}
function handleVkbdEnter() {
  isSearchFocused.value = false;
  document.activeElement?.blur();
}
function selectSearchResult(product) {
  addToCart(product);
  searchQuery.value = "";
  isSearchFocused.value = false;
}

// ───── Горячие товары: отдельный запрос с is_hot=true (см. admin/hot-products.vue,
// та же логика, что и в cashier/pos.vue) — сайдбар слева открывает
// модалку на 90% экрана с товарами выбранной группы ─────
const hotProducts = ref([]);
async function fetchHotProducts() {
  try {
    const res = await getProducts({ is_hot: true, is_active: true, per_page: 100 });
    hotProducts.value = res.data || [];
  } catch (e) {
    // сайдбар горячих товаров просто не покажется — не блокируем кассу
  }
}
const hotGroups = computed(() => {
  const groups = hotProducts.value.map((p) => p.hot_group).filter(Boolean);
  return [...new Set(groups)];
});
const activeHotGroup = ref(null);
const filteredHotProducts = computed(() =>
  hotProducts.value.filter((p) => p.hot_group === activeHotGroup.value),
);
function toggleHotGroup(group) {
  activeHotGroup.value = activeHotGroup.value === group ? null : group;
}

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
  const found = catalogProducts.value.find(
    (p) => String(p.sku).toLowerCase() === trimmed.toLowerCase(),
  );
  if (found) {
    addToCart(found);
  } else {
    ui.error(`Товар не найден: ${trimmed}`);
  }
});

// ───── Пейринг устройства: касса без device-токена не может создавать заказы ─────
// (см. EnsureSelfServiceDevice на бэкенде) — сотрудник вводит одноразовый код
// из админки один раз при настройке киоска, дальше токен живёт в SQLite/localStorage.
const pairingCode = ref("");
const pairingError = ref("");
const pairingLoading = ref(false);

onMounted(async () => {
  const token = await getDeviceToken();
  if (!token) {
    screen.value = "pairing";
  }
});

async function submitPairing() {
  const code = pairingCode.value.trim();
  if (!code || pairingLoading.value) return;
  pairingLoading.value = true;
  pairingError.value = "";
  try {
    const res = await pairDevice(code);
    // Терминал теперь официально закреплён за этим устройством на сервере —
    // синхронизируем локальную метку, чтобы она не разъезжалась с реальностью.
    terminalId.value = res.terminal_id;
    const electron = window.electronAPI;
    if (electron?.setSelfServiceTerminalId) {
      await electron.setSelfServiceTerminalId(res.terminal_id);
    } else {
      localStorage.setItem("self_service_terminal_id", res.terminal_id);
    }
    pairingCode.value = "";
    screen.value = "catalog";
  } catch (e) {
    pairingError.value = e?.data?.message || "Не удалось привязать кассу. Проверьте код.";
  } finally {
    pairingLoading.value = false;
  }
}

async function handleUnauthorized() {
  await clearDeviceToken();
  stopPolling();
  screen.value = "pairing";
}

// ───── Экраны: pairing → catalog → payment → success (+ error-состояния внутри payment) ─────
const screen = ref("catalog"); // pairing | catalog | payment | success
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
    if (e?.status === 401 || e?.statusCode === 401) {
      await handleUnauthorized();
      return;
    }
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
      if (e?.status === 401 || e?.statusCode === 401) {
        await handleUnauthorized();
        return;
      }
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
      <div class="ss-header-right">
        <button class="ss-printer-btn" @click="showPrinterModal = true" title="Настройка принтера">
          <i class="bi bi-printer"></i>
        </button>
        <div class="ss-terminal">{{ terminalId }}</div>
      </div>
    </header>

    <!-- ══════════ Модалка настройки принтера ══════════ -->
    <div v-if="showPrinterModal" class="modal-backdrop fade show"></div>
    <div
      v-if="showPrinterModal"
      class="modal fade show d-block"
      tabindex="-1"
      @click.self="showPrinterModal = false"
    >
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 rounded-4 shadow-lg">
          <div class="modal-header border-0 p-4">
            <h5 class="modal-title fw-bold">Настройка принтера</h5>
            <button type="button" class="btn-close" @click="showPrinterModal = false"></button>
          </div>
          <div class="modal-body p-4 pt-0">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <label class="form-label fw-bold mb-0">Выберите принтер</label>
              <span :class="isConnected ? 'text-success' : 'text-info'" class="small fw-bold">
                {{ isConnected ? "Принтер: Подключен (Electron)" : "Принтер: Обычный режим" }}
              </span>
            </div>

            <select
              :value="activePrinter"
              @change="(e) => setPrinter(e.target.value)"
              class="form-select rounded-3"
            >
              <option value="">-- По умолчанию --</option>
              <option v-for="p in printers" :key="p" :value="p">{{ p }}</option>
            </select>

            <div v-if="!isConnected" class="alert alert-info mt-2 py-2 small">
              Запустите приложение через <strong>Electron</strong> для выбора принтера и прямой печати.
            </div>

            <small class="text-muted mt-3 d-block">
              Выбранный принтер будет использоваться для печати чеков БЕЗ открытия окна с диалогом печати.
            </small>
          </div>
          <div class="modal-footer border-0 p-4 pt-0 d-flex justify-content-between">
            <button
              type="button"
              class="btn btn-outline-info rounded-pill px-3 fw-bold"
              @click="testPrint"
              :disabled="!isConnected || !activePrinter"
            >
              <i class="bi bi-play-circle me-1"></i> Тест печати
            </button>
            <button type="button" class="btn btn-primary rounded-pill px-4" @click="showPrinterModal = false">
              Готово
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ══════════ Пейринг устройства (первый запуск / отозванный токен) ══════════ -->
    <div v-if="screen === 'pairing'" class="ss-payment-screen">
      <div class="ss-payment-card">
        <h2>Настройка кассы</h2>
        <p class="ss-payment-hint">
          Введите код привязки, выданный администратором для этого терминала.
        </p>
        <form @submit.prevent="submitPairing">
          <input
            v-model="pairingCode"
            type="text"
            inputmode="numeric"
            maxlength="6"
            placeholder="000000"
            class="ss-pairing-input"
            autofocus
          />
          <p v-if="pairingError" class="ss-pairing-error">{{ pairingError }}</p>
          <button
            type="submit"
            class="ss-back-btn ss-back-btn--primary"
            :disabled="pairingLoading || !pairingCode.trim()"
          >
            {{ pairingLoading ? "Привязываем..." : "ПРИВЯЗАТЬ КАССУ" }}
          </button>
        </form>
      </div>
    </div>

    <!-- ══════════ Каталог + корзина ══════════ -->
    <div v-else-if="screen === 'catalog'" class="ss-body">
      <aside v-if="hotGroups.length > 0" class="ss-hot-sidebar">
        <div class="ss-hot-sidebar-icon"><i class="bi bi-fire"></i></div>
        <button
          v-for="group in hotGroups"
          :key="group"
          class="ss-hot-tab"
          :class="{ active: activeHotGroup === group }"
          @click="toggleHotGroup(group)"
        >
          <i class="bi bi-fire"></i>
          <span>{{ group }}</span>
        </button>
      </aside>

      <div class="ss-catalog">
        <div class="ss-search">
          <i class="bi bi-search"></i>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Найти товар по названию или коду..."
            @focus="isSearchFocused = true"
            @blur="scheduleSearchBlur"
          />

          <div v-if="isSearchFocused && searchQuery.trim()" class="ss-search-dropdown">
            <button
              v-for="product in visibleProducts"
              :key="product.id"
              class="ss-search-row"
              :disabled="!product.in_stock"
              @click="selectSearchResult(product)"
            >
              <div class="ss-search-row-img">
                <img v-if="product.image" :src="getImageUrl(product.image)" :alt="product.name" />
                <i v-else class="bi bi-image"></i>
              </div>
              <div class="ss-search-row-info">
                <div class="ss-search-row-name">{{ product.name }}</div>
                <div class="ss-search-row-sku">
                  SKU: {{ product.sku }}
                  <span v-if="!product.in_stock" class="ss-search-row-out">— нет в наличии</span>
                </div>
              </div>
              <div class="ss-search-row-price">
                {{ formatMoney(product.sale_price || product.price) }} сом
              </div>
            </button>
            <div v-if="visibleProducts.length === 0" class="ss-search-row-empty">
              Ничего не найдено
            </div>
          </div>
        </div>

        <div v-if="loadingCatalog" class="ss-loading">Загрузка каталога...</div>
        <div v-else class="ss-empty">
          <i class="bi bi-fire ss-empty-icon"></i>
          <span>Выберите товар слева или найдите его по названию/коду</span>
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

      <!-- Модалка горячей группы — сайдбар остаётся кликабельным поверх (можно
           переключать группы, не закрывая модалку) -->
      <Transition name="fade">
        <div
          v-if="activeHotGroup"
          class="ss-hot-modal-backdrop"
          @click="activeHotGroup = null"
        ></div>
      </Transition>
      <Transition name="fade">
        <div v-if="activeHotGroup" class="ss-hot-modal">
          <div class="ss-hot-modal-header">
            <h3><i class="bi bi-fire"></i> {{ activeHotGroup }}</h3>
            <button class="ss-hot-modal-close" @click="activeHotGroup = null">
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
          <div class="ss-hot-modal-grid">
            <button
              v-for="product in filteredHotProducts"
              :key="product.id"
              class="ss-product-tile"
              :disabled="!product.in_stock"
              @click="addToCart(product); activeHotGroup = null"
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
            <div v-if="filteredHotProducts.length === 0" class="ss-empty">
              Нет товаров в этой группе
            </div>
          </div>
        </div>
      </Transition>
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

    <PosOnScreenKeyboard
      v-if="isSearchFocused"
      :show-close="false"
      @char="handleVkbdChar"
      @backspace="handleVkbdBackspace"
      @space="handleVkbdSpace"
      @enter="handleVkbdEnter"
    />
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
.ss-header-right { display: flex; align-items: center; gap: 14px; }
.ss-terminal { font-size: 0.9rem; opacity: 0.6; }
.ss-printer-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 1rem;
  opacity: 0.7;
}
.ss-printer-btn:active { opacity: 1; background: rgba(255, 255, 255, 0.2); }

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

.ss-search-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  max-height: 60vh;
  overflow-y: auto;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.15);
  z-index: 15;
  scrollbar-width: auto;
}
.ss-search-dropdown::-webkit-scrollbar { width: 14px; }
.ss-search-dropdown::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 16px; }
.ss-search-dropdown::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 16px;
  border: 3px solid #f1f5f9;
}
.ss-search-dropdown::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
.ss-search-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  border: none;
  border-bottom: 1px solid #f1f5f9;
  background: #fff;
  text-align: left;
}
.ss-search-row:disabled { opacity: 0.5; }
.ss-search-row:active:not(:disabled) { background: #f1f5f9; }
.ss-search-row-img {
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  border-radius: 10px;
  background: #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.ss-search-row-img img { width: 100%; height: 100%; object-fit: cover; }
.ss-search-row-img i { font-size: 1.4rem; color: #cbd5e1; }
.ss-search-row-info { flex: 1; min-width: 0; }
.ss-search-row-name {
  font-size: 1rem;
  font-weight: 700;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ss-search-row-sku { font-size: 0.82rem; color: #94a3b8; margin-top: 2px; }
.ss-search-row-out { color: #ef4444; font-weight: 600; }
.ss-search-row-price {
  flex-shrink: 0;
  font-weight: 800;
  color: #0ea5e9;
  font-size: 1.05rem;
}
.ss-search-row-empty {
  padding: 24px;
  text-align: center;
  color: #94a3b8;
}

.ss-loading, .ss-empty {
  margin: auto;
  font-size: 1.2rem;
  color: #94a3b8;
  text-align: center;
}
.ss-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.ss-empty-icon { font-size: 2.4rem; color: #cbd5e1; }
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
  width: 680px;
  flex-shrink: 0;
  background: #fff;
  display: flex;
  flex-direction: column;
  box-shadow: -2px 0 10px rgba(0, 0, 0, 0.05);
}

/* ══════════ Сайдбар групп горячих товаров ══════════ */
.ss-hot-sidebar {
  width: 92px;
  flex-shrink: 0;
  background: #0f172a;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 8px;
  overflow-y: auto;
  position: relative;
  z-index: 20;
}
.ss-hot-sidebar-icon {
  color: #f97316;
  font-size: 1.4rem;
  margin-bottom: 6px;
}
.ss-hot-tab {
  width: 100%;
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: #cbd5e1;
  border-radius: 12px;
  padding: 10px 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-size: 0.72rem;
  font-weight: 700;
  text-align: center;
}
.ss-hot-tab i { font-size: 1.3rem; color: #f97316; }
.ss-hot-tab span {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.15;
}
.ss-hot-tab.active { background: #f97316; color: #fff; }
.ss-hot-tab.active i { color: #fff; }

/* ══════════ Модалка горячей группы (90% экрана) ══════════ */
.ss-hot-modal-backdrop {
  position: fixed;
  inset: 0 0 0 92px;
  background: rgba(15, 23, 42, 0.55);
  z-index: 30;
}
.ss-hot-modal {
  position: fixed;
  inset: 5% 5% 5% calc(92px + 5%);
  background: #f8fafc;
  border-radius: 24px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 31;
}
.ss-hot-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 28px;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}
.ss-hot-modal-header h3 {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-size: 1.3rem;
  font-weight: 800;
  color: #0f172a;
}
.ss-hot-modal-header h3 i { color: #f97316; }
.ss-hot-modal-close {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border: none;
  border-radius: 50%;
  background: #ef4444;
  color: #fff;
  font-size: 1.1rem;
}
.ss-hot-modal-grid {
  flex: 1;
  overflow-y: auto;
  padding: 24px 28px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 16px;
  align-content: start;
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.18s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
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
.ss-back-btn--primary:disabled { background: #cbd5e1; cursor: not-allowed; }

.ss-pairing-input {
  width: 100%;
  padding: 18px;
  margin-bottom: 16px;
  border: 2px solid #e2e8f0;
  border-radius: 14px;
  font-size: 2rem;
  font-weight: 800;
  text-align: center;
  letter-spacing: 0.3em;
}
.ss-pairing-input:focus { outline: 3px solid #38bdf8; border-color: transparent; }
.ss-pairing-error { color: #ef4444; font-weight: 600; margin-bottom: 16px; }

.ss-success-icon { font-size: 4rem; color: #22c55e; margin-bottom: 10px; }
.ss-success-order { color: #64748b; margin-bottom: 6px; }
.ss-success-card p { color: #64748b; margin-bottom: 24px; }

@media (max-width: 900px) {
  .ss-body { flex-direction: column; }
  .ss-cart { width: 100%; max-height: 45vh; }
  .ss-hot-sidebar {
    width: 100%;
    flex-direction: row;
    overflow-x: auto;
    overflow-y: hidden;
  }
  .ss-hot-sidebar-icon { margin: 0 4px 0 0; }
  .ss-hot-tab { width: auto; flex-direction: row; white-space: nowrap; padding: 8px 14px; }
  .ss-hot-modal-backdrop { inset: 0; }
  .ss-hot-modal { inset: 4%; }
}
</style>
