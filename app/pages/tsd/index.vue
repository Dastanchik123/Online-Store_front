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
const candidates = ref([]);
const sessionLog = ref([]);

// Отсканированные, но ещё не подтверждённые товары — копятся здесь при
// последовательном сканировании и уходят в реальную корзину только по
// нажатию «Добавить в корзину», а не автоматически при каждом новом скане.
const pendingItems = ref([]);
const confirmingCart = ref(false);

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

// Камера теперь не закрывается после одного скана — можно сканировать
// товары подряд, не открывая камеру заново каждый раз; закрывает её
// только сам пользователь кнопкой закрытия. Кулдаун нужен, чтобы один и
// тот же штрихкод, всё ещё попадающий в кадр, не добавлялся в список
// по нескольку раз в секунду.
const SCAN_COOLDOWN_MS = 1200;
let scanCooldownUntil = 0;

const handleDetectedCode = (text) => {
  const now = performance.now();
  if (now < scanCooldownUntil || loadingProduct.value) return;
  scanCooldownUntil = now + SCAN_COOLDOWN_MS;
  playScanBeep();
  scanCode.value = text;
  lookupProduct();
};

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
        handleDetectedCode(barcodes[0].rawValue);
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
            handleDetectedCode(result.getText());
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

const isProductOutOfStock = (p) =>
  p.in_stock === false || (p.stock_quantity ?? 1) <= 0;

const pendingMaxQty = (p) => {
  const stock = p.stock_quantity;
  return stock && stock > 0 ? stock : 99;
};

// Добавляет отсканированный товар в локальный список ожидания. Повторный
// скан того же товара просто увеличивает его количество в списке — ничего
// не уходит в реальную корзину, пока не нажата «Добавить в корзину».
const addToPendingList = (p) => {
  if (isProductOutOfStock(p)) {
    uiStore.error(`«${p.name}» нет в наличии`);
    return;
  }

  const existing = pendingItems.value.find((i) => i.product.id === p.id);
  if (existing) {
    existing.qty = Math.min(existing.qty + 1, pendingMaxQty(p));
  } else {
    pendingItems.value.unshift({ id: p.id, product: p, qty: 1 });
  }

  candidates.value = [];
  scanCode.value = "";
  focusScan();
};

// При ручном вводе с клавиатуры значение может быть пустым, нечисловым
// или выходить за границы остатка — приводим к валидному числу по blur.
const normalizePendingQty = (item) => {
  const qty = Math.min(
    pendingMaxQty(item.product),
    Math.max(1, Math.floor(Number(item.qty) || 1))
  );
  item.qty = qty;
};

const removePendingItem = (item) => {
  pendingItems.value = pendingItems.value.filter((i) => i.id !== item.id);
};

const pendingTotal = computed(() =>
  pendingItems.value.reduce(
    (sum, i) => sum + i.qty * Number(i.product.sale_price || i.product.price || 0),
    0
  )
);

