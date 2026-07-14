<script setup>
definePageMeta({
  layout: false,
  middleware: "auth",
});

const authStore = useAuthStore();
const uiStore = useUiStore();
const { getProducts } = useProducts();
const { addToCart, getCart } = useCart();
const cartStore = useCartStore();

const scanCode = ref("");
const scanInputEl = ref(null);
const loadingProduct = ref(false);
const adding = ref(false);
const product = ref(null);
const candidates = ref([]);
const qtyValue = ref(1);
const sessionLog = ref([]);

// Сканирование камерой устройства (ZXing) — используется, когда нет
// физического сканера, например при заходе со смартфона.
const showCamera = ref(false);
const cameraError = ref("");
const cameraVideoEl = ref(null);
let cameraControls = null;

const stopCamera = () => {
  cameraControls?.stop();
  cameraControls = null;
};

const closeCamera = () => {
  stopCamera();
  showCamera.value = false;
  cameraError.value = "";
};

const openCamera = async () => {
  showCamera.value = true;
  cameraError.value = "";
  await nextTick();

  try {
    const { BrowserMultiFormatReader } = await import("@zxing/browser");
    const reader = new BrowserMultiFormatReader();
    cameraControls = await reader.decodeFromConstraints(
      { video: { facingMode: { ideal: "environment" } } },
      cameraVideoEl.value,
      (result) => {
        if (result) {
          const text = result.getText();
          stopCamera();
          showCamera.value = false;
          scanCode.value = text;
          lookupProduct();
        }
      }
    );
  } catch (e) {
    console.error(e);
    cameraError.value =
      e?.name === "NotAllowedError"
        ? "Доступ к камере запрещён. Разрешите доступ в настройках браузера."
        : "Не удалось запустить камеру";
  }
};

onBeforeUnmount(() => stopCamera());

const focusScan = () => {
  nextTick(() => scanInputEl.value?.focus());
};

onMounted(() => {
  focusScan();
  getCart().catch(() => {});
});

const resetProduct = () => {
  product.value = null;
  candidates.value = [];
  scanCode.value = "";
  qtyValue.value = 1;
  focusScan();
};

const selectProduct = (p) => {
  product.value = p;
  candidates.value = [];
  qtyValue.value = 1;
  scanCode.value = "";
};

const lookupProduct = async () => {
  const code = scanCode.value.trim();
  if (!code) return;

  loadingProduct.value = true;
  candidates.value = [];
  try {
    const res = await getProducts({
      search: code,
      search_strict: true,
      per_page: 20,
    });
    const items = res.data || res || [];
    const exact = items.find(
      (p) => String(p.sku).toLowerCase() === code.toLowerCase()
    );

    if (exact) {
      selectProduct(exact);
    } else if (items.length === 1) {
      selectProduct(items[0]);
    } else if (items.length > 1) {
      candidates.value = items;
    } else {
      uiStore.addToast(`Товар не найден: ${code}`, "error");
      scanCode.value = "";
      focusScan();
    }
  } catch (e) {
    console.error(e);
    uiStore.addToast("Ошибка поиска товара", "error");
  } finally {
    loadingProduct.value = false;
  }
};

const isOutOfStock = computed(() => {
  if (!product.value) return false;
  return product.value.in_stock === false || (product.value.stock_quantity ?? 1) <= 0;
});

const maxQty = computed(() => {
  const stock = product.value?.stock_quantity;
  return stock && stock > 0 ? stock : 99;
});

const adjustQty = (delta) => {
  qtyValue.value = Math.min(
    maxQty.value,
    Math.max(1, Number(qtyValue.value || 0) + delta)
  );
};

