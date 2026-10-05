<script setup>
const {
  getSuppliers,
  getPurchases,
  getReturnableItems,
  getSupplierReturns,
  createSupplierReturn,
  deleteSupplierReturn,
  confirmSupplierReturn,
  cancelSupplierReturn,
} = useAccounting();
const { getProducts: getProductsForBarcode } = useProducts();
const uiStore = useUiStore();
const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();

definePageMeta({
  layout: "admin",
  middleware: "permission",
  permission: "supplier_returns.manage",
});

const STATUS_LABELS = {
  draft: { text: "Черновик", class: "bg-secondary-subtle text-secondary" },
  confirmed: { text: "Проведён", class: "bg-success-subtle text-success" },
  cancelled: { text: "Отменён", class: "bg-danger-subtle text-danger" },
};

const activeTab = ref("list");
const loading = ref(false);
const suppliers = ref([]);
const returns = ref([]);

const today = new Date().toLocaleDateString("en-CA");
const filters = ref({
  supplier_id: "",
  status: "",
  date_from: "",
  date_to: "",
  search: "",
  page: 1,
  per_page: 15,
});

const returnData = ref({ data: [], current_page: 1, last_page: 1, total: 0 });

let debounceTimer = null;
watch(
  () => filters.value.search,
  () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      filters.value.page = 1;
      loadReturns();
    }, 500);
  },
);

const loadReturns = async () => {
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
    const data = await getSupplierReturns(params);
    if (data && Array.isArray(data.data)) {
      returnData.value = data;
      returns.value = data.data;
    } else {
      returns.value = Array.isArray(data) ? data : [];
      returnData.value = {
        data: returns.value,
        current_page: 1,
        last_page: 1,
        total: returns.value.length,
      };
    }
  } catch (error) {
    uiStore.error("Ошибка при загрузке возвратов поставщику");
  } finally {
    loading.value = false;
  }
};

const changePage = (page) => {
  if (page < 1 || page > returnData.value.last_page) return;
  filters.value.page = page;
  loadReturns();
};

const loadSuppliers = async () => {
  const data = await getSuppliers();
  suppliers.value = Array.isArray(data) ? data : data?.data || [];
};

// --- Новый возврат ---

const form = ref({
  supplier_id: "",
  reason: "",
  notes: "",
  items: [], // { purchase_item_id, purchase_id, product_id, name, sku, unit, quantity_purchased, returned_before, available, price, is_package, quantity }
});

// Ссылки на инпуты "Вернуть" по индексу строки — чтобы после сканирования
// штрих-кода сразу поставить туда фокус (как на странице закупок)
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

const supplierPurchases = ref([]);
const loadingReturnableItems = ref(false);

const loadSupplierPurchases = async () => {
  supplierPurchases.value = [];
  if (!form.value.supplier_id) return;
  const data = await getPurchases({ supplier_id: form.value.supplier_id, per_page: 100 });
  supplierPurchases.value = Array.isArray(data) ? data : data?.data || [];
};

watch(
  () => form.value.supplier_id,
  () => {
    loadSupplierPurchases();
  },
);

// Закупки, чьи позиции уже подгружены в форму — не дёргаем API повторно
// (используется и кнопками, и поиском по штрих-коду)
const loadedPurchaseIds = computed(
  () => new Set(form.value.items.map((i) => i.purchase_id)),
);

const addPurchaseItems = async (purchaseId) => {
  loadingReturnableItems.value = true;
  try {
    const items = await getReturnableItems(purchaseId);
    (Array.isArray(items) ? items : []).forEach((item) => {
      if (item.available <= 0) return;
      if (form.value.items.some((i) => i.purchase_item_id === item.id)) return;
      form.value.items.push({
        purchase_item_id: item.id,
        purchase_id: item.purchase_id,
        product_id: item.product_id,
        name: item.product?.name || `Товар #${item.product_id}`,
        sku: item.product?.sku || "",
        unit: item.is_package
          ? item.product?.package_unit || "уп"
          : item.product?.unit || "шт",
        quantity_purchased: item.quantity,
        returned_before: item.returned_quantity,
        available: item.available,
        price: item.buy_price,
        quantity: 0,
      });
    });
  } catch (error) {
    uiStore.error("Не удалось загрузить товары этой закупки");
  } finally {
    loadingReturnableItems.value = false;
  }
};

