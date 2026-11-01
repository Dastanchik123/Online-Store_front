<script setup>
// Уведомления — ситуации, которые требуют ручного действия персонала:
// лишняя QR-оплата (вернуть наличными), минус по остатку, расхождение суммы
// оплаты, оплата по неизвестному платежу. См. App\Support\Alerts на бэкенде.
definePageMeta({
  layout: "admin",
  middleware: "permission",
  permission: "alerts.manage",
});

const { apiFetch } = useApi();
const ui = useUiStore();

const loading = ref(true);
const alerts = ref([]);
const openCount = ref(0);
const showResolved = ref(false);
const busyId = ref(null);

const TYPE_LABELS = {
  payment_needs_refund: { text: "Вернуть деньги", icon: "bi-cash-coin", cls: "text-danger" },
  payment_amount_mismatch: { text: "Сумма оплаты не совпала", icon: "bi-exclamation-diamond", cls: "text-danger" },
  payment_unknown: { text: "Неизвестная оплата", icon: "bi-question-diamond", cls: "text-danger" },
  negative_stock: { text: "Минус по остатку", icon: "bi-box-seam", cls: "text-warning" },
};

const typeOf = (alert) =>
  TYPE_LABELS[alert.type] || { text: alert.type, icon: "bi-bell", cls: "text-secondary" };

const fetchAlerts = async () => {
  loading.value = true;
  try {
    const res = await apiFetch(
      `/alerts?status=${showResolved.value ? "all" : "open"}&per_page=100`,
    );
    alerts.value = res.data || [];
    openCount.value = res.open_count ?? 0;
  } catch (e) {
    ui.addToast("Не удалось загрузить уведомления", "error");
  } finally {
    loading.value = false;
  }
};

const refundCash = async (alert) => {
  const confirmed = await ui.showConfirm(
    "Возврат наличными",
    `Подтвердите, что покупателю выдано ${alert.data?.amount} сом наличными из кассы. В бухгалтерии будет записан расход.`,
  );
  if (!confirmed) return;

  busyId.value = alert.id;
  try {
    await apiFetch(`/alerts/${alert.id}/refund-cash`, { method: "POST" });
    ui.addToast("Возврат оформлен", "success");
    await fetchAlerts();
  } catch (e) {
    ui.addToast(e?.data?.message || "Не удалось оформить возврат", "error");
  } finally {
    busyId.value = null;
  }
};

const resolve = async (alert) => {
  busyId.value = alert.id;
  try {
    await apiFetch(`/alerts/${alert.id}/resolve`, { method: "POST" });
    await fetchAlerts();
  } catch (e) {
    ui.addToast(e?.data?.message || "Не удалось закрыть уведомление", "error");
  } finally {
    busyId.value = null;
  }
};

const formatDate = (v) => (v ? new Date(v).toLocaleString("ru-RU") : "—");

watch(showResolved, fetchAlerts);
onMounted(fetchAlerts);
</script>

<template>
  <div class="p-4 animate-fade-in">
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
      <div>
        <h1 class="h3 fw-bold mb-1">
          Уведомления
          <span v-if="openCount > 0" class="badge bg-danger rounded-pill align-middle ms-1">{{ openCount }}</span>
        </h1>
        <p class="text-muted small mb-0">
          Ситуации, которые требуют вашего действия: возврат лишней оплаты,
          расхождения в учёте.
        </p>
      </div>
      <div class="form-check form-switch">
        <input id="showResolved" v-model="showResolved" class="form-check-input" type="checkbox" role="switch" />
        <label class="form-check-label small" for="showResolved">Показывать закрытые</label>
      </div>
    </div>

    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border text-primary" role="status"></div>
    </div>

    <div v-else-if="alerts.length === 0" class="card border-0 shadow-sm rounded-4 p-5 text-center text-muted">
      <i class="bi bi-check2-circle fs-1 text-success mb-2"></i>
      Открытых уведомлений нет
    </div>

    <div v-else class="d-flex flex-column gap-3">
      <div
        v-for="alert in alerts"
        :key="alert.id"
        class="card border-0 shadow-sm rounded-4 p-3"
        :class="{ 'opacity-75': alert.is_read }"
      >
        <div class="d-flex flex-wrap justify-content-between gap-3">
          <div class="d-flex gap-3">
            <i class="bi fs-3" :class="[typeOf(alert).icon, typeOf(alert).cls]"></i>
            <div>
              <div class="fw-bold">
                {{ typeOf(alert).text }}
                <span v-if="alert.data?.order_number" class="text-muted fw-normal small ms-1">
                  заказ #{{ alert.data.order_number }}
                </span>
              </div>
              <div class="small">{{ alert.message }}</div>
              <div class="x-small text-muted mt-1">{{ formatDate(alert.created_at) }}</div>
              <div v-if="alert.is_read" class="x-small text-success mt-1">
                Закрыт{{ alert.data?.resolved_by_name ? `: ${alert.data.resolved_by_name}` : "" }}
                {{ formatDate(alert.data?.resolved_at) }}
                <span v-if="alert.data?.refunded_cash">— выдано {{ alert.data.refunded_cash }} сом наличными</span>
              </div>
            </div>
          </div>

          <div v-if="!alert.is_read" class="d-flex align-items-start gap-2">
            <button
              v-if="alert.type === 'payment_needs_refund'"
              class="btn btn-sm btn-danger rounded-pill px-3"
              :disabled="busyId === alert.id"
              @click="refundCash(alert)"
            >
              <i class="bi bi-cash me-1"></i> Возврат выдан наличными
            </button>
            <button
              v-else
              class="btn btn-sm btn-outline-secondary rounded-pill px-3"
              :disabled="busyId === alert.id"
              @click="resolve(alert)"
            >
              <i class="bi bi-check2 me-1"></i> Отметить обработанным
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