const selectProduct = (p) => addToPendingList(p);

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
      addToPendingList(exact);
    } else if (items.length === 1) {
      addToPendingList(items[0]);
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

const confirmPendingItems = async () => {
  if (!pendingItems.value.length || confirmingCart.value) return;

  confirmingCart.value = true;
  try {
    for (const item of pendingItems.value) {
      await addToCart(item.product.id, item.qty);
      sessionLog.value.unshift({
        id: Date.now() + item.product.id,
        sku: item.product.sku,
        name: item.product.name,
        qty: item.qty,
        time: new Date().toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      });
    }
    uiStore.success(`Добавлено товаров: ${pendingItems.value.length}`);
    pendingItems.value = [];
    focusScan();
  } catch (e) {
    console.error(e);
    uiStore.error(e?.data?.message || "Не удалось добавить в корзину");
  } finally {
    confirmingCart.value = false;
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

      <!-- Скан камерой без видеопревью — само видео скрыто (декодирование
           идёт в фоне), пользователь видит только статус и может выключить
           фонарик или отменить скан -->
      <div v-if="showCamera" class="camera-status-card">
        <span class="camera-status-dot"></span>
        <span class="camera-status-label">Сканирование камерой…</span>
        <button
          v-if="torchSupported"
          class="camera-torch-inline"
          :class="{ active: torchOn }"
          @click="toggleTorch"
        >
          <i class="bi" :class="torchOn ? 'bi-flashlight' : 'bi-flashlight-off'"></i>
        </button>
        <button class="close-btn" @click="closeCamera">
          <i class="bi bi-x-lg"></i>
        </button>
        <video ref="cameraVideoEl" class="camera-video-hidden" muted playsinline></video>
      </div>
      <div v-if="cameraError" class="camera-error-inline">
        <i class="bi bi-exclamation-triangle me-1"></i>{{ cameraError }}
        <button class="camera-retry-btn" @click="openCamera">Повторить</button>
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

      <!-- Список отсканированных товаров, ожидающих подтверждения -->
      <div v-if="pendingItems.length" class="pending-list">
        <div class="pending-list-title">
          К добавлению: {{ pendingItems.length }}
          <span class="pending-list-total">{{ pendingTotal }} сом</span>
        </div>

        <div v-for="item in pendingItems" :key="item.id" class="pending-row">
          <div class="pending-thumb">
            <img
              v-if="item.product.image_url"
              :src="item.product.image_url"
              :alt="item.product.name"
            />
            <i v-else class="bi bi-image text-secondary opacity-50"></i>
          </div>

          <div class="flex-grow-1 min-w-0">
            <div class="pending-name">{{ item.product.name }}</div>
            <small class="text-muted"
              >{{ item.product.sale_price || item.product.price }} сом</small
            >
          </div>

          <input
            v-model.number="item.qty"
            type="number"
            inputmode="numeric"
            pattern="[0-9]*"
            class="pending-qty-input"
            min="1"
            :max="pendingMaxQty(item.product)"
            @blur="normalizePendingQty(item)"
            @keyup.enter="$event.target.blur()"
          />

          <button class="pending-remove-btn" @click="removePendingItem(item)">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>

        <button
          class="save-btn"
          :disabled="confirmingCart"
          @click="confirmPendingItems"
        >
          <span
            v-if="confirmingCart"
            class="spinner-border spinner-border-sm me-2"
          ></span>
          <i v-else class="bi bi-cart-plus me-2"></i>
          Добавить в корзину ({{ pendingItems.length }})
        </button>
      </div>

      <button
        v-if="cartStore.itemsCount > 0"
        class="checkout-btn"
        @click="openCheckout"
      >
        <i class="bi bi-qr-code me-2"></i>Оплатить — получить QR для кассы
        <span class="checkout-btn-count">{{ cartStore.itemsCount }}</span>
      </button>

      <!-- Журнал сессии — показываем, только если уже что-то отсканировано -->
      <div v-if="sessionLog.length" class="session-log">
        <div class="session-log-title">
          Отсканировано за визит: {{ sessionLog.length }}
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
  padding: 0.5rem 1rem;
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
  font-size: 1.1rem;
  width: 32px;
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
  font-size: 0.9rem;
}

.header-title small {
  font-size: 0.7rem;
}

.tsd-body {
  flex: 1;
  padding: 0.75rem;
  max-width: 420px;
  width: 100%;
  margin: 0 auto;
}

.scan-box {
  background: white;
  border-radius: 0.85rem;
  padding: 0.85rem;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  margin-bottom: 0.75rem;
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
  gap: 0.4rem;
}

.scan-input {
  flex: 1;
  min-width: 0;
  border: 2px solid #e2e8f0;
  border-radius: 0.6rem;
  padding: 0.6rem 0.65rem;
  font-size: 0.95rem;
  min-height: 42px;
}

.scan-input:focus {
  outline: none;
  border-color: #38bdf8;
}

.scan-go-btn {
  width: 42px;
  min-width: 42px;
  min-height: 42px;
  border: none;
  border-radius: 0.6rem;
  background: #38bdf8;
  color: white;
  font-size: 1.05rem;
  flex-shrink: 0;
}

.scan-go-btn:disabled {
  opacity: 0.5;
}

.scan-camera-btn {
  width: 42px;
  min-width: 42px;
  min-height: 42px;
  border: none;
  border-radius: 0.6rem;
  background: #e0f2fe;
  color: #0284c7;
  flex-shrink: 0;
  font-size: 1.1rem;
}

.scan-camera-btn:disabled {
  opacity: 0.5;
}

.camera-status-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  background: white;
  border-radius: 0.85rem;
  padding: 0.7rem 0.85rem;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  margin-bottom: 0.75rem;
}

.camera-status-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #38bdf8;
  flex-shrink: 0;
  animation: camera-status-pulse 1.2s ease-in-out infinite;
}

