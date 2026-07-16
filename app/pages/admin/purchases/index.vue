<script setup>
const {
  getPurchases,
  getSuppliers,
  createPurchase,
  updatePurchase,
  deletePurchase,
  downloadPurchaseInvoice,
  registerSupplierPayment,
  createSupplier,
} = useAccounting();
const {
  createProduct,
  getCategories,
  generateSku,
  createCategory,
  getProducts: getProductsForBarcode,
} = useProducts();
const uiStore = useUiStore();
const productsStore = useProductsStore();

definePageMeta({
  layout: "admin",
  middleware: "purchaser",
});

const activeTab = ref("list");
const loading = ref(false);
const purchases = ref([]);
const suppliers = ref([]);
const showProductPicker = ref(false);
const selectedItems = reactive({});
const selectedItemsCount = computed(
  () => Object.values(selectedItems).filter(Boolean).length,
);
const isAllItemsSelected = computed(
  () =>
    form.value.items.length > 0 &&
    form.value.items.every((_, index) => selectedItems[index]),
);
const toggleSelectAllItems = () => {
  const nextValue = !isAllItemsSelected.value;
  form.value.items.forEach((_, index) => {
    selectedItems[index] = nextValue;
  });
};
const toPrintItem = (item) => ({
  id: item.product_id,
  name: item.name,
  sku: item.sku || "",
  price: Number(item.sale_price || 0),
  sale_price: 0,
  qty: item.quantity,
});

// Печать открывается модалкой поверх текущей страницы, а не переходом —
// приём товара ещё не сохранён, и уход со страницы сбросил бы черновик.
const showPrintModal = ref(false);
const printModalItems = ref([]);

const openPrintModalForItem = (item) => {
  printModalItems.value = [toPrintItem(item)];
  showPrintModal.value = true;
};

const openPrintModalBulk = () => {
  printModalItems.value = form.value.items
    .filter((i, index) => selectedItems[index])
    .map(toPrintItem);
  showPrintModal.value = true;
};

const barcodeBuffer = ref("");
const lastBarcodeKeyTime = ref(0);
const isBarcodeLookup = ref(false);

const today = new Date().toLocaleDateString("en-CA");
const filters = ref({
  date_from: today,
  date_to: today,
  supplier_id: "",
  status: "",
  search: "",
  page: 1,
  per_page: 15,
});

const purchaseData = ref({
  data: [],
  current_page: 1,
  last_page: 1,
  total: 0,
});

let debounceTimer = null;
watch(
  () => filters.value.search,
  () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      filters.value.page = 1;
      loadData();
    }, 500);
  },
);

const form = ref({
  supplier_id: "",
  paid_amount: 0,
  items: [],
});
const editingPurchaseId = ref(null);

// Черновик накладной сохраняется в localStorage, чтобы случайное обновление
// страницы (F5) не стирало уже подобранные товары и поставщика
const PURCHASE_DRAFT_KEY = "purchase_draft_v1";

const saveDraftToStorage = () => {
  if (!import.meta.client || editingPurchaseId.value) return;
  if (!form.value.supplier_id && form.value.items.length === 0) {
    localStorage.removeItem(PURCHASE_DRAFT_KEY);
    return;
  }
  localStorage.setItem(PURCHASE_DRAFT_KEY, JSON.stringify(form.value));
};

const clearDraftFromStorage = () => {
  if (!import.meta.client) return;
  localStorage.removeItem(PURCHASE_DRAFT_KEY);
};

const restoreDraftFromStorage = () => {
  if (!import.meta.client) return;
  try {
    const raw = localStorage.getItem(PURCHASE_DRAFT_KEY);
    if (!raw) return;
    const draft = JSON.parse(raw);
    if (draft && (draft.items?.length || draft.supplier_id)) {
      form.value = { supplier_id: "", paid_amount: 0, items: [], ...draft };
      activeTab.value = "create";
      uiStore.success("Восстановлен несохранённый черновик приёма товара");
    }
  } catch (e) {
    console.error("Failed to restore purchase draft", e);
  }
};

let draftSaveTimer = null;
watch(
  form,
  () => {
    clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(saveDraftToStorage, 300);
  },
  { deep: true },
);

// Защита от случайного обновления/закрытия страницы, пока приём не
// подтверждён: браузер спросит подтверждение, а при переходе внутри
// приложения — покажем свой диалог
const hasUnsavedChanges = computed(
  () =>
    activeTab.value === "create" &&
    (form.value.items.length > 0 || !!form.value.supplier_id),
);

const handleBeforeUnload = (e) => {
  if (!hasUnsavedChanges.value) return;
  e.preventDefault();
  e.returnValue = "";
};

const isPurchasesModalOpen = () =>
  showProductPicker.value ||
  showAddProductModal.value ||
  showAddSupplierModal.value ||
  showAddCategoryModal.value ||
  showPaymentModal.value ||
  showPrintModal.value;

// Insert — быстрый вызов "Вставить товар" без мыши, как на кассе.
// Сканер штрих-кода шлёт символы очень быстро и завершает Enter — ловим
// их, пока фокус не в поле ввода и открыта вкладка приёма, и сразу
// добавляем товар в накладную по артикулу (SKU).
const handleGlobalKeydown = (e) => {
  if (e.key === "Insert") {
    if (activeTab.value !== "create" || showProductPicker.value) return;
    e.preventDefault();
    showProductPicker.value = true;
    return;
  }

  if (
    activeTab.value !== "create" ||
    isPurchasesModalOpen() ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)
  ) {
    return;
  }

  const now = Date.now();
  if (now - lastBarcodeKeyTime.value > 150) {
    barcodeBuffer.value = "";
  }
  lastBarcodeKeyTime.value = now;

  if (e.key === "Enter") {
    if (barcodeBuffer.value.length > 2) {
      e.preventDefault();
      addItemByBarcode(barcodeBuffer.value);
    }
    barcodeBuffer.value = "";
  } else if (e.key.length === 1) {
    barcodeBuffer.value += e.key;
  }
};

