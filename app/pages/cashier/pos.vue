<script setup>
definePageMeta({
  layout: false,
  middleware: "cashier",
});

const authStore = useAuthStore();
const ui = useUiStore();
const { printReceipt, initQZ } = usePrinter();
const { settings, fetchPublicSettings } = useSettings();

const cart = ref([]);
const searchQuery = ref("");
const searchResults = ref([]);
const isSearching = ref(false);
const selectedUser = ref(null);
const users = ref([]);
const isUserSearching = ref(false);
const userSearchQuery = ref("");
const cachedProducts = ref([]);
const isInitialLoading = ref(true);
const hotProducts = ref([]);
const activeGroup = ref(null);
const hotProductIndex = ref(-1);
const hotGroupIndex = ref(-1);

const barcodeBuffer = ref("");
const lastKeyTime = ref(0);

const hotGroups = computed(() => {
  const groups = hotProducts.value
    .map((p) => p.hot_group)
    .filter(
      (g) =>
        g &&
        g !== "" &&
        g.toLowerCase() !== "общее" &&
        g.toLowerCase() !== "все",
    );
  return [...new Set(groups)];
});

const filteredHotProducts = computed(() => {
  if (!activeGroup.value) return [];
  return hotProducts.value.filter((p) => p.hot_group === activeGroup.value);
});

const toggleGroup = (group) => {
  if (activeGroup.value === group) {
    activeGroup.value = null;
    hotProductIndex.value = -1;
  } else {
    activeGroup.value = group;
    hotProductIndex.value = 0;
  }
};

const cashAmount = ref(0);
const transferAmount = ref(0);
const isDebt = ref(false);
const dueDate = ref("");
const activeField = ref("cash");
const isFocused = ref(false);
const isSearchFocused = ref(false);
const isSubmitting = ref(false);
const savedChangeAmount = ref(0);
const activeCartIndex = ref(-1);
const searchResultIndex = ref(-1);
const numpadBuffer = ref("");
let lastPlusTime = 0;

const couponCode = ref("");
const couponDiscount = ref(0);
const isCouponValidating = ref(false);
const appliedCoupon = ref(null);

