<script setup>
definePageMeta({
  layout: "admin",
  middleware: "staff",
});

const uiStore = useUiStore();
const {
  getOrders,
  updateOrder,
  downloadOrderInvoice,
  downloadOrderThermalReceipt,
  returnOrderItems,
} = useOrders();
const { printReceipt, initPrinter } = usePrinter();

const orders = ref({
  data: [],
  current_page: 1,
  last_page: 1,
  total: 0,
  per_page: 15,
});

const isLoading = ref(false);
const isUpdating = ref(false);
const selectedOrder = ref(null);
const isModalOpen = ref(false);
const showAdvancedFilters = ref(false);

// Высота таблицы — как у списка товаров/категорий: подгоняется под
// остаток экрана от её верхней границы, а не жёстко зашитой константой
const tableWrap = ref(null);
const tableHeight = ref(null);
const updateTableHeight = () => {
  const el = tableWrap.value;
  if (!el) return;
  const top = el.getBoundingClientRect().top + (window.scrollY || 0);
  // 70px — запас под панель пагинации под таблицей (когда она показана)
  tableHeight.value = Math.max(240, window.innerHeight - top - 70);
};
const tableHeightStyle = computed(() =>
  tableHeight.value ? `${tableHeight.value}px` : "calc(100vh - 350px)",
);


const isOpenReturnModal = ref(false);
const returnItemsSelection = ref([]);

const openPartialReturnModal = () => {
  if (!selectedOrder.value || !selectedOrder.value.items) return;

  
  returnItemsSelection.value = selectedOrder.value.items.map((item) => ({
    ...item,
    return_qty: 0,
    
    refunded_quantity: item.refunded_quantity || 0,
  }));
  isOpenReturnModal.value = true;
};

const submitPartialReturn = async () => {
  const itemsToReturn = returnItemsSelection.value
    .filter((item) => item.return_qty > 0)
    .map((item) => ({
      id: item.id,
      quantity: item.return_qty,
    }));

  if (itemsToReturn.length === 0) {
    uiStore.error("Выберите хотя бы один товар для возврата");
    return;
  }

  try {
    isUpdating.value = true;
    await returnOrderItems(selectedOrder.value.id, itemsToReturn);

    uiStore.success("Товары успешно возвращены");
    isOpenReturnModal.value = false;

    
    
    closeOrderModal();
    fetchOrders();
  } catch (error) {
    console.error(error);
    uiStore.error("Ошибка при возврате товаров");
  } finally {
    isUpdating.value = false;
  }
};

const today = new Date().toLocaleDateString("en-CA");
const filters = ref({
  status: "",
  payment_status: "",
  payment_method: "",
  search: "",
  date_from: today,
  date_to: today,
  min_total: "",
  max_total: "",
  user_id: "",
  per_page: 15,
  page: 1,
  source: "online",
});

let debounceTimer = null;
watch(
  () => filters.value.search,
  () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      filters.value.page = 1;
      fetchOrders();
    }, 500);
  }
);


watch(
  () => selectedOrder.value?.payment_status,
  (newStatus) => {
    if (
      newStatus === "paid" &&
      selectedOrder.value &&
      !selectedOrder.value.payment_method
    ) {
      selectedOrder.value.payment_method = "cash";
    }
  }
);


const formatPrice = (price) => {
  if (price === null || price === undefined) return "0 сом";
  return (
    parseFloat(price).toLocaleString("ru-RU", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }) + " сом"
  );
};


const visiblePages = computed(() => {
  const total = orders.value.last_page || 0;
  const current = orders.value.current_page || 1;
  const delta = 2;
  const range = [];
  const rangeWithDots = [];
  let l;

  range.push(1);
  for (let i = current - delta; i <= current + delta; i++) {
    if (i < total && i > 1) {
      range.push(i);
    }
  }
  if (total > 1) range.push(total);

  for (let i of range) {
    if (l) {
      if (i - l === 2) {
        rangeWithDots.push(l + 1);
      } else if (i - l !== 1) {
        rangeWithDots.push("...");
      }
    }
    rangeWithDots.push(i);
    l = i;
  }

  return rangeWithDots;
});

const fetchOrders = async () => {
  isLoading.value = true;
  try {
    const data = await getOrders({
      ...filters.value,
      status: filters.value.status || undefined,
      payment_status: filters.value.payment_status || undefined,
      payment_method: filters.value.payment_method || undefined,
      search: filters.value.search || undefined,
      date_from: filters.value.date_from || undefined,
      date_to: filters.value.date_to || undefined,
      min_total: filters.value.min_total || undefined,
      max_total: filters.value.max_total || undefined,
      user_id: filters.value.user_id || undefined,
      per_page: filters.value.per_page || undefined,
      page: filters.value.page,
    });

    orders.value = data;
  } catch (error) {
    console.error(error);
  } finally {
    isLoading.value = false;
    // появление/исчезновение панели пагинации меняет доступную высоту
    await nextTick();
    updateTableHeight();
  }
};

