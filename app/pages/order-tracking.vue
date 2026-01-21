<script setup>
const { trackOrder } = useOrders();
const ui = useUiStore();

const orderNumber = ref("");
const order = ref(null);
const loading = ref(false);
const searched = ref(false);

const track = async () => {
  if (!orderNumber.value) return;

  loading.value = true;
  searched.value = true;
  order.value = null;

  try {
    order.value = await trackOrder(orderNumber.value);
  } catch (e) {
    ui.addToast("Заказ не найден. Проверьте номер.", "warning");
  } finally {
    loading.value = false;
  }
};

const getStatusLabel = (status) => {
  const map = {
    pending: "В обработке",
    processing: "Собирается",
    shipped: "Отправлен",
    delivered: "Доставлен",
    cancelled: "Отменен",
    completed: "Выполнен",
  };
  return map[status] || status;
};

const getStatusStep = (status) => {
  const steps = ["pending", "processing", "shipped", "delivered", "completed"];
  return steps.indexOf(status) + 1;
};
</script>

<template>
  <div class="container py-5 min-vh-100">
    <div class="row justify-content-center">
      <div class="col-lg-6">
        <div class="text-center mb-5">
          <h1 class="fw-bold mb-3">Где мой заказ? 📦</h1>
          <p class="text-muted">
            Введите номер вашего заказа, чтобы узнать его статус и
            местоположение.
          </p>
        </div>

        <div class="card border-0 shadow-lg rounded-4 p-4 mb-5">
          <div class="input-group input-group-lg">
            <input
              v-model="orderNumber"
              type="text"
              class="form-control rounded-start-4 border-end-0 bg-light"
              placeholder="Введите номер (например, ORD-...)"
              @keyup.enter="track"
            />
            <button
              class="btn btn-primary rounded-end-4 px-4"
              @click="track"
              :disabled="loading"
            >
              <span
                v-if="loading"
                class="spinner-border spinner-border-sm"
              ></span>
              <i v-else class="bi bi-search"></i>
            </button>
          </div>
        </div>

        <div v-if="loading" class="text-center py-5">
          <div class="spinner-border text-primary" role="status"></div>
        </div>

        <div v-else-if="order" class="animate-fade-in">
          <div class="card border-0 shadow-sm rounded-4 p-4">
            <div class="d-flex justify-content-between align-items-center mb-4">
              <h5 class="fw-bold mb-0">Заказ #{{ order.order_number }}</h5>
              <span
                class="badge bg-primary-subtle text-primary rounded-pill px-3 py-2"
                >{{ getStatusLabel(order.status) }}</span
              >
            </div>

            
            <div
              class="status-stepper d-flex justify-content-between position-relative mb-5 mt-4"
            >
              <div class="progress-line"></div>
              <div
                v-for="step in 4"
                :key="step"
                class="step-point"
                :class="{ active: getStatusStep(order.status) >= step }"
              >
                <div class="point-circle"></div>
                <div class="point-label small text-muted mt-2">
                  {{ ["Принят", "Сборка", "В пути", "У вас"][step - 1] }}
                </div>
              </div>
            </div>

            <div class="alert alert-light border-0 rounded-4 p-3 small mb-4">
              <div class="row">
                <div class="col-6 mb-2">
                  <div class="text-muted">Дата заказа:</div>
                  <div class="fw-bold">
                    {{ new Date(order.created_at).toLocaleDateString() }}
                  </div>
                </div>
                <div class="col-6 mb-2">
                  <div class="text-muted">Сумма:</div>
                  <div class="fw-bold">{{ order.total }} сом</div>
                </div>
                <div class="col-12">
                  <div class="text-muted">Адрес доставки:</div>
                  <div class="fw-bold">
                    {{ order.shipping_address?.address || "Самовывоз" }}
                  </div>
                </div>
              </div>
            </div>

            <NuxtLink
              :to="`/orders/${order.id}`"
              class="btn btn-outline-primary w-100 rounded-pill py-2 fw-bold"
              >Полная информация</NuxtLink
            >
          </div>
        </div>

        <div v-else-if="searched && !loading" class="text-center py-5">
          <i class="bi bi-search-heart display-1 text-muted opacity-25"></i>
          <p class="mt-3 fs-5">
            Мы не смогли найти этот заказ. Убедитесь, что номер верный.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.status-stepper {
  padding: 0 20px;
}
.progress-line {
  position: absolute;
  top: 6px;
  left: 30px;
  right: 30px;
  height: 2px;
  background: #e2e8f0;
  z-index: 1;
}
.step-point {
  position: relative;
  z-index: 2;
  text-align: center;
}
.point-circle {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #cbd5e1;
  margin: 0 auto;
  border: 3px solid #fff;
  box-shadow: 0 0 0 2px #cbd5e1;
  transition: all 0.3s ease;
}
.step-point.active .point-circle {
  background: #3b82f6;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.2), 0 0 0 2px #3b82f6;
}
.step-point.active .point-label {
  color: #3b82f6 !important;
  font-weight: bold;
}
</style>
