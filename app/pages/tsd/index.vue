<script setup>
definePageMeta({
  layout: false,
  middleware: "purchaser",
});

const authStore = useAuthStore();
const uiStore = useUiStore();
const { getProducts } = useProducts();
const { createAdjustment } = useAccounting();

const scanCode = ref("");
const scanInputEl = ref(null);
const loadingProduct = ref(false);
const saving = ref(false);
const product = ref(null);
const candidates = ref([]);
const mode = ref("recount"); // 'recount' | 'receive'
const qtyValue = ref(0);
const sessionLog = ref([]);

// Сканирование камерой устройства (ZXing) — используется, когда у ТСД нет
// физического лазерного сканера или для проверки со смартфона.
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

onMounted(() => focusScan());

const resetProduct = () => {
  product.value = null;
  candidates.value = [];
  scanCode.value = "";
  qtyValue.value = 0;
  mode.value = "recount";
  focusScan();
};

const selectProduct = (p) => {
  product.value = p;
  candidates.value = [];
  mode.value = "recount";
  qtyValue.value = p.stock_quantity ?? 0;
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

const computedNewQuantity = computed(() => {
  if (!product.value) return 0;
  if (mode.value === "receive") {
    return (product.value.stock_quantity ?? 0) + Number(qtyValue.value || 0);
  }
  return Number(qtyValue.value || 0);
});

const diffPreview = computed(() => {
  if (!product.value) return 0;
  return computedNewQuantity.value - (product.value.stock_quantity ?? 0);
});

const adjustQty = (delta) => {
  qtyValue.value = Math.max(0, Number(qtyValue.value || 0) + delta);
};

const setMode = (m) => {
  mode.value = m;
  qtyValue.value = m === "receive" ? 0 : product.value?.stock_quantity ?? 0;
};

const saveAdjustment = async () => {
  if (!product.value || saving.value) return;

  const oldQty = product.value.stock_quantity ?? 0;
  const newQty = computedNewQuantity.value;

  if (newQty === oldQty) {
    uiStore.addToast("Количество не изменилось", "info");
    resetProduct();
    return;
  }

  saving.value = true;
  try {
    const reason =
      mode.value === "receive"
        ? `ТСД: приход +${Number(qtyValue.value || 0)}`
        : "ТСД: пересчёт";

    await createAdjustment({
      product_id: product.value.id,
      new_quantity: newQty,
      reason,
    });

    sessionLog.value.unshift({
      id: Date.now(),
      sku: product.value.sku,
      name: product.value.name,
      old: oldQty,
      new: newQty,
      diff: newQty - oldQty,
      time: new Date().toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    });

    uiStore.addToast("Остаток обновлён", "success");
    resetProduct();
  } catch (e) {
    console.error(e);
    uiStore.addToast(
      e?.data?.message || "Не удалось сохранить изменение",
      "error"
    );
  } finally {
    saving.value = false;
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
      <NuxtLink to="/purchaser" class="back-link">
        <i class="bi bi-arrow-left"></i>
      </NuxtLink>
      <div class="header-title">
        <div class="fw-bold">ТСД</div>
        <small class="opacity-75">{{ authStore.user?.name }}</small>
      </div>
      <div style="width: 40px"></div>
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
          <small class="text-muted">SKU: {{ c.sku }} · остаток {{ c.stock_quantity }}</small>
        </button>
      </div>

      <!-- Карточка найденного товара -->
      <div v-if="product" class="product-card">
        <div class="d-flex justify-content-between align-items-start mb-2">
          <div>
            <div class="product-name">{{ product.name }}</div>
            <small class="text-muted">SKU: {{ product.sku }}</small>
          </div>
          <button class="close-btn" @click="resetProduct">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>

        <div class="current-stock">
          <span class="text-muted small">Текущий остаток</span>
          <div class="current-stock-value">{{ product.stock_quantity }}</div>
        </div>

        <div class="mode-toggle">
          <button
            class="mode-btn"
            :class="{ active: mode === 'recount' }"
            @click="setMode('recount')"
          >
            <i class="bi bi-arrow-repeat me-1"></i>Пересчёт
          </button>
          <button
            class="mode-btn"
            :class="{ active: mode === 'receive' }"
            @click="setMode('receive')"
          >
            <i class="bi bi-box-arrow-in-down me-1"></i>Приход
          </button>
        </div>

        <div class="qty-label">
          {{ mode === "receive" ? "Количество к приходу" : "Фактическое количество" }}
        </div>
        <div class="qty-stepper">
          <button class="qty-btn" @click="adjustQty(-1)">
            <i class="bi bi-dash-lg"></i>
          </button>
          <input
            v-model.number="qtyValue"
            type="number"
            inputmode="numeric"
            class="qty-input"
          />
          <button class="qty-btn" @click="adjustQty(1)">
            <i class="bi bi-plus-lg"></i>
          </button>
        </div>

        <div class="preview-row" v-if="mode === 'receive'">
          Новый остаток: <b>{{ computedNewQuantity }}</b>
        </div>
        <div
          class="preview-row"
          v-else-if="diffPreview !== 0"
          :class="diffPreview > 0 ? 'text-success' : 'text-danger'"
        >
          Разница: <b>{{ diffPreview > 0 ? "+" : "" }}{{ diffPreview }}</b>
        </div>

        <button
          class="save-btn"
          :disabled="saving"
          @click="saveAdjustment"
        >
          <span v-if="saving" class="spinner-border spinner-border-sm me-2"></span>
          Сохранить
        </button>
      </div>

      <!-- Журнал сессии -->
      <div v-else class="session-log">
        <div class="session-log-title">
          Сегодня отсканировано: {{ sessionLog.length }}
        </div>
        <div v-if="!sessionLog.length" class="empty-hint">
          <i class="bi bi-upc-scan fs-1 opacity-25"></i>
          <p class="mt-2 mb-0">Отсканируйте товар, чтобы начать</p>
        </div>
        <div v-for="item in sessionLog" :key="item.id" class="log-row">
          <div class="flex-grow-1">
            <div class="fw-bold small">{{ item.name }}</div>
            <small class="text-muted">{{ item.sku }} · {{ item.time }}</small>
          </div>
          <div
            class="log-diff"
            :class="item.diff > 0 ? 'text-success' : item.diff < 0 ? 'text-danger' : 'text-muted'"
          >
            {{ item.old }} → {{ item.new }}
          </div>
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

.back-link {
  color: white;
  font-size: 1.25rem;
  width: 40px;
  display: flex;
  align-items: center;
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

.product-name {
  font-size: 1.15rem;
  font-weight: 700;
}

.close-btn {
  border: none;
  background: #f1f5f9;
  width: 36px;
  height: 36px;
  border-radius: 50%;
}

.current-stock {
  text-align: center;
  background: #f8fafc;
  border-radius: 0.75rem;
  padding: 0.75rem;
  margin: 0.75rem 0;
}

.current-stock-value {
  font-size: 2rem;
  font-weight: 800;
  color: #1e293b;
}

.mode-toggle {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.mode-btn {
  flex: 1;
  padding: 0.65rem;
  border-radius: 0.75rem;
  border: 2px solid #e2e8f0;
  background: white;
  font-weight: 600;
  color: #64748b;
}

.mode-btn.active {
  border-color: #6366f1;
  background: #eef2ff;
  color: #4338ca;
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
  margin-bottom: 0.75rem;
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

.preview-row {
  text-align: center;
  margin-bottom: 0.75rem;
  font-size: 0.95rem;
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

.log-diff {
  font-weight: 700;
  font-size: 0.9rem;
  white-space: nowrap;
}
</style>
