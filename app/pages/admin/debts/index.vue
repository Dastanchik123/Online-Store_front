<script setup>
definePageMeta({
  layout: "admin",
  middleware: "cashier",
});

const uiStore = useUiStore();
const {
  getDebts,
  payDebt,
  deleteDebt,
  deleteDebtPayment,
  downloadDebtsReport,
  downloadDebtsExcel,
} = useAccounting();
const route = useRoute();
const router = useRouter();

const debts = ref({
  data: [],
  current_page: 1,
  last_page: 1,
  total: 0,
  per_page: 15,
});

const isLoading = ref(false);
const isUpdating = ref(false);

const filters = ref({
  status: "active",
  search: "",
  page: 1,
});

const paymentModal = ref({
  isOpen: false,
  debtId: null,
  maxAmount: 0,
  amount: 0,
  method: "cash",
  debt: null,
});

const detailsModal = ref({
  isOpen: false,
  order: null,
});

const openOrderDetails = (debt) => {
  if (debt.order) {
    detailsModal.value.order = debt.order;
    detailsModal.value.isOpen = true;
  } else {
    uiStore.error("Данные заказа не найдены");
  }
};

const handleDeleteDebt = async (debtId) => {
  const confirmed = await uiStore.showConfirm(
    "Удаление долга",
    "Вы уверены, что хотите полностью удалить эту запись о долге? Это действие невозможно отменить."
  );

  if (!confirmed) return;

  isUpdating.value = true;
  try {
    await deleteDebt(debtId);
    uiStore.success("Запись о долге удалена");
    fetchDebts();
  } catch (error) {
    uiStore.error("Ошибка при удалении");
  } finally {
    isUpdating.value = false;
  }
};

let debounceTimer = null;

const fetchDebts = async () => {
  isLoading.value = true;
  try {
    const data = await getDebts({
      ...filters.value,
      status: filters.value.status === "all" ? undefined : filters.value.status,
    });
    debts.value = data;
  } catch (error) {
    console.error(error);
  } finally {
    isLoading.value = false;
  }
};

watch(
  () => filters.value.search,
  () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      filters.value.page = 1;
      fetchDebts();
    }, 500);
  }
);

const changePage = (page) => {
  if (page < 1 || page > debts.value.last_page) return;
  filters.value.page = page;
  fetchDebts();
};

const openPaymentModal = (debt) => {
  paymentModal.value = {
    isOpen: true,
    debtId: debt.id,
    maxAmount: debt.remaining_amount,
    amount: debt.remaining_amount,
    method: debt.order?.payment_method || "cash",
    debt: debt,
  };
};

const submitPayment = async () => {
  if (paymentModal.value.amount <= 0) {
    uiStore.error("Сумма должна быть больше 0");
    return;
  }
  if (paymentModal.value.amount > paymentModal.value.maxAmount) {
    uiStore.error("Сумма превышает остаток долга");
    return;
  }

  isUpdating.value = true;
  try {
    await payDebt(paymentModal.value.debtId, {
      amount: paymentModal.value.amount,
      payment_method: paymentModal.value.method,
    });
    uiStore.success("Оплата принята");
    paymentModal.value.isOpen = false;
    fetchDebts();
  } catch (error) {
    console.error(error);
    uiStore.error("Ошибка при оплате");
  } finally {
    isUpdating.value = false;
  }
};

const removePayment = async (paymentId) => {
  const confirmed = await uiStore.showConfirm(
    "Отмена платежа",
    "Вы уверены, что хотите отменить этот платеж?"
  );
  if (!confirmed) return;

  isUpdating.value = true;
  try {
    await deleteDebtPayment(paymentId);
    uiStore.success("Платеж отменен");
    paymentModal.value.isOpen = false;
    fetchDebts();
  } catch (error) {
    console.error(error);
    uiStore.error("Ошибка при удалении платежа");
  } finally {
    isUpdating.value = false;
  }
};

const formatPrice = (price) => {
  return parseFloat(price || 0).toLocaleString("ru-RU") + " сом";
};

