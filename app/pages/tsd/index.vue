<script setup>
definePageMeta({
  layout: false,
  middleware: "auth",
});

const authStore = useAuthStore();
const uiStore = useUiStore();
const { getProducts } = useProducts();
const { addToCart, getCart, getCheckoutQr } = useCart();
const cartStore = useCartStore();

const scanCode = ref("");
const scanInputEl = ref(null);
const loadingProduct = ref(false);
const adding = ref(false);
const product = ref(null);
const candidates = ref([]);
const qtyValue = ref(1);
const sessionLog = ref([]);

// QR для кассы: покупатель нажимает «Оплатить», получает QR и показывает
// его кассиру — тот сканирует и получает все отсканированные товары разом.
const showCheckoutModal = ref(false);
const checkoutLoading = ref(false);
const checkoutQrDataUrl = ref("");
const checkoutExpiresAt = ref(null);
const checkoutSecondsLeft = ref(0);
let checkoutTimer = null;

const stopCheckoutTimer = () => {
  if (checkoutTimer) clearInterval(checkoutTimer);
  checkoutTimer = null;
};

const closeCheckoutModal = () => {
  showCheckoutModal.value = false;
  stopCheckoutTimer();
};

const openCheckout = async () => {
  if (!cartStore.itemsCount) {
    uiStore.error("Корзина пуста");
    return;
  }

  checkoutLoading.value = true;
  showCheckoutModal.value = true;
  checkoutQrDataUrl.value = "";
  try {
    const res = await getCheckoutQr();
    checkoutExpiresAt.value = new Date(res.expires_at);

    const QRCode = (await import("qrcode")).default;
    checkoutQrDataUrl.value = await QRCode.toDataURL(res.token, {
      width: 320,
      margin: 1,
    });

    stopCheckoutTimer();
    const tick = () => {
      const diff = Math.max(
        0,
        Math.floor((checkoutExpiresAt.value.getTime() - Date.now()) / 1000)
      );
      checkoutSecondsLeft.value = diff;
      if (diff <= 0) {
        stopCheckoutTimer();
        uiStore.info("QR истёк, получите новый");
      }
    };
    tick();
    checkoutTimer = setInterval(tick, 1000);
  } catch (e) {
    console.error(e);
    uiStore.error(e?.data?.message || "Не удалось получить QR");
    showCheckoutModal.value = false;
  } finally {
    checkoutLoading.value = false;
  }
};

const checkoutTimeLabel = computed(() => {
  const m = Math.floor(checkoutSecondsLeft.value / 60);
  const s = checkoutSecondsLeft.value % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
});

onBeforeUnmount(() => stopCheckoutTimer());

// Сканирование камерой устройства (ZXing) — используется, когда нет
// физического сканера, например при заходе со смартфона.
const showCamera = ref(false);
const cameraError = ref("");
const cameraVideoEl = ref(null);
const torchSupported = ref(false);
const torchOn = ref(false);
let cameraControls = null;
let cameraStream = null;
let detectionActive = false;

// Трек берём напрямую из видеопотока, а не через switchTorch() zxing —
// это официально помечено как experimental/нестабильное в браузерах.
const getVideoTrack = () => {
  const stream = cameraVideoEl.value?.srcObject;
  return stream?.getVideoTracks?.()[0] || null;
};

const stopCamera = () => {
  detectionActive = false;
  cameraControls?.stop();
  cameraControls = null;
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }
  torchSupported.value = false;
  torchOn.value = false;
};

const closeCamera = () => {
  stopCamera();
  showCamera.value = false;
  cameraError.value = "";
};

const toggleTorch = async () => {
  const track = getVideoTrack();
  if (!track) return;

  try {
    await track.applyConstraints({ advanced: [{ torch: !torchOn.value }] });
    torchOn.value = !torchOn.value;
  } catch (e) {
    console.error(e);
    uiStore.error("Не удалось включить фонарик");
  }
};

// Настраивает автофокус/экспозицию трека под чтение штрихкода.
const applyCameraCapabilities = async (stream) => {
  const track = stream.getVideoTracks()[0];
  const capabilities = track?.getCapabilities?.() || {};

  torchSupported.value = !!capabilities.torch;

  const advanced = [];
  if (capabilities.focusMode?.includes("continuous")) {
    advanced.push({ focusMode: "continuous" });
  }
  if (capabilities.exposureMode?.includes("continuous")) {
    advanced.push({ exposureMode: "continuous" });
  }
  if (capabilities.whiteBalanceMode?.includes("continuous")) {
    advanced.push({ whiteBalanceMode: "continuous" });
  }
  if (advanced.length) {
    try {
      await track.applyConstraints({ advanced });
    } catch (e) {
      console.warn("Не удалось применить авто-режимы камеры:", e);
    }
  }

  // Фонарик включаем сразу при открытии камеры — в большинстве случаев
  // сканируют в кармане/на складе, где света мало; пользователь может
  // выключить его вручную кнопкой, а при закрытии камеры он гаснет сам
  // вместе с остановкой трека.
  if (torchSupported.value) {
    try {
      await track.applyConstraints({ advanced: [{ torch: true }] });
      torchOn.value = true;
    } catch (e) {
      console.warn("Не удалось включить фонарик автоматически:", e);
    }
  }
};

