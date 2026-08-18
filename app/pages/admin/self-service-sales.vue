<script setup lang="ts">
// Структура страницы намеренно повторяет admin/pos-sales.vue — тот же
// принцип (отдельная страница на канал продаж), просто источник = self_service
// и вместо кассира показывается терминал кассы самообслуживания.
definePageMeta({
  layout: "admin",
  middleware: "staff",
});

const uiStore = useUiStore();
const { getOrders } = useOrders();

const orders = ref<any>({
  data: [],
  current_page: 1,
  last_page: 1,
  total: 0,
});
const isLoading = ref(false);
const selectedOrder = ref<any>(null);
const showModal = ref(false);

const filters = ref({
  source: "self_service",
  date_from: new Date().toLocaleDateString("en-CA"),
  date_to: new Date().toLocaleDateString("en-CA"),
  terminal_id: "",
  payment_status: "",
  per_page: 20,
  page: 1,
});

const toUtcDayBoundary = (dateStr: string, endOfDay: boolean) => {
  if (!dateStr) return undefined;
  const time = endOfDay ? "23:59:59.999" : "00:00:00.000";
  return new Date(`${dateStr}T${time}`).toISOString();
};

// Терминал сейчас не индексирован отдельным API-фильтром на бэкенде —
// список терминалов и фильтрация по нему делаются на клиенте, этого
// достаточно, пока self-service касс немного (см. §22 ТЗ: терминалы без
// отдельной таблицы управления на первом этапе)
const terminals = computed(() => {
  const set = new Set(orders.value.data.map((o: any) => o.terminal_id).filter(Boolean));
  return Array.from(set);
});
const visibleOrders = computed(() => {
  if (!filters.value.terminal_id) return orders.value.data;
  return orders.value.data.filter((o: any) => o.terminal_id === filters.value.terminal_id);
});

const totalRevenue = computed(() =>
  orders.value.data
    .filter((o: any) => o.payment_status === "paid")
    .reduce((sum: number, o: any) => sum + Number(o.total || 0), 0),
);
const paidCount = computed(
  () => orders.value.data.filter((o: any) => o.payment_status === "paid").length,
);

const fetchSales = async () => {
  isLoading.value = true;
  try {
    orders.value = await getOrders({
      ...filters.value,
      date_from: toUtcDayBoundary(filters.value.date_from, false),
      date_to: toUtcDayBoundary(filters.value.date_to, true),
      with_items: 1,
    } as any);
  } catch (error) {
    console.error(error);
    uiStore.error("Ошибка при загрузке self-service продаж");
  } finally {
    isLoading.value = false;
  }
};

const openDetails = (order: any) => {
  selectedOrder.value = order;
  showModal.value = true;
};

const formatPrice = (price: any) => parseFloat(price || 0).toLocaleString("ru-RU") + " сом";

const changePage = (page: number) => {
  if (page < 1 || page > orders.value.last_page) return;
  filters.value.page = page;
  fetchSales();
};

const paymentStatusLabel = (status: string) =>
  ({ paid: "Оплачено", pending: "Ожидает оплаты", failed: "Отменён/не оплачен", refunded: "Возврат" })[status] ||
  status;
const orderStatusLabel = (status: string) =>
  ({
    pending: "Ожидание",
    processing: "Обработка",
    shipped: "Отправлен",
    delivered: "Доставлен",
    cancelled: "Отменен",
    refunded: "Возврат",
    paid: "Оплачено",
  })[status] || status;
const paymentStatusClass = (status: string) =>
  ({
    paid: "bg-success-subtle text-success",
    pending: "bg-warning-subtle text-warning",
    failed: "bg-danger-subtle text-danger",
    refunded: "bg-secondary-subtle text-secondary",
  })[status] || "bg-light text-dark";

onMounted(fetchSales);
watch(() => filters.value.payment_status, () => { filters.value.page = 1; fetchSales(); });
</script>