const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const getStatusBadge = (status) => {
  switch (status) {
    case "active":
      return "badge bg-danger";
    case "partial":
      return "badge bg-warning text-dark";
    case "paid":
      return "badge bg-success";
    case "cancelled":
      return "badge bg-secondary";
    default:
      return "badge bg-light text-dark";
  }
};

const getStatusText = (status) => {
  const map = {
    active: "Не оплачен",
    partial: "Частично",
    paid: "Оплачен",
    cancelled: "Отменен",
  };
  return map[status] || status;
};

const translatePaymentMethod = (method) => {
  const map = {
    cash: "Оплата при получении",
    card: "Картой",
    bank_transfer: "Перевод",
    mbank: "MBank",
    qr: "QR-код",
  };
  return map[method] || method;
};

const exportPdf = async () => {
  try {
    await downloadDebtsReport({
      ...filters.value,
      isGrouped: isGrouped.value,
      expandedGroups: Array.from(expandedGroups.value),
    });
  } catch (error) {
    uiStore.error("Ошибка при экспорте PDF");
  }
};

const exportExcel = async () => {
  try {
    await downloadDebtsExcel({
      ...filters.value,
      isGrouped: isGrouped.value,
      expandedGroups: Array.from(expandedGroups.value),
    });
  } catch (error) {
    uiStore.error("Ошибка при экспорте Excel");
  }
};

const isGrouped = ref(true);
const expandedGroups = ref(new Set());

const toggleGroup = (groupId) => {
  if (expandedGroups.value.has(groupId)) {
    expandedGroups.value.delete(groupId);
  } else {
    expandedGroups.value.add(groupId);
  }
};

const expandedOrders = ref(new Set());
const toggleOrderDetails = (orderId) => {
  if (expandedOrders.value.has(orderId)) {
    expandedOrders.value.delete(orderId);
  } else {
    expandedOrders.value.add(orderId);
  }
};

const groupedDebts = computed(() => {
  const groups = [];
  const map = new Map();

  debts.value.data.forEach((debt) => {
    const groupId = debt.user_id || "guest-" + (debt.user?.name || "Гость");
    if (!map.has(groupId)) {
      map.set(groupId, {
        id: groupId,
        user: debt.user,
        debts: [],
        total_remaining: 0,
        total_paid: 0,
        total_amount: 0,
      });
      groups.push(map.get(groupId));
    }
    const group = map.get(groupId);
    group.debts.push(debt);
    group.total_remaining += parseFloat(debt.remaining_amount || 0);
    group.total_paid += parseFloat(debt.paid_amount || 0);
    group.total_amount += parseFloat(debt.total_amount || 0);
  });

  return groups;
});

onMounted(() => {
  if (route.query.status) filters.value.status = String(route.query.status);
  if (route.query.search) filters.value.search = String(route.query.search);
  if (route.query.page) filters.value.page = Number(route.query.page);

  fetchDebts();

  router.replace({ query: {} });
});
</script>

