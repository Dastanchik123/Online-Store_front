<script setup lang="ts">
definePageMeta({
  layout: "admin",
  middleware: "pos",
});

const authStore = useAuthStore();
const uiStore = useUiStore();
const { getOrders } = useOrders();
const { getPosSummary, getStaff } = usePos();

const orders = ref<any>({
  data: [],
  current_page: 1,
  last_page: 1,
  total: 0,
});
const summary = ref<any>({
  cash_total: 0,
  transfer_total: 0,
  total: 0,
  sales_count: 0,
});
const staffList = ref<any[]>([]);
const isLoading = ref(false);
const selectedOrder = ref<any>(null);
const showModal = ref(false);

const filters = ref({
  source: "pos",
  date_from: new Date().toLocaleDateString("en-CA"),
  date_to: new Date().toLocaleDateString("en-CA"),
  staff_id: "",
  per_page: 15,
  page: 1,
});

const fetchPosSales = async () => {
  isLoading.value = true;
  try {
    const [ordersData, summaryData]: [any, any] = await Promise.all([
      getOrders({ ...filters.value, with_items: 1 } as any),
      getPosSummary(filters.value.staff_id),
    ]);
    orders.value = ordersData;
    summary.value = summaryData;
  } catch (error) {
    console.error(error);
    uiStore.error("Ошибка при загрузке данных");
  } finally {
    isLoading.value = false;
  }
};

const fetchStaff = async () => {
  try {
    const data: any = await getStaff();
    staffList.value = data;
  } catch (error) {
    console.error("Staff fetch error:", error);
  }
};

const openDetails = (order: any) => {
  selectedOrder.value = order;
  showModal.value = true;
};

const formatPrice = (price: any) => {
  return parseFloat(price).toLocaleString("ru-RU") + " сом";
};

const changePage = (page: number) => {
  if (page < 1 || page > orders.value.last_page) return;
  filters.value.page = page;
  fetchPosSales();
};

const getStatusBadgeClass = (status: any) => {
  switch (status) {
    case "paid":
      return "bg-success-subtle text-success";
    case "pending":
      return "bg-warning-subtle text-warning";
    default:
      return "bg-light text-dark";
  }
};

onMounted(() => {
  fetchPosSales();
  fetchStaff();
});

watch(
  () => filters.value.staff_id,
  () => {
    filters.value.page = 1;
    fetchPosSales();
  },
);
</script>