const addProductToCart = async () => {
  if (!product.value || adding.value || isOutOfStock.value) return;

  adding.value = true;
  try {
    await addToCart(product.value.id, qtyValue.value);

    sessionLog.value.unshift({
      id: Date.now(),
      sku: product.value.sku,
      name: product.value.name,
      qty: qtyValue.value,
      time: new Date().toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    });

    uiStore.success("Добавлено в корзину");
    resetProduct();
  } catch (e) {
    console.error(e);
    uiStore.error(e?.data?.message || "Не удалось добавить в корзину");
  } finally {
    adding.value = false;
  }
};

const handleScanKeydown = (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    lookupProduct();
  }
};
</script>

<template>
  <div class="tsd-page">
    <div class="tsd-header">
      <NuxtLink to="/" class="back-link">
        <i class="bi bi-arrow-left"></i>
      </NuxtLink>
      <div class="header-title">
        <div class="fw-bold">Сканер товаров</div>
        <small class="opacity-75">{{ authStore.user?.name }}</small>
      </div>
      <NuxtLink to="/cart" class="cart-link position-relative">
        <i class="bi bi-cart"></i>
        <span v-if="cartStore.itemsCount > 0" class="cart-badge">{{
          cartStore.itemsCount
        }}</span>
      </NuxtLink>
    </div>

    <div class="tsd-body">
      <!-- Поле сканирования -->
      <div class="scan-box">
        <label class="scan-label">
          <i class="bi bi-upc-scan me-1"></i>Скан штрихкода / SKU
        </label>
        <div class="scan-input-wrap">
          <input
            ref="scanInputEl"
            v-model="scanCode"
            type="text"
            inputmode="none"
            autocomplete="off"
            class="scan-input"
            placeholder="Наведите сканер или введите код"
            :disabled="loadingProduct"
            @keydown="handleScanKeydown"
          />
          <button
            class="scan-go-btn"
            :disabled="!scanCode.trim() || loadingProduct"
            @click="lookupProduct"
          >
            <span
              v-if="loadingProduct"
              class="spinner-border spinner-border-sm"
            ></span>
            <i v-else class="bi bi-search"></i>
          </button>
          <button
            class="scan-camera-btn"
            :disabled="loadingProduct"
            @click="openCamera"
          >
            <i class="bi bi-camera"></i>
          </button>
        </div>
      </div>

      <!-- Список кандидатов при неоднозначном совпадении -->
      <div v-if="candidates.length" class="candidates-box">
        <div class="candidates-title">Уточните товар:</div>
        <button
          v-for="c in candidates"
          :key="c.id"
          class="candidate-row"
          @click="selectProduct(c)"
        >
          <div class="fw-bold">{{ c.name }}</div>
          <small class="text-muted">SKU: {{ c.sku }} · {{ c.sale_price || c.price }} сом</small>
        </button>
      </div>

      <!-- Карточка найденного товара -->
      <div v-if="product" class="product-card">
        <div class="d-flex justify-content-between align-items-start mb-2">
          <div class="d-flex align-items-center gap-3">
            <div class="product-thumb">
              <img
                v-if="product.image_url"
                :src="product.image_url"
                :alt="product.name"
              />
              <i v-else class="bi bi-image text-secondary opacity-50"></i>
            </div>
            <div>
              <div class="product-name">{{ product.name }}</div>
              <small class="text-muted">SKU: {{ product.sku }}</small>
            </div>
          </div>
          <button class="close-btn" @click="resetProduct">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>

        <div class="price-row">
          <span class="product-price"
            >{{ product.sale_price || product.price }} сом</span
          >
          <span v-if="isOutOfStock" class="badge text-bg-danger">Нет в наличии</span>
          <span v-else class="badge text-bg-success-subtle text-success">В наличии</span>
        </div>

        <div class="qty-label">Количество</div>
        <div class="qty-stepper">
          <button class="qty-btn" :disabled="isOutOfStock" @click="adjustQty(-1)">
            <i class="bi bi-dash-lg"></i>
          </button>
          <input
            v-model.number="qtyValue"
            type="number"
            inputmode="numeric"
            class="qty-input"
            :disabled="isOutOfStock"
            min="1"
            :max="maxQty"
          />
          <button class="qty-btn" :disabled="isOutOfStock" @click="adjustQty(1)">
            <i class="bi bi-plus-lg"></i>
          </button>
        </div>

        <button
          class="save-btn"
          :disabled="adding || isOutOfStock"
          @click="addProductToCart"
        >
          <span v-if="adding" class="spinner-border spinner-border-sm me-2"></span>
          <i v-else class="bi bi-cart-plus me-2"></i>
          {{ isOutOfStock ? "Нет в наличии" : "Добавить в корзину" }}
        </button>
      </div>

      <!-- Журнал сессии -->
      <div v-else class="session-log">
        <div class="session-log-title">
          Отсканировано за визит: {{ sessionLog.length }}
        </div>
        <div v-if="!sessionLog.length" class="empty-hint">
          <i class="bi bi-upc-scan fs-1 opacity-25"></i>
          <p class="mt-2 mb-0">Отсканируйте товар, чтобы добавить его в корзину</p>
        </div>
        <div v-for="item in sessionLog" :key="item.id" class="log-row">
          <div class="flex-grow-1">
            <div class="fw-bold small">{{ item.name }}</div>
            <small class="text-muted">{{ item.sku }} · {{ item.time }}</small>
          </div>
          <div class="log-qty">×{{ item.qty }}</div>
        </div>
      </div>
    </div>

    <!-- Сканирование камерой -->
    <div v-if="showCamera" class="camera-overlay">
      <div class="camera-header">
        <span>Наведите камеру на штрихкод</span>
        <button class="camera-close-btn" @click="closeCamera">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>
      <div class="camera-viewport">
        <video ref="cameraVideoEl" class="camera-video" muted playsinline></video>
        <div class="camera-frame"></div>
      </div>
      <div v-if="cameraError" class="camera-error">
        <i class="bi bi-exclamation-triangle me-1"></i>{{ cameraError }}
        <button class="camera-retry-btn" @click="openCamera">Повторить</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tsd-page {
  min-height: 100vh;
  background: #f1f5f9;
  display: flex;
  flex-direction: column;
}