<template>
  <div class="debts-page p-4 animate-fade-in">
    
    <div
      class="header-card mb-4 p-4 rounded-4 shadow-sm text-white glass-header"
    >
      <div class="row align-items-center">
        <div class="col-lg-6">
          <h1 class="h3 mb-1 fw-bold">Долги клиентов</h1>
          <p class="mb-0 opacity-75 small">
            Управление задолженностями по заказам
          </p>
        </div>
      </div>
    </div>

    
    <div class="card border-0 shadow-sm rounded-4 mb-4 p-3">
      <div class="row g-2 align-items-center">
        <div class="col-md-4">
          <div class="input-group">
            <span class="input-group-text bg-white border-end-0">
              <i class="bi bi-search text-muted"></i>
            </span>
            <input
              v-model="filters.search"
              type="text"
              class="form-control border-start-0 ps-0"
              placeholder="Имя клиента..."
            />
          </div>
        </div>
        <div class="col-md-3">
          <select
            v-model="filters.status"
            class="form-select rounded-3"
            @change="fetchDebts"
          >
            <option value="active">Только должники</option>
            <option value="partial">Частично погашенные</option>
            <option value="paid">Оплаченные</option>
            <option value="cancelled">Отмененные</option>
            <option value="all">Все статусы</option>
          </select>
        </div>
        <div class="col-auto">
          <div class="form-check form-switch mt-1">
            <input
              v-model="isGrouped"
              class="form-check-input"
              type="checkbox"
              id="groupToggle"
            />
            <label class="form-check-label small fw-bold" for="groupToggle"
              >Группировать</label
            >
          </div>
        </div>
        <div class="col-auto d-flex gap-2 ms-auto">
          <button
            class="btn btn-outline-danger d-flex align-items-center gap-2 rounded-3"
            @click="exportPdf"
          >
            <i class="bi bi-file-earmark-pdf"></i>
            <span class="d-none d-md-inline">PDF</span>
          </button>
          <button
            class="btn btn-outline-success d-flex align-items-center gap-2 rounded-3"
            @click="exportExcel"
          >
            <i class="bi bi-file-earmark-spreadsheet"></i>
            <span class="d-none d-md-inline">Excel</span>
          </button>
          <button
            class="btn btn-primary rounded-circle shadow-sm"
            @click="fetchDebts"
          >
            <i class="bi bi-arrow-clockwise"></i>
          </button>
        </div>
      </div>
    </div>

    
    <div class="card border-0 shadow-sm rounded-4">
      <div class="table-responsive overflow-hidden">
        <table class="table table-hover align-middle mb-0 custom-table">
          <thead
            class="bg-light small text-muted text-uppercase d-none d-lg-table-header-group"
          >
            <tr>
              <th class="ps-4">Клиент</th>
              <th>Заказ</th>
              <th>Всего</th>
              <th>Оплачено</th>
              <th class="text-danger">Остаток</th>
              <th>Статус</th>
              <th>Срок</th>
              <th class="text-end pe-4">Действия</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="debts.data.length === 0">
              <td colspan="8" class="text-center p-5 text-muted">
                Записей не найдено
              </td>
            </tr>

            <template v-if="isGrouped">
              <template
                v-for="group in groupedDebts"
                :key="group.user?.id || group.user?.name"
              >
                
                <tr
                  class="group-header fw-bold"
                  @click="toggleGroup(group.id)"
                  style="cursor: pointer"
                >
                  <td colspan="2" class="ps-4">
                    <div class="d-flex align-items-center">
                      <div class="client-group-icon me-3">
                        <i class="bi bi-people-fill text-primary"></i>
                      </div>
                      <div>
                        <div class="text-dark">
                          {{ group.user?.name || "Гость" }}
                        </div>
                        <div class="small text-muted fw-normal">
                          {{ group.user?.phone || "Нет телефона" }}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td class="text-dark">
                    {{ formatPrice(group.total_amount) }}
                  </td>
                  <td class="text-success">
                    {{ formatPrice(group.total_paid) }}
                  </td>
                  <td class="text-danger fw-black fs-5">
                    {{ formatPrice(group.total_remaining) }}
                  </td>
                  <td colspan="2">
                    <span
                      class="badge bg-light text-dark border rounded-pill px-3"
                    >
                      {{ group.debts.length }}
                      {{ group.debts.length === 1 ? "заказ" : "заказа" }}
                    </span>
                  </td>
                  <td class="text-end pe-4">
                    <i
                      class="bi bi-chevron-down accordion-arrow"
                      :class="{
                        'is-expanded': expandedGroups.has(
                          group.user?.id || group.user?.name
                        ),
                      }"
                    ></i>
                  </td>
                </tr>

                
                <template
                  v-for="debt in group.debts"
                  v-if="expandedGroups.has(group.user?.id || group.user?.name)"
                  :key="debt.id"
                >
                  <tr class="debt-row child-row animate-fade-in">
                    <td class="ps-5" data-label="Клиент">
                      <div
                        class="d-flex align-items-center opacity-75 text-primary fw-bold"
                        @click.stop="toggleOrderDetails(debt.id)"
                        style="cursor: pointer"
                      >
                        <i
                          class="bi"
                          :class="
                            expandedOrders.has(debt.id)
                              ? 'bi-eye-slash-fill'
                              : 'bi-eye-fill'
                          "
                        ></i>
                        <span class="ms-2 small">{{
                          expandedOrders.has(debt.id)
                            ? "Скрыть состав"
                            : "Состав заказа"
                        }}</span>
                      </div>
                    </td>
                    <td data-label="Заказ">
                      <span v-if="debt.order" class="text-muted"
                        >#{{ debt.order_id }}</span
                      >
                    </td>
                    <td data-label="Всего" class="fw-bold">
                      {{ formatPrice(debt.total_amount) }}
                    </td>
                    <td data-label="Оплачено" class="text-success">
                      {{ formatPrice(debt.paid_amount) }}
                    </td>
                    <td data-label="Остаток" class="text-danger fw-bold">
                      {{ formatPrice(debt.remaining_amount) }}
                    </td>
                    <td data-label="Статус">
                      <span :class="getStatusBadge(debt.status)">{{
                        getStatusText(debt.status)
                      }}</span>
                    </td>
                    <td
                      data-label="Срок"
                      class="small text-muted d-lg-table-cell"
                    >
                      {{ formatDate(debt.due_date) }}
                    </td>
                    <td class="text-end pe-4 mobile-actions">
                      <div class="d-flex justify-content-end gap-2">
                        <button
                          v-if="debt.status === 'paid'"
                          class="btn btn-sm rounded-pill btn-outline-danger shadow-sm px-2"
                          @click.stop="handleDeleteDebt(debt.id)"
                          title="Удалить"
                        >
                          <i class="bi bi-trash"></i>
                        </button>
                        <button
                          class="btn btn-sm rounded-pill px-3 shadow-sm"
                          :class="
                            debt.status === 'paid'
                              ? 'btn-outline-primary'
                              : 'btn-success'
                          "
                          @click.stop="openPaymentModal(debt)"
                        >
                          <i
                            class="bi"
                            :class="
                              debt.status === 'paid'
                                ? 'bi-clock-history'
                                : 'bi-wallet2'
                            "
                          ></i>
                          {{
                            debt.status === "paid" ? " История" : " Оплатить"
                          }}
                        </button>
                      </div>
                    </td>
                  </tr>

                  
                  <tr
                    v-if="expandedOrders.has(debt.id)"
                    class="items-details-row animate-fade-in"
                  >
                    <td colspan="8" class="p-0">
                      <div
                        class="bg-light p-3 border-start border-primary border-4 ms-5 me-4 my-2 rounded-3 shadow-sm"
                      >
                        <div
                          class="fw-bold mb-2 small text-uppercase text-muted"
                        >
                          Состав заказа #{{ debt.order_id }}
                        </div>
                        <div class="table-responsive">
                          <table class="table table-sm table-borderless mb-0">
                            <thead>
                              <tr
                                class="text-muted border-bottom"
                                style="font-size: 0.75rem"
                              >
                                <th>Товар</th>
                                <th class="text-center">Кол-во</th>
                                <th class="text-end">Цена</th>
                                <th class="text-end">Всего</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr
                                v-for="item in debt.order?.items"
                                :key="item.id"
                                class="small border-bottom-dashed"
                              >
                                <td>
                                  <div class="fw-bold">
                                    {{ item.product?.name }}
                                  </div>
                                  <div class="text-muted tiny">
                                    SKU: {{ item.product?.sku }}
                                  </div>
                                </td>
                                <td class="text-center">{{ item.quantity }}</td>
                                <td class="text-end">
                                  {{ formatPrice(item.price) }}
                                </td>
                                <td class="text-end fw-bold">
                                  {{ formatPrice(item.price * item.quantity) }}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </td>
                  </tr>
                </template>
              </template>
            </template>

            <template v-else>
              
              <tr v-for="debt in debts.data" :key="debt.id" class="debt-row">
                <td class="ps-4" data-label="Клиент">
                  <NuxtLink
                    :to="`/admin/users/${debt.user_id}`"
                    class="text-decoration-none text-dark d-flex align-items-center"
                  >
                    <div
                      class="avatar-sm me-2 d-lg-none bg-primary-subtle text-primary rounded-circle d-flex align-items-center justify-content-center fw-bold"
                    >
                      {{ debt.user?.name?.[0] || "?" }}
                    </div>
                    <div>
                      <div class="fw-bold">
                        {{ debt.user?.name || "Гость" }}
                      </div>
                      <div class="small text-muted">
                        {{ debt.user?.phone || debt.user?.email }}
                      </div>
                    </div>
                  </NuxtLink>
                </td>
                <td data-label="Заказ">
                  <span class="text-muted">#{{ debt.order_id }}</span>
                </td>
                <td data-label="Всего" class="fw-bold">
                  {{ formatPrice(debt.total_amount) }}
                </td>
                <td data-label="Оплачено" class="text-success">
                  {{ formatPrice(debt.paid_amount) }}
                </td>
                <td data-label="Остаток" class="text-danger fw-bold">
                  {{ formatPrice(debt.remaining_amount) }}
                </td>
                <td data-label="Статус">
                  <span :class="getStatusBadge(debt.status)">{{
                    getStatusText(debt.status)
                  }}</span>
                </td>
                <td data-label="Срок" class="small text-muted d-lg-table-cell">
                  {{ formatDate(debt.due_date) }}
                </td>
                <td class="text-end pe-4 mobile-actions">
                  <div class="d-flex justify-content-end gap-2">
                    <button
                      v-if="debt.status === 'paid'"
                      class="btn btn-sm rounded-pill btn-outline-danger shadow-sm px-2"
                      @click="handleDeleteDebt(debt.id)"
                    >
                      <i class="bi bi-trash"></i>
                    </button>
                    <button
                      class="btn btn-sm rounded-pill px-3 shadow-sm"
                      :class="
                        debt.status === 'paid'
                          ? 'btn-outline-primary'
                          : 'btn-success'
                      "
                      @click="openPaymentModal(debt)"
                    >
                      <i
                        class="bi"
                        :class="
                          debt.status === 'paid'
                            ? 'bi-clock-history'
                            : 'bi-wallet2'
                        "
                      ></i>
                      {{ debt.status === "paid" ? " История" : " Оплатить" }}
                    </button>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      
      <div v-if="debts.last_page > 1" class="p-3 d-flex justify-content-end">
        <nav>
          <ul class="pagination mb-0">
            <li
              class="page-item"
              :class="{ disabled: debts.current_page === 1 }"
            >
              <button
                class="page-link"
                @click="changePage(debts.current_page - 1)"
              >
                Назад
              </button>
            </li>
            <li class="page-item active">
              <span class="page-link">{{ debts.current_page }}</span>
            </li>
            <li
              class="page-item"
              :class="{ disabled: debts.current_page === debts.last_page }"
            >
              <button
                class="page-link"
                @click="changePage(debts.current_page + 1)"
              >
                Вперед
              </button>
            </li>
          </ul>
        </nav>
      </div>
    </div>

    
    <UiBaseModal
      :show="paymentModal.isOpen"
      title="История и оплата долга"
      @close="paymentModal.isOpen = false"
    >
      <div v-if="paymentModal.debt">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label text-muted small mb-0">Клиент</label>
            <div class="fw-bold">{{ paymentModal.debt.user?.name }}</div>
            <div class="small text-muted">
              Заказ #{{ paymentModal.debt.order_id }}
            </div>
          </div>
          <div class="col-md-6">
            <label class="form-label text-muted small mb-0"
              >Остаток долга</label
            >
            <div class="fs-5 fw-bold text-danger">
              {{ formatPrice(paymentModal.debt.remaining_amount) }}
            </div>
          </div>
        </div>

        <hr />

        <div class="mb-3">
          <label class="form-label fw-bold small">Принять оплату</label>
          <div class="input-group">
            <input
              type="number"
              v-model.number="paymentModal.amount"
              class="form-control"
              :max="paymentModal.maxAmount"
              min="0"
              placeholder="Сумма"
            />
            <select
              v-model="paymentModal.method"
              class="form-select"
              style="max-width: 130px"
            >
              <option value="cash">Нал</option>
              <option value="mbank">MBank</option>
              <option value="card">Карта</option>
            </select>
            <button
              class="btn btn-success"
              :disabled="isUpdating || paymentModal.amount <= 0"
              @click="submitPayment"
            >
              ОК
            </button>
          </div>
        </div>

        <div
          v-if="paymentModal.debt?.payments?.length"
          class="mt-4 pt-3 border-top"
        >
          <h6 class="fw-bold mb-2 small text-muted text-uppercase">
            История выплат
          </h6>
          <div
            class="list-group list-group-flush border rounded-3 overflow-hidden"
          >
            <div
              v-for="pay in paymentModal.debt.payments"
              :key="pay.id"
              class="list-group-item d-flex justify-content-between align-items-center py-2 bg-light-subtle"
            >
              <div>
                <div class="fw-bold small">{{ formatPrice(pay.amount) }}</div>
                <div class="text-muted" style="font-size: 0.65rem">
                  {{ formatDate(pay.created_at) }} •
                  {{ translatePaymentMethod(pay.payment_method) }}
                </div>
              </div>
              <button
                class="btn btn-sm text-danger p-0"
                @click="removePayment(pay.id)"
                :disabled="isUpdating"
              >
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </UiBaseModal>

    
    <UiBaseModal
      :show="detailsModal.isOpen"
      title="Детали заказа"
      @close="detailsModal.isOpen = false"
    >
      <div v-if="detailsModal.order">
        <div class="mb-3 d-flex justify-content-between align-items-center">
          <span class="badge bg-primary rounded-pill"
            >Заказ #{{ detailsModal.order.id }}</span
          >
          <span class="text-muted small">{{
            formatDate(detailsModal.order.created_at)
          }}</span>
        </div>
        <div class="table-responsive">
          <table class="table table-sm table-borderless">
            <thead class="bg-light">
              <tr class="small text-muted text-uppercase">
                <th>Товар</th>
                <th class="text-center">Кол-во</th>
                <th class="text-end">Цена</th>
                <th class="text-end">Итого</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in detailsModal.order.items"
                :key="item.id"
                class="border-bottom-dashed"
              >
                <td>
                  <div class="fw-bold small">
                    {{ item.product?.name || "Товар удален" }}
                  </div>
                  <div class="text-muted" style="font-size: 0.7rem">
                    SKU: {{ item.product?.sku || "N/A" }}
                  </div>
                </td>
                <td class="text-center small">{{ item.quantity }}</td>
                <td class="text-end small">{{ formatPrice(item.price) }}</td>
                <td class="text-end fw-bold small">
                  {{ formatPrice(item.price * item.quantity) }}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3" class="text-end text-muted small pt-3">
                  Подытог:
                </td>
                <td class="text-end small pt-3">
                  {{ formatPrice(detailsModal.order.subtotal) }}
                </td>
              </tr>
              <tr v-if="parseFloat(detailsModal.order.discount) > 0">
                <td colspan="3" class="text-end text-muted small">Скидка:</td>
                <td class="text-end text-danger small">
                  -{{ formatPrice(detailsModal.order.discount) }}
                </td>
              </tr>
              <tr>
                <td colspan="3" class="text-end fw-bold border-top">
                  Итого к оплате:
                </td>
                <td class="text-end fw-bold text-primary border-top">
                  {{ formatPrice(detailsModal.order.total) }}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <template #footer>
        <button
          class="btn btn-primary rounded-pill px-4"
          @click="detailsModal.isOpen = false"
        >
          Закрыть
        </button>
      </template>
    </UiBaseModal>
  </div>
</template>

<style scoped>
.glass-header {
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
}
.group-header {
  background-color: #f8fafc;
  border-bottom: 2px solid #e2e8f0;
  transition: background-color 0.2s;
}
.group-header:hover {
  background-color: #f1f5f9;
}
.client-group-icon {
  width: 40px;
  height: 40px;
  background: white;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}
.child-row {
  border-left: 4px solid #3b82f6;
  background-color: #fff !important;
}
.child-row:hover {
  background-color: #f1f5f9 !important;
}
.fw-black {
  font-weight: 900;
}
.accordion-arrow {
  display: inline-block;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  color: #64748b;
  font-size: 1.1rem;
  vertical-align: middle;
}
.accordion-arrow.is-expanded {
  transform: rotate(180deg);
  color: #3b82f6;
}
.border-bottom-dashed {
  border-bottom: 1px dashed #e2e8f0;
}
.bg-light-subtle {
  background-color: #fcfcfc;
}
.tiny {
  font-size: 0.65rem;
}
.items-details-row {
  background-color: #f8fafc !important;
}
</style>