const handleGlobalKeyDown = async (e) => {
  const key = e.key;

  if (!["INPUT", "TEXTAREA"].includes(e.target.tagName)) {
    const currentTime = Date.now();
    if (currentTime - lastKeyTime.value > 150) {
      barcodeBuffer.value = "";
    }
    lastKeyTime.value = currentTime;

    if (key === "Enter") {
      if (barcodeBuffer.value.length > 2) {
        e.preventDefault();
        await processBarcode(barcodeBuffer.value);
        barcodeBuffer.value = "";
        return;
      }
      barcodeBuffer.value = "";
    } else if (key.length === 1) {
      barcodeBuffer.value += key;
    }
  }

  if (e.ctrlKey && (key === "ArrowUp" || key === "ArrowDown")) {
    e.preventDefault();
    if (hotGroups.value.length === 0) return;

    let currentIndex = hotGroups.value.indexOf(activeGroup.value);
    const delta = key === "ArrowUp" ? -1 : 1;
    let nextIndex;

    if (currentIndex === -1) {
      nextIndex = delta === 1 ? 0 : hotGroups.value.length - 1;
    } else {
      nextIndex = currentIndex + delta;
      if (nextIndex < 0) nextIndex = hotGroups.value.length - 1;
      if (nextIndex >= hotGroups.value.length) nextIndex = 0;
    }

    activeGroup.value = hotGroups.value[nextIndex];
    hotGroupIndex.value = nextIndex;
    hotProductIndex.value = 0;
    return;
  }

  const isInsideSearch = document.activeElement?.closest(".search-section");
  const currentResults = searchResults.value;

  if (isInsideSearch && currentResults.length > 0) {
    if (!e.ctrlKey && (key === "ArrowUp" || key === "ArrowDown")) {
      e.preventDefault();
      const delta = key === "ArrowUp" ? -1 : 1;
      let nextIndex = searchResultIndex.value + delta;
      if (nextIndex < 0) nextIndex = currentResults.length - 1;
      if (nextIndex >= currentResults.length) nextIndex = 0;
      searchResultIndex.value = nextIndex;
      return;
    }
    if (key === "Enter") {
      if (searchResultIndex.value !== -1) {
        e.preventDefault();
        addToCart(currentResults[searchResultIndex.value]);
        searchResults.value = [];
        searchQuery.value = "";
        searchResultIndex.value = -1;
        isSearchFocused.value = false;
        document.activeElement?.blur();
        return;
      }
    }
  }

  const isInsideInput = ["INPUT", "TEXTAREA"].includes(
    document.activeElement?.tagName,
  );
  if (activeGroup.value && !isInsideInput) {
    if (key === "ArrowUp" || key === "ArrowDown") {
      e.preventDefault();
      const delta = key === "ArrowUp" ? -1 : 1;
      let nextIndex = hotProductIndex.value + delta;
      if (nextIndex < 0) nextIndex = filteredHotProducts.value.length - 1;
      if (nextIndex >= filteredHotProducts.value.length) nextIndex = 0;
      hotProductIndex.value = nextIndex;
      return;
    }
    if (key === "Enter") {
      if (hotProductIndex.value !== -1) {
        e.preventDefault();
        addToCart(filteredHotProducts.value[hotProductIndex.value]);
        return;
      }
    }
  }

  if (isFocused.value) {
    if (/^[0-9.]$/.test(key)) {
      e.preventDefault();
      appendNumber(key);
      return;
    }
    if (key === "Backspace") {
      e.preventDefault();
      handleBackspace();
      return;
    }
  }

  if (key === "F1") {
    e.preventDefault();
    document.querySelector(".search-section input")?.focus();
    activeGroup.value = null;
    return;
  }

  if (key === "F3") {
    e.preventDefault();
    if (hotGroups.value.length > 0) {
      if (activeGroup.value) {
        activeGroup.value = null;
        hotGroupIndex.value = -1;
      } else {
        hotGroupIndex.value = 0;
        activeGroup.value = hotGroups.value[0];
        hotProductIndex.value = 0;
      }
    }
    return;
  }

  if (key === "F2") {
    e.preventDefault();
    document.querySelector(".customer-search-input")?.focus();
    return;
  }

  if (key === "F4") {
    e.preventDefault();
    document.getElementById("coupon-input")?.focus();
    return;
  }

  if (key === "F5") {
    e.preventDefault();
    activeField.value = "cash";
    isFocused.value = true;
    numpadBuffer.value = "";
    document.querySelector(".cash-input-field")?.focus();
    return;
  }
  if (key === "F6") {
    e.preventDefault();
    activeField.value = "transfer";
    isFocused.value = true;
    numpadBuffer.value = "";
    document.querySelector(".transfer-input-field")?.focus();
    return;
  }

  if (!e.ctrlKey && (key === "ArrowUp" || key === "ArrowDown")) {
    if (["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;

    if (activeGroup.value) return;

    if (cart.value.length === 0) return;
    e.preventDefault();
    if (activeCartIndex.value === -1) {
      activeCartIndex.value = 0;
      activeField.value = "quantity";
    } else {
      const delta = key === "ArrowUp" ? -1 : 1;
      let nextIndex = activeCartIndex.value + delta;
      if (nextIndex < 0) nextIndex = cart.value.length - 1;
      if (nextIndex >= cart.value.length) nextIndex = 0;
      activeCartIndex.value = nextIndex;
    }
    isFocused.value = true;
    numpadBuffer.value = "";
    return;
  }

  if (key === "ArrowLeft" || key === "ArrowRight") {
    if (["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
    if (activeCartIndex.value === -1) return;
    e.preventDefault();
    if (activeField.value === "quantity") {
      activeField.value = "price";
    } else if (activeField.value === "price") {
      activeField.value = "quantity";
    }
    numpadBuffer.value = "";
    return;
  }

  if (key === "F9") {
    e.preventDefault();
    setQuickAmount("full");
    return;
  }
  if (key === "F10") {
    e.preventDefault();
    finalizeSale();
    return;
  }

  if (key === "*") {
    e.preventDefault();
    if (cart.value.length > 0) {
      activeCartIndex.value = cart.value.length - 1;
      activeField.value = "quantity";
      isFocused.value = true;
      numpadBuffer.value = "";
    }
    return;
  }

  if (key === "+") {
    e.preventDefault();
    const now = Date.now();
    if (now - lastPlusTime < 300) {
      activeField.value = "transfer";
      isFocused.value = true;
      numpadBuffer.value = "";
      document.querySelector(".transfer-input-field")?.focus();
      lastPlusTime = 0;
    } else {
      activeField.value = "cash";
      isFocused.value = true;
      numpadBuffer.value = "";
      document.querySelector(".cash-input-field")?.focus();
      lastPlusTime = now;
    }
    return;
  }

  if (key === "Enter") {
    if (isFocused.value) {
      e.preventDefault();
      isFocused.value = false;
      numpadBuffer.value = "";

      if (document.activeElement?.tagName === "INPUT") {
        document.activeElement.blur();
      }
      return;
    }
    if (cart.value.length > 0) {
      e.preventDefault();
      finalizeSale();
    }
  }

  if (key === "Escape") {
    isFocused.value = false;
    activeGroup.value = null;
    activeCartIndex.value = -1;
    hotProductIndex.value = -1;
    searchResults.value = [];
    searchResultIndex.value = -1;
    isSearchFocused.value = false;
    document.activeElement?.blur();
  }
};

onMounted(async () => {
  window.addEventListener("keydown", handleGlobalKeyDown);
  loadAllProducts();
  fetchHotProducts();
  fetchPublicSettings();

  if (import.meta.client) {
    const savedCart = localStorage.getItem("pos_cart");
    if (savedCart) {
      cart.value = JSON.parse(savedCart);
    }
    await initQZ();
  }
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleGlobalKeyDown);
});

watch(
  () => cart.value.length,
  (newVal) => {
    if (newVal > 0) {
      savedChangeAmount.value = 0;
    }
  },
);

const totalPrice = computed(() => {
  return cart.value.reduce((sum, item) => sum + item.price * item.quantity, 0);
});

const paidAmount = computed(() => {
  return (
    (parseFloat(cashAmount.value) || 0) +
    (parseFloat(transferAmount.value) || 0)
  );
});

const changeAmount = computed(() => {
  if (isDebt.value) return 0;
  const change = paidAmount.value - (totalPrice.value - couponDiscount.value);
  return change > 0 ? change : 0;
});

const { getProducts: getProductsSearch, getAllProducts } = usePos();
const { getProducts } = useProducts();

const loadAllProducts = async () => {
  try {
    const data = await getAllProducts();
    cachedProducts.value = data;
  } catch (e) {
    console.error("Failed to load products for cache:", e);
  } finally {
    isInitialLoading.value = false;
  }
};

const fetchHotProducts = async () => {
  try {
    const data = await getProducts({
      is_hot: true,
      per_page: 50,
      sort: "hot_order",
      direction: "asc",
    });
    hotProducts.value = data.data || [];
  } catch (e) {
    console.error("Failed to fetch hot products:", e);
  }
};

const searchProducts = async () => {
  const query = searchQuery.value.toLowerCase().trim();
  if (query.length < 2) {
    searchResults.value = [];
    searchResultIndex.value = -1;
    return;
  }

  searchResultIndex.value = -1;

  if (cachedProducts.value.length > 0) {
    searchResults.value = cachedProducts.value
      .filter(
        (p) =>
          (p.name && p.name.toLowerCase().includes(query)) ||
          (p.sku && String(p.sku).toLowerCase().includes(query)),
      )
      .slice(0, 50);
    searchResultIndex.value = searchResults.value.length > 0 ? 0 : -1;
    return;
  }

  isSearching.value = true;
  try {
    const data = await getProductsSearch(searchQuery.value);
    searchResults.value = data;
    searchResultIndex.value = searchResults.value.length > 0 ? 0 : -1;
  } catch (e) {
    console.error(e);
  } finally {
    isSearching.value = false;
  }
};

const { searchUsers: apiSearchUsers } = usePos();
const searchUsers = async () => {
  if (userSearchQuery.value.length < 2) return;
  isUserSearching.value = true;
  try {
    const data = await apiSearchUsers(userSearchQuery.value);
    users.value = data.data || [];
  } catch (e) {
    console.error(e);
  } finally {
    isUserSearching.value = false;
  }
};

const addToCart = (product) => {
  if (product.stock_quantity <= 0) {
    ui.addToast(`Товар "${product.name}" закончился на складе`, "error");
    return;
  }

  const existing = cart.value.find((item) => item.product_id === product.id);
  if (existing) {
    existing.quantity++;
  } else {
    cart.value.push({
      product_id: product.id,
      name: product.name,
      price: product.sale_price || product.price,
      purchase_price: product.purchase_price,
      quantity: 1,
      sku: product.sku,
      image_url: product.image_url,
      stock_quantity: product.stock_quantity,
    });
  }

  activeGroup.value = null;
};

const removeFromCart = (index) => {
  cart.value.splice(index, 1);
};

const updateQuantity = (item, delta) => {
  const newQty = item.quantity + delta;
  if (newQty > 0 && newQty <= item.stock) {
    item.quantity = newQty;
  }
};

const selectUser = (user) => {
  selectedUser.value = user;
  userSearchQuery.value = "";
  users.value = [];
};

const handleCashInput = () => {
  if (isDebt.value) return;
  const currentCash = parseFloat(cashAmount.value) || 0;
  const total = totalPrice.value;
  if (currentCash < total) {
    transferAmount.value = parseFloat((total - currentCash).toFixed(2));
  } else {
    transferAmount.value = 0;
  }
};

const handleTransferInput = () => {
  if (isDebt.value) return;
  const currentTransfer = parseFloat(transferAmount.value) || 0;
  const total = totalPrice.value;
  if (currentTransfer < total) {
    cashAmount.value = parseFloat((total - currentTransfer).toFixed(2));
  } else {
    cashAmount.value = 0;
  }
};

const appendNumber = (num) => {
  if (num === "." && numpadBuffer.value.includes(".")) return;

  const toAdd = num.toString();
  numpadBuffer.value += toAdd;

  const val = parseFloat(numpadBuffer.value);
  if (!isNaN(val)) {
    if (activeField.value === "quantity") {
      if (activeCartIndex.value !== -1 && cart.value[activeCartIndex.value]) {
        cart.value[activeCartIndex.value].quantity = val;
      }
    } else if (activeField.value === "price") {
      if (activeCartIndex.value !== -1 && cart.value[activeCartIndex.value]) {
        cart.value[activeCartIndex.value].price = val;
      }
    } else {
      const field = activeField.value === "cash" ? cashAmount : transferAmount;
      field.value = val;
      if (activeField.value === "cash") handleCashInput();
      else handleTransferInput();
    }
  }
};

const handleBackspace = () => {
  numpadBuffer.value = numpadBuffer.value.slice(0, -1);
  if (numpadBuffer.value === "" || numpadBuffer.value === "-") {
    numpadBuffer.value = "";
    if (activeField.value === "quantity") {
      if (activeCartIndex.value !== -1 && cart.value[activeCartIndex.value]) {
        cart.value[activeCartIndex.value].quantity = 0;
      }
    } else if (activeField.value === "price") {
      if (activeCartIndex.value !== -1 && cart.value[activeCartIndex.value]) {
        cart.value[activeCartIndex.value].price = 0;
      }
    } else {
      const field = activeField.value === "cash" ? cashAmount : transferAmount;
      field.value = 0;
      if (activeField.value === "cash") handleCashInput();
      else handleTransferInput();
    }
    return;
  }

  const val = parseFloat(numpadBuffer.value);
  if (!isNaN(val)) {
    if (activeField.value === "quantity") {
      if (activeCartIndex.value !== -1 && cart.value[activeCartIndex.value]) {
        cart.value[activeCartIndex.value].quantity = val;
      }
    } else if (activeField.value === "price") {
      if (activeCartIndex.value !== -1 && cart.value[activeCartIndex.value]) {
        cart.value[activeCartIndex.value].price = val;
      }
    } else {
      const field = activeField.value === "cash" ? cashAmount : transferAmount;
      field.value = val;
      if (activeField.value === "cash") handleCashInput();
      else handleTransferInput();
    }
  }
};

const handleClear = () => {
  numpadBuffer.value = "";
  if (activeField.value === "quantity") {
    if (activeCartIndex.value !== -1 && cart.value[activeCartIndex.value]) {
      cart.value[activeCartIndex.value].quantity = 0;
    }
  } else if (activeField.value === "price") {
    if (activeCartIndex.value !== -1 && cart.value[activeCartIndex.value]) {
      cart.value[activeCartIndex.value].price = 0;
    }
  } else {
    const field = activeField.value === "cash" ? cashAmount : transferAmount;
    field.value = 0;
    if (activeField.value === "cash") handleCashInput();
    else handleTransferInput();
  }
};

const setQuickAmount = (amount) => {
  if (amount === "full") {
    cashAmount.value = totalPrice.value - couponDiscount.value;
    transferAmount.value = 0;
  } else {
    cashAmount.value = amount;
    handleCashInput();
  }
};

const applyCoupon = async () => {
  if (!couponCode.value) return;
  if (cart.value.length === 0) {
    ui.addToast("Сначала добавьте товары в корзину", "warning");
    return;
  }

  isCouponValidating.value = true;
  try {
    const { apiFetch } = useApi();
    const res = await apiFetch("/coupons/validate", {
      method: "POST",
      body: {
        code: couponCode.value,
        amount: totalPrice.value,
      },
    });

    if (res.valid) {
      appliedCoupon.value = res;
      if (res.type === "fixed") {
        couponDiscount.value = Number(res.value);
      } else {
        couponDiscount.value = (totalPrice.value * Number(res.value)) / 100;
      }
      ui.addToast(
        `Купон "${res.code}" применен! Скидка: ${couponDiscount.value} сом`,
        "success",
      );

      if (cashAmount.value === totalPrice.value) {
        cashAmount.value = totalPrice.value - couponDiscount.value;
      }
    }
  } catch (e) {
    ui.addToast(e.data?.message || "Неверный код купона", "error");
    couponDiscount.value = 0;
    appliedCoupon.value = null;
  } finally {
    isCouponValidating.value = false;
  }
};

const removeCoupon = () => {
  appliedCoupon.value = null;
  couponDiscount.value = 0;
  couponCode.value = "";
  ui.addToast("Купон удален", "info");
};

const finalizeSale = async () => {
  if (cart.value.length === 0) {
    ui.addToast("Корзина пуста", "warning");
    return;
  }

  const total =
    Math.round((totalPrice.value - couponDiscount.value) * 100) / 100;
  const paid = Math.round(paidAmount.value * 100) / 100;

  for (const item of cart.value) {
    if (Number(item.price) < Number(item.purchase_price)) {
      ui.addToast(
        `Цена товара "${item.name}" (${item.price} сом) ниже себестоимости (${item.purchase_price} сом)!`,
        "error",
      );
      return;
    }
  }

  if (!isDebt.value && paid < total) {
    ui.addToast(
      `Недостаточно средств. Нужно ещё ${(total - paid).toFixed(2)} сом`,
      "warning",
    );
    return;
  }

  if (isDebt.value && !selectedUser.value) {
    ui.addToast("Для оформления долга выберите клиента", "error");
    return;
  }

  isSubmitting.value = true;

  if (typeof document !== "undefined") {
    document.activeElement?.blur();
  }

  savedChangeAmount.value = changeAmount.value;
  isFocused.value = false;
  numpadBuffer.value = "";

  console.log("SALE DEBUG:", {
    total: total,
    paid: paid,
    cash: cashAmount.value,
    transfer: transferAmount.value,
    isDebt: isDebt.value,
  });

  try {
    const { createPosSale } = usePos();
    const res = await createPosSale({
      items: cart.value,
      user_id: selectedUser.value?.id,
      cash_amount: Number(cashAmount.value),
      transfer_amount: Number(transferAmount.value),
      is_debt: isDebt.value,
      due_date: isDebt.value && dueDate.value ? dueDate.value : null,
      discount: Number(couponDiscount.value),
    });

    ui.addToast("Продажа успешно оформлена!", "success");

    const tpl = localStorage.getItem("print_template") || "thermal";
    const orderId = res?.order_id || res?.id || res?.order?.id;

    if (orderId) {
      await printReceipt(orderId, tpl);
    } else {
      console.warn("Could not find orderId in response:", res);
    }

    resetPos();
  } catch (e) {
    console.error("SALE ERROR:", e);
    const errorMsg = e.data?.message || e.message || "Ошибка сервера";
    ui.addToast(errorMsg, "error");
  } finally {
    isSubmitting.value = false;
  }
};

const resetPos = () => {
  cart.value = [];
  selectedUser.value = null;
  cashAmount.value = 0;
  transferAmount.value = 0;
  isDebt.value = false;
  dueDate.value = "";
  couponCode.value = "";
  couponDiscount.value = 0;
  appliedCoupon.value = null;
};

const clearCart = () => {
  cart.value = [];
  ui.addToast("Корзина очищена", "info");
};

watch(totalPrice, (newTotal) => {
  if (!isDebt.value) {
    cashAmount.value = newTotal - couponDiscount.value;
    transferAmount.value = 0;
  }
});

watch(couponDiscount, (newDiscount) => {
  if (!isDebt.value) {
    cashAmount.value = totalPrice.value - newDiscount;
  }
});
</script>

<template>
  <div
    class="pos-container-fluid p-0 animate-fade-in overflow-hidden"
    style="height: 100vh"
  >
    <div class="d-flex h-100 overflow-hidden position-relative">
      <div
        class="sidebar-glass d-flex flex-column py-3"
        style="width: 70px; flex-shrink: 0; z-index: 1050"
      >
        <div
          class="d-flex flex-column gap-1 align-items-center w-100 overflow-y-auto custom-scrollbar shadow-none h-100"
        >
          <div class="mb-4 text-center">
            <div
              class="badge bg-primary bg-opacity-10 text-primary x-small border border-primary border-opacity-25 py-1 mb-2"
            >
              F3
            </div>
            <i class="bi bi-stack fs-4 text-white opacity-50"></i>
          </div>
          <button
            v-for="(group, gIdx) in hotGroups"
            :key="group"
            @click="toggleGroup(group)"
            class="pos-sidebar-tab w-100 border-0 transition-all d-flex flex-column align-items-center py-3"
            :class="{ active: activeGroup === group }"
          >
            <div class="active-indicator" v-if="activeGroup === group"></div>
            <i class="bi bi-grid-fill fs-5 mb-1"></i>
            <span class="tab-label text-truncate px-1">{{ group }}</span>
          </button>
        </div>
      </div>
      <Transition name="fade">
        <div
          v-if="activeGroup"
          class="panel-overlay"
          @click="activeGroup = null"
        ></div>
      </Transition>

      <Transition name="panel">
        <div v-if="activeGroup" class="hot-panel shadow-lg d-flex flex-column">
          <div
            class="d-flex align-items-center justify-content-between p-3 border-bottom bg-light"
          >
            <h6 class="fw-bold mb-0 text-primary d-flex align-items-center">
              <i class="bi bi-fire me-2"></i>{{ activeGroup }}
            </h6>
            <button
              @click="activeGroup = null"
              class="btn btn-sm btn-link text-muted p-0 border-0"
            >
              <i class="bi bi-x-lg fs-5"></i>
            </button>
          </div>
          <div
            class="p-2 flex-grow-1 overflow-auto bg-white custom-scrollbar-gray"
          >
            <div class="d-flex flex-column gap-2">
              <button
                v-for="(p, hIdx) in filteredHotProducts"
                :key="p.id"
                @click="addToCart(p)"
                class="hot-item-row w-100 rounded-3 border-0 p-2 d-flex align-items-center text-start transition-all"
                :class="{ 'bg-primary text-white': hotProductIndex === hIdx }"
              >
                <div
                  class="fw-bold me-2 opacity-50 x-small"
                  :class="
                    hotProductIndex === hIdx ? 'text-white' : 'text-primary'
                  "
                  style="width: 20px"
                >
                  {{ hIdx + 1 }}
                </div>
                <div
                  class="hot-tile-image-compact rounded-3 overflow-hidden me-3 flex-shrink-0 bg-light"
                  style="width: 48px; height: 48px"
                >
                  <img
                    v-if="p.image_url"
                    :src="p.image_url"
                    class="h-100 w-100 object-fit-cover"
                  />
                  <div
                    v-else
                    class="h-100 w-100 text-primary d-flex align-items-center justify-content-center fw-bold small opacity-75"
                  >
                    {{ p.name.substring(0, 1).toUpperCase() }}
                  </div>
                </div>
                <div class="flex-grow-1 min-w-0 pr-2">
                  <div
                    class="fw-bold small lh-sm mb-1 text-wrap"
                    :class="
                      hotProductIndex === hIdx ? 'text-white' : 'text-dark'
                    "
                  >
                    {{ p.name }}
                  </div>
                  <div
                    :class="
                      hotProductIndex === hIdx
                        ? 'text-white opacity-75'
                        : 'text-muted'
                    "
                    style="font-size: 10px"
                  >
                    SKU: {{ p.sku }}
                  </div>
                </div>
                <div class="ms-auto flex-shrink-0 text-end">
                  <div
                    class="fw-bold small"
                    :class="
                      hotProductIndex === hIdx ? 'text-white' : 'text-primary'
                    "
                  >
                    {{ p.sale_price || p.price }} сом
                  </div>
                </div>
              </button>
            </div>
            <div
              v-if="filteredHotProducts.length === 0"
              class="text-center py-5 text-muted opacity-50"
            >
              <i class="bi bi-inbox fs-2 d-block mb-2"></i>
              Ничего не найдено
            </div>
          </div>
        </div>
      </Transition>

      <div class="flex-grow-1 d-flex flex-column bg-light overflow-hidden">
        <div class="p-3 pb-0">
          <div
            class="d-flex justify-content-between align-items-center bg-white p-3 rounded-4 shadow-sm border mb-3"
          >
            <div class="d-flex align-items-center gap-3">
              <NuxtLink
                to="/cashier"
                class="btn btn-outline-secondary rounded-4 border-0 shadow-none hover-bg-light"
              >
                <i class="bi bi-arrow-left fs-4"></i>
              </NuxtLink>
              <h4 class="fw-bold m-0 text-muted d-flex align-items-center">
                <i class="bi bi-calculator-fill me-2 text-primary"></i>
                <span>POS ТЕРМИНАЛ</span>
              </h4>
            </div>
            <div class="d-flex align-items-center gap-3">
              <div
                class="badge bg-light text-dark px-3 py-2 border rounded-pill d-flex align-items-center gap-2 shadow-sm"
              >
                <i class="bi bi-person-badge text-primary fs-6"></i>
                <span class="small fw-bold">{{ authStore.user?.name }}</span>
              </div>
              <button
                @click="loadAllProducts"
                class="btn btn-light rounded-circle shadow-sm border"
                style="width: 40px; height: 40px"
              >
                <i
                  class="bi bi-arrow-clockwise"
                  :class="{
                    'spinner-border spinner-border-sm border-0':
                      isInitialLoading,
                  }"
                ></i>
              </button>
            </div>
          </div>
        </div>

        <div class="flex-grow-1 p-3 pt-0 overflow-hidden">
          <div class="row g-3 h-100 overflow-hidden">
            <div
              class="col-lg-8 d-flex flex-column h-100"
              style="min-height: 0"
            >
              <div
                class="card border-0 shadow-sm rounded-4 p-4 flex-grow-1 d-flex flex-column bg-white overflow-hidden"
                style="min-height: 0"
              >
                <div
                  class="d-flex justify-content-between align-items-center mb-3"
                >
                  <h6
                    class="fw-bold mb-0 text-muted opacity-75 text-uppercase x-small"
                  >
                    <i class="bi bi-cart4 me-2"></i>СПИСОК ТОВАРОВ
                    <span
                      class="badge bg-light text-primary rounded-pill ms-2 border"
                      >{{ cart.length }}</span
                    >
                  </h6>
                  <button
                    v-if="cart.length > 0"
                    @click="clearCart"
                    class="btn btn-sm btn-outline-danger border-0 rounded-pill px-3 x-small"
                  >
                    <i class="bi bi-trash3 me-1"></i>Очистить
                  </button>
                </div>

                <div class="search-section position-relative mb-3">
                  <div
                    class="input-group shadow-sm rounded-4 overflow-hidden border border-light"
                  >
                    <span class="input-group-text border-0 bg-white"
                      ><i class="bi bi-search text-muted"></i
                      ><span
                        class="ms-1 x-small fw-bold text-primary opacity-50"
                        >F1</span
                      ></span
                    >
                    <input
                      v-model="searchQuery"
                      @input="searchProducts"
                      @focus="
                        isSearchFocused = true;
                        searchProducts();
                      "
                      @blur="
                        setTimeout(() => {
                          isSearchFocused = false;
                        }, 200)
                      "
                      type="text"
                      class="form-control border-0 py-2 fs-6 shadow-none"
                      placeholder="Поиск (F1)..."
                    />
                  </div>

                  <div
                    v-if="isSearchFocused && searchResults.length > 0"
                    class="search-results shadow-lg rounded-4 mt-1 bg-white position-absolute w-100 border animate-fade-in custom-scrollbar-gray"
                    style="z-index: 1070"
                  >
                    <div
                      v-for="(p, sIdx) in searchResults"
                      :key="p.id"
                      @click="
                        addToCart(p);
                        searchResults = [];
                        searchQuery = '';
                        searchResultIndex = -1;
                        isSearchFocused = false;
                      "
                      class="p-3 border-bottom d-flex justify-content-between align-items-center cursor-pointer transition-all"
                      :class="
                        searchResultIndex === sIdx
                          ? 'bg-primary text-white'
                          : 'hover-bg'
                      "
                    >
                      <div class="min-w-0 me-3">
                        <div
                          class="fw-bold text-truncate small"
                          :class="{ 'text-white': searchResultIndex === sIdx }"
                        >
                          {{ p.name }}
                        </div>
                        <small
                          :class="
                            searchResultIndex === sIdx
                              ? 'text-white opacity-75'
                              : 'text-muted'
                          "
                          style="font-size: 10px"
                        >
                          SKU: {{ p.sku }} | Остаток: {{ p.stock_quantity }}
                        </small>
                      </div>
                      <div
                        class="fw-bold"
                        :class="
                          searchResultIndex === sIdx
                            ? 'text-white'
                            : 'text-primary'
                        "
                      >
                        {{ p.sale_price || p.price }}
                        <span class="x-small fw-normal">сом</span>
                      </div>
                    </div>
                    <div
                      v-if="searchQuery !== '' && searchResults.length === 0"
                      class="p-4 text-center text-muted"
                    >
                      Ничего не найдено
                    </div>
                  </div>
                </div>

                <div
                  class="cart-scroll-area border rounded-4 flex-grow-1 overflow-auto bg-light-subtle custom-scrollbar"
                >
                  <table class="table table-hover align-middle mb-0">
                    <thead class="bg-light sticky-top">
                      <tr
                        class="small text-muted text-uppercase"
                        style="font-size: 10px"
                      >
                        <th class="ps-3 border-0 py-3" style="width: 40px">
                          #
                        </th>
                        <th class="border-0 py-3">Товар</th>
                        <th class="text-center border-0 py-3">Кол-во</th>
                        <th class="text-center border-0 py-3">Цена</th>
                        <th class="text-end pe-3 border-0 py-3">Сумма</th>
                        <th class="border-0 py-3" style="width: 50px"></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="(item, index) in cart"
                        :key="item.product_id"
                        class="cart-item-row"
                        :class="{
                          'bg-primary bg-opacity-10': activeCartIndex === index,
                        }"
                      >
                        <td
                          class="ps-3 py-3 text-muted small fw-bold"
                          style="width: 40px"
                        >
                          {{ index + 1 }}
                        </td>
                        <td class="py-3">
                          <div class="fw-bold small lh-sm mb-1">
                            {{ item.name }}
                          </div>
                          <div class="text-muted" style="font-size: 10px">
                            {{ item.sku }}
                          </div>
                        </td>
                        <td class="py-3">
                          <div
                            class="d-flex align-items-center justify-content-center gap-2"
                          >
                            <button
                              @click="updateQuantity(item, -1)"
                              class="btn btn-light border border-secondary border-opacity-25 rounded-3 p-0 d-flex align-items-center justify-content-center shadow-xs touch-btn"
                              style="width: 38px; height: 38px"
                            >
                              <i class="bi bi-dash-lg text-secondary"></i>
                            </button>
                            <input
                              type="text"
                              v-model="item.quantity"
                              @focus="
                                activeField = 'quantity';
                                activeCartIndex = index;
                                isFocused = true;
                                numpadBuffer = '';
                              "
                              readonly
                              class="form-control text-center fw-black border-0 bg-transparent p-0 shadow-none fs-5"
                              style="width: 70px"
                            />
                            <button
                              @click="updateQuantity(item, 1)"
                              class="btn btn-light border border-secondary border-opacity-25 rounded-3 p-0 d-flex align-items-center justify-content-center shadow-xs touch-btn"
                              style="width: 38px; height: 38px"
                            >
                              <i class="bi bi-plus-lg text-secondary"></i>
                            </button>
                          </div>
                        </td>
                        <td class="py-3">
                          <div
                            class="d-flex align-items-center justify-content-center"
                          >
                            <div
                              v-if="
                                settings.pos_allow_price_change !== '1' ||
                                activeField !== 'price' ||
                                activeCartIndex !== index
                              "
                              @dblclick="
                                if (settings.pos_allow_price_change === '1') {
                                  activeField = 'price';
                                  activeCartIndex = index;
                                  isFocused = true;
                                  numpadBuffer = '';
                                }
                              "
                              class="fw-black fs-6"
                              :class="{
                                'text-primary':
                                  activeCartIndex === index &&
                                  settings.pos_allow_price_change === '1',
                                'cursor-pointer':
                                  settings.pos_allow_price_change === '1',
                              }"
                            >
                              {{ item.price }} сом
                            </div>
                            <input
                              v-else
                              type="text"
                              v-model="item.price"
                              @focus="
                                isFocused = true;
                                numpadBuffer = '';
                              "
                              class="form-control text-center fw-black border-0 bg-transparent p-0 shadow-none fs-6 text-primary animate-fade-in"
                              style="width: 80px"
                            />
                          </div>
                        </td>
                        <td class="text-end pe-3 py-3 fs-6 fw-black">
                          {{ (item.price * item.quantity).toLocaleString() }}
                        </td>
                        <td class="py-3 text-center">
                          <button
                            @click="removeFromCart(index)"
                            class="btn btn-light-danger rounded-circle d-flex align-items-center justify-content-center shadow-xs mx-auto"
                            style="width: 40px; height: 40px"
                          >
                            <i class="bi bi-trash-fill fs-5"></i>
                          </button>
                        </td>
                      </tr>
                      <tr v-if="cart.length === 0">
                        <td
                          colspan="4"
                          class="text-center py-5 text-muted opacity-50"
                        >
                          <i class="bi bi-cart-dash fs-1 d-block mb-3"></i>
                          <div class="small fw-bold">КОРЗИНА ПУСТА</div>
                          <div class="x-small">
                            Выберите товар или используйте поиск
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div
              class="col-lg-4 d-flex flex-column h-100"
              style="min-height: 0"
            >
              <div
                class="card border-0 shadow-sm rounded-4 p-4 flex-grow-1 overflow-auto d-flex flex-column bg-white h-100"
                style="min-height: 0"
              >
                <div
                  class="d-flex align-items-center gap-2 mb-4 text-muted opacity-75"
                >
                  <i class="bi bi-receipt fs-5"></i>
                  <h6
                    class="fw-bold mb-0 text-uppercase x-small letter-spacing-1"
                  >
                    Расчет заказа
                  </h6>
                </div>

                <div class="payment-section-box mb-4">
                  <label
                    class="form-label x-small fw-bold text-muted text-uppercase mb-2 ps-1"
                    >Клиент</label
                  >

                  <Transition name="fade-item" mode="out-in">
                    <div
                      v-if="selectedUser"
                      class="selected-user-card p-3 rounded-4 d-flex justify-content-between align-items-center mb-0 animate-scale-in"
                    >
                      <div class="d-flex align-items-center gap-3 min-w-0">
                        <div class="avatar-circle-sm bg-primary text-white">
                          <i class="bi bi-person-fill"></i>
                        </div>
                        <div class="min-w-0">
                          <div class="fw-bold text-truncate small text-dark">
                            {{ selectedUser.name }}
                          </div>
                          <div class="x-small text-muted text-truncate">
                            {{ selectedUser.phone || selectedUser.email }}
                          </div>
                        </div>
                      </div>
                      <button
                        @click="selectedUser = null"
                        class="btn btn-sm btn-light-danger rounded-circle p-2 ms-2"
                      >
                        <i class="bi bi-x-lg"></i>
                      </button>
                    </div>

                    <div class="position-relative" v-else>
                      <div
                        class="search-input-group rounded-4 overflow-hidden border"
                      >
                        <span
                          class="search-icon ps-3 text-primary d-flex align-items-center gap-1"
                          ><i class="bi bi-person-search"></i
                          ><span class="x-small fw-bold opacity-50"
                            >F2</span
                          ></span
                        >
                        <input
                          v-model="userSearchQuery"
                          @input="searchUsers"
                          type="text"
                          class="form-control customer-search-input border-0 py-3 shadow-none bg-transparent"
                          placeholder="Поиск клиента (F2)..."
                        />
                      </div>

                      <Transition name="fade">
                        <div
                          v-if="users.length > 0"
                          class="user-dropdown-results shadow-lg rounded-4 mt-2 bg-white position-absolute w-100 z-3 border"
                        >
                          <div
                            v-for="u in users"
                            :key="u.id"
                            @click="selectUser(u)"
                            class="p-3 border-bottom cursor-pointer user-item-hover transition-all"
                          >
                            <div class="fw-bold small">{{ u.name }}</div>
                            <small class="text-muted x-small d-block mt-1">{{
                              u.phone || u.email
                            }}</small>
                          </div>
                        </div>
                      </Transition>
                    </div>
                  </Transition>
                </div>

                <div class="payment-section-box mb-4">
                  <label
                    class="form-label x-small fw-bold text-muted text-uppercase mb-2 ps-1"
                  >
                    Купон на скидку
                  </label>

                  <div
                    v-if="appliedCoupon"
                    class="applied-coupon-card px-3 py-2 rounded-4 d-flex justify-content-between align-items-center bg-success bg-opacity-10 border border-success border-opacity-25 animate-scale-in"
                  >
                    <div class="d-flex align-items-center gap-2">
                      <i
                        class="bi bi-ticket-perforated-fill text-success fs-5"
                      ></i>
                      <div>
                        <span class="fw-bold text-success small">{{
                          appliedCoupon.code
                        }}</span>
                        <span class="ms-2 x-small text-success opacity-75"
                          >-{{ couponDiscount }} сом</span
                        >
                      </div>
                    </div>
                    <button
                      @click="removeCoupon"
                      class="btn btn-sm btn-link text-danger p-0"
                    >
                      <i class="bi bi-trash"></i>
                    </button>
                  </div>

                  <div
                    v-else
                    class="coupon-input-group rounded-4 overflow-hidden border d-flex"
                  >
                    <span
                      class="ps-3 text-primary d-flex align-items-center gap-1 bg-light border-end"
                      ><i class="bi bi-ticket-perforated"></i
                      ><span class="x-small fw-bold opacity-50">F4</span></span
                    >
                    <input
                      id="coupon-input"
                      v-model="couponCode"
                      type="text"
                      class="form-control border-0 py-2 px-3 shadow-none bg-transparent small fw-bold"
                      placeholder="Введите код купона (F4)..."
                      @keyup.enter="applyCoupon"
                    />
                    <button
                      @click="applyCoupon"
                      :disabled="isCouponValidating || !couponCode"
                      class="btn btn-outline-primary border-0 px-3 transition-all"
                    >
                      <span
                        v-if="isCouponValidating"
                        class="spinner-border spinner-border-sm"
                      ></span>
                      <i v-else class="bi bi-arrow-right-circle-fill"></i>
                    </button>
                  </div>
                </div>

                <div class="totals-compact-card p-3 rounded-4 mb-3 border-0">
                  <div
                    class="d-flex justify-content-between align-items-center mb-0 opacity-75"
                  >
                    <span class="text-muted x-small fw-bold">ИТОГО:</span>
                    <span class="small fw-bold text-dark"
                      >{{ totalPrice.toLocaleString() }} сом</span
                    >
                  </div>

                  <div
                    v-if="couponDiscount > 0"
                    class="d-flex justify-content-between align-items-center mb-0 text-success opacity-75"
                  >
                    <span class="x-small fw-bold">СКИДКА:</span>
                    <span class="small fw-bold"
                      >-{{ couponDiscount.toLocaleString() }} сом</span
                    >
                  </div>

                  <div
                    class="d-flex justify-content-between align-items-center"
                  >
                    <span class="h5 fw-bold mb-0 text-dark">К ОПЛАТЕ:</span>
                    <div class="text-end">
                      <span class="h2 fw-black mb-0 text-primary">
                        {{ (totalPrice - couponDiscount).toLocaleString() }}
                      </span>
                      <span class="small fw-bold text-primary ms-1">сом</span>
                    </div>
                  </div>
                </div>

                <div class="payment-methods-section mb-3">
                  <div class="row g-2">
                    <div class="col-6">
                      <div
                        class="payment-card-premium p-2 rounded-4 transition-all cursor-pointer border"
                        :class="{
                          active: activeField === 'cash',
                          completed: cashAmount > 0,
                        }"
                        @click="activeField = 'cash'"
                      >
                        <div
                          class="d-flex justify-content-between align-items-center mb-1"
                        >
                          <span class="x-small fw-bold text-muted opacity-50"
                            >НАЛИЧНЫЕ
                            <span
                              class="badge bg-success-subtle text-success ms-1"
                              >F5</span
                            ></span
                          >
                          <i
                            class="bi bi-wallet2"
                            :class="
                              activeField === 'cash'
                                ? 'text-white'
                                : 'text-success'
                            "
                          ></i>
                        </div>
                        <div class="payment-amount-display">
                          <input
                            type="number"
                            v-model.number="cashAmount"
                            @focus="
                              activeField = 'cash';
                              isFocused = true;
                              numpadBuffer = '';
                            "
                            @blur="isFocused = false"
                            class="form-control cash-input-field border-0 p-0 fw-black fs-4 bg-transparent shadow-none"
                            placeholder="0"
                            readonly
                          />
                        </div>
                      </div>
                    </div>

                    <div class="col-6">
                      <div
                        class="payment-card-premium p-2 rounded-4 transition-all cursor-pointer border"
                        :class="{
                          active: activeField === 'transfer',
                          completed: transferAmount > 0,
                        }"
                        @click="activeField = 'transfer'"
                      >
                        <div
                          class="d-flex justify-content-between align-items-center mb-1"
                        >
                          <span class="x-small fw-bold text-muted opacity-50"
                            >ПЕРЕВОД
                            <span
                              class="badge bg-primary-subtle text-primary ms-1"
                              >F6</span
                            ></span
                          >
                          <i
                            class="bi bi-credit-card"
                            :class="
                              activeField === 'transfer'
                                ? 'text-white'
                                : 'text-primary'
                            "
                          ></i>
                        </div>
                        <div class="payment-amount-display">
                          <input
                            type="number"
                            v-model.number="transferAmount"
                            @focus="
                              activeField = 'transfer';
                              isFocused = true;
                              numpadBuffer = '';
                            "
                            @blur="isFocused = false"
                            class="form-control transfer-input-field border-0 p-0 fw-black fs-4 bg-transparent shadow-none"
                            placeholder="0"
                            readonly
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="position-relative w-100" style="z-index: 1100">
                  <Transition name="fade">
                    <div
                      v-if="isFocused"
                      class="numpad-backdrop-clean"
                      @click="isFocused = false"
                    ></div>
                  </Transition>

                  <Transition name="pop">
                    <div
                      v-if="isFocused"
                      class="numpad-popover-integrated shadow-2xl rounded-5 border p-3 bg-white"
                    >
                      <div
                        class="numpad-display-box mb-3 p-3 rounded-4 d-flex justify-content-between align-items-center"
                      >
                        <div class="text-start min-w-0 me-3">
                          <div
                            class="x-small fw-bold text-primary text-uppercase opacity-75"
                            style="letter-spacing: 0.5px"
                          >
                            {{
                              activeField === "quantity"
                                ? "Изменение кол-ва"
                                : "Ввод суммы"
                            }}
                          </div>
                          <div
                            class="small text-muted fw-bold text-truncate"
                            style="max-width: 150px"
                          >
                            <template v-if="activeField === 'quantity'">
                              {{ cart[activeCartIndex]?.name || "Товар" }}
                            </template>
                            <template v-else>
                              {{
                                activeField === "cash" ? "НАЛИЧНЫЕ" : "ПЕРЕВОД"
                              }}
                            </template>
                          </div>
                        </div>
                        <div class="text-end">
                          <span class="h2 fw-black mb-0 text-dark">
                            {{ numpadBuffer || 0 }}
                          </span>
                          <span class="small fw-bold text-muted ms-1">
                            {{ activeField === "quantity" ? "шт" : "сом" }}
                          </span>
                        </div>
                      </div>

                      <div class="row g-2 mb-2">
                        <div
                          class="col-4"
                          v-for="n in [1, 2, 3, 4, 5, 6, 7, 8, 9, '.', 0, '00']"
                          :key="n"
                        >
                          <button
                            @mousedown.prevent
                            @click="appendNumber(n)"
                            class="btn btn-numpad-compact w-100 py-2 rounded-4 fw-bold"
                          >
                            {{ n }}
                          </button>
                        </div>
                        <div class="col-6">
                          <button
                            @mousedown.prevent
                            @click="handleClear"
                            class="btn btn-outline-danger w-100 py-2 rounded-4 fw-bold"
                          >
                            СБРОС
                          </button>
                        </div>
                        <div class="col-6">
                          <button
                            @mousedown.prevent
                            @click="handleBackspace"
                            class="btn btn-numpad-danger-compact w-100 py-2 rounded-4 fw-bold"
                          >
                            <i class="bi bi-backspace"></i>
                          </button>
                        </div>
                      </div>
                      <div class="d-flex gap-2 mt-2">
                        <button
                          @mousedown.prevent
                          @click="isFocused = false"
                          class="btn btn-success flex-grow-1 py-3 rounded-4 fw-bold shadow-sm"
                        >
                          <i class="bi bi-check-circle me-1"></i>ОК (Enter)
                        </button>
                        <button
                          @mousedown.prevent
                          @click="finalizeSale"
                          class="btn btn-primary flex-grow-1 py-3 rounded-4 fw-bold shadow-sm"
                          :disabled="cart.length === 0 || isSubmitting"
                        >
                          <i class="bi bi-printer-fill me-1"></i>ЗАВЕРШИТЬ (F10)
                        </button>
                      </div>
                    </div>
                  </Transition>
                </div>

                <div class="mt-auto pt-3 border-top">
                  <div class="row g-2 align-items-center">
                    <div
                      class="col-6"
                      v-if="changeAmount > 0 || savedChangeAmount > 0"
                    >
                      <div
                        class="change-card-premium p-2 rounded-4 border-0 d-flex flex-column text-center"
                      >
                        <span class="x-small fw-bold text-success opacity-75"
                          >СДАЧА</span
                        >
                        <span class="h5 mb-0 fw-black text-success">{{
                          (changeAmount > 0
                            ? changeAmount
                            : savedChangeAmount
                          ).toLocaleString()
                        }}</span>
                      </div>
                    </div>

                    <div
                      :class="changeAmount > 0 ? 'col-6' : 'col-12'"
                      v-if="settings.pos_allow_debt === '1'"
                    >
                      <button
                        class="btn w-100 rounded-4 border p-2 position-relative transition-all d-flex align-items-center justify-content-center gap-2"
                        :class="
                          isDebt
                            ? 'btn-primary bg-primary-subtle text-primary border-primary border-opacity-25'
                            : 'btn-light border-light-subtle text-muted'
                        "
                        @click="isDebt = !isDebt"
                      >
                        <i
                          class="bi"
                          :class="
                            isDebt
                              ? 'bi-calendar-check-fill'
                              : 'bi-calendar-plus'
                          "
                        ></i>
                        <span class="x-small fw-bold text-uppercase"
                          >В ДОЛГ</span
                        >
                      </button>
                    </div>

                    <div class="col-12" v-if="isDebt">
                      <input
                        type="date"
                        v-model="dueDate"
                        class="form-control form-control-sm rounded-3 border-primary border-opacity-10 bg-light-subtle"
                      />
                    </div>
                  </div>
                </div>

                <div class="mt-3">
                  <button
                    @click="finalizeSale"
                    class="btn btn-primary btn-lg w-100 rounded-4 py-3 fw-black shadow-lg-primary d-flex align-items-center justify-content-center"
                    :disabled="cart.length === 0 || isSubmitting"
                  >
                    <span
                      v-if="isSubmitting"
                      class="spinner-border spinner-border-sm me-3"
                    ></span>
                    <i v-else class="bi bi-printer-fill me-2 fs-5"></i>
                    <span>ЗАВЕРШИТЬ</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <UiToastContainer />
  </div>
