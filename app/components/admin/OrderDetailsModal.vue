<script setup>
const props = defineProps({
  show: Boolean,
  order: Object,
  readOnly: { type: Boolean, default: false },
});
const emit = defineEmits(["close", "updated"]);

const uiStore = useUiStore();
const { updateOrder, downloadOrderThermalReceipt } = useOrders();

const isUpdating = ref(false);
const localOrder = ref(null);

watch(
  () => props.order,
  (newOrder) => {
    if (newOrder) {
      localOrder.value = JSON.parse(JSON.stringify(newOrder));
    }
  },
  { immediate: true }
);

const updateOrderStatus = async () => {
  isUpdating.value = true;
  try {
    await updateOrder(localOrder.value.id, {
      status: localOrder.value.status,
      payment_status: localOrder.value.payment_status,
      payment_method: localOrder.value.payment_method,
    });
    uiStore.success("Статус заказа успешно обновлен");
    emit("updated");
    emit("close");
  } catch (error) {
    console.error(error);
    uiStore.error("Ошибка при обновлении статуса");
  } finally {
    isUpdating.value = false;
  }
};

const formatPrice = (price) => {
  if (price === null || price === undefined) return "0 сом";
  return parseFloat(price).toLocaleString("ru-RU") + " сом";
};

const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("ru-RU");
};

const isOverdue = (dueDate) => {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
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
  const texts = { paid: "Оплачено", pending: "Ожидает", failed: "Ошибка" };
  return texts[status] || status;
};

const getPaymentMethodText = (method) => {
  const texts = {
    cash: "Оплата при получении",
    transfer: "Перевод/MBank",
    card: "Картой",
  };
  return texts[method] || method || "Не указан";
};
</script>

<template>
  <UiBaseModal
    v-if="localOrder"
    :show="show"
    :title="
      readOnly
        ? 'Просмотр возврата по чеку #' + localOrder.order_number
        : 'Детали заказа ' + localOrder.order_number
    "
    size="lg"
    @close="emit('close')"
  >
    <div class="modal-body-scrollable p-3">
      <div class="row g-4 mb-4" v-if="!readOnly">
        <div class="col-md-6">
          <div class="status-edit-card p-3 rounded-4 border bg-light h-100">
            <label class="form-label text-muted small fw-bold mb-2"
              >СТАТУС ЗАКАЗА</label
            >
            <select
              v-model="localOrder.status"
              class="form-select border-0 shadow-sm rounded-3 mb-2"
            >
              <option value="pending">⏳ Ожидает</option>
              <option value="processing">🛠️ В обработке</option>
              <option value="shipped">🚚 Отправлен</option>
              <option value="delivered">✅ Доставлен</option>
              <option value="cancelled">❌ Отменен</option>
              <option value="refunded">↩️ Возврат</option>
            </select>
          </div>
        </div>
        <div class="col-md-6">
          <div class="status-edit-card p-3 rounded-4 border bg-light h-100">
            <label class="form-label text-muted small fw-bold mb-2"
              >ОПЛАТА</label
            >
            <select
              v-model="localOrder.payment_status"
              class="form-select border-0 shadow-sm rounded-3 mb-3"
            >
              <option value="pending">⏳ Ожидает</option>
              <option value="paid">✅ Оплачено</option>
              <option value="failed">❌ Ошибка</option>
            </select>
            <label class="form-label text-muted small fw-bold mb-2"
              >МЕТОД</label
            >
            <select
              v-model="localOrder.payment_method"
              class="form-select border-0 shadow-sm rounded-3"
            >
              <option :value="null">Не указан</option>
              <option value="cash">Наличные / Терминал</option>
              <option value="transfer">Перевод MBank</option>
            </select>
          </div>
        </div>
      </div>

      <div
        class="alert alert-danger rounded-4 d-flex align-items-center mb-4"
        v-else
      >
        <i class="bi bi-arrow-counterclockwise fs-4 me-3"></i>
        <div>
          <div class="fw-bold">Это запись о возврате денежных средств</div>
          <div class="small">
            Инвентарь был автоматически возвращен на склад.
          </div>
        </div>
      </div>

      
      <div
        class="luxury-card-inner mb-4 overflow-hidden rounded-4 border bg-white"
      >
        <div
          class="p-3 bg-light border-bottom d-flex justify-content-between align-items-center"
        >
          <h6 class="fw-bold mb-0">Состав заказа</h6>
          <span class="badge bg-primary-subtle text-primary rounded-pill px-3"
            >{{ localOrder.items?.length }} поз.</span
          >
        </div>
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <thead class="bg-light small">
              <tr>
                <th class="ps-3 py-2">Товар</th>
                <th class="text-center">Куплено</th>
                <th class="text-center text-danger">Возврат</th>
                <th class="text-end pe-3">Сумма</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in localOrder.items" :key="item.id">
                <td class="ps-3 py-2">
                  <div class="small fw-bold">{{ item.product_name }}</div>
                  <div class="text-muted x-small">
                    {{ formatPrice(item.price) }} / шт.
                  </div>
                </td>
                <td class="text-center small">{{ item.quantity }}</td>
                <td class="text-center small">
                  <span
                    v-if="item.refunded_quantity > 0"
                    class="badge bg-danger rounded-pill"
                    >-{{ item.refunded_quantity }}</span
                  >
                  <span v-else class="text-muted">-</span>
                </td>
                <td class="text-end pe-3 small fw-bold">
                  {{ formatPrice(item.total) }}
                </td>
              </tr>
            </tbody>
            <tfoot class="bg-light fw-bold">
              <tr>
                <td colspan="3" class="text-end py-2">ИТОГО ПО ЧЕКУ:</td>
                <td class="text-end pe-3 py-2 text-primary">
                  {{ formatPrice(localOrder.total) }}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      
      <div class="row g-3">
        <div class="col-md-6" v-if="localOrder.shipping_address">
          <div class="p-3 border rounded-4 bg-white h-100">
            <h6 class="small fw-bold text-muted mb-2 uppercase">ДОСТАВКА</h6>
            <div class="fw-bold">
              {{ localOrder.shipping_address.first_name }}
              {{ localOrder.shipping_address.last_name }}
            </div>
            <div class="small text-muted mb-1">
              {{ localOrder.shipping_address.address_line_1 }}
            </div>
            <div class="small text-primary fw-bold">
              {{ localOrder.shipping_address.phone }}
            </div>
          </div>
        </div>
        <div class="col-md-6">
          <div class="p-3 border rounded-4 bg-white h-100">
            <h6 class="small fw-bold text-muted mb-2 uppercase">КОММЕНТАРИЙ</h6>
            <div class="small text-muted">
              {{ localOrder.notes || "Комментариев нет" }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="d-flex justify-content-between w-100">
        <button
          class="btn btn-outline-secondary rounded-pill px-4"
          @click="downloadOrderThermalReceipt(localOrder.id)"
        >
          <i class="bi bi-printer me-2"></i>Печать чека
        </button>
        <div class="d-flex gap-2">
          <button
            class="btn btn-light rounded-pill px-4"
            @click="emit('close')"
          >
            Закрыть
          </button>
          <button
            v-if="!readOnly"
            class="btn btn-primary rounded-pill px-4 fw-bold"
            :disabled="isUpdating"
            @click="updateOrderStatus"
          >
            {{ isUpdating ? "Сохранение..." : "Сохранить" }}
          </button>
        </div>
      </div>
    </template>
  </UiBaseModal>
</template>

<style scoped>
.x-small {
  font-size: 0.65rem;
}
.uppercase {
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
</style>