// --- Сканер штрих-кода ---
// Как на странице закупок: сканер шлёт символы очень быстро и завершает
// Enter. Если товар уже в текущем списке — просто увеличиваем "Вернуть" на
// строке; если ещё нет — ищем его среди ещё не подгруженных закупок этого
// поставщика и подгружаем нужную закупку целиком.
const barcodeBuffer = ref("");
const lastBarcodeKeyTime = ref(0);
const isBarcodeLookup = ref(false);

const handleGlobalKeydown = (e) => {
  if (
    activeTab.value !== "create" ||
    showConfirmSummary.value ||
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

const addItemByBarcode = async (code) => {
  if (isBarcodeLookup.value) return;
  if (!form.value.supplier_id) {
    uiStore.error("Сначала выберите поставщика");
    return;
  }

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
      uiStore.info(`Товар со штрих-кодом «${code}» не найден`);
      return;
    }

    let index = form.value.items.findIndex((i) => i.product_id === match.id);

    if (index === -1) {
      // Ищем товар среди закупок поставщика, которые ещё не подгружены в форму
      for (const purchase of supplierPurchases.value) {
        if (loadedPurchaseIds.value.has(purchase.id)) continue;
        await addPurchaseItems(purchase.id);
        index = form.value.items.findIndex((i) => i.product_id === match.id);
        if (index !== -1) break;
      }
    }

    if (index === -1) {
      uiStore.info(
        `«${match.name}» не найден среди закупок выбранного поставщика или уже полностью возвращён`,
      );
      return;
    }

    const item = form.value.items[index];
    item.quantity = Math.min((parseFloat(item.quantity) || 0) + 1, item.available);
    focusQuantityInput(index);
  } catch (e) {
    uiStore.error("Не удалось найти товар по штрих-коду");
  } finally {
    isBarcodeLookup.value = false;
  }
};

const removeItem = (index) => {
  form.value.items.splice(index, 1);
};

const clampQuantity = (item) => {
  const qty = parseFloat(item.quantity) || 0;
  if (qty < 0) item.quantity = 0;
  else if (qty > item.available) item.quantity = item.available;
};

const totalAmount = computed(() =>
  form.value.items.reduce(
    (sum, item) => sum + (parseFloat(item.quantity) || 0) * item.price,
    0,
  ),
);

const activeItems = computed(() =>
  form.value.items.filter((i) => (parseFloat(i.quantity) || 0) > 0),
);

const resetForm = () => {
  form.value = { supplier_id: "", reason: "", notes: "", items: [] };
  supplierPurchases.value = [];
};

const handleSubmit = async () => {
  if (!form.value.supplier_id) {
    uiStore.error("Выберите поставщика");
    return;
  }
  if (activeItems.value.length === 0) {
    uiStore.error("Укажите количество возврата хотя бы для одного товара");
    return;
  }
  for (const item of activeItems.value) {
    if (item.quantity > item.available) {
      uiStore.error(`«${item.name}»: нельзя вернуть больше доступного (${item.available})`);
      return;
    }
  }

  try {
    await createSupplierReturn({
      supplier_id: form.value.supplier_id,
      reason: form.value.reason || null,
      notes: form.value.notes || null,
      items: activeItems.value.map((i) => ({
        purchase_item_id: i.purchase_item_id,
        quantity: i.quantity,
      })),
    });
    uiStore.success("Черновик возврата создан");
    resetForm();
    activeTab.value = "list";
    await loadReturns();
  } catch (error) {
    uiStore.error(error.data?.message || "Ошибка при создании возврата");
  }
};