<template>
  <div class="pos-sales-page p-4 animate-fade-in">
    <div class="d-flex justify-content-between align-items-center mb-4">
      <div>
        <h2 class="fw-bold mb-1">Оффлайн продажи (POS)</h2>
        <p class="text-muted mb-0">История и статистика продаж в магазине</p>
      </div>
      <NuxtLink
        to="/cashier/pos"
        class="btn btn-primary rounded-4 px-4 py-2 fw-bold shadow-sm"
      >
        <i class="bi bi-plus-lg me-2"></i> Новая продажа
      </NuxtLink>
    </div>

    <div class="row g-4 mb-5">
      <div class="col-md-3">
        <div
          class="card border-0 shadow-sm rounded-4 p-4 h-100 bg-white border-start border-success border-4"
        >
          <div class="d-flex align-items-center mb-2">
            <div
              class="icon-box bg-success-subtle text-success rounded-3 me-3 p-2"
            >
              <i class="bi bi-cash-stack fs-4"></i>
            </div>
            <span class="fw-bold text-muted">Наличными</span>
          </div>
          <h3 class="fw-bold mb-0 text-success">
            {{ formatPrice(summary.cash_total) }}
          </h3>
          <small class="text-muted">За сегодня</small>
        </div>
      </div>
      <div class="col-md-3">
        <div
          class="card border-0 shadow-sm rounded-4 p-4 h-100 bg-white border-start border-primary border-4"
        >
          <div class="d-flex align-items-center mb-2">
            <div
              class="icon-box bg-primary-subtle text-primary rounded-3 me-3 p-2"
            >
              <i class="bi bi-credit-card fs-4"></i>
            </div>
            <span class="fw-bold text-muted">Безнал (Перевод)</span>
          </div>
          <h3 class="fw-bold mb-0 text-primary">
            {{ formatPrice(summary.transfer_total) }}
          </h3>
          <small class="text-muted">За сегодня</small>
        </div>
      </div>
      <div class="col-md-3">
        <div
          class="card border-0 shadow-sm rounded-4 p-4 h-100 bg-dark text-white shadow"
        >
          <div class="d-flex align-items-center mb-2 text-white-50">
            <div
              class="icon-box bg-white bg-opacity-25 text-white rounded-3 me-3 p-2"
            >
              <i class="bi bi-wallet2 fs-4"></i>
            </div>
            <span class="fw-bold text-white opacity-75">Общая выручка</span>
          </div>
          <h3 class="fw-bold mb-0 text-white">
            {{ formatPrice(summary.total) }}
          </h3>
          <small class="opacity-50">Сумма всех оплат</small>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card border-0 shadow-sm rounded-4 p-4 h-100 bg-white">
          <div class="d-flex align-items-center mb-2">
            <div class="icon-box bg-info-subtle text-info rounded-3 me-3 p-2">
              <i class="bi bi-receipt fs-4"></i>
            </div>
            <span class="fw-bold text-muted">Всего чеков</span>
          </div>
          <h3 class="fw-bold mb-0">{{ summary.sales_count }}</h3>
          <small class="text-muted">Кол-во операций</small>
        </div>
      </div>
    </div>

    <div
      class="card border-0 shadow-sm rounded-4 overflow-hidden d-flex flex-column"
      style="max-height: 600px"
    >
      <div class="card-header bg-white p-4 border-0 flex-shrink-0">
        <div class="row g-3">
          <div class="col-md-4">
            <h5 class="fw-bold mb-0">История операций</h5>
          </div>
          <div class="col-md-8">
            <div class="d-flex gap-2 flex-wrap justify-content-md-end">
              <select
                v-model="filters.staff_id"
                class="form-select form-select-sm rounded-3 shadow-sm"
                style="width: auto"
              >
                <option value="">Все кассиры</option>
                <option
                  v-for="staff in staffList"
                  :key="staff.id"
                  :value="staff.id"
                >
                  {{ staff.name }} ({{ staff.role }})
                </option>
              </select>
              <input
                type="date"
                v-model="filters.date_from"
                @change="fetchPosSales"
                class="form-control form-control-sm rounded-3 shadow-sm"
                style="width: auto"
              />
              <input
                type="date"
                v-model="filters.date_to"
                @change="fetchPosSales"
                class="form-control form-control-sm rounded-3 shadow-sm"
                style="width: auto"
              />
            </div>
          </div>
        </div>
      </div>

      <div class="table-responsive flex-grow-1 overflow-auto custom-scrollbar">
        <table class="table table-hover align-middle mb-0">
          <thead class="bg-light">
            <tr>
              <th class="ps-4">№ Чек</th>
              <th>Кассир</th>
              <th>Клиент</th>
              <th>Дата и время</th>
              <th class="text-end">Сумма</th>
              <th>Оплата</th>
              <th class="text-end pe-4">Действия</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="sale in orders.data" :key="sale.id">
              <td class="ps-4 fw-bold">#{{ sale.order_number }}</td>
              <td>
                <div class="d-flex align-items-center">
                  <div
                    class="avatar-sm bg-light rounded-circle me-2 d-flex align-items-center justify-content-center"
                    style="width: 24px; height: 24px"
                  >
                    <i class="bi bi-person text-secondary small"></i>
                  </div>
                  <span class="small">{{ sale.staff?.name || "Система" }}</span>
                </div>
              </td>
              <td class="small">{{ sale.user?.name || "Гость" }}</td>
              <td class="small">
                {{ new Date(sale.created_at).toLocaleString("ru-RU") }}
              </td>
              <td class="text-end fw-bold">{{ formatPrice(sale.total) }}</td>
              <td>
                <span
                  class="badge rounded-pill px-3 py-1"
                  :class="getStatusBadgeClass(sale.payment_status)"
                >
                  {{ sale.payment_status === "paid" ? "Оплачено" : "Долг" }}
                </span>
              </td>
              <td class="text-end pe-4">
                <button
                  @click="openDetails(sale)"
                  class="btn btn-sm btn-outline-primary rounded-pill px-3"
                >
                  <i class="bi bi-info-circle me-1"></i> Детали
                </button>
              </td>
            </tr>
            <tr v-if="orders.data.length === 0 && !isLoading">
              <td colspan="7" class="text-center py-5 text-muted">
                Продаж за выбранный период не найдено
              </td>
            </tr>
            <tr v-if="isLoading">
              <td colspan="7" class="text-center py-5">
                <div
                  class="spinner-border text-primary spinner-border-sm me-2"
                ></div>
                Загрузка...
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        class="d-flex justify-content-between align-items-center p-4 border-top bg-light flex-shrink-0"
      >
        <span class="text-muted small">
          Показано {{ orders.data.length }} из {{ orders.total }} записей
        </span>
        <nav v-if="orders.last_page > 1">
          <ul class="pagination pagination-sm mb-0 shadow-sm">
            <li
              class="page-item"
              :class="{ disabled: orders.current_page === 1 }"
            >
              <button
                class="page-link border-0 rounded-start-3 px-3"
                @click="changePage(orders.current_page - 1)"
              >
                <i class="bi bi-chevron-left"></i> Назад
              </button>
            </li>
            <li class="page-item disabled">
              <span class="page-link border-0 bg-white fw-bold px-3">
                {{ orders.current_page }} / {{ orders.last_page }}
              </span>
            </li>
            <li
              class="page-item"
              :class="{ disabled: orders.current_page === orders.last_page }"
            >
              <button
                class="page-link border-0 rounded-end-3 px-3"
                @click="changePage(orders.current_page + 1)"
              >
                Вперед <i class="bi bi-chevron-right"></i>
              </button>
            </li>
          </ul>
        </nav>
      </div>
    </div>

    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div
        class="modal-content shadow-lg rounded-4 overflow-hidden animate-slide-up"
      >
        <div
          class="modal-header border-0 p-4 bg-light d-flex justify-content-between align-items-center"
        >
          <div>
            <h5 class="fw-bold mb-0">Чек №{{ selectedOrder.order_number }}</h5>
            <small class="text-muted">{{
              new Date(selectedOrder.created_at).toLocaleString("ru-RU")
            }}</small>
          </div>
          <button @click="showModal = false" class="btn-close"></button>
        </div>
        <div class="modal-body p-4">
          <div
            class="staff-info mb-4 p-3 bg-light rounded-3 d-flex justify-content-between align-items-center"
          >
            <div>
              <small class="text-muted d-block">Кассир</small>
              <span class="fw-bold">{{
                selectedOrder.staff?.name || "Система"
              }}</span>
            </div>
            <div class="text-end">
              <small class="text-muted d-block">Тип оплаты</small>
              <span class="badge bg-secondary rounded-pill">{{
                selectedOrder.payment_method
              }}</span>
            </div>
          </div>

          <p class="fw-bold mb-3">Состав чека:</p>
          <div class="items-list mb-4">
            <div
              v-for="item in selectedOrder.items"
              :key="item.id"
              class="d-flex justify-content-between align-items-center py-2 border-bottom border-light"
            >
              <div class="flex-grow-1">
                <div class="fw-bold small">{{ item.product_name }}</div>
                <small class="text-muted"
                  >{{ item.quantity }} x {{ formatPrice(item.price) }}</small
                >
              </div>
              <div class="fw-bold text-end">
                {{ formatPrice(item.total) }}
              </div>
            </div>
          </div>

          <div class="summary-box p-3 bg-dark text-white rounded-3">
            <div class="d-flex justify-content-between mb-1 opacity-75 small">
              <span>Сумма</span>
              <span>{{ formatPrice(selectedOrder.total) }}</span>
            </div>
            <div
              class="d-flex justify-content-between border-top border-white border-opacity-25 mt-2 pt-2 fw-bold fs-5"
            >
              <span>ИТОГО:</span>
              <span>{{ formatPrice(selectedOrder.total) }}</span>
            </div>
          </div>
        </div>
        <div class="modal-footer border-0 p-4 text-center">
          <button
            @click="showModal = false"
            class="btn btn-light rounded-pill px-5"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pos-sales-page {
  background: #f8fafc;
  min-height: 100vh;
}
.icon-box {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.avatar-sm {
  background: #e2e8f0;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  overflow-y: auto;
}
.modal-content {
  background: white;
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.modal-body {
  overflow-y: auto;
}

.items-list {
  max-height: 300px;
  overflow-y: auto;
  padding-right: 5px;
}

.items-list::-webkit-scrollbar {
  width: 4px;
}
.items-list::-webkit-scrollbar-thumb {
  background: #e2e8f0;
  border-radius: 10px;
}

.animate-fade-in {
  animation: fadeIn 0.4s ease-out;
}
.animate-slide-up {
  animation: slideUp 0.3s ease-out;
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
@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
</style>