onBeforeRouteLeave(async () => {
  if (!hasUnsavedChanges.value) return true;
  return await uiStore.showConfirm(
    "Покинуть страницу?",
    "В текущем приёме есть несохранённые товары. Уйти без оприходования?",
  );
});

const confirmDiscardDraft = async (message) => {
  if (form.value.items.length === 0 && !form.value.supplier_id) return true;
  return await uiStore.showConfirm("Очистить текущий приём?", message);
};

const clearItems = async () => {
  if (form.value.items.length === 0) return;
  const proceed = await confirmDiscardDraft(
    "Все добавленные товары будут удалены из текущего приёма.",
  );
  if (proceed) {
    form.value.items = [];
    Object.keys(selectedItems).forEach((key) => delete selectedItems[key]);
  }
};

const showPaymentModal = ref(false);
const selectedPurchaseForPayment = ref(null);
const paymentForm = ref({
  amount: 0,
  payment_method: "cash",
});

const openPaymentModal = (purchase) => {
  selectedPurchaseForPayment.value = purchase;
  paymentForm.value.amount =
    purchase.total_amount - (purchase.paid_amount || 0);
  showPaymentModal.value = true;
};

const handleRegisterPayment = async () => {
  if (!selectedPurchaseForPayment.value || paymentForm.value.amount <= 0) {
    uiStore.error("Введите корректную сумму");
    return;
  }
  try {
    await registerSupplierPayment(
      selectedPurchaseForPayment.value.id,
      paymentForm.value,
    );
    uiStore.success("Оплата успешно зарегистрирована");
    showPaymentModal.value = false;
    await loadData();
  } catch (error) {
    uiStore.error(
      "Ошибка: " + (error.data?.message || "Не удалось сохранить оплату"),
    );
  }
};

const showAddSupplierModal = ref(false);
const showAddProductModal = ref(false);
const showAddCategoryModal = ref(false);
const newSupplierForm = ref({ name: "", phone: "", email: "", address: "" });
const newCategoryForm = ref({ name: "", description: "" });
const supplierSearch = ref("");

const categories = ref([]);
const newProductForm = ref({
  name: "",
  sku: "",
  purchase_price: "",
  price: "",
  category_id: "",
  is_active: true,
  in_stock: true,
});
const productErrors = ref({});
const isProductSaving = ref(false);

const filteredSuppliers = computed(() => {
  if (!supplierSearch.value) return suppliers.value;
  return suppliers.value.filter((s) =>
    s.name.toLowerCase().includes(supplierSearch.value.toLowerCase()),
  );
});

const handleQuickAddSupplier = async () => {
  if (!newSupplierForm.value.name) {
    uiStore.error("Имя поставщика обязательно");
    return;
  }
  try {
    const res = await createSupplier(newSupplierForm.value);
    const newSup = res.data || res;
    await loadData();
    form.value.supplier_id = newSup.id;
    showAddSupplierModal.value = false;
    newSupplierForm.value = { name: "", phone: "", email: "", address: "" };
    uiStore.success("Поставщик добавлен и выбран");
  } catch (error) {
    uiStore.error("Ошибка при добавлении поставщика");
  }
};

const handleQuickAddProduct = async () => {
  productErrors.value = {};
  isProductSaving.value = true;
  try {
    const res = await createProduct(newProductForm.value);
    uiStore.success("Товар успешно создан!");
    addItem(res.data || res);
    showAddProductModal.value = false;

    newProductForm.value = {
      name: "",
      sku: "",
      purchase_price: "",
      price: "",
      category_id: "",
      is_active: true,
      in_stock: true,
    };
  } catch (error) {
    if (error.data?.errors) {
      productErrors.value = error.data.errors;
    } else {
      uiStore.error("Ошибка при создании товара");
    }
  } finally {
    isProductSaving.value = false;
  }
};

const handleQuickAddCategory = async () => {
  if (!newCategoryForm.value.name) {
    uiStore.error("Название категории обязательно");
    return;
  }
  try {
    const res = await createCategory(newCategoryForm.value);
    const newCat = res.data || res;

    const cats = await getCategories();
    categories.value = Array.isArray(cats) ? cats : cats.data || [];

    newProductForm.value.category_id = newCat.id;

    showAddCategoryModal.value = false;
    newCategoryForm.value = { name: "", description: "" };
    uiStore.success("Категория добавлена");
  } catch (error) {
    console.error(error);
    uiStore.error("Ошибка при создании категории");
  }
};

// Открывается из модалки выбора товара — закрываем её на время создания
// нового товара, чтобы модалки не накладывались друг на друга
const openAddProductModal = async () => {
  showProductPicker.value = false;
  if (categories.value.length === 0) {
    const res = await getCategories();
    categories.value = Array.isArray(res) ? res : res.data || [];
  }

  // Артикул пустой по умолчанию — обычно его сканируют штрих-кодом
  showAddProductModal.value = true;
};

const handleGenerateSku = async () => {
  try {
    const res = await generateSku();
    newProductForm.value.sku = res.sku;
  } catch (e) {
    uiStore.error("Ошибка при генерации SKU");
  }
};

// Сканер штрих-кода в конце ввода отправляет Enter — по умолчанию это
// сабмитило бы форму создания товара. Вместо этого просто переводим
// фокус на следующее поле, как Tab
const focusNextField = (e) => {
  e.preventDefault();
  const form = e.target.closest("form");
  if (!form) return;
  const focusable = Array.from(
    form.querySelectorAll("input, select, textarea"),
  ).filter((el) => !el.disabled && el.offsetParent !== null);
  const idx = focusable.indexOf(e.target);
  const next = focusable[idx + 1];
  if (next) {
    next.focus();
    if (typeof next.select === "function") next.select();
  }
};

