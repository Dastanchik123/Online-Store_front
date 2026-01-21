<script setup>
const props = defineProps({
  show: Boolean,
});
const emit = defineEmits(["close"]);

const { getReturns, getReturnsSummary } = useAccounting();
const ui = useUiStore();

const returns = ref([]);
const summary = ref({
  total_refunded: 0,
  returns_count: 0,
});
const isLoading = ref(false);
const searchQuery = ref("");
const dateFrom = ref("");
const dateTo = ref("");
const currentPage = ref(1);
const totalPages = ref(1);

const selectedOrder = ref(null);
const isOrderModalOpen = ref(false);

const openOrderDetails = (order) => {
  selectedOrder.value = order;
  isOrderModalOpen.value = true;
};

const fetchReturns = async () => {
  isLoading.value = true;
  try {
    const params = {
      page: currentPage.value,
      search: searchQuery.value,
      date_from: dateFrom.value,
      date_to: dateTo.value,
    };
    const response = await getReturns(params);
    returns.value = response.data;
    totalPages.value = response.last_page;

    const summaryResponse = await getReturnsSummary(params);
    summary.value = summaryResponse;
  } catch (e) {
    ui.addToast("Ошибка при загрузке возвратов", "error");
  } finally {
    isLoading.value = false;
  }
};

const handleSearch = () => {
  currentPage.value = 1;
  fetchReturns();
};

const formatPrice = (price) => {
  return new Intl.NumberFormat("ru-RU").format(price) + " сом";
};

const formatDate = (date) => {
  return new Date(date).toLocaleString("ru-RU");
};

const getReturnedItems = (order) => {
  if (!order || !order.items) return [];
  return order.items.filter((item) => item.refunded_quantity > 0);
};

watch(
  () => props.show,
  (newVal) => {
    if (newVal) {
      fetchReturns();
    }
  }
);
</script>

<template>
  <UiBaseModal
    :show="show"
    title="История возвратов"
    size="xl"
    @close="emit('close')"
  >
    <div class="p-3">
      
      <div class="row g-3 mb-4">
        <div class="col-md-6">
          <div class="bg-danger-subtle p-3 rounded-4 d-flex align-items-center">
            <div class="icon-box bg-white text-danger rounded-3 me-3">
              <i class="bi bi-arrow-counterclockwise fs-4"></i>
            </div>
            <div>
              <div class="text-danger small fw-bold">ОБЩАЯ СУММА ВОЗВРАТОВ</div>
              <div class="h4 fw-bold mb-0 text-danger">
                {{ formatPrice(summary.total_refunded) }}
              </div>
            </div>
          </div>
        </div>
        <div class="col-md-6">
          <div class="bg-light p-3 rounded-4 d-flex align-items-center">
            <div class="icon-box bg-white text-muted rounded-3 me-3">
              <i class="bi bi-hash fs-4"></i>
            </div>
            <div>
              <div class="text-muted small fw-bold">КОЛИЧЕСТВО ВОЗВРАТОВ</div>
              <div class="h4 fw-bold mb-0">{{ summary.returns_count }}</div>
            </div>
          </div>
        </div>
      </div>

      
      <div class="row g-2 mb-3">
        <div class="col-md-5">
          <input
            v-model="searchQuery"
            type="text"
            class="form-control"
            placeholder="Поиск по номеру заказа или описанию..."
            @input="handleSearch"
          />
        </div>
        <div class="col-md-3">
          <input
            v-model="dateFrom"
            type="date"
            class="form-control"
            @change="handleSearch"
          />
        </div>
        <div class="col-md-3">
          <input
            v-model="dateTo"
            type="date"
            class="form-control"
            @change="handleSearch"
          />
        </div>
        <div class="col-md-1">
          <button class="btn btn-outline-secondary w-100" @click="fetchReturns">
            <i class="bi bi-arrow-clockwise"></i>
          </button>
        </div>
      </div>

      
      <div class="table-responsive rounded-3 border">
        <table class="table table-hover align-middle mb-0">
          <thead class="bg-light">
            <tr>
              <th class="ps-3">Дата</th>
              <th>Сумма</th>
              <th>Сотрудник</th>
              <th>Заказ</th>
              <th>Товары</th>
              <th class="pe-3 text-end">Действия</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="isLoading" v-for="i in 3" :key="'loader-' + i">
              <td colspan="6" class="py-4 text-center">
                <div
                  class="spinner-border spinner-border-sm text-primary"
                ></div>
              </td>
            </tr>
            <tr v-else-if="returns.length === 0">
              <td colspan="6" class="py-5 text-center text-muted">
                Возвратов не найдено
              </td>
            </tr>
            <tr v-for="ret in returns" :key="ret.id" class="small">
              <td class="ps-3">
                <div class="fw-bold">
                  {{ formatDate(ret.created_at).split(",")[0] }}
                </div>
                <div class="text-muted x-small">
                  {{ formatDate(ret.created_at).split(",")[1] }}
                </div>
              </td>
              <td>
                <span class="text-danger fw-bold"
                  >-{{ formatPrice(ret.amount) }}</span
                >
              </td>
              <td>{{ ret.user?.name || "Система" }}</td>
              <td>
                <span v-if="ret.trackable" class="fw-bold"
                  >#{{ ret.trackable.order_number }}</span
                >
                <span v-else class="text-muted">-</span>
              </td>
              <td style="max-width: 300px">
                <div v-if="ret.trackable">
                  <div
                    v-for="item in getReturnedItems(ret.trackable)"
                    :key="item.id"
                    class="x-small mb-1 d-flex justify-content-between"
                  >
                    <span>{{ item.product?.name || item.product_name }}</span>
                    <span class="badge bg-danger ms-2"
                      >{{ item.refunded_quantity }} шт.</span
                    >
                  </div>
                </div>
              </td>
              <td class="pe-3 text-end">
                <button
                  v-if="ret.trackable"
                  class="btn btn-sm btn-light rounded-pill px-3"
                  @click="openOrderDetails(ret.trackable)"
                >
                  Подробнее
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      
      <div
        class="d-flex justify-content-between align-items-center mt-3"
        v-if="totalPages > 1"
      >
        <span class="small text-muted"
          >Страница {{ currentPage }} из {{ totalPages }}</span
        >
        <div class="btn-group btn-group-sm">
          <button
            class="btn btn-outline-primary"
            :disabled="currentPage === 1"
            @click="
              currentPage--;
              fetchReturns();
            "
          >
            Назад
          </button>
          <button
            class="btn btn-outline-primary"
            :disabled="currentPage === totalPages"
            @click="
              currentPage++;
              fetchReturns();
            "
          >
            Вперед
          </button>
        </div>
      </div>
    </div>

    
    <AdminOrderDetailsModal
      :show="isOrderModalOpen"
      :order="selectedOrder"
      :readOnly="true"
      @close="isOrderModalOpen = false"
      @updated="fetchReturns"
    />
  </UiBaseModal>
</template>

<style scoped>
.icon-box {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.x-small {
  font-size: 0.65rem;
}
</style>
