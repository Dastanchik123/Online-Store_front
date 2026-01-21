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
  getProducts,
  createProduct,
  getCategories,
  generateSku,
  createCategory,
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
const products = ref([]);
const searchProductQuery = ref("");

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
    await loadData();
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

const openAddProductModal = async () => {
  if (categories.value.length === 0) {
    const res = await getCategories();
    categories.value = Array.isArray(res) ? res : res.data || [];
  }

  try {
    const res = await generateSku();
    newProductForm.value.sku = res.sku;
  } catch (e) {
    console.error("Failed to generate SKU", e);
  }

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

    const [pResponse, sResponse, prodResponse] = await Promise.allSettled([
      getPurchases(params),
      getSuppliers(),
      getProducts({ per_page: 100 }),
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

    if (prodResponse.status === "fulfilled") {
      const data = prodResponse.value;
      products.value = Array.isArray(data) ? data : data?.data || [];
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

const addItem = (product) => {
  const existing = form.value.items.find((i) => i.product_id === product.id);
  if (existing) {
    existing.quantity++;
  } else {
    form.value.items.push({
      product_id: product.id,
      name: product.name,
      quantity: 1,
      buy_price: parseFloat(product.purchase_price || product.price || 0),
      notes: "",
    });
  }
};

const removeItem = (index) => {
  form.value.items.splice(index, 1);
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
      quantity: item.quantity,
      buy_price: item.buy_price,
    })),
  };
  activeTab.value = "create";
};

