<script setup>
// Электронная копия чека — открывается по QR с бумажного чека.
// Данные только по uuid заказа (см. ReceiptController), без личных данных.
const route = useRoute();
const { apiFetch } = useApi();

useHead({
  title: "Электронный чек",
  meta: [{ name: "robots", content: "noindex, nofollow" }],
});

const { data: receipt, pending, error } = await useAsyncData(
  `receipt-${route.params.uuid}`,
  () => apiFetch(`/receipts/${route.params.uuid}`),
);

const money = (value) =>
  Number(value || 0).toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const qty = (value) => Number(value || 0).toLocaleString("ru-RU", { maximumFractionDigits: 3 });

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

const PAYMENT_LABELS = {
  cash: "Наличные",
  qr: "QR-оплата",
  mixed: "Наличные + QR",
  mbank: "MBank",
  card: "Карта",
};

const STATUS_LABELS = {
  pending: { text: "Ожидает оплаты", cls: "bg-warning-subtle text-warning-emphasis" },
  cancelled: { text: "Отменён", cls: "bg-danger-subtle text-danger-emphasis" },
  refunded: { text: "Возвращён", cls: "bg-secondary-subtle text-secondary-emphasis" },
};

const statusBadge = computed(() => {
  const r = receipt.value;
  if (!r) return null;
  if (STATUS_LABELS[r.status]) return STATUS_LABELS[r.status];
  if (r.payment_status === "paid") return { text: "Оплачен", cls: "bg-success-subtle text-success-emphasis" };
  return null;
});

const currency = computed(() => {
  const c = receipt.value?.currency;
  return !c || ["KGS", "SOM"].includes(String(c).toUpperCase()) ? "сом" : c;
});

const printReceipt = () => window.print();
</script>

<template>
  <div class="container py-4 receipt-page">
    <div v-if="pending" class="text-center py-5">
      <div class="spinner-border text-primary" role="status"></div>
    </div>

    <div v-else-if="error || !receipt" class="text-center py-5">
      <i class="bi bi-receipt-cutoff display-4 text-muted"></i>
      <h1 class="h5 fw-bold mt-3">Чек не найден</h1>
      <p class="text-muted small mb-0">
        Проверьте, что QR отсканирован полностью, или обратитесь в магазин.
      </p>
    </div>

    <div v-else class="receipt-card card border-0 shadow-sm rounded-4 mx-auto">
      <div class="card-body p-4">
        <div class="text-center mb-3">
          <div class="h5 fw-bold mb-1">{{ receipt.shop.name || "Магазин" }}</div>
          <div class="small text-muted">
            <div v-if="receipt.shop.inn">ИНН: {{ receipt.shop.inn }}</div>
            <div v-if="receipt.shop.address">{{ receipt.shop.address }}</div>
            <div v-if="receipt.shop.phone">{{ receipt.shop.phone }}</div>
          </div>
        </div>

        <div class="d-flex justify-content-between align-items-start border-top border-bottom py-2 mb-3">
          <div>
            <div class="fw-bold">Чек № {{ receipt.order_number }}</div>
            <div class="small text-muted">{{ formatDate(receipt.created_at) }}</div>
          </div>
          <span v-if="statusBadge" class="badge rounded-pill" :class="statusBadge.cls">
            {{ statusBadge.text }}
          </span>
        </div>

        <table class="table table-sm align-middle mb-3">
          <thead>
            <tr class="small text-muted text-nowrap">
              <th class="fw-semibold">Товар</th>
              <th class="fw-semibold text-end">Кол-во</th>
              <th class="fw-semibold text-end">Цена</th>
              <th class="fw-semibold text-end">Сумма</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, i) in receipt.items" :key="i">
              <td>
                {{ item.name }}
                <div v-if="item.refunded_quantity > 0" class="small text-danger">
                  Возвращено: {{ qty(item.refunded_quantity) }} {{ item.unit }}
                </div>
              </td>
              <td class="text-end text-nowrap">{{ qty(item.quantity) }} {{ item.unit }}</td>
              <td class="text-end text-nowrap">{{ money(item.price) }}</td>
              <td class="text-end text-nowrap fw-semibold">{{ money(item.total) }}</td>
            </tr>
          </tbody>
        </table>

        <div class="small">
          <div v-if="receipt.discount > 0" class="d-flex justify-content-between">
            <span class="text-muted">Сумма без скидки</span>
            <span>{{ money(receipt.subtotal) }} {{ currency }}</span>
          </div>
          <div v-if="receipt.discount > 0" class="d-flex justify-content-between">
            <span class="text-muted">Скидка</span>
            <span>−{{ money(receipt.discount) }} {{ currency }}</span>
          </div>
        </div>
        <div class="d-flex justify-content-between align-items-baseline fw-bold fs-4 mt-2">
          <span>Итого</span>
          <span>{{ money(receipt.total) }} {{ currency }}</span>
        </div>
        <div v-if="receipt.refunded_total > 0" class="d-flex justify-content-between small text-danger">
          <span>Возвращено покупателю</span>
          <span>−{{ money(receipt.refunded_total) }} {{ currency }}</span>
        </div>
        <div v-if="PAYMENT_LABELS[receipt.payment_method]" class="small text-muted mt-1">
          Оплата: {{ PAYMENT_LABELS[receipt.payment_method] }}
        </div>

        <div v-if="receipt.shop.footer" class="text-center small text-muted mt-4 footer-text">
          {{ receipt.shop.footer }}
        </div>

        <div class="text-center mt-4 d-print-none">
          <button class="btn btn-outline-primary rounded-pill px-4" @click="printReceipt">
            <i class="bi bi-printer me-2"></i>Распечатать / сохранить
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.receipt-card {
  max-width: 480px;
}
.footer-text {
  white-space: pre-line;
}
@media print {
  .receipt-card {
    box-shadow: none !important;
  }
}
</style>