@keyframes camera-status-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.7); }
}

.camera-status-label {
  flex: 1;
  font-size: 0.9rem;
  color: #334155;
  font-weight: 600;
}

.camera-torch-inline {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border: none;
  border-radius: 50%;
  background: #f1f5f9;
  color: #64748b;
  font-size: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.camera-torch-inline.active {
  background: #facc15;
  color: #7c5e00;
}

/* Видео не должно быть видно ("проекция" на весь блок не нужна), но
   должно оставаться в DOM с ненулевым размером — иначе часть браузеров
   (особенно мобильных) приостанавливает декодирование скрытых кадров. */
.camera-video-hidden {
  position: absolute;
  width: 2px;
  height: 2px;
  opacity: 0.01;
  pointer-events: none;
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
  border-radius: 0.85rem;
  padding: 0.85rem;
  margin-bottom: 0.75rem;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

.candidates-title {
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: #64748b;
  font-size: 0.8rem;
}

.candidate-row {
  width: 100%;
  text-align: left;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 0.6rem;
  padding: 0.65rem;
  margin-bottom: 0.4rem;
}

.pending-list {
  background: white;
  border-radius: 0.85rem;
  padding: 0.85rem;
  margin-bottom: 0.75rem;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

.pending-list-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 700;
  color: #1e293b;
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
}

.pending-list-total {
  color: #0284c7;
  font-weight: 800;
}

.pending-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0;
  border-bottom: 1px solid #f1f5f9;
}

.pending-row:last-of-type {
  border-bottom: none;
}

.pending-thumb {
  width: 38px;
  height: 38px;
  border-radius: 0.5rem;
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.pending-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pending-name {
  font-size: 0.85rem;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.min-w-0 {
  min-width: 0;
}

.pending-qty-input {
  width: 34px;
  text-align: center;
  font-weight: 700;
  font-size: 0.9rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.4rem;
  padding: 0.15rem 0;
  -moz-appearance: textfield;
}

.pending-qty-input:focus {
  outline: none;
  border-color: #38bdf8;
}

.pending-qty-input::-webkit-outer-spin-button,
.pending-qty-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.pending-remove-btn {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 50%;
  background: #fef2f2;
  color: #dc2626;
  font-size: 0.75rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn {
  border: none;
  background: #f1f5f9;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  flex-shrink: 0;
}

.save-btn {
  width: 100%;
  min-height: 48px;
  border: none;
  border-radius: 0.6rem;
  background: #16a34a;
  color: white;
  font-weight: 700;
  font-size: 1rem;
}

.save-btn:disabled {
  opacity: 0.6;
}

.session-log {
  background: white;
  border-radius: 0.85rem;
  padding: 0.85rem;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

.session-log-title {
  font-weight: 700;
  margin-bottom: 0.65rem;
  color: #1e293b;
  font-size: 0.95rem;
}

.checkout-btn {
  width: 100%;
  min-height: 48px;
  border: none;
  border-radius: 0.6rem;
  background: #16a34a;
  color: white;
  font-weight: 700;
  font-size: 0.95rem;
  margin-bottom: 0.85rem;
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