const changePage = (page) => {
  if (page < 1 || page > orders.value.last_page || page === "...") return;
  filters.value.page = page;
  fetchOrders();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

const openOrderModal = (order) => {
  selectedOrder.value = JSON.parse(JSON.stringify(order)); 
  isModalOpen.value = true;
};

const closeOrderModal = () => {
  isModalOpen.value = false;
  selectedOrder.value = null;
};

const updateOrderStatus = async () => {
  isUpdating.value = true;
  try {
    await updateOrder(selectedOrder.value.id, {
      status: selectedOrder.value.status,
      payment_status: selectedOrder.value.payment_status,
      payment_method: selectedOrder.value.payment_method,
    });
    uiStore.success("Статус заказа успешно обновлен");
    closeOrderModal();
    fetchOrders();
  } catch (error) {
    console.error(error);
    uiStore.error("Ошибка при обновлении статуса");
  } finally {
    isUpdating.value = false;
  }
};

const statusLabelClass = (status) => {
  switch (status) {
    case "pending":
      return "badge-pending";
    case "processing":
      return "badge-processing";
    case "shipped":
      return "badge-shipped";
    case "delivered":
      return "badge-delivered";
    case "cancelled":
      return "badge-cancelled";
    case "refunded":
      return "badge-refunded";
    default:
      return "badge-light";
  }
};

const getStatusText = (status) => {
  const texts = {
    pending: "Ожидает",
    processing: "В обработке",
    shipped: "Отправлен",
    delivered: "Доставлен",
    cancelled: "Отменен",
    refunded: "Возврат",
  };
  return texts[status] || status;
};

const getPaymentStatusText = (status) => {
  const texts = {
    paid: "Оплачено",
    pending: "Ожидает",
    failed: "Ошибка",
  };
  return texts[status] || status;
};

// Быстрая смена статуса/оплаты прямо в таблице, без открытия модалки
const STATUS_QUICK_OPTIONS = [
  { value: "pending", label: "Ожидает" },
  { value: "processing", label: "В обработке" },
  { value: "shipped", label: "Отправлен" },
  { value: "delivered", label: "Доставлен" },
  { value: "cancelled", label: "Отменен" },
  { value: "refunded", label: "Возврат" },
];

const PAYMENT_STATUS_QUICK_OPTIONS = [
  { value: "pending", label: "Ожидает" },
  { value: "paid", label: "Оплачено" },
  { value: "failed", label: "Ошибка" },
];

const quickUpdatingId = ref(null);

const quickUpdateOrder = async (order, payload) => {
  if (quickUpdatingId.value) return;
  quickUpdatingId.value = order.id;
  try {
    await updateOrder(order.id, {
      status: payload.status ?? order.status,
      payment_status: payload.payment_status ?? order.payment_status,
      payment_method: payload.payment_method ?? order.payment_method,
    });
    Object.assign(order, payload);
    uiStore.success("Статус обновлён");
  } catch (error) {
    console.error(error);
    uiStore.error(error.data?.message || "Ошибка при обновлении статуса");
  } finally {
    quickUpdatingId.value = null;
  }
};

const quickSetStatus = (order, status) => {
  if (status === order.status) return;
  quickUpdateOrder(order, { status });
};

const quickSetPaymentStatus = (order, payment_status) => {
  if (payment_status === order.payment_status) return;
  const payload = { payment_status };
  if (payment_status === "paid" && !order.payment_method) {
    payload.payment_method = "cash";
  }
  quickUpdateOrder(order, payload);
};

const getPaymentMethodText = (method) => {
  const texts = {
    cash: "Оплата при получении (Нал/Безнал)",
    transfer: "Перевод/MBank",
    card: "Картой",
    mbank: "MBank (устар.)",
  };
  return texts[method] || method || "Не указан";
};

const isOverdue = (dueDate) => {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
};

const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Live-обновление списка + автопечать чека при поступлении нового заказа.
// Раньше список грузился только при монтировании/смене фильтров — событие
// NewOrderPlaced ловил лишь layouts/admin.vue (тост), сама таблица не
// обновлялась и ничего не печаталось. stopListening снимает ТОЛЬКО этот
// обработчик, не трогая канал целиком — он используется и другими
// подписчиками (тост в layout, своя подписка в кассе).
const { $echo } = useNuxtApp();
const onNewOrderPlaced = (e) => {
  fetchOrders();
  printReceipt(e.id, "thermal");
};

// Изменение статуса заказа / статуса оплаты / дат доставки на УЖЕ
// существующем заказе (оплата картой, ручная смена статуса, погашение
// долга в кассе и т.д.) — тоже событие OrderStatusUpdated, но чек тут
// печатать не нужно, только обновить список.
const onOrderStatusUpdated = () => {
  fetchOrders();
};

onMounted(() => {
  fetchOrders();
  if (import.meta.client) {
    window.addEventListener("resize", updateTableHeight);
    initPrinter();
    if ($echo) {
      $echo
        .private("admin.orders")
        .listen(".NewOrderPlaced", onNewOrderPlaced)
        .listen(".OrderStatusUpdated", onOrderStatusUpdated);
    }
  }
});

onUnmounted(() => {
  if (import.meta.client) {
    window.removeEventListener("resize", updateTableHeight);
    if ($echo) {
      $echo
        .private("admin.orders")
        .stopListening(".NewOrderPlaced", onNewOrderPlaced)
        .stopListening(".OrderStatusUpdated", onOrderStatusUpdated);
    }
  }
});
</script>

<template>
  <div class="orders-page p-4 animate-fade-in">
    
    <div
      class="header-card mb-4 p-4 rounded-4 shadow-sm text-white glass-header"
    >
      <div class="row align-items-center">
        <div class="col-lg-3">
          <h1 class="h3 mb-1 fw-bold">Заказы</h1>
          <p class="mb-0 opacity-75 small">Управление продажами</p>
        </div>
        <div class="col-lg-9">
          <div class="row g-2 justify-content-end">
            <div class="col-md-4">
              <div
                class="input-group search-pill overflow-hidden bg-white bg-opacity-10 border-0"
              >
                <span
                  class="input-group-text border-0 bg-transparent text-white opacity-50 ps-3"
                  ><i class="bi bi-search"></i
                ></span>
                <input
                  v-model="filters.search"
                  type="text"
                  class="form-control border-0 bg-transparent text-white placeholder-white ps-2"
                  placeholder="Поиск..."
                  @keyup.enter="fetchOrders"
                />
              </div>
            </div>
            <div class="col-md">
              <div
                class="input-group search-pill overflow-hidden bg-white bg-opacity-10 border-0"
              >
                <span
                  class="input-group-text border-0 bg-transparent text-white opacity-50 ps-3"
                  ><i class="bi bi-filter"></i
                ></span>
                <select
                  v-model="filters.status"
                  @change="fetchOrders"
                  class="form-select border-0 bg-transparent text-white luxury-select ps-2"
                >
                  <option value="" class="text-dark">Все статусы</option>
                  <option value="pending" class="text-dark">⏳ Ожидает</option>
                  <option value="processing" class="text-dark">
                    🛠️ В обработке
                  </option>
                  <option value="shipped" class="text-dark">
                    🚚 Отправлен
                  </option>
                  <option value="delivered" class="text-dark">
                    ✅ Доставлен
                  </option>
                  <option value="cancelled" class="text-dark">
                    ❌ Отменен
                  </option>
                  <option value="refunded" class="text-dark">↩️ Возврат</option>
                </select>
              </div>
            </div>
            <div class="col-md">
              <div
                class="input-group search-pill overflow-hidden bg-white bg-opacity-10 border-0"
              >
                <span
                  class="input-group-text border-0 bg-transparent text-white opacity-50 ps-3"
                  ><i class="bi bi-wallet2"></i
                ></span>
                <select
                  v-model="filters.payment_status"
                  @change="fetchOrders"
                  class="form-select border-0 bg-transparent text-white luxury-select ps-2"
                >
                  <option value="" class="text-dark">Все оплаты</option>
                  <option value="pending" class="text-dark">⏳ Ожидает</option>
                  <option value="paid" class="text-dark">✅ Оплачено</option>
                  <option value="failed" class="text-dark">❌ Ошибка</option>
                </select>
              </div>
            </div>
            <div class="col-md">
              <div
                class="input-group search-pill overflow-hidden bg-white bg-opacity-10 border-0"
              >
                <span
                  class="input-group-text border-0 bg-transparent text-white opacity-50 ps-3"
                  ><i class="bi bi-credit-card"></i
                ></span>
                <select
                  v-model="filters.payment_method"
                  @change="fetchOrders"
                  class="form-select border-0 bg-transparent text-white luxury-select ps-2"
                >
                  <option value="" class="text-dark">Все способы</option>
                  <option value="cash" class="text-dark">
                    🚚 При получении
                  </option>
                  <option value="transfer" class="text-dark">💳 Перевод</option>
                </select>
              </div>
            </div>
            <div class="col-auto">
              <button
                @click="showAdvancedFilters = !showAdvancedFilters"
                class="btn btn-white-glass rounded-circle"
                :class="{ active: showAdvancedFilters }"
                title="Больше фильтров"
              >
                <i class="bi bi-sliders"></i>
              </button>
            </div>
            <div class="col-auto">
              <button
                @click="fetchOrders"
                class="btn btn-white-glass rounded-circle"
              >
                <i class="bi bi-arrow-clockwise"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    
    <div
      v-if="showAdvancedFilters"
      class="card border-0 shadow-sm rounded-4 mb-4 p-4 bg-white animate-fade-in"
    >
      <div class="row g-3">
        <div class="col-md-3">
          <label class="form-label small fw-bold text-muted">Дата с</label>
          <input
            v-model="filters.date_from"
            type="date"
            class="form-control"
            @change="fetchOrders"
          />
        </div>
        <div class="col-md-3">
          <label class="form-label small fw-bold text-muted">Дата по</label>
          <input
            v-model="filters.date_to"
            type="date"
            class="form-control"
            @change="fetchOrders"
          />
        </div>
        <div class="col-md-3">
          <label class="form-label small fw-bold text-muted">Мин. сумма</label>
          <input
            v-model="filters.min_total"
            type="number"
            class="form-control"
            placeholder="0"
            @change="fetchOrders"
          />
        </div>
        <div class="col-md-3">
          <label class="form-label small fw-bold text-muted">Макс. сумма</label>
          <input
            v-model="filters.max_total"
            type="number"
            class="form-control"
            placeholder="1000000"
            @change="fetchOrders"
          />
        </div>
      </div>
      <div class="mt-3 d-flex justify-content-end">
        <button
          @click="
            filters.date_from = '';
            filters.date_to = '';
            filters.min_total = '';
            filters.max_total = '';
            filters.user_id = '';
            fetchOrders();
          "
          class="btn btn-sm btn-outline-secondary rounded-pill"
        >
          Сбросить фильтры
        </button>
      </div>
    </div>

    
    <div
      class="card border-0 shadow-sm rounded-4 luxury-table-card overflow-hidden"
    >
      <div v-if="isLoading && orders.data.length === 0" class="p-5 text-center">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Загрузка...</span>
        </div>
        <div class="mt-3 text-muted fw-bold">Загружаем заказы...</div>
      </div>

      <div
        v-else-if="orders.data.length === 0"
        class="p-5 text-center text-muted"
      >
        <i class="bi bi-search fs-1 opacity-25 d-block mb-3"></i>
        <span>Заказов не найдено. Попробуйте изменить фильтр.</span>
      </div>

      <!-- Фоновая подгрузка (напр. по приходу нового заказа через WS)
           не сносит строки — иначе таблица схлопывается и сбрасывает
           скролл; старые строки остаются, только приглушаются -->
      <div
        v-else
        ref="tableWrap"
        class="table-responsive-cards"
        :class="{ 'is-refetching': isLoading }"
        :style="{ minHeight: tableHeightStyle, maxHeight: tableHeightStyle, overflowY: 'auto', background: '#f8fafc' }"
      >
        <table class="table table-hover align-middle mb-0 custom-table">
          <thead class="d-none d-lg-table-header-group">
            <tr>
              <th scope="col" class="ps-4">№ Заказа</th>
              <th scope="col">Статус</th>
              <th scope="col">Оплата</th>
              <th scope="col">Сумма</th>
              <th scope="col">Дата создания</th>
              <th scope="col" class="text-end pe-4">Действия</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="order in orders.data"
              :key="order.id"
              class="transaction-row"
              @click="openOrderModal(order)"
            >
              <td class="ps-4" data-label="№ Заказа">
                <div class="d-flex align-items-center">
                  <div
                    class="order-idx text-muted me-3 small font-monospace d-none d-lg-block"
                  >
                    #{{ order.id }}
                  </div>
                  <div>
                    <div class="fw-bold text-dark">
                      {{ order.order_number }}
                    </div>
                    <span v-if="order.is_debt" class="badge-mini debt">
                      <i class="bi bi-person-exclamation"></i> С ДОЛГОМ
                    </span>
                  </div>
                </div>
              </td>
              <td data-label="Статус" @click.stop>
                <div class="dropdown quick-status-dropdown">
                  <button
                    type="button"
                    class="badge-modern-status border-0 dropdown-toggle"
                    :class="statusLabelClass(order.status)"
                    data-bs-toggle="dropdown"
                    :disabled="quickUpdatingId === order.id"
                  >
                    <span
                      v-if="quickUpdatingId === order.id"
                      class="spinner-border spinner-border-sm"
                      style="width: 0.7rem; height: 0.7rem"
                    ></span>
                    <template v-else>{{ getStatusText(order.status) }}</template>
                  </button>
                  <ul class="dropdown-menu shadow-sm">
                    <li v-for="opt in STATUS_QUICK_OPTIONS" :key="opt.value">
                      <button
                        type="button"
                        class="dropdown-item d-flex align-items-center gap-2"
                        :class="{ active: order.status === opt.value }"
                        @click="quickSetStatus(order, opt.value)"
                      >
                        <span
                          class="status-dot"
                          :class="statusLabelClass(opt.value)"
                        ></span>
                        {{ opt.label }}
                      </button>
                    </li>
                  </ul>
                </div>
              </td>
              <td data-label="Оплата" @click.stop>
                <div class="dropdown quick-status-dropdown">
                  <button
                    type="button"
                    class="btn btn-sm btn-light border rounded-pill dropdown-toggle d-flex align-items-center gap-1"
                    data-bs-toggle="dropdown"
                    :disabled="quickUpdatingId === order.id"
                  >
                    <span
                      v-if="quickUpdatingId === order.id"
                      class="spinner-border spinner-border-sm"
                      style="width: 0.7rem; height: 0.7rem"
                    ></span>
                    <template v-else>
                      <i
                        :class="
                          order.payment_status === 'paid'
                            ? 'bi bi-check-circle-fill text-success'
                            : 'bi bi-dash-circle text-warning'
                        "
                      ></i>
                      <span class="small fw-bold">{{
                        getPaymentStatusText(order.payment_status)
                      }}</span>
                    </template>
                  </button>
                  <ul class="dropdown-menu shadow-sm">
                    <li
                      v-for="opt in PAYMENT_STATUS_QUICK_OPTIONS"
                      :key="opt.value"
                    >
                      <button
                        type="button"
                        class="dropdown-item d-flex align-items-center gap-2"
                        :class="{ active: order.payment_status === opt.value }"
                        @click="quickSetPaymentStatus(order, opt.value)"
                      >
                        {{ opt.label }}
                      </button>
                    </li>
                  </ul>
                  <div
                    v-if="order.payment_method"
                    class="x-small text-muted mt-1 opacity-75"
                    style="font-size: 0.65rem"
                  >
                    <i class="bi bi-wallet2 me-1"></i>
                    {{ getPaymentMethodText(order.payment_method) }}
                  </div>
                </div>
              </td>
              <td data-label="Сумма">
                <div
                  class="fw-bold text-dark font-monospace text-end text-lg-start"
                >
                  <div>{{ formatPrice(order.total) }}</div>
                  <div
                    v-if="order.is_debt && order.remaining_amount > 0"
                    class="text-danger small fw-bold mt-1"
                    style="font-size: 0.65rem"
                  >
                    Долг: {{ formatPrice(order.remaining_amount) }}
                  </div>
                </div>
              </td>
              <td data-label="Дата" class="text-muted small">
                {{ formatDate(order.created_at) }}
              </td>
              <td class="text-end pe-4 mobile-actions">
                <button
                  @click.stop="downloadOrderInvoice(order.id)"
                  class="btn btn-sm btn-light rounded-circle shadow-sm p-1 px-2 border ms-1"
                  title="Скачать накладную"
                >
                  <i class="bi bi-file-earmark-pdf text-danger"></i>
                </button>
                <button
                  @click.stop="downloadOrderThermalReceipt(order.id)"
                  class="btn btn-sm btn-light rounded-circle shadow-sm p-1 px-2 border ms-1"
                  title="Печать чека (80мм)"
                >
                  <i class="bi bi-printer text-success"></i>
                </button>
                <button
                  @click.stop="openOrderModal(order)"
                  class="btn btn-sm btn-light rounded-circle shadow-sm p-1 px-2 border ms-1"
                  title="Подробнее"
                >
                  <i class="bi bi-eye text-primary"></i>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    
    <div
      v-if="orders.last_page > 1"
      class="d-flex justify-content-between align-items-center mt-4 px-2"
    >
      <div class="small fw-semi-bold text-muted">
        Показано
        <span class="text-dark">{{
          (orders.current_page - 1) * orders.per_page + 1
        }}</span
        >-
        <span class="text-dark">{{
          Math.min(orders.current_page * orders.per_page, orders.total)
        }}</span>
        из <span class="text-dark">{{ orders.total }}</span>
      </div>
      <nav>
        <ul class="pagination-premium mb-0">
          <li :class="{ disabled: orders.current_page <= 1 }">
            <button @click="changePage(orders.current_page - 1)">
              <i class="bi bi-chevron-left"></i>
            </button>
          </li>
          <li
            v-for="page in visiblePages"
            :key="page"
            :class="{
              active: page === orders.current_page,
              dots: page === '...',
            }"
          >
            <button @click="changePage(page)">{{ page }}</button>
          </li>
          <li :class="{ disabled: orders.current_page >= orders.last_page }">
            <button @click="changePage(orders.current_page + 1)">
              <i class="bi bi-chevron-right"></i>
            </button>
          </li>
        </ul>
      </nav>
    </div>

    
    <UiBaseModal
      v-if="selectedOrder"
      :show="isModalOpen"
      :title="'Детали заказа ' + selectedOrder.order_number"
      size="lg"
      @close="closeOrderModal"
    >
      <div class="modal-body-scrollable">
        <div class="row g-4 mb-4">
          <div class="col-md-6">
            <div class="status-edit-card p-3 rounded-4 border bg-light">
              <label class="form-label text-muted small fw-bold mb-2"
                >СТАТУС ЗАКАЗА</label
              >
              <select
                v-model="selectedOrder.status"
                class="form-select border-0 shadow-sm rounded-3 mb-2"
              >
                <option value="pending">⏳ Ожидает</option>
                <option value="processing">🛠️ В обработке</option>
                <option value="shipped">🚚 Отправлен</option>
                <option value="delivered">✅ Доставлен</option>
                <option value="cancelled">❌ Отменен</option>
                <option value="refunded">↩️ Возврат</option>
              </select>
              <div class="text-muted" style="font-size: 0.65rem">
                <i class="bi bi-info-circle me-1"></i>
                Отмена или возврат автоматически возвращают товар на склад.
              </div>
            </div>
          </div>
          <div class="col-md-6">
            <div class="status-edit-card p-3 rounded-4 border bg-light">
              <label class="form-label text-muted small fw-bold mb-2"
                >ОПЛАТА</label
              >
              <select
                v-model="selectedOrder.payment_status"
                class="form-select border-0 shadow-sm rounded-3"
              >
                <option value="pending">⏳ Ожидает</option>
                <option value="paid">✅ Оплачено</option>
                <option value="failed">❌ Ошибка</option>
              </select>

              <label class="form-label text-muted small fw-bold mb-2 mt-3"
                >СПОСОБ ОПЛАТЫ</label
              >
              <select
                v-model="selectedOrder.payment_method"
                class="form-select border-0 shadow-sm rounded-3"
              >
                <option :value="null">Не указан</option>
                <option value="cash">🚚 Оплата при получении</option>
                <option value="transfer">🏦 Перевод / MBank</option>
              </select>
            </div>
          </div>
        </div>

        <div class="luxury-card-inner mb-4 overflow-hidden rounded-4 border">
          <div
            class="p-3 bg-light border-bottom d-flex justify-content-between align-items-center"
          >
            <h6 class="fw-bold mb-0">Состав заказа</h6>
            <span class="badge bg-primary-subtle text-primary rounded-pill px-3"
              >{{ selectedOrder.items?.length }} поз.</span
            >
          </div>
          <div class="table-responsive">
            <table class="table table-sm align-middle mb-0">
              <thead class="bg-light small">
                <tr>
                  <th class="ps-3 py-2">Товар</th>
                  <th class="text-center">Кол-во</th>
                  <th class="text-center">Возврат</th>
                  <th class="text-end pe-3">Сумма</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in selectedOrder.items" :key="item.id">
                  <td class="ps-3 py-2">
                    <div class="small fw-bold">
                      {{ item.product_name || "Товар #" + item.product_id }}
                    </div>
                    <div class="text-muted" style="font-size: 0.65rem">
                      {{ formatPrice(item.price) }} / шт.
                    </div>
                  </td>
                  <td class="text-center small">{{ item.quantity }}</td>
                  <td class="text-center small text-danger fw-bold">
                    <span v-if="item.refunded_quantity > 0"
                      >-{{ item.refunded_quantity }}</span
                    >
                    <span v-else>-</span>
                  </td>
                  <td class="text-end pe-3 small fw-bold">
                    {{ formatPrice(item.total) }}
                  </td>
                </tr>
              </tbody>
              <tfoot class="border-top bg-light-subtle">
                <tr>
                  <td colspan="3" class="text-end fw-bold py-3 small">
                    ИТОГО:
                  </td>
                  <td class="text-end pe-3 py-3 fw-bold text-primary">
                    {{ formatPrice(selectedOrder.total) }}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        
        <div
          v-if="selectedOrder.is_debt"
          class="debt-box p-4 rounded-4 mb-4 border border-danger-subtle bg-danger-subtle bg-opacity-10"
        >
          <div class="d-flex align-items-center mb-3">
            <div
              class="stat-icon-mini bg-danger text-white me-2 d-flex align-items-center justify-content-center"
              style="width: 32px; height: 32px; border-radius: 8px"
            >
              <i class="bi bi-person-exclamation"></i>
            </div>
            <h6 class="fw-bold mb-0 text-danger">Задолженность</h6>
          </div>
          <div class="row g-3 text-center">
            <div class="col-6 col-md-3 border-end">
              <div class="small text-muted mb-1">Аванс</div>
              <div class="fw-bold">
                {{ formatPrice(selectedOrder.initial_payment) }}
              </div>
            </div>
            <div class="col-6 col-md-3 border-end">
              <div class="small text-muted mb-1">Выплачено</div>
              <div class="fw-bold text-success">
                {{ formatPrice(selectedOrder.paid_amount) }}
              </div>
            </div>
            <div class="col-6 col-md-3 border-end">
              <div class="small text-muted mb-1">Долг</div>
              <div class="fw-bold text-danger">
                {{ formatPrice(selectedOrder.remaining_amount) }}
              </div>
            </div>
            <div class="col-6 col-md-3">
              <div class="small text-muted mb-1">Срок</div>
              <div
                class="fw-bold"
                :class="{ 'text-danger': isOverdue(selectedOrder.due_date) }"
              >
                {{
                  selectedOrder.due_date
                    ? new Date(selectedOrder.due_date).toLocaleDateString()
                    : "—"
                }}
              </div>
            </div>
          </div>
        </div>

        <div class="row g-4 mt-2">
          <div class="col-md-6">
            <h6
              class="fw-bold mb-2 px-1 py-1 border-start border-primary border-4 ms-1"
            >
              Адрес доставки
            </h6>
            <div
              class="p-3 bg-white border shadow-sm rounded-4 h-100"
              v-if="selectedOrder.shipping_address"
            >
              <div class="fw-bold mb-1 text-dark">
                {{ selectedOrder.shipping_address.first_name }}
                {{ selectedOrder.shipping_address.last_name }}
              </div>
              <div class="text-muted small mb-2">
                <i class="bi bi-geo-alt me-2"></i
                >{{ selectedOrder.shipping_address.address_line_1 }}
              </div>
              <div class="text-muted small mb-2">
                <i class="bi bi-building me-2"></i
                >{{ selectedOrder.shipping_address.city }}
              </div>
              <div class="text-primary small fw-bold">
                <i class="bi bi-telephone me-2"></i
                >{{ selectedOrder.shipping_address.phone }}
              </div>
            </div>
            <div
              v-else
              class="p-3 text-center bg-light rounded-4 border h-100 d-flex align-items-center justify-content-center text-muted small"
            >
              Адрес не указан
            </div>
          </div>
          <div class="col-md-6">
            <h6
              class="fw-bold mb-2 px-1 py-1 border-start border-warning border-4 ms-1"
            >
              Комментарий
            </h6>
            <div
              class="p-3 bg-white border shadow-sm rounded-4 h-100 small text-muted"
            >
              {{ selectedOrder.notes || "Нет примечаний от клиента." }}
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <div
          class="d-flex justify-content-between gap-2 w-100 align-items-center"
        >
          <div class="d-flex gap-2">
            <button
              class="btn btn-outline-success rounded-pill px-3 fw-bold"
              @click="downloadOrderThermalReceipt(selectedOrder.id)"
              title="Печать чека"
            >
              <i class="bi bi-printer me-2"></i>Чек
            </button>
            <div class="dropdown">
              <button
                class="btn btn-outline-danger rounded-pill px-3 fw-bold dropdown-toggle"
                type="button"
                data-bs-toggle="dropdown"
                aria-expanded="false"
              >
                <i class="bi bi-arrow-return-left me-2"></i>Возврат
              </button>
              <ul class="dropdown-menu">
                <li>
                  <a
                    class="dropdown-item"
                    href="#"
                    @click.prevent="openPartialReturnModal"
                    >Частичный возврат (поштучно)</a
                  >
                </li>
                <li><hr class="dropdown-divider" /></li>
                <li>
                  <a
                    class="dropdown-item text-danger"
                    href="#"
                    @click.prevent="
                      selectedOrder.status = 'refunded';
                      updateOrderStatus();
                    "
                    >Полный возврат заказа</a
                  >
                </li>
              </ul>
            </div>
          </div>

          <div class="d-flex gap-2">
            <button
              class="btn btn-light rounded-pill px-4 fw-bold"
              @click="closeOrderModal"
            >
              Закрыть
            </button>
            <button
              class="btn btn-primary rounded-pill px-4 fw-bold shadow-sm"
              :disabled="isUpdating"
              @click="updateOrderStatus"
            >
              <span
                v-if="isUpdating"
                class="spinner-border spinner-border-sm me-2"
              ></span>
              {{ isUpdating ? "Сохранение..." : "Сохранить" }}
            </button>
          </div>
        </div>
      </template>
    </UiBaseModal>

    
    <UiBaseModal
      v-if="selectedOrder"
      :show="isOpenReturnModal"
      title="Частичный возврат товаров"
      @close="isOpenReturnModal = false"
    >
      <div v-if="selectedOrder">
        <p class="text-muted small">
          Выберите товары и количество для возврата.
        </p>
        <div class="table-responsive mb-3">
          <table class="table table-sm align-middle">
            <thead>
              <tr>
                <th>Товар</th>
                <th class="text-center">Куплено</th>
                <th class="text-center">Вернуть</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in returnItemsSelection" :key="item.id">
                <td>
                  <div class="small fw-bold">{{ item.product_name }}</div>
                  <div class="text-muted" style="font-size: 10px">
                    {{ formatPrice(item.price) }}
                  </div>
                </td>
                <td class="text-center">
                  {{ item.quantity }}
                  <span
                    v-if="item.refunded_quantity > 0"
                    class="text-danger small ms-1"
                    >(-{{ item.refunded_quantity }})</span
                  >
                </td>
                <td style="width: 120px">
                  <input
                    type="number"
                    class="form-control form-control-sm text-center"
                    v-model.number="item.return_qty"
                    min="0"
                    :max="item.quantity - item.refunded_quantity"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <template #footer>
        <button
          class="btn btn-light rounded-pill px-4"
          @click="isOpenReturnModal = false"
        >
          Отмена
        </button>
        <button
          class="btn btn-danger rounded-pill px-4"
          @click="submitPartialReturn"
        >
          Подтвердить возврат
        </button>
      </template>
    </UiBaseModal>
  </div>
