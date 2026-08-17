<script setup>
// Открывается на ТЕЛЕФОНЕ покупателя после скана QR с кассы самообслуживания.
// Гость без логина — никакого middleware/layout с CRM-навигацией.
definePageMeta({
  layout: false,
});

const route = useRoute();
const token = String(route.params.token || "");
const { getPayInfo, confirmPayment } = useSelfService();

const state = ref("loading"); // loading | ready | confirming | done | error
const info = ref(null);
const errorMessage = ref("");

const formatMoney = (v) =>
  Number(v || 0).toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

onMounted(async () => {
  try {
    info.value = await getPayInfo(token);
    state.value = info.value.status === "paid" ? "done" : "ready";
  } catch (e) {
    errorMessage.value = e?.data?.message || "Ссылка на оплату недействительна.";
    state.value = "error";
  }
});

async function confirm() {
  if (state.value !== "ready") return;
  state.value = "confirming";
  try {
    await confirmPayment(token);
    state.value = "done";
  } catch (e) {
    errorMessage.value = e?.data?.message || "Не удалось подтвердить оплату. Попробуйте ещё раз.";
    state.value = "error";
  }
}
</script>

<template>
  <div class="pay-screen">
    <div class="pay-card">
      <template v-if="state === 'loading'">
        <div class="pay-spinner"></div>
        <p>Загрузка...</p>
      </template>

      <template v-else-if="state === 'ready' || state === 'confirming'">
        <h1>Подтверждение оплаты</h1>
        <div class="pay-order">Заказ №{{ info?.order_number }}</div>
        <div class="pay-amount">{{ formatMoney(info?.amount) }} сом</div>
        <p class="pay-hint">
          Это временный демо-способ оплаты. Нажмите кнопку ниже, чтобы подтвердить,
          что вы оплатили покупку.
        </p>
        <button class="pay-confirm-btn" :disabled="state === 'confirming'" @click="confirm">
          <span v-if="state === 'confirming'">Подтверждаем...</span>
          <span v-else>Я ОПЛАТИЛ(А)</span>
        </button>
      </template>

      <template v-else-if="state === 'done'">
        <i class="bi bi-check-circle-fill pay-success-icon"></i>
        <h1>Оплата подтверждена</h1>
        <p>Вернитесь к кассе — чек уже печатается.</p>
      </template>

      <template v-else-if="state === 'error'">
        <i class="bi bi-x-circle-fill pay-error-icon"></i>
        <h1>Не получилось</h1>
        <p>{{ errorMessage }}</p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.pay-screen {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f1f5f9;
  font-family: "Inter", Arial, sans-serif;
  padding: 20px;
}
.pay-card {
  background: #fff;
  border-radius: 20px;
  padding: 36px 28px;
  text-align: center;
  max-width: 380px;
  width: 100%;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
}
.pay-card h1 { font-size: 1.35rem; font-weight: 800; margin-bottom: 14px; color: #0f172a; }
.pay-order { color: #64748b; margin-bottom: 6px; }
.pay-amount { font-size: 1.8rem; font-weight: 800; color: #0ea5e9; margin-bottom: 16px; }
.pay-hint { color: #64748b; font-size: 0.9rem; margin-bottom: 24px; }
.pay-confirm-btn {
  width: 100%;
  padding: 18px;
  border: none;
  border-radius: 14px;
  background: #0ea5e9;
  color: #fff;
  font-size: 1.1rem;
  font-weight: 800;
}
.pay-confirm-btn:disabled { background: #cbd5e1; }
.pay-success-icon { font-size: 3.5rem; color: #22c55e; margin-bottom: 10px; }
.pay-error-icon { font-size: 3.5rem; color: #ef4444; margin-bottom: 10px; }
</style>