</template>

<style scoped>
.pos-container-fluid {
  background-color: #f1f5f9;
}

.sidebar-glass {
  background: #0f1016 !important;
  border-right: 1px solid rgba(255, 255, 255, 0.05);
  height: 100vh;
  overflow: hidden;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 5px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 10px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar-gray::-webkit-scrollbar {
  width: 4px;
}

.custom-scrollbar-gray::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
  border-radius: 10px;
}

.custom-scrollbar-gray::-webkit-scrollbar-track {
  background: transparent;
}

.pos-sidebar-tab {
  background: transparent;
  color: rgba(255, 255, 255, 0.35);
  position: relative;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.pos-sidebar-tab:hover {
  background: rgba(255, 255, 255, 0.03);
  color: #fff;
}

.pos-sidebar-tab.active {
  background: rgba(255, 255, 255, 0.07);
  color: #3b82f6;
}

.pos-sidebar-tab .tab-label {
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
  text-align: center;
  opacity: 0.8;
}

.active-indicator {
  position: absolute;
  left: 0;
  top: 10%;
  bottom: 10%;
  width: 4px;
  background: #3b82f6;
  border-radius: 0 4px 4px 0;
  box-shadow: 0 0 15px rgba(59, 130, 246, 0.8);
}

.hot-panel {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 70px;
  width: 400px;
  background: white;
  z-index: 1040;
  border-right: 1px solid #e2e8f0;
  box-shadow: 20px 0 50px rgba(0, 0, 0, 0.1);
}

.panel-overlay {
  position: absolute;
  top: 0;
  left: 70px;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.02);
  backdrop-filter: blur(1px);
  z-index: 1030;
}