const loadData = async () => {
  loading.value = true;
  try {
    const params = {
      ...filters.value,
      supplier_id: filters.value.supplier_id || undefined,
      status: filters.value.status || undefined,
      date_from: filters.value.date_from || undefined,
      date_to: filters.value.date_to || undefined,
      search: filters.value.search || undefined,
    };

    const [pResponse, sResponse] = await Promise.allSettled([
      getPurchases(params),
      getSuppliers(),
    ]);

    if (pResponse.status === "fulfilled") {
      const data = pResponse.value;
      if (data && data.data && Array.isArray(data.data)) {
        purchaseData.value = data;
        purchases.value = data.data;
      } else {
        purchases.value = Array.isArray(data) ? data : [];
        purchaseData.value = {
          data: purchases.value,
          current_page: 1,
          last_page: 1,
          total: purchases.value.length,
        };
      }
    }

    if (sResponse.status === "fulfilled") {
      const data = sResponse.value;
      suppliers.value = Array.isArray(data) ? data : data?.data || [];
    }
  } catch (error) {
    console.error("Error loading data:", error);
    uiStore.error("Ошибка при загрузке данных");
  } finally {
    loading.value = false;
  }
};

const changePage = (page) => {
  if (page < 1 || page > purchaseData.value.last_page) return;
  filters.value.page = page;
  loadData();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

// Ссылки на инпуты "Кол-во" по индексу строки — чтобы после добавления
// товара сразу поставить туда фокус (быстро набрать количество).
// Индекс, а не product_id: один и тот же товар может быть в приёме
// несколькими строками (разные партии/цены), тогда product_id не уникален.
const qtyInputRefs = {};
const setQtyInputRef = (index, el) => {
  if (el) qtyInputRefs[index] = el;
  else delete qtyInputRefs[index];
};

const focusQuantityInput = async (index) => {
  await nextTick();
  const el = qtyInputRefs[index];
  if (el) {
    el.focus();
    el.select();
  }
};

const addItem = (product) => {
  const existingIndex = form.value.items.findIndex(
    (i) => i.product_id === product.id,
  );
  if (existingIndex !== -1) {
    form.value.items[existingIndex].quantity++;
    focusQuantityInput(existingIndex);
  } else {
    form.value.items.push({
      product_id: product.id,
      name: product.name,
      sku: product.sku || "",
      quantity: 1,
      buy_price: parseFloat(product.purchase_price || product.price || 0),
      sale_price: parseFloat(product.price || 0),
      notes: "",
    });
    focusQuantityInput(form.value.items.length - 1);
  }
};

const removeItem = (index) => {
  form.value.items.splice(index, 1);
  // selectedItems привязан по индексу строки — после удаления индексы
  // сдвигаются, поэтому сбрасываем отметки, чтобы «выбранность» не
  // перескочила на другой товар.
  Object.keys(selectedItems).forEach((key) => delete selectedItems[key]);
};

const addItemByBarcode = async (code) => {
  if (isBarcodeLookup.value) return;
  isBarcodeLookup.value = true;
  try {
    const res = await getProductsForBarcode(
      { search: code, search_strict: true, per_page: 5 },
      { noCache: true },
    );
    const results = Array.isArray(res) ? res : res?.data || [];
    const match =
      results.find((p) => String(p.sku).trim() === code) ||
      (results.length === 1 ? results[0] : null);

    if (!match) {
      uiStore.info(`Товар со штрих-кодом «${code}» не найден — создайте новый`);
      await openAddProductModal();
      newProductForm.value.sku = code;
      return;
    }
    addItem(match);
  } catch (e) {
    uiStore.error("Не удалось найти товар по штрих-коду");
  } finally {
    isBarcodeLookup.value = false;
  }
};

const totalAmount = computed(() => {
  return form.value.items.reduce(
    (sum, item) => sum + item.quantity * item.buy_price,
    0,
  );
});

const handleSubmit = async () => {
  if (!form.value.supplier_id || form.value.items.length === 0) {
    uiStore.error("Заполните все поля и добавьте хотя бы один товар");
    return;
  }

  try {
    if (editingPurchaseId.value) {
      await updatePurchase(editingPurchaseId.value, form.value);
      uiStore.success("Запись о закупке успешно обновлена!");
    } else {
      await createPurchase(form.value);
      uiStore.success("Поставка успешно оприходована!");
    }
    clearDraftFromStorage();
    cancelEdit();
    loadData();
  } catch (error) {
    uiStore.error(
      "Ошибка при сохранении: " + (error.data?.message || "Сервер не отвечает"),
    );
  }
};

const handleEdit = (purchase) => {
  editingPurchaseId.value = purchase.id;
  form.value = {
    supplier_id: purchase.supplier_id,
    paid_amount: purchase.paid_amount,
    items: purchase.items.map((item) => ({
      product_id: item.product_id,
      name: item.product?.name || "Товар",
      sku: item.product?.sku || "",
      quantity: item.quantity,
      buy_price: item.buy_price,
      sale_price: parseFloat(item.product?.price || 0),
    })),
  };
  Object.keys(selectedItems).forEach((key) => delete selectedItems[key]);
  activeTab.value = "create";
};

const cancelEdit = () => {
  editingPurchaseId.value = null;
  form.value = { supplier_id: "", paid_amount: 0, items: [] };
  Object.keys(selectedItems).forEach((key) => delete selectedItems[key]);
  activeTab.value = "list";
};

const handleDelete = async (id) => {
  const confirmed = await uiStore.showConfirm(
    "Удаление закупки",
    "Вы уверены? Это действие может повлиять на остатки товаров.",
  );
  if (!confirmed) return;

  try {
    await deletePurchase(id);
    uiStore.success("Запись удалена");
    loadData();
  } catch (error) {
    uiStore.error("Ошибка при удалении");
  }
};

const formatPrice = (price) => {
  return parseFloat(price).toLocaleString("ru-RU") + " сом";
};

onMounted(async () => {
  await loadData();
  restoreDraftFromStorage();
  if (import.meta.client) {
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("keydown", handleGlobalKeydown);
  }
});

onUnmounted(() => {
  if (import.meta.client) {
    window.removeEventListener("beforeunload", handleBeforeUnload);
    window.removeEventListener("keydown", handleGlobalKeydown);
  }
});
</script>

<template>
  <div class="purchases-page p-4">
    <div class="header-card mb-4 p-4 rounded-4 shadow-sm text-white">
      <div
        class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3"
      >
        <div>
          <h1 class="h3 mb-1 fw-bold">Склад: Приём и Закупки</h1>
          <p class="mb-0 text-white-50">
            Управление входящими поставками товаров
          </p>
        </div>
        <div
          class="tab-switcher p-1 rounded-pill bg-white bg-opacity-10 border border-white border-opacity-10 d-flex"
        >
          <button
            class="btn-tab"
            :class="{ active: activeTab === 'list' }"
            @click="activeTab = 'list'"
          >
            <i class="bi bi-clock-history me-2"></i>История
          </button>
          <button
            class="btn-tab"
            :class="{ active: activeTab === 'create' }"
            @click="activeTab = 'create'"
          >
            <i class="bi bi-plus-circle-fill me-2"></i
            >{{ editingPurchaseId ? "Правка приёма" : "Новый приём" }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="activeTab === 'list'" class="animate-fade-in">
      <div
        class="card border-0 shadow-sm rounded-4 p-4 mb-4 bg-white luxury-filter-card"
      >
        <div class="row g-3 align-items-end">
          <div class="col-md-2">
            <label class="small fw-bold text-muted text-uppercase mb-2 d-block"
              >С даты</label
            >
            <input
              v-model="filters.date_from"
              type="date"
              class="form-control border-0 bg-light rounded-pill px-3 py-2"
              @change="loadData"
            />
          </div>
          <div class="col-md-2">
            <label class="small fw-bold text-muted text-uppercase mb-2 d-block"
              >По дату</label
            >
            <input
              v-model="filters.date_to"
              type="date"
              class="form-control border-0 bg-light rounded-pill px-3 py-2"
              @change="loadData"
            />
          </div>
          <div class="col-md-2">
            <label class="small fw-bold text-muted text-uppercase mb-2 d-block"
              >Поставщик</label
            >
            <select
              v-model="filters.supplier_id"
              class="form-select border-0 bg-light rounded-pill px-3 py-2"
              @change="loadData"
            >
              <option value="">Все</option>
              <option v-for="s in suppliers" :key="s.id" :value="s.id">
                {{ s.name }}
              </option>
            </select>
          </div>
          <div class="col-md-2">
            <label class="small fw-bold text-muted text-uppercase mb-2 d-block"
              >Статус</label
            >
            <select
              v-model="filters.status"
              class="form-select border-0 bg-light rounded-pill px-3 py-2"
              @change="loadData"
            >
              <option value="">Все</option>
              <option value="completed">✅ Выполнено</option>
              <option value="pending">⏳ Ожидает</option>
              <option value="cancelled">❌ Отменено</option>
            </select>
          </div>
          <div class="col-md-2">
            <label class="small fw-bold text-muted text-uppercase mb-2 d-block"
              >Поиск</label
            >
            <div class="input-group search-pill-inner">
              <span class="input-group-text border-0 ps-3 bg-light"
                ><i class="bi bi-search"></i
              ></span>
              <input
                v-model="filters.search"
                type="text"
                placeholder="Инфо..."
                class="form-control border-0 bg-light rounded-end-pill"
              />
            </div>
          </div>
          <div class="col-md-2 text-end">
            <button
              class="btn btn-refresh-round shadow-sm"
              @click="loadData"
              title="Обновить"
            >
              <i class="bi bi-arrow-clockwise" :class="{ spin: loading }"></i>
            </button>
          </div>
        </div>
      </div>

      <div
        class="card border-0 shadow-sm rounded-4 overflow-hidden d-flex flex-column"
        style="min-height: calc(100vh - 350px); max-height: calc(100vh - 350px);"
      >
        <div
          class="table-responsive-cards flex-grow-1 overflow-auto custom-scrollbar"
        >
          <table class="table table-hover align-middle mb-0 custom-table">
            <thead class="d-none d-lg-table-header-group">
              <tr>
                <th class="ps-4">№ ПНК / Дата</th>
                <th>Поставщик</th>
                <th>Товары</th>
                <th>Сумма</th>
                <th class="text-end pe-4">Действия</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="5" class="text-center py-5">
                  <div class="spinner-border text-primary" role="status"></div>
                </td>
              </tr>
              <tr v-for="p in purchases" :key="p.id" class="purchase-row">
                <td class="ps-4" data-label="Накладная">
                  <div class="fw-bold text-dark">
                    #{{ p.purchase_number || p.id }}
                  </div>
                  <div class="text-muted small">
                    {{ new Date(p.created_at).toLocaleDateString() }}
                  </div>
                </td>
                <td data-label="Поставщик">
                  <div
                    class="d-flex align-items-center justify-content-end justify-content-lg-start"
                  >
                    <div class="supplier-blob me-2 d-none d-lg-block"></div>
                    <span class="small fw-bold">{{
                      p.supplier?.name || "Прямая поставка"
                    }}</span>
                  </div>
                </td>
                <td data-label="Товары">
                  <span class="badge bg-light text-primary border rounded-pill">
                    {{ p.items?.length || 0 }} поз.
                  </span>
                </td>
                <td data-label="Сумма">
                  <div
                    class="d-flex flex-column text-end text-lg-start"
                    style="font-size: 0.85rem"
                  >
                    <span class="fw-bold text-dark">{{
                      formatPrice(p.total_amount)
                    }}</span>
                    <span class="text-success small"
                      >Оплачено: {{ formatPrice(p.paid_amount) }}</span
                    >
                  </div>
                </td>
                <td class="text-end pe-4 mobile-actions">
                  <div class="d-flex justify-content-end gap-2">
                    <button
                      class="btn btn-sm btn-light rounded-pill border shadow-sm"
                      @click="downloadPurchaseInvoice(p.id)"
                      title="Скачать накладную"
                    >
                      <i class="bi bi-file-earmark-pdf text-danger"></i>
                    </button>
                    <button
                      v-if="
                        parseFloat(p.total_amount) >
                        parseFloat(p.paid_amount || 0)
                      "
                      class="btn btn-sm btn-light rounded-pill border shadow-sm"
                      @click="openPaymentModal(p)"
                      title="Внести оплату"
                    >
                      <i class="bi bi-cash-coin text-success"></i>
                    </button>
                    <button
                      class="btn btn-sm btn-light rounded-pill border shadow-sm"
                      @click="handleEdit(p)"
                      title="Правка"
                    >
                      <i class="bi bi-pencil-fill text-primary"></i>
                    </button>
                    <button
                      class="btn btn-sm btn-light rounded-pill border shadow-sm"
                      @click="handleDelete(p.id)"
                      title="Удалить"
                    >
                      <i class="bi bi-trash text-danger"></i>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div
        v-if="purchaseData.last_page > 1"
        class="d-flex justify-content-between align-items-center mt-4 px-2"
      >
        <div class="small fw-bold text-muted">
          Всего записей: <span class="text-dark">{{ purchaseData.total }}</span>
        </div>
        <nav>
          <ul class="pagination-premium mb-0">
            <li :class="{ disabled: filters.page <= 1 }">
              <button
                @click="changePage(filters.page - 1)"
                :disabled="filters.page <= 1"
              >
                <i class="bi bi-chevron-left"></i>
              </button>
            </li>
            <li
              v-for="page in purchaseData.last_page"
              :key="page"
              :class="{ active: page === filters.page }"
            >
              <button @click="changePage(page)">{{ page }}</button>
            </li>
            <li :class="{ disabled: filters.page >= purchaseData.last_page }">
              <button
                @click="changePage(filters.page + 1)"
                :disabled="filters.page >= purchaseData.last_page"
              >
                <i class="bi bi-chevron-right"></i>
              </button>
            </li>
          </ul>
        </nav>
      </div>
    </div>

    <div
      v-if="activeTab === 'create'"
      class="row g-4 animate-slide-up h-view-content"
    >
      <div class="col-12">
        <div
          class="card border-0 shadow-sm rounded-4 overflow-hidden h-100 d-flex flex-column"
        >
          <div
            class="p-4 border-bottom bg-white d-flex justify-content-between align-items-center"
          >
            <h5 class="fw-bold mb-0">
              {{
                editingPurchaseId
                  ? "Редактирование приёма"
                  : "Формирование приёма"
              }}
            </h5>
            <div class="d-flex gap-2">
              <button
                v-if="selectedItemsCount > 0"
                class="btn btn-sm btn-dark rounded-pill px-3"
                @click="openPrintModalBulk"
              >
                <i class="bi bi-tags me-1"></i>Печать ценников ({{ selectedItemsCount }})
              </button>
              <button
                class="btn btn-sm btn-primary rounded-pill px-3"
                @click="showProductPicker = true"
              >
                <i class="bi bi-plus-lg me-1"></i>Вставить товар
              </button>
              <button
                v-if="editingPurchaseId"
                class="btn btn-sm btn-outline-secondary rounded-pill"
                @click="cancelEdit"
              >
                Отмена
              </button>
              <button
                class="btn btn-sm btn-outline-danger border-0 rounded-pill"
                @click="clearItems"
              >
                Очистить
              </button>
            </div>
          </div>

          <div class="p-4 bg-light-subtle border-bottom">
            <div class="row g-3">
              <div class="col-md-7">
                <div
                  class="d-flex justify-content-between align-items-center mb-1"
                >
                  <label class="form-label fw-bold small text-secondary mb-0"
                    >Поставщик</label
                  >
                  <button
                    class="btn btn-link btn-sm p-0 text-decoration-none"
                    @click="showAddSupplierModal = true"
                  >
                    <i class="bi bi-plus-circle me-1"></i>Новый
                  </button>
                </div>
                <div class="position-relative">
                  <select
                    v-model="form.supplier_id"
                    class="form-select border-0 bg-white rounded-3 shadow-sm px-3 py-2"
                  >
                    <option value="">Выберите из списка...</option>
                    <option
                      v-for="s in filteredSuppliers"
                      :key="s.id"
                      :value="s.id"
                    >
                      {{ s.name }}
                    </option>
                  </select>
                </div>
              </div>
              <div class="col-md-5">
                <label class="form-label fw-bold small text-secondary"
                  >Сумма оплаты (аванс)</label
                >
                <div
                  class="input-group shadow-sm rounded-3 overflow-hidden border-0"
                >
                  <input
                    v-model.number="form.paid_amount"
                    type="number"
                    class="form-control border-0 bg-white py-2"
                    placeholder="0.00"
                  />
                  <span class="input-group-text border-0 bg-white text-muted"
                    >сом</span
                  >
                </div>
              </div>
            </div>
          </div>

          <div class="receipt-builder p-0 flex-grow-1 overflow-auto">
            <table class="table mb-0 align-middle">
              <thead class="bg-light sticky-top" style="z-index: 5">
                <tr
                  style="
                    font-size: 0.7rem;
                    color: #64748b;
                    text-transform: uppercase;
                  "
                >
                  <th width="36" class="text-center">
                    <input
                      type="checkbox"
                      class="form-check-input"
                      :checked="isAllItemsSelected"
                      @change="toggleSelectAllItems"
                    />
                  </th>
                  <th class="ps-4">Наименование</th>
                  <th width="90" class="text-center">Кол-во</th>
                  <th width="140">Цена зак.</th>
                  <th width="140">Цена продажи</th>
                  <th width="140" class="text-end">Итого</th>
                  <th width="60"></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(item, index) in form.items"
                  :key="item.product_id + '-' + index"
                  class="receipt-item-row"
                >
                  <td class="text-center">
                    <input
                      type="checkbox"
                      class="form-check-input"
                      v-model="selectedItems[index]"
                    />
                  </td>
                  <td class="ps-4">
                    <div class="fw-bold text-dark small">{{ item.name }}</div>
                  </td>
                  <td>
                    <input
                      :ref="(el) => setQtyInputRef(index, el)"
                      v-model.number="item.quantity"
                      type="number"
                      class="form-control form-control-sm border-0 bg-light rounded-pill text-center font-monospace"
                      min="1"
                      @keyup.enter="$event.target.blur()"
                    />
                  </td>
                  <td>
                    <div class="input-group input-group-sm">
                      <input
                        v-model.number="item.buy_price"
                        type="number"
                        class="form-control border-0 bg-light rounded-start-pill ps-3"
                        step="0.01"
                      />
                      <span
                        class="input-group-text border-0 bg-light rounded-end-pill pe-2 text-muted"
                        style="font-size: 0.6rem"
                        >сом</span
                      >
                    </div>
                  </td>
                  <td>
                    <div class="input-group input-group-sm">
                      <input
                        v-model.number="item.sale_price"
                        type="number"
                        class="form-control border-0 bg-light rounded-start-pill ps-3"
                        step="0.01"
                      />
                      <span
                        class="input-group-text border-0 bg-light rounded-end-pill pe-2 text-muted"
                        style="font-size: 0.6rem"
                        >сом</span
                      >
                    </div>
                  </td>
                  <td class="text-end fw-bold text-dark small">
                    {{
                      formatPrice(item.quantity * item.buy_price).replace(
                        " сом",
                        "",
                      )
                    }}
                  </td>
                  <td class="text-center">
                    <div class="d-flex align-items-center justify-content-center gap-1">
                      <button
                        class="btn btn-sm btn-link text-secondary p-1 btn-print-label"
                        title="Печать этикетки"
                        @click="openPrintModalForItem(item)"
                      >
                        <i class="bi bi-tag"></i>
                      </button>
                      <button
                        class="btn btn-sm btn-link text-danger p-1"
                        @click="removeItem(index)"
                      >
                        <i class="bi bi-x-circle"></i>
                      </button>
                    </div>
                  </td>
                </tr>
                <tr v-if="form.items.length === 0">
                  <td
                    colspan="7"
                    class="text-center py-5 text-muted small opacity-75"
                  >
                    <i class="bi bi-cart-plus d-block fs-1 mb-2"></i>
                    Нажмите «Вставить товар», чтобы добавить позиции
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="mt-auto p-4 border-top bg-white shadow-lg">
            <div class="row align-items-center">
              <div class="col">
                <div class="text-muted small fw-bold">ОБЩИЙ ИТОГ ПРИЁМА:</div>
                <h2 class="fw-bold text-primary mb-0">
                  {{ formatPrice(totalAmount) }}
                </h2>
              </div>
              <div class="col-auto">
                <button
                  class="btn btn-receive-large shadow-lg"
                  :class="{ 'btn-warning': editingPurchaseId }"
                  :disabled="form.items.length === 0 || !form.supplier_id"
                  @click="handleSubmit"
                >
                  <i class="bi bi-check2-circle-fill me-2"></i>
                  {{
                    editingPurchaseId
                      ? "Обновить оприходование"
                      : "Подтвердить и оприходовать"
                  }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <UiBaseModal
      :show="showAddSupplierModal"
      title="Быстрое добавление поставщика"
      @close="showAddSupplierModal = false"
      @submit="handleQuickAddSupplier"
    >
      <div class="p-1">
        <div class="mb-3">
          <label class="form-label fw-bold small">Наименование *</label>
          <input
            v-model="newSupplierForm.name"
            type="text"
            class="form-control rounded-3"
            placeholder="ООО 'Поставка Плюс'"
            required
          />
        </div>
        <div class="row g-3 mb-3">
          <div class="col-md-6">
            <label class="form-label fw-bold small">Телефон</label>
            <input
              v-model="newSupplierForm.phone"
              type="text"
              class="form-control rounded-3"
              placeholder="+996..."
            />
          </div>
          <div class="col-md-6">
            <label class="form-label fw-bold small">Email</label>
            <input
              v-model="newSupplierForm.email"
              type="email"
              class="form-control rounded-3"
              placeholder="info@example.com"
            />
          </div>
        </div>
        <div class="mb-0">
          <label class="form-label fw-bold small">Адрес</label>
          <textarea
            v-model="newSupplierForm.address"
            class="form-control rounded-3"
            rows="3"
            placeholder="Город, улица, дом..."
          ></textarea>
        </div>
      </div>

      <template #footer>
        <div class="d-flex justify-content-end gap-2 w-100">
          <button
            type="button"
            class="btn btn-light px-4 rounded-pill"
            @click="showAddSupplierModal = false"
          >
            Отмена
          </button>
          <button
            type="submit"
            class="btn btn-primary px-4 rounded-pill fw-bold shadow-sm"
          >
            Создать и выбрать
          </button>
        </div>
      </template>
    </UiBaseModal>

    <UiBaseModal
      :show="showAddProductModal"
      title="Создание нового товара"
      @close="showAddProductModal = false; showProductPicker = true"
      @submit="handleQuickAddProduct"
    >
      <div class="p-1">
        <div class="mb-3">
          <label class="form-label fw-bold small">Артикул (SKU) *</label>
          <div class="input-group">
            <input
              v-model="newProductForm.sku"
              type="text"
              class="form-control rounded-start-3"
              :class="{ 'is-invalid': productErrors.sku }"
              placeholder="Отсканируйте штрих-код или введите вручную"
              required
              @keydown.enter="focusNextField"
            />
            <button
              type="button"
              class="btn btn-outline-secondary rounded-end-3"
              @click="handleGenerateSku"
              title="Сгенерировать новый SKU"
            >
              <i class="bi bi-magic"></i>
            </button>
            <div v-if="productErrors.sku" class="invalid-feedback">
              {{ productErrors.sku[0] }}
            </div>
          </div>
        </div>

        <div class="mb-3">
          <label class="form-label fw-bold small">Название товара *</label>
          <input
            v-model="newProductForm.name"
            type="text"
            class="form-control rounded-3"
            :class="{ 'is-invalid': productErrors.name }"
            placeholder="Напр: Молоток отбойный"
            required
            @keydown.enter="focusNextField"
          />
          <div v-if="productErrors.name" class="invalid-feedback">
            {{ productErrors.name[0] }}
          </div>
        </div>

        <div class="mb-3">
          <label class="form-label fw-bold small">Категория *</label>
          <div class="input-group">
            <select
              v-model="newProductForm.category_id"
              class="form-select rounded-start-3"
              :class="{ 'is-invalid': productErrors.category_id }"
              required
              @keydown.enter="focusNextField"
            >
              <option value="">Выберите категорию</option>
              <option v-for="cat in categories" :key="cat.id" :value="cat.id">
                {{ cat.name }}
              </option>
            </select>
            <button
              type="button"
              class="btn btn-outline-secondary rounded-end-3"
              @click="showAddCategoryModal = true"
              title="Добавить категорию"
            >
              <i class="bi bi-plus-lg"></i>
            </button>
            <div v-if="productErrors.category_id" class="invalid-feedback">
              {{ productErrors.category_id[0] }}
            </div>
          </div>
        </div>

        <div class="row g-3 mb-0">
          <div class="col-md-6">
            <label class="form-label fw-bold small">Закупочная цена</label>
            <div class="input-group">
              <input
                v-model.number="newProductForm.purchase_price"
                type="number"
                class="form-control rounded-start-3"
                placeholder="0.00"
                @keydown.enter="focusNextField"
              />
              <span class="input-group-text rounded-end-3 bg-light text-muted"
                >сом</span
              >
            </div>
            <div
              v-if="productErrors.purchase_price"
              class="text-danger small mt-1"
            >
              {{ productErrors.purchase_price[0] }}
            </div>
          </div>
          <div class="col-md-6">
            <label class="form-label fw-bold small">Цена продажи *</label>
            <div class="input-group shadow-none">
              <input
                v-model.number="newProductForm.price"
                type="number"
                class="form-control rounded-start-3"
                :class="{ 'is-invalid': productErrors.price }"
                placeholder="0.00"
                required
                @keydown.enter.prevent
              />
              <span class="input-group-text rounded-end-3 bg-light text-muted"
                >сом</span
              >
              <div v-if="productErrors.price" class="invalid-feedback d-block">
                {{ productErrors.price[0] }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="d-flex justify-content-end gap-2 w-100">
          <button
            type="button"
            class="btn btn-light px-4 rounded-pill"
            @click="showAddProductModal = false; showProductPicker = true"
          >
            Отмена
          </button>
          <button
            type="submit"
            class="btn btn-primary px-4 rounded-pill fw-bold shadow-sm"
            :disabled="isProductSaving"
          >
            <span
              v-if="isProductSaving"
              class="spinner-border spinner-border-sm me-2"
            ></span>
            Создать товар
          </button>
        </div>
      </template>
    </UiBaseModal>

    <UiBaseModal
      :show="showAddCategoryModal"
      title="Создание новой категории"
      @close="showAddCategoryModal = false"
      @submit="handleQuickAddCategory"
    >
      <div class="p-1">
        <div class="mb-3">
          <label class="form-label fw-bold small">Название категории *</label>
          <input
            v-model="newCategoryForm.name"
            type="text"
            class="form-control rounded-3"
            placeholder="Например: Электроинструмент"
            required
          />
        </div>
        <div class="mb-0">
          <label class="form-label fw-bold small">Описание</label>
          <textarea
            v-model="newCategoryForm.description"
            class="form-control rounded-3"
            rows="3"
            placeholder="Описание категории..."
          ></textarea>
        </div>
      </div>

      <template #footer>
        <div class="d-flex justify-content-end gap-2 w-100">
          <button
            type="button"
            class="btn btn-light px-4 rounded-pill"
            @click="showAddCategoryModal = false"
          >
            Отмена
          </button>
          <button
            type="submit"
            class="btn btn-primary px-4 rounded-pill fw-bold shadow-sm"
          >
            Создать
          </button>
        </div>
      </template>
    </UiBaseModal>

    <UiBaseModal
      :show="showPaymentModal"
      title="Регистрация оплаты поставщику"
      @close="showPaymentModal = false"
    >
      <div class="p-1">
        <div class="p-3 bg-light rounded-4 mb-4">
          <div class="d-flex justify-content-between mb-2">
            <span class="text-muted small">Поставщик:</span>
            <span class="fw-bold small">{{
              selectedPurchaseForPayment?.supplier?.name || "Прямая поставка"
            }}</span>
          </div>
          <div class="d-flex justify-content-between mb-2">
            <span class="text-muted small">Общая сумма:</span>
            <span class="fw-bold small">{{
              formatPrice(selectedPurchaseForPayment?.total_amount)
            }}</span>
          </div>
          <div class="d-flex justify-content-between">
            <span class="text-muted small">Остаток долга:</span>
            <span class="fw-bold text-danger">{{
              formatPrice(
                (selectedPurchaseForPayment?.total_amount || 0) -
                  (selectedPurchaseForPayment?.paid_amount || 0),
              )
            }}</span>
          </div>
        </div>

        <div class="mb-4">
          <label class="form-label fw-bold small text-secondary"
            >Сумма платежа</label
          >
          <div
            class="input-group input-group-lg shadow-sm rounded-3 overflow-hidden"
          >
            <input
              v-model.number="paymentForm.amount"
              type="number"
              class="form-control border-0 bg-light text-center fw-bold"
              placeholder="0.00"
            />
            <span class="input-group-text border-0 bg-light text-muted"
              >сом</span
            >
          </div>
        </div>

        <div class="mb-0">
          <label class="form-label fw-bold small text-secondary"
            >Способ оплаты</label
          >
          <div class="d-flex gap-2">
            <button
              v-for="m in ['cash', 'bank_transfer', 'card']"
              :key="m"
              type="button"
              class="btn flex-grow-1 py-3 border rounded-4 transition-all"
              :class="
                paymentForm.payment_method === m
                  ? 'btn-primary border-primary'
                  : 'btn-outline-light text-dark'
              "
              @click="paymentForm.payment_method = m"
            >
              <div class="small fw-bold">
                {{
                  m === "cash"
                    ? "Наличные"
                    : m === "bank_transfer"
                    ? "Перевод"
                    : "Карта"
                }}
              </div>
            </button>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="d-flex justify-content-end gap-2 w-100">
          <button
            type="button"
            class="btn btn-light px-4 rounded-pill"
            @click="showPaymentModal = false"
          >
            Отмена
          </button>
          <button
            class="btn btn-success px-4 rounded-pill fw-bold shadow-sm"
            @click="handleRegisterPayment"
          >
            <i class="bi bi-check2-circle me-2"></i>Зарегистрировать оплату
          </button>
        </div>
      </template>
    </UiBaseModal>

    <AdminProductPickerModal
      :show="showProductPicker"
      :items="form.items"
      @close="showProductPicker = false"
      @select="addItem"
      @create-product="openAddProductModal"
    />

    <AdminPrintLabelsModal
      v-model:show="showPrintModal"
      :items="printModalItems"
    />
  </div>
</template>

<style scoped>
.header-card {
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

/* Убираем стрелки увеличения/уменьшения у числовых полей */
.purchases-page input[type="number"]::-webkit-outer-spin-button,
.purchases-page input[type="number"]::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.purchases-page input[type="number"] {
  -moz-appearance: textfield;
}

/* Фиксированная высота карточки приёма с внутренним скроллом — только
   на xl+. На меньших экранах раскладка обычная, без обрезки. */
@media (min-width: 1200px) {
  .h-view-content {
    height: calc(100vh - 180px);
    min-height: 500px;
    overflow: hidden;
  }

  .h-view-content > div {
    height: 100%;
    display: flex !important;
    flex-direction: column;
  }

  .h-view-content .card {
    display: flex !important;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
}

.receipt-builder {
  flex: 1;
  overflow-y: auto !important;
  overflow-x: hidden;
  scrollbar-width: thin;
}

.receipt-builder::-webkit-scrollbar {
  width: 6px;
}
.receipt-builder::-webkit-scrollbar-thumb {
  background-color: #e2e8f0;
  border-radius: 10px;
}

.tab-switcher {
  gap: 4px;
}

.btn-tab {
  background: transparent;
  border: none;
  font-size: 0.85rem;
  font-weight: 700;
  padding: 0.6rem 1.2rem;
  border-radius: 50px;
  color: rgba(255, 255, 255, 0.6);
  transition: all 0.3s;
}

.btn-tab.active {
  background: white;
  color: #0f172a;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.btn-tab:not(.active):hover {
  background: rgba(255, 255, 255, 0.05);
  color: white;
}

thead th {
  background: #f8fafc;
  color: #64748b;
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 1rem;
}

.purchase-row:hover {
  background-color: #f1f5f9;
}

.supplier-blob {
  width: 8px;
  height: 8px;
  background: #38bdf8;
  border-radius: 50%;
}

.status-badge.received {
  background: rgba(34, 197, 94, 0.1);
  color: #16a34a;
  padding: 0.5rem 1rem;
  border-radius: 50px;
  font-weight: 700;
  font-size: 0.75rem;
}

.pagination-premium {
  display: flex;
  list-style: none;
  gap: 6px;
  padding: 0;
}
.pagination-premium li button {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: white;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  font-size: 0.85rem;
}
.pagination-premium li.active button {
  background: #38bdf8;
  color: white;
  border-color: #38bdf8;
  box-shadow: 0 4px 12px rgba(56, 189, 248, 0.25);
}
.pagination-premium li.disabled button {
  opacity: 0.5;
  cursor: not-allowed;
}

.receipt-item-row:hover {
  background-color: #f8fafc;
}
.btn-print-label {
  opacity: 0;
  transition: opacity 0.15s;
}
.receipt-item-row:hover .btn-print-label {
  opacity: 1;
}

.btn-receive-large {
  background: #38bdf8;
  color: #0f172a;
  border: none;
  padding: 1rem 2rem;
  border-radius: 50px;
  font-weight: 800;
  transition: all 0.3s;
}

.btn-receive-large:hover:not(:disabled) {
  background: #7dd3fc;
  transform: translateY(-3px);
  box-shadow: 0 10px 25px rgba(56, 189, 248, 0.4);
}

.btn-receive-large:disabled {
  background: #e2e8f0;
  color: #94a3b8;
}

.animate-fade-in {
  animation: fadeIn 0.4s ease-out;
}
.animate-slide-up {
  animation: slideUp 0.4s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
</style>