// --- Действия над возвратом ---

const showConfirmSummary = ref(false);
const returnToConfirm = ref(null);

const openConfirmSummary = (supplierReturn) => {
  returnToConfirm.value = supplierReturn;
  showConfirmSummary.value = true;
};

const doConfirm = async () => {
  if (!returnToConfirm.value) return;
  try {
    await confirmSupplierReturn(returnToConfirm.value.id);
    uiStore.success("Возврат проведён, остатки и долг поставщику обновлены");
    showConfirmSummary.value = false;
    returnToConfirm.value = null;
    await loadReturns();
  } catch (error) {
    uiStore.error(error.data?.message || "Не удалось провести возврат");
  }
};

const handleCancel = async (supplierReturn) => {
  const confirmed = await uiStore.showConfirm(
    "Отменить возврат?",
    "Остатки товара и долг поставщику будут восстановлены до состояния перед проведением.",
  );
  if (!confirmed) return;
  try {
    await cancelSupplierReturn(supplierReturn.id);
    uiStore.success("Возврат отменён");
    await loadReturns();
  } catch (error) {
    uiStore.error(error.data?.message || "Не удалось отменить возврат");
  }
};

const handleDelete = async (supplierReturn) => {
  const confirmed = await uiStore.showConfirm(
    "Удалить черновик возврата?",
    "Это действие необратимо.",
  );
  if (!confirmed) return;
  try {
    await deleteSupplierReturn(supplierReturn.id);
    uiStore.success("Черновик удалён");
    await loadReturns();
  } catch (error) {
    uiStore.error(error.data?.message || "Ошибка при удалении");
  }
};

const formatPrice = (price) => (parseFloat(price) || 0).toLocaleString("ru-RU") + " сом";

onMounted(async () => {
  await Promise.all([loadReturns(), loadSuppliers()]);

  // Переход из закупки кнопкой "Вернуть поставщику" — сразу открываем
  // вкладку создания и подгружаем позиции этой закупки
  if (route.query.purchase_id) {
    activeTab.value = "create";
    if (route.query.supplier_id) {
      form.value.supplier_id = Number(route.query.supplier_id);
      await loadSupplierPurchases();
    }
    await addPurchaseItems(Number(route.query.purchase_id));
    router.replace({ query: {} });
  }

  if (import.meta.client) {
    window.addEventListener("keydown", handleGlobalKeydown);
  }
});

onUnmounted(() => {
  if (import.meta.client) {
    window.removeEventListener("keydown", handleGlobalKeydown);
  }
});
</script>