// Короткий писк при успешном скане камерой — физический сканер пищит сам,
// а у камеры до этого не было вообще никакой обратной связи об успехе.
const playScanBeep = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.15);
    oscillator.onended = () => ctx.close();
  } catch (e) {
    // Web Audio недоступен — не критично для работы сканера.
  }
};

const BARCODE_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "itf",
  "codabar",
  "qr_code",
];

// Нативный BarcodeDetector гоняет декодирование через системный движок
// (на Android — Google Play Services ML Kit) вместо покадрового JS-разбора
// ZXing, поэтому надёжно читает штрихкод и на слабых/бюджетных камерах,
// где кадр из getUserMedia часто смазан или зашумлён.
const runNativeDetectionLoop = (detector) => {
  detectionActive = true;

  const tick = async () => {
    if (!detectionActive || !cameraVideoEl.value) return;

    try {
      const barcodes = await detector.detect(cameraVideoEl.value);
      if (barcodes.length) {
        const text = barcodes[0].rawValue;
        detectionActive = false;
        playScanBeep();
        stopCamera();
        showCamera.value = false;
        scanCode.value = text;
        lookupProduct();
        return;
      }
    } catch (e) {
      // Кадр ещё не готов или временная ошибка декодера — пробуем дальше.
    }

    if (detectionActive) requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
};

const openCamera = async () => {
  showCamera.value = true;
  cameraError.value = "";
  await nextTick();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    });
    cameraStream = stream;
    cameraVideoEl.value.srcObject = stream;
    await cameraVideoEl.value.play();

    await applyCameraCapabilities(stream);

    if ("BarcodeDetector" in window) {
      let detector;
      try {
        detector = new window.BarcodeDetector({ formats: BARCODE_FORMATS });
      } catch (e) {
        detector = new window.BarcodeDetector();
      }
      runNativeDetectionLoop(detector);
    } else {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const { DecodeHintType } = await import("@zxing/library");

      // TRY_HARDER — без этого zxing на телефонах часто открывает камеру,
      // но так и не распознаёт штрихкод (слишком быстро сдаётся на нечётком
      // кадре); жертвуем скоростью декодирования ради точности.
      const hints = new Map();
      hints.set(DecodeHintType.TRY_HARDER, true);

      const reader = new BrowserMultiFormatReader(hints);
      cameraControls = await reader.decodeFromStream(
        stream,
        cameraVideoEl.value,
        (result) => {
          if (result) {
            const text = result.getText();
            playScanBeep();
            stopCamera();
            showCamera.value = false;
            scanCode.value = text;
            lookupProduct();
          }
        }
      );
    }
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

// Физический сканер (USB/Bluetooth) — это HID-клавиатура: он «печатает»
// код и завершает Enter'ом. Пока фокус в поле сканирования, этим уже
// занимается v-model + handleScanKeydown выше. Но если фокус случайно
// ушёл (например, после клика по кнопке), символы сканера уходили бы в
// никуда — этот глобальный слушатель ловит их в любом случае.
let scannerBuffer = "";
let scannerLastKeyAt = 0;