.tsd-header {
  background: linear-gradient(135deg, #6366f1 0%, #4338ca 100%);
  color: white;
  padding: 0.75rem 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 10;
}

.back-link,
.cart-link {
  color: white;
  font-size: 1.25rem;
  width: 40px;
  display: flex;
  align-items: center;
}

.cart-link {
  justify-content: flex-end;
}

.cart-badge {
  position: absolute;
  top: -6px;
  right: -2px;
  background: #ef4444;
  color: white;
  font-size: 0.65rem;
  font-weight: 700;
  border-radius: 999px;
  padding: 0.05rem 0.35rem;
}

.header-title {
  text-align: center;
}

.tsd-body {
  flex: 1;
  padding: 1rem;
  max-width: 480px;
  width: 100%;
  margin: 0 auto;
}

.scan-box {
  background: white;
  border-radius: 1rem;
  padding: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  margin-bottom: 1rem;
}

.scan-label {
  font-size: 0.85rem;
  color: #64748b;
  font-weight: 600;
  margin-bottom: 0.5rem;
  display: block;
}

.scan-input-wrap {
  display: flex;
  gap: 0.5rem;
}

.scan-input {
  flex: 1;
  border: 2px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 0.9rem 1rem;
  font-size: 1.1rem;
  min-height: 56px;
}

.scan-input:focus {
  outline: none;
  border-color: #6366f1;
}

.scan-go-btn {
  width: 56px;
  min-height: 56px;
  border: none;
  border-radius: 0.75rem;
  background: #6366f1;
  color: white;
  font-size: 1.25rem;
}

.scan-go-btn:disabled {
  opacity: 0.5;
}

.scan-camera-btn {
  width: 56px;
  min-height: 56px;
  border: none;
  border-radius: 0.75rem;
  background: #eef2ff;
  color: #4338ca;
  font-size: 1.25rem;
}

.scan-camera-btn:disabled {
  opacity: 0.5;
}

.camera-overlay {
  position: fixed;
  inset: 0;
  background: #000;
  z-index: 1000;
  display: flex;
  flex-direction: column;
}

.camera-header {
  color: white;
  padding: 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  background: rgba(0, 0, 0, 0.6);
  z-index: 1;
}

.camera-close-btn {
  border: none;
  background: rgba(255, 255, 255, 0.15);
  color: white;
  width: 36px;
  height: 36px;
  border-radius: 50%;
}

.camera-viewport {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.camera-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.camera-frame {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 80%;
  max-width: 320px;
  height: 120px;
  border: 3px solid #22c55e;
  border-radius: 0.75rem;
  box-shadow: 0 0 0 2000px rgba(0, 0, 0, 0.35);
}

.camera-error {
  position: absolute;
  bottom: 2rem;
  left: 1rem;
  right: 1rem;
  background: rgba(220, 38, 38, 0.95);
  color: white;
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  text-align: center;
}

.camera-retry-btn {
  display: block;
  margin: 0.5rem auto 0;
  border: none;
  background: white;
  color: #dc2626;
  font-weight: 700;
  padding: 0.4rem 1rem;
  border-radius: 0.5rem;
}

.candidates-box {
  background: white;
  border-radius: 1rem;
  padding: 1rem;
  margin-bottom: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.candidates-title {
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: #64748b;
  font-size: 0.85rem;
}

.candidate-row {
  width: 100%;
  text-align: left;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 0.75rem;
  padding: 0.75rem;
  margin-bottom: 0.5rem;
}

.product-card {
  background: white;
  border-radius: 1rem;
  padding: 1.25rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.product-thumb {
  width: 56px;
  height: 56px;
  border-radius: 0.75rem;
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.product-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.product-name {
  font-size: 1.05rem;
  font-weight: 700;
}

.close-btn {
  border: none;
  background: #f1f5f9;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  flex-shrink: 0;
}

.price-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #f8fafc;
  border-radius: 0.75rem;
  padding: 0.75rem 1rem;
  margin: 0.75rem 0;
}

.product-price {
  font-size: 1.4rem;
  font-weight: 800;
  color: #1e293b;
}

.qty-label {
  font-size: 0.85rem;
  color: #64748b;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.qty-stepper {
  display: flex;
  align-items: stretch;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.qty-btn {
  width: 56px;
  min-height: 56px;
  border: none;
  border-radius: 0.75rem;
  background: #eef2ff;
  color: #4338ca;
  font-size: 1.25rem;
}

.qty-btn:disabled {
  opacity: 0.5;
}

.qty-input {
  flex: 1;
  text-align: center;
  font-size: 1.5rem;
  font-weight: 700;
  border: 2px solid #e2e8f0;
  border-radius: 0.75rem;
  min-height: 56px;
}

.qty-input:focus {
  outline: none;
  border-color: #6366f1;
}

.save-btn {
  width: 100%;
  min-height: 56px;
  border: none;
  border-radius: 0.75rem;
  background: #16a34a;
  color: white;
  font-weight: 700;
  font-size: 1.1rem;
}

.save-btn:disabled {
  opacity: 0.6;
}

.session-log {
  background: white;
  border-radius: 1rem;
  padding: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.session-log-title {
  font-weight: 700;
  margin-bottom: 0.75rem;
  color: #1e293b;
}

.empty-hint {
  text-align: center;
  color: #94a3b8;
  padding: 2rem 0;
}

.log-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.6rem 0;
  border-bottom: 1px solid #f1f5f9;
}

.log-row:last-child {
  border-bottom: none;
}

.log-qty {
  font-weight: 700;
  font-size: 0.9rem;
  color: #4338ca;
  white-space: nowrap;
}
</style>