const cancelEdit = () => {
  editingPurchaseId.value = null;
  form.value = { supplier_id: "", paid_amount: 0, items: [] };
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

const filteredProducts = computed(() => {
  if (!searchProductQuery.value) return products.value.slice(0, 5);
  return products.value
    .filter(
      (p) =>
        p.name.toLowerCase().includes(searchProductQuery.value.toLowerCase()) ||
        p.sku?.toLowerCase().includes(searchProductQuery.value.toLowerCase()),
    )
    .slice(0, 10);
});

onMounted(loadData);
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
            @click="
              editingPurchaseId = null;
              form = { supplier_id: '', paid_amount: 0, items: [] };
              activeTab = 'create';
            "
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
        style="max-height: 600px"
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
      <div class="col-xl-5">
        <div
          class="card border-0 shadow-sm rounded-4 d-flex flex-column h-100 overflow-hidden"
        >
          <div class="p-4 bg-light border-bottom">
            <h5 class="fw-bold mb-3 d-flex align-items-center">
              <i class="bi bi-search text-primary me-2"></i>Подбор товаров
            </h5>
            <div class="search-box">
              <div class="input-group">
                <input
                  v-model="searchProductQuery"
                  type="text"
                  class="form-control rounded-start-pill border-0 shadow-none ps-4 py-2"
                  placeholder="Поиск товара..."
                />
                <button
                  class="btn btn-primary rounded-end-pill px-3"
                  @click="openAddProductModal"
                  title="Создать новый товар"
                >
                  <i class="bi bi-plus-lg"></i>
                </button>
              </div>
            </div>
          </div>

          <div class="product-selection-list p-3 flex-grow-1 overflow-auto">
            <div
              v-for="p in filteredProducts"
              :key="p.id"
              class="product-select-card p-3 mb-2 rounded-4"
              @click="addItem(p)"
            >
              <div class="row g-0 align-items-center">
                <div class="col-auto">
                  <img
                    :src="p.image_url"
                    class="rounded-3 shadow-sm"
                    style="width: 50px; height: 50px; object-fit: cover"
                  />
                </div>
                <div class="col ps-3">
                  <div class="fw-bold text-dark small line-clamp-1">
                    {{ p.name }}
                  </div>
                  <div class="d-flex justify-content-between">
                    <span class="text-muted" style="font-size: 0.7rem"
                      >SKU: {{ p.sku || "N/A" }}</span
                    >
                    <span
                      class="badge"
                      :class="
                        p.stock_quantity < 5
                          ? 'bg-danger-subtle text-danger'
                          : 'bg-success-subtle text-success'
                      "
                      style="font-size: 0.65rem"
                      >Доступно: {{ p.stock_quantity }}</span
                    >
                  </div>
                </div>
                <div class="col-auto ps-2 text-primary">
                  <i class="bi bi-plus-circle-fill fs-5"></i>
                </div>
              </div>
            </div>
            <div
              v-if="products.length && !filteredProducts.length"
              class="text-center py-5 text-muted small"
            >
              Товары не найдены
            </div>
          </div>
        </div>
      </div>

      <div class="col-xl-7">
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
                v-if="editingPurchaseId"
                class="btn btn-sm btn-outline-secondary rounded-pill"
                @click="cancelEdit"
              >
                Отмена
              </button>
              <button
                class="btn btn-sm btn-outline-danger border-0 rounded-pill"
                @click="form.items = []"
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
                  <th class="ps-4">Наименование</th>
                  <th width="90" class="text-center">Кол-во</th>
                  <th width="140">Цена зак.</th>
                  <th width="140" class="text-end">Итого</th>
                  <th width="60"></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(item, index) in form.items"
                  :key="item.product_id"
                  class="receipt-item-row"
                >
                  <td class="ps-4">
                    <div class="fw-bold text-dark small">{{ item.name }}</div>
                  </td>
                  <td>
                    <input
                      v-model.number="item.quantity"
                      type="number"
                      class="form-control form-control-sm border-0 bg-light rounded-pill text-center font-monospace"
                      min="1"
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
                  <td class="text-end fw-bold text-dark small">
                    {{
                      formatPrice(item.quantity * item.buy_price).replace(
                        " сом",
                        "",
                      )
                    }}
                  </td>
                  <td class="text-center">
                    <button
                      class="btn btn-sm btn-link text-danger p-1"
                      @click="removeItem(index)"
                    >
                      <i class="bi bi-x-circle"></i>
                    </button>
                  </td>
                </tr>
                <tr v-if="form.items.length === 0">
                  <td
                    colspan="5"
                    class="text-center py-5 text-muted small opacity-75"
                  >
                    <i class="bi bi-cart-plus d-block fs-1 mb-2"></i>
                    Добавьте товары из левого списка
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
      @close="showAddProductModal = false"
      @submit="handleQuickAddProduct"
    >
      <div class="p-1">
        <div class="mb-3">
          <label class="form-label fw-bold small">Название товара *</label>
          <input
            v-model="newProductForm.name"
            type="text"
            class="form-control rounded-3"
            :class="{ 'is-invalid': productErrors.name }"
            placeholder="Напр: Молоток отбойный"
            required
          />
          <div v-if="productErrors.name" class="invalid-feedback">
            {{ productErrors.name[0] }}
          </div>
        </div>

        <div class="row g-3 mb-3">
          <div class="col-md-6">
            <label class="form-label fw-bold small">Артикул (SKU) *</label>
            <div class="input-group">
              <input
                v-model="newProductForm.sku"
                type="text"
                class="form-control rounded-start-3"
                :class="{ 'is-invalid': productErrors.sku }"
                placeholder="ART-12345"
                required
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
          <div class="col-md-6">
            <label class="form-label fw-bold small">Категория *</label>
            <div class="input-group">
              <select
                v-model="newProductForm.category_id"
                class="form-select rounded-start-3"
                :class="{ 'is-invalid': productErrors.category_id }"
                required
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
            @click="showAddProductModal = false"
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
  </div>
</template>

<style scoped>
.header-card {
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

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

.product-selection-list,
.receipt-builder {
  flex: 1;
  overflow-y: auto !important;
  overflow-x: hidden;
  scrollbar-width: thin;
}

.product-selection-list::-webkit-scrollbar,
.receipt-builder::-webkit-scrollbar {
  width: 6px;
}
.product-selection-list::-webkit-scrollbar-thumb,
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

.search-box .form-control {
  background: white;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
}

.product-select-card {
  background: white;
  border: 1px solid #f1f5f9;
  cursor: pointer;
  transition: all 0.2s;
}

.product-select-card:hover {
  transform: translateX(5px);
  border-color: #38bdf8;
  background: #f1f5f9;
}

.receipt-builder {
  scrollbar-width: thin;
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

.line-clamp-1 {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