const isEditableTarget = (el) =>
  el instanceof HTMLElement &&
  (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

const handleGlobalScannerKeydown = (e) => {
  // В поле сканирования и так работает штатная обработка — не дублируем.
  if (e.target === scanInputEl.value) return;
  // В других полях ввода (например, количество) не мешаем ручному вводу.
  if (isEditableTarget(e.target)) return;

  const now = Date.now();
  const gap = now - scannerLastKeyAt;
  scannerLastKeyAt = now;

  if (e.key === "Enter") {
    // Сканер печатает код за десятки миллисекунд — человек с клавиатуры
    // набирает заметно медленнее. По этому зазору отличаем реальный скан
    // от случайного Enter где-то на странице.
    const code = scannerBuffer;
    scannerBuffer = "";
    if (code.length >= 3 && gap < 200) {
      e.preventDefault();
      scanCode.value = code;
      lookupProduct();
    }
    return;
  }

  if (e.key.length === 1) {
    scannerBuffer = gap > 100 ? e.key : scannerBuffer + e.key;
  }
};

onMounted(() => window.addEventListener("keydown", handleGlobalScannerKeydown));
onBeforeUnmount(() =>
  window.removeEventListener("keydown", handleGlobalScannerKeydown)
);
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
      <!-- Сканирование камерой — компактная карточка в потоке страницы, не
           полноэкранная модалка, чтобы не перекрывать весь экран -->
      <div v-if="showCamera" class="camera-card">
        <div class="camera-card-header">
          <span class="camera-card-title">
            <i class="bi bi-upc-scan"></i>Наведите камеру на штрихкод
          </span>
          <button class="close-btn" @click="closeCamera">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>

        <div class="camera-frame-box">
          <video ref="cameraVideoEl" class="camera-video" muted playsinline></video>
          <button
            v-if="torchSupported"
            class="camera-torch-btn"
            :class="{ active: torchOn }"
            @click="toggleTorch"
          >
            <i class="bi" :class="torchOn ? 'bi-flashlight' : 'bi-flashlight-off'"></i>
          </button>
        </div>

        <div v-if="cameraError" class="camera-error-inline">
          <i class="bi bi-exclamation-triangle me-1"></i>{{ cameraError }}
          <button class="camera-retry-btn" @click="openCamera">Повторить</button>
        </div>
      </div>

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
        <button
          v-if="cartStore.itemsCount > 0"
          class="checkout-btn"
          @click="openCheckout"
        >
          <i class="bi bi-qr-code me-2"></i>Оплатить — получить QR для кассы
          <span class="checkout-btn-count">{{ cartStore.itemsCount }}</span>
        </button>

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

    <!-- QR для кассы -->
    <div v-if="showCheckoutModal" class="checkout-overlay" @click.self="closeCheckoutModal">
      <div class="checkout-modal">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <div class="fw-bold">QR для кассы</div>
          <button class="close-btn" @click="closeCheckoutModal">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>

        <div v-if="checkoutLoading" class="text-center py-5">
          <span class="spinner-border"></span>
        </div>
        <template v-else-if="checkoutQrDataUrl">
          <img :src="checkoutQrDataUrl" alt="QR" class="checkout-qr-img" />
          <p class="text-center text-muted small mb-1 mt-2">
            Покажите этот QR кассиру — он отсканирует его и получит все товары из корзины
          </p>
          <p class="text-center fw-bold" :class="{ 'text-danger': checkoutSecondsLeft < 60 }">
            Действителен ещё: {{ checkoutTimeLabel }}
          </p>
          <button class="save-btn" @click="openCheckout">
            <i class="bi bi-arrow-repeat me-2"></i>Обновить QR
          </button>
        </template>
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
  background: #0f172a;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
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
  border-color: #38bdf8;
}

.scan-go-btn {
  width: 56px;
  min-height: 56px;
  border: none;
  border-radius: 0.75rem;
  background: #38bdf8;
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
  background: #e0f2fe;
  color: #0284c7;
  font-size: 1.25rem;
}

.scan-camera-btn:disabled {
  opacity: 0.5;
}

.camera-card {
  background: white;
  border-radius: 1rem;
  padding: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  margin-bottom: 1rem;
}

.camera-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.camera-card-title {
  font-size: 0.85rem;
  color: #64748b;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.camera-frame-box {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 10;
  border-radius: 0.75rem;
  overflow: hidden;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
}

.camera-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.camera-torch-btn {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border: none;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.55);
  color: white;
  font-size: 1.05rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.camera-torch-btn.active {
  background: #facc15;
  color: #7c5e00;
}

.camera-error-inline {
  margin-top: 0.75rem;
  background: #fef2f2;
  color: #dc2626;
  padding: 0.65rem 0.85rem;
  border-radius: 0.75rem;
  text-align: center;
  font-size: 0.9rem;
}

.camera-retry-btn {
  display: block;
  margin: 0.5rem auto 0;
  border: none;
  background: #dc2626;
  color: white;
  font-weight: 700;
  padding: 0.35rem 0.9rem;
  border-radius: 0.5rem;
  font-size: 0.85rem;
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
  background: #e0f2fe;
  color: #0284c7;
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
  border-color: #38bdf8;
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

.checkout-btn {
  width: 100%;
  min-height: 56px;
  border: none;
  border-radius: 0.75rem;
  background: #16a34a;
  color: white;
  font-weight: 700;
  font-size: 1rem;
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.checkout-btn-count {
  background: rgba(255, 255, 255, 0.25);
  border-radius: 999px;
  padding: 0.1rem 0.55rem;
  margin-left: 0.5rem;
  font-size: 0.85rem;
}

.checkout-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.checkout-modal {
  background: white;
  border-radius: 1.25rem;
  padding: 1.5rem;
  width: 100%;
  max-width: 360px;
}

.checkout-qr-img {
  display: block;
  width: 100%;
  max-width: 280px;
  margin: 0 auto;
  border-radius: 0.75rem;
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
  color: #0284c7;
  white-space: nowrap;
}
</style>