<template>
  <div class="supplier-returns-page p-4">
    <div class="header-card mb-4 p-4 rounded-4 shadow-sm text-white">
      <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
        <div>
          <h1 class="h3 mb-1 fw-bold">Возврат товара поставщику</h1>
          <p class="mb-0 text-white-50">Возврат ранее закупленного товара поставщику</p>
        </div>
        <div class="tab-switcher p-1 rounded-pill bg-white bg-opacity-10 border border-white border-opacity-10 d-flex">
          <button class="btn-tab" :class="{ active: activeTab === 'list' }" @click="activeTab = 'list'">
            <i class="bi bi-clock-history me-2"></i>История
          </button>
          <button class="btn-tab" :class="{ active: activeTab === 'create' }" @click="activeTab = 'create'">
            <i class="bi bi-arrow-return-left me-2"></i>Новый возврат
          </button>
        </div>
      </div>
    </div>

    <div v-if="activeTab === 'list'" class="animate-fade-in">
      <div class="card border-0 shadow-sm rounded-4 p-4 mb-4 bg-white">
        <div class="row g-3 align-items-end">
          <div class="col-md-2">
            <label class="small fw-bold text-muted text-uppercase mb-2 d-block">С даты</label>
            <input v-model="filters.date_from" type="date" class="form-control border-0 bg-light rounded-pill px-3 py-2" @change="loadReturns" />
          </div>
          <div class="col-md-2">
            <label class="small fw-bold text-muted text-uppercase mb-2 d-block">По дату</label>
            <input v-model="filters.date_to" type="date" class="form-control border-0 bg-light rounded-pill px-3 py-2" @change="loadReturns" />
          </div>
          <div class="col-md-3">
            <label class="small fw-bold text-muted text-uppercase mb-2 d-block">Поставщик</label>
            <select v-model="filters.supplier_id" class="form-select border-0 bg-light rounded-pill px-3 py-2" @change="loadReturns">
              <option value="">Все</option>
              <option v-for="s in suppliers" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </div>
          <div class="col-md-2">
            <label class="small fw-bold text-muted text-uppercase mb-2 d-block">Статус</label>
            <select v-model="filters.status" class="form-select border-0 bg-light rounded-pill px-3 py-2" @change="loadReturns">
              <option value="">Все</option>
              <option value="draft">Черновик</option>
              <option value="confirmed">Проведён</option>
              <option value="cancelled">Отменён</option>
            </select>
          </div>
          <div class="col-md-2">
            <label class="small fw-bold text-muted text-uppercase mb-2 d-block">Поиск</label>
            <input v-model="filters.search" type="text" placeholder="Причина, коммент..." class="form-control border-0 bg-light rounded-pill px-3 py-2" />
          </div>
          <div class="col-md-1 text-end">
            <button class="btn btn-refresh-round shadow-sm" @click="loadReturns" title="Обновить">
              <i class="bi bi-arrow-clockwise" :class="{ spin: loading }"></i>
            </button>
          </div>
        </div>
      </div>

      <div class="card border-0 shadow-sm rounded-4 overflow-hidden">
        <div class="table-responsive-cards">
          <table class="table table-hover align-middle mb-0 custom-table">
            <thead class="d-none d-lg-table-header-group">
              <tr>
                <th class="ps-4">№ / Дата</th>
                <th>Поставщик</th>
                <th>Товаров</th>
                <th>Сумма</th>
                <th>Статус</th>
                <th class="text-end pe-4">Действия</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="6" class="text-center py-5">
                  <div class="spinner-border text-primary" role="status"></div>
                </td>
              </tr>
              <tr v-if="!loading && returns.length === 0">
                <td colspan="6" class="text-center py-5 text-muted small">Возвратов пока нет</td>
              </tr>
              <tr v-for="r in returns" :key="r.id">
                <td class="ps-4" data-label="Возврат">
                  <div class="fw-bold text-dark">#{{ r.id }}</div>
                  <div class="text-muted small">{{ new Date(r.return_date || r.created_at).toLocaleDateString() }}</div>
                </td>
                <td data-label="Поставщик">
                  <span class="small fw-bold">{{ r.supplier?.name || "—" }}</span>
                </td>
                <td data-label="Товары">
                  <span class="badge bg-light text-primary border rounded-pill">{{ r.items?.length || 0 }} поз.</span>
                </td>
                <td data-label="Сумма">
                  <span class="fw-bold text-dark">{{ formatPrice(r.total_amount) }}</span>
                </td>
                <td data-label="Статус">
                  <span class="badge rounded-pill px-3 py-2" :class="STATUS_LABELS[r.status]?.class">
                    {{ STATUS_LABELS[r.status]?.text || r.status }}
                  </span>
                </td>
                <td class="text-end pe-4">
                  <div class="d-flex justify-content-end gap-2">
                    <button
                      v-if="r.status === 'draft'"
                      class="btn btn-sm btn-light rounded-pill border shadow-sm"
                      title="Провести возврат"
                      @click="openConfirmSummary(r)"
                    >
                      <i class="bi bi-check2-circle text-success"></i>
                    </button>
                    <button
                      v-if="r.status === 'confirmed'"
                      class="btn btn-sm btn-light rounded-pill border shadow-sm"
                      title="Отменить возврат"
                      @click="handleCancel(r)"
                    >
                      <i class="bi bi-arrow-counterclockwise text-warning"></i>
                    </button>
                    <button
                      v-if="r.status === 'draft' && authStore.hasPermission('supplier_returns.delete')"
                      class="btn btn-sm btn-light rounded-pill border shadow-sm"
                      title="Удалить"
                      @click="handleDelete(r)"
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

      <div v-if="returnData.last_page > 1" class="d-flex justify-content-between align-items-center mt-4 px-2">
        <div class="small fw-bold text-muted">
          Всего записей: <span class="text-dark">{{ returnData.total }}</span>
        </div>
        <nav>
          <ul class="pagination-premium mb-0">
            <li :class="{ disabled: filters.page <= 1 }">
              <button @click="changePage(filters.page - 1)" :disabled="filters.page <= 1"><i class="bi bi-chevron-left"></i></button>
            </li>
            <li v-for="page in returnData.last_page" :key="page" :class="{ active: page === filters.page }">
              <button @click="changePage(page)">{{ page }}</button>
            </li>
            <li :class="{ disabled: filters.page >= returnData.last_page }">
              <button @click="changePage(filters.page + 1)" :disabled="filters.page >= returnData.last_page"><i class="bi bi-chevron-right"></i></button>
            </li>
          </ul>
        </nav>
      </div>
    </div>

    <div v-if="activeTab === 'create'" class="row g-4 animate-slide-up h-view-content">
      <div class="col-12">
        <div class="card border-0 shadow-sm rounded-4 overflow-hidden">
          <div class="p-4 border-bottom bg-white flex-shrink-0">
            <div class="row g-3">
              <div class="col-md-6">
                <label class="form-label fw-bold small text-secondary">Поставщик</label>
                <select v-model="form.supplier_id" class="form-select border-0 bg-light rounded-3 shadow-sm px-3 py-2">
                  <option value="">Выберите поставщика...</option>
                  <option v-for="s in suppliers" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select>
              </div>
              <div class="col-md-6">
                <label class="form-label fw-bold small text-secondary">Причина возврата</label>
                <input v-model="form.reason" type="text" class="form-control border-0 bg-light rounded-3 shadow-sm px-3 py-2" placeholder="Брак, пересорт, излишек..." />
              </div>
            </div>

            <div v-if="form.supplier_id" class="mt-3">
              <label class="form-label fw-bold small text-secondary d-block mb-2">Добавить товары из закупки</label>
              <div v-if="supplierPurchases.length === 0" class="text-muted small">
                У этого поставщика пока нет закупок.
              </div>
              <div class="d-flex flex-wrap gap-2">
                <button
                  v-for="p in supplierPurchases"
                  :key="p.id"
                  class="btn btn-sm btn-outline-primary rounded-pill"
                  :disabled="loadingReturnableItems"
                  @click="addPurchaseItems(p.id)"
                >
                  <i class="bi bi-plus-lg me-1"></i>Закупка #{{ p.id }} от {{ new Date(p.created_at).toLocaleDateString() }}
                </button>
              </div>
            </div>
          </div>

          <div class="p-0 flex-grow-1 overflow-auto">
            <table class="table mb-0 align-middle">
              <thead class="bg-light">
                <tr style="font-size: 0.7rem; color: #64748b; text-transform: uppercase">
                  <th class="ps-4">Товар</th>
                  <th class="text-center">Закуплено</th>
                  <th class="text-center">Возвращено ранее</th>
                  <th class="text-center">Доступно</th>
                  <th>Цена</th>
                  <th width="140" class="text-center">Вернуть</th>
                  <th width="140" class="text-end">Сумма</th>
                  <th width="50"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, index) in form.items" :key="item.purchase_item_id">
                  <td class="ps-4">
                    <div class="fw-bold text-dark small">{{ item.name }}</div>
                    <div class="text-muted" style="font-size: 11px">{{ item.sku }}</div>
                  </td>
                  <td class="text-center small">{{ item.quantity_purchased }} {{ item.unit }}</td>
                  <td class="text-center small text-muted">{{ item.returned_before }} {{ item.unit }}</td>
                  <td class="text-center small fw-bold text-primary">{{ item.available }} {{ item.unit }}</td>
                  <td class="small">{{ formatPrice(item.price) }}</td>
                  <td>
                    <input
                      :ref="(el) => setQtyInputRef(index, el)"
                      v-model.number="item.quantity"
                      type="number"
                      min="0"
                      :max="item.available"
                      step="0.001"
                      class="form-control form-control-sm border-0 bg-light rounded-pill text-center"
                      :class="{ 'border border-danger': item.quantity > item.available }"
                      @input="clampQuantity(item)"
                    />
                  </td>
                  <td class="text-end fw-bold text-dark small">
                    {{ formatPrice((item.quantity || 0) * item.price) }}
                  </td>
                  <td class="text-center">
                    <button class="btn btn-sm btn-link text-danger p-1" @click="removeItem(index)">
                      <i class="bi bi-x-circle"></i>
                    </button>
                  </td>
                </tr>
                <tr v-if="form.items.length === 0">
                  <td colspan="8" class="text-center py-5 text-muted small opacity-75">
                    <i class="bi bi-arrow-return-left d-block fs-1 mb-2"></i>
                    Выберите поставщика и добавьте товары из закупки
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="p-4 border-top bg-white mt-auto flex-shrink-0">
            <div class="mb-3">
              <label class="form-label fw-bold small text-secondary">Комментарий</label>
              <textarea v-model="form.notes" class="form-control border-0 bg-light rounded-3" rows="2"></textarea>
            </div>
            <div class="row align-items-center">
              <div class="col">
                <div class="text-muted small fw-bold">СУММА ВОЗВРАТА:</div>
                <h2 class="fw-bold text-primary mb-0">{{ formatPrice(totalAmount) }}</h2>
              </div>
              <div class="col-auto">
                <button
                  class="btn btn-receive-large shadow-lg"
                  :disabled="activeItems.length === 0 || !form.supplier_id"
                  @click="handleSubmit"
                >
                  <i class="bi bi-check2-circle-fill me-2"></i>Создать черновик возврата
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <UiBaseModal
      :show="showConfirmSummary"
      title="Подтверждение возврата"
      @close="showConfirmSummary = false"
    >
      <div v-if="returnToConfirm" class="p-1">
        <p>Вы действительно хотите провести возврат?</p>
        <ul class="list-unstyled small">
          <li>Товаров: <strong>{{ returnToConfirm.items?.length || 0 }}</strong></li>
          <li>Сумма возврата: <strong>{{ formatPrice(returnToConfirm.total_amount) }}</strong></li>
        </ul>
        <div class="alert alert-warning small mb-0">
          После проведения складские остатки и долг поставщику будут изменены. Отменить можно будет отдельным действием.
        </div>
      </div>
      <template #footer>
        <div class="d-flex justify-content-end gap-2 w-100">
          <button type="button" class="btn btn-light px-4 rounded-pill" @click="showConfirmSummary = false">Отмена</button>
          <button class="btn btn-success px-4 rounded-pill fw-bold shadow-sm" @click="doConfirm">
            <i class="bi bi-check2-circle me-2"></i>Провести возврат
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

.animate-fade-in {
  animation: fadeIn 0.4s ease-out;
}
.animate-slide-up {
  animation: slideUp 0.4s ease-out;
}

/* Прижимает нижний блок (комментарий/сумма/кнопка) к низу карточки —
   карточка растягивается на доступную высоту, таблица прокручивается
   внутри, футер всегда виден снизу (как на странице закупок). */
@media (min-width: 1200px) {
  .h-view-content {
    height: calc(100vh - 260px);
    min-height: 420px;
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

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes slideUp {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
</style>