<template>
  <div class="ss-sales-page p-4 animate-fade-in">
    <div class="d-flex justify-content-between align-items-center mb-4">
      <div>
        <h2 class="fw-bold mb-1">Касса самообслуживания</h2>
        <p class="text-muted mb-0">Заказы, оформленные покупателями через self-service</p>
      </div>
      <NuxtLink to="/self-service" target="_blank" class="btn btn-primary rounded-4 px-4 py-2 fw-bold shadow-sm">
        <i class="bi bi-box-arrow-up-right me-2"></i> Открыть кассу
      </NuxtLink>
    </div>

    <div class="row g-4 mb-5">
      <div class="col-md-4">
        <div class="card border-0 shadow-sm rounded-4 p-4 h-100 bg-dark text-white shadow">
          <div class="d-flex align-items-center mb-2 text-white-50">
            <div class="icon-box bg-white bg-opacity-25 text-white rounded-3 me-3 p-2">
              <i class="bi bi-wallet2 fs-4"></i>
            </div>
            <span class="fw-bold text-white opacity-75">Выручка (оплаченные)</span>
          </div>
          <h3 class="fw-bold mb-0 text-white">{{ formatPrice(totalRevenue) }}</h3>
          <small class="opacity-50">За выбранный период</small>
        </div>
      </div>
      <div class="col-md-4">
        <div class="card border-0 shadow-sm rounded-4 p-4 h-100 bg-white">
          <div class="d-flex align-items-center mb-2">
            <div class="icon-box bg-success-subtle text-success rounded-3 me-3 p-2">
              <i class="bi bi-check-circle fs-4"></i>
            </div>
            <span class="fw-bold text-muted">Оплаченных заказов</span>
          </div>
          <h3 class="fw-bold mb-0">{{ paidCount }}</h3>
          <small class="text-muted">из {{ orders.data.length }} на странице</small>
        </div>
      </div>
      <div class="col-md-4">
        <div class="card border-0 shadow-sm rounded-4 p-4 h-100 bg-white">
          <div class="d-flex align-items-center mb-2">
            <div class="icon-box bg-info-subtle text-info rounded-3 me-3 p-2">
              <i class="bi bi-shop-window fs-4"></i>
            </div>
            <span class="fw-bold text-muted">Терминалов активно</span>
          </div>
          <h3 class="fw-bold mb-0">{{ terminals.length }}</h3>
          <small class="text-muted">за выбранный период</small>
        </div>
      </div>
    </div>

    <div
      class="card border-0 shadow-sm rounded-4 overflow-hidden d-flex flex-column"
      style="min-height: calc(100vh - 400px); max-height: calc(100vh - 400px); background: #f8fafc;"
    >
      <div class="card-header bg-white p-4 border-0 shrink-0">
        <div class="row g-3">
          <div class="col-md-4">
            <h5 class="fw-bold mb-0">История заказов</h5>
          </div>
          <div class="col-md-8">
            <div class="d-flex gap-2 flex-wrap justify-content-md-end">
              <select v-model="filters.terminal_id" class="form-select form-select-sm rounded-3 shadow-sm" style="width: auto">
                <option value="">Все терминалы</option>
                <option v-for="t in terminals" :key="t" :value="t">{{ t }}</option>
              </select>
              <select v-model="filters.payment_status" class="form-select form-select-sm rounded-3 shadow-sm" style="width: auto">
                <option value="">Любой статус оплаты</option>
                <option value="paid">Оплачено</option>
                <option value="pending">Ожидает оплаты</option>
                <option value="failed">Отменён/не оплачен</option>
              </select>
              <input type="date" v-model="filters.date_from" @change="fetchSales" class="form-control form-control-sm rounded-3 shadow-sm" style="width: auto" />
              <input type="date" v-model="filters.date_to" @change="fetchSales" class="form-control form-control-sm rounded-3 shadow-sm" style="width: auto" />
            </div>
          </div>
        </div>
      </div>

      <div class="table-responsive grow overflow-auto custom-scrollbar" style="background: #f8fafc;">
        <table class="table table-hover align-middle mb-0">
          <thead class="bg-light">
            <tr>
              <th class="ps-4">№ Заказ</th>
              <th>Терминал</th>
              <th>Дата и время</th>
              <th class="text-end">Сумма</th>
              <th>Оплата</th>
              <th>Статус заказа</th>
              <th class="text-end pe-4">Действия</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="sale in visibleOrders" :key="sale.id">
              <td class="ps-4 fw-bold">#{{ sale.order_number }}</td>
              <td><span class="badge bg-light text-dark border">{{ sale.terminal_id || "—" }}</span></td>
              <td class="small">{{ new Date(sale.created_at).toLocaleString("ru-RU") }}</td>
              <td class="text-end fw-bold">{{ formatPrice(sale.total) }}</td>
              <td>
                <span class="badge rounded-pill px-3 py-1" :class="paymentStatusClass(sale.payment_status)">
                  {{ paymentStatusLabel(sale.payment_status) }}
                </span>
              </td>
              <td class="small text-muted">{{ orderStatusLabel(sale.status) }}</td>
              <td class="text-end pe-4">
                <button @click="openDetails(sale)" class="btn btn-sm btn-outline-primary rounded-pill px-3">
                  <i class="bi bi-info-circle me-1"></i> Детали
                </button>
              </td>
            </tr>
            <tr v-if="visibleOrders.length === 0 && !isLoading">
              <td colspan="7" class="text-center py-5 text-muted">Заказов за выбранный период не найдено</td>
            </tr>
            <tr v-if="isLoading">
              <td colspan="7" class="text-center py-5">
                <div class="spinner-border text-primary spinner-border-sm me-2"></div>
                Загрузка...
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="d-flex justify-content-between align-items-center p-4 border-top bg-light flex-shrink-0">
        <span class="text-muted small">Показано {{ orders.data.length }} из {{ orders.total }} записей</span>
        <nav v-if="orders.last_page > 1">
          <ul class="pagination pagination-sm mb-0 shadow-sm">
            <li class="page-item" :class="{ disabled: orders.current_page === 1 }">
              <button class="page-link border-0 rounded-start-3 px-3" @click="changePage(orders.current_page - 1)">
                <i class="bi bi-chevron-left"></i> Назад
              </button>
            </li>
            <li class="page-item disabled">
              <span class="page-link border-0 bg-white fw-bold px-3">{{ orders.current_page }} / {{ orders.last_page }}</span>
            </li>
            <li class="page-item" :class="{ disabled: orders.current_page === orders.last_page }">
              <button class="page-link border-0 rounded-end-3 px-3" @click="changePage(orders.current_page + 1)">
                Вперед <i class="bi bi-chevron-right"></i>
              </button>
            </li>
          </ul>
        </nav>
      </div>
    </div>

    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal-content shadow-lg rounded-4 overflow-hidden animate-slide-up">
        <div class="modal-header border-0 p-4 bg-light d-flex justify-content-between align-items-center">
          <div>
            <h5 class="fw-bold mb-0">Заказ №{{ selectedOrder.order_number }}</h5>
            <small class="text-muted">{{ new Date(selectedOrder.created_at).toLocaleString("ru-RU") }}</small>
          </div>
          <button @click="showModal = false" class="btn-close"></button>
        </div>
        <div class="modal-body p-4">
          <div class="staff-info mb-4 p-3 bg-light rounded-3 d-flex justify-content-between align-items-center">
            <div>
              <small class="text-muted d-block">Терминал</small>
              <span class="fw-bold">{{ selectedOrder.terminal_id || "—" }}</span>
            </div>
            <div class="text-end">
              <small class="text-muted d-block">Статус оплаты</small>
              <span class="badge rounded-pill px-3" :class="paymentStatusClass(selectedOrder.payment_status)">
                {{ paymentStatusLabel(selectedOrder.payment_status) }}
              </span>
            </div>
          </div>

          <p class="fw-bold mb-3">Состав заказа:</p>
          <div class="items-list mb-4">
            <div
              v-for="item in selectedOrder.items"
              :key="item.id"
              class="d-flex justify-content-between align-items-center py-2 border-bottom border-light"
            >
              <div class="flex-grow-1">
                <div class="fw-bold small">{{ item.product_name }}</div>
                <small class="text-muted">{{ item.quantity }} x {{ formatPrice(item.price) }}</small>
              </div>
              <div class="fw-bold text-end">{{ formatPrice(item.total) }}</div>
            </div>
          </div>

          <div class="summary-box p-3 bg-dark text-white rounded-3">
            <div class="d-flex justify-content-between border-top border-white border-opacity-25 pt-2 fw-bold fs-5">
              <span>ИТОГО:</span>
              <span>{{ formatPrice(selectedOrder.total) }}</span>
            </div>
          </div>
        </div>
        <div class="modal-footer border-0 p-4 text-center">
          <button @click="showModal = false" class="btn btn-light rounded-pill px-5">Закрыть</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ss-sales-page { background: #f8fafc; min-height: 100vh; }
.icon-box { width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; }

.modal-overlay {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px);
  z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px; overflow-y: auto;
}
.modal-content { background: white; width: 100%; max-width: 650px; max-height: 90vh; display: flex; flex-direction: column; }
.modal-body { overflow-y: auto; }
.items-list { max-height: 300px; overflow-y: auto; padding-right: 5px; }
.items-list::-webkit-scrollbar { width: 4px; }
.items-list::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }

.animate-fade-in { animation: fadeIn 0.4s ease-out; }
.animate-slide-up { animation: slideUp 0.3s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }

.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
</style>