.hot-item-row {
  background: white;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid #f1f5f9 !important;
}

.hot-item-row:hover {
  background: #f8fafc;
  border-color: #e2e8f0 !important;
  transform: translateX(5px);
}

.hot-item-row:active {
  transform: scale(0.98);
  background: #f1f5f9;
}

.panel-enter-active,
.panel-leave-active {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s;
}

.panel-enter-from,
.panel-leave-to {
  transform: translateX(-40px);
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-item-enter-active,
.fade-item-leave-active,
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.hot-tile-name {
  line-height: 1.2;
  font-size: 0.85rem;
}

.hot-tile-price-badge {
  letter-spacing: 0.5px;
}

.hot-groups-tabs::-webkit-scrollbar {
  height: 0px;
}

.hot-groups-tabs {
  scrollbar-width: none;
}

.transition-all {
  transition: all 0.2s ease;
}

.hot-grid-scroll::-webkit-scrollbar {
  width: 4px;
}

.hot-grid-scroll::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 10px;
}

.cart-scroll-area {
  flex: 1;
  min-height: 0;
}

.cart-scroll-area::-webkit-scrollbar {
  width: 6px;
}

.cart-scroll-area::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 10px;
}

.fw-extrabold {
  font-weight: 800;
}

.animate-scale-in {
  animation: scaleIn 0.3s ease-out forwards;
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.line-clamp-1 {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

input::-webkit-outer-spin-button,
input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
input[type="number"] {
  appearance: textfield;
  -moz-appearance: textfield;
}

.hover-bg:hover {
  background-color: #f8fafc;
}
.cursor-pointer {
  scrollbar-width: thin;
}

.search-results {
  max-height: 450px;
  overflow-y: auto;
  background: white;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1),
    0 8px 10px -6px rgba(0, 0, 0, 0.1);
}
.search-results .hover-bg {
  border-bottom: 1px solid #f1f5f9;
}
.search-results .hover-bg:last-child {
  border-bottom: none;
}
.user-search-results {
  max-height: 200px;
  overflow-y: auto;
}
.animate-fade-in {
  animation: fadeIn 0.3s ease-out;
}
.btn-white {
  background: white;
  border: 1px solid #dee2e6;
  transition: all 0.2s;
}
.btn-white:hover {
  background: #f8fafc;
  border-color: #adb5bd;
}
.btn-light-danger {
  background: #fff5f5;
  border: 1px solid #feb2b2;
}
.transition-all {
  transition: all 0.2s;
}
.ring-2 {
  box-shadow: 0 0 0 2px #4f46e5;
}
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.payment-section-box {
  position: relative;
}

.selected-user-card {
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.avatar-circle-sm {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
}

.search-input-group {
  display: flex;
  align-items: center;
  background: #f8fafc;
  border: 1.5px solid #e2e8f0 !important;
  transition: all 0.2s;
}

.search-input-group:focus-within {
  border-color: #3b82f6 !important;
  background: white;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
}

.search-icon {
  font-size: 1.2rem;
  opacity: 0.6;
}

.totals-compact-card {
  background: #f8fafc;
  border: 1px dashed #cbd5e1 !important;
}

.user-dropdown-results {
  max-height: 180px;
  overflow-y: auto;
  z-index: 1200;
}

.numpad-popover-integrated {
  position: absolute;
  top: -250px;
  left: 0;
  width: 100%;
  z-index: 1100;
  transform-origin: center center;
}

.pop-enter-active,
.pop-leave-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.pop-enter-from,
.pop-leave-to {
  transform: translateY(20px) scale(0.9);
  opacity: 0;
}

.numpad-backdrop-clean {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1050;
  background: transparent;
}

.btn-numpad-compact {
  height: 50px;
  background: white;
  border: 1px solid #e2e8f0;
  font-size: 1.25rem !important;
  color: #1e293b;
  transition: all 0.1s;
}

.btn-numpad-compact:active {
  background: #f1f5f9;
  transform: scale(0.95);
}

.btn-numpad-danger-compact {
  height: 50px;
  background: #fff1f2;
  border: 1px solid #fecdd3;
  color: #e11d48;
}

.payment-card-premium {
  min-height: 80px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.numpad-display-box {
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
}

.payment-card-premium.active {
  border-color: #3b82f6 !important;
  background: #3b82f6;
  box-shadow: 0 10px 20px rgba(59, 130, 246, 0.2);
}

.payment-card-premium.active * {
  color: white !important;
  opacity: 1 !important;
}

.payment-card-premium.completed:not(.active) {
  border-color: #10b981 !important;
  background: #f0fdf4;
}

.fw-black {
  font-weight: 900;
}

.letter-spacing-1 {
  letter-spacing: 1px;
}

.numpad-popover-premium {
  position: absolute;
  top: -20px;
  left: 0;
  width: 100%;
  z-index: 1080;
  transform-origin: bottom center;
}

.numpad-backdrop-premium {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1075;
  background: rgba(15, 23, 42, 0.2);
  backdrop-filter: blur(4px);
}

.btn-numpad {
  height: 70px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  font-size: 1.5rem !important;
  color: #1e293b;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
  transition: all 0.1s;
}

.btn-numpad:active {
  background: #cbd5e1;
  transform: scale(0.95);
}

.btn-numpad-danger {
  height: 70px;
  background: #fff1f2;
  border: 1px solid #fecdd3;
  color: #e11d48;
  font-size: 1.5rem;
}

.btn-numpad-danger:active {
  background: #fecdd3;
  transform: scale(0.95);
}

.shadow-lg-primary {
  box-shadow: 0 15px 30px rgba(59, 130, 246, 0.3) !important;
}

.shadow-2xl {
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25) !important;
}

.change-card-premium {
  background: #f0fdf4;
  border: 1px solid #10b981;
}

.debt-card-premium {
  background: white;
  border-color: #e2e8f0;
}

.hover-scale:hover {
  transform: scale(1.01);
}

.pop-enter-active,
.pop-leave-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.pop-enter-from,
.pop-leave-to {
  transform: translateY(20px) scale(0.9);
  opacity: 0;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.touch-btn:active {
  background: #f1f5f9 !important;
  transform: scale(0.92);
  transition: transform 0.1s ease;
}

.shadow-xs {
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05) !important;
}
</style>