</template>

<style scoped>
.orders-page {
  background-color: #f8fafc;
  min-height: 100vh;
}

/* Фоновая подгрузка (новый заказ по WS): строки остаются, но приглушены */
.table-responsive-cards.is-refetching tbody {
  opacity: 0.5;
  pointer-events: none;
  transition: opacity 0.15s;
}

.glass-header {
  background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%);
}

.luxury-table-card {
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.05) !important;
}

.custom-table thead th {
  background: #f8fafc;
  padding: 16px;
  color: #64748b;
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.transaction-row {
  cursor: pointer;
  transition: all 0.2s;
}
.transaction-row:hover {
  background-color: #f1f5f9;
}

.badge-modern-status {
  padding: 6px 14px;
  border-radius: 50px;
  font-size: 0.7rem;
  font-weight: 700;
  display: inline-block;
}

.badge-pending {
  background: #fef3c7;
  color: #d97706;
}
.badge-processing {
  background: #e0e7ff;
  color: #4f46e5;
}
.badge-shipped {
  background: #e0f2fe;
  color: #0284c7;
}
.badge-delivered {
  background: #dcfce7;
  color: #16a34a;
}
.badge-cancelled {
  background: #fee2e2;
  color: #dc2626;
}
.badge-refunded {
  background: #f1f5f9;
  color: #64748b;
}

/* Быстрые дропдауны статуса/оплаты прямо в таблице */
.quick-status-dropdown {
  display: inline-block;
  position: relative;
}
.quick-status-dropdown .dropdown-toggle {
  cursor: pointer;
}
.quick-status-dropdown .dropdown-toggle::after {
  margin-left: 6px;
  vertical-align: middle;
}
.quick-status-dropdown .dropdown-menu {
  min-width: 170px;
  padding: 6px;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.06);
}
.quick-status-dropdown .dropdown-item {
  border-radius: 8px;
  font-size: 0.85rem;
  padding: 7px 10px;
}
.quick-status-dropdown .dropdown-item.active,
.quick-status-dropdown .dropdown-item:active {
  background: #eef2ff;
  color: #4f46e5;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-dot.badge-pending { background: #d97706; }
.status-dot.badge-processing { background: #4f46e5; }
.status-dot.badge-shipped { background: #0284c7; }
.status-dot.badge-delivered { background: #16a34a; }
.status-dot.badge-cancelled { background: #dc2626; }
.status-dot.badge-refunded { background: #64748b; }

.badge-mini {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.6rem;
  font-weight: 800;
  display: inline-block;
  margin-top: 4px;
}
.badge-mini.debt {
  background: #fee2e2;
  color: #dc2626;
}

.pagination-premium {
  display: flex;
  list-style: none;
  gap: 6px;
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
  background: #4f46e5;
  color: white;
  border-color: #4f46e5;
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25);
}

.search-pill {
  border-radius: 50px;
  backdrop-filter: blur(4px);
  min-height: 44px;
}

.luxury-select {
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 500;
  padding-right: 30px !important;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.luxury-select option {
  background: white !important;
  color: #1e293b !important;
}

.animate-fade-in {
  animation: fadeIn 0.4s ease-out;
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
.placeholder-white::placeholder {
  color: rgba(255, 255, 255, 0.7);
}

.btn-white-glass {
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border: none;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
}
.btn-white-glass:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: rotate(180deg);
}


.modal-body-scrollable {
  scrollbar-width: none; 
  -ms-overflow-style: none; 
}
.modal-body-scrollable::-webkit-scrollbar {
  display: none; 
}
</style>
