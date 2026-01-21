<script setup>
definePageMeta({
  layout: "admin",
  middleware: "admin",
});

const { getDashboardStats } = useAccounting();
const { getCategoryLabel } = useFinance();

const periods = [
  { label: "Сегодня", value: "today" },
  { label: "Неделя", value: "week" },
  { label: "Месяц", value: "month" },
  { label: "Год", value: "year" },
];
const activePeriod = ref("month");
const loading = ref(true);
const data = ref(null);

const filters = ref({
  date_from: "",
  date_to: "",
});

const stats = computed(() => {
  if (!data.value?.summary) return [];

  const s = data.value.summary;
  return [
    {
      title: "Общая выручка",
      value: s.total_revenue,
      trend: "+12%",
      trendDir: "up",
      icon: "bi-cash-stack",
      color: "primary",
    },
    {
      title: "Выручка (без долгов)",
      value: s.paid_revenue,
      trend: "Оплачено",
      trendDir: "up",
      icon: "bi-wallet-fill",
      color: "info",
    },
    {
      title: "Валовая прибыль",
      value: s.gross_profit,
      trend: "+8%",
      trendDir: "up",
      icon: "bi-graph-up-arrow",
      color: "success",
    },
    {
      title: "Расходы и возвраты",
      value: s.expenses,
      trend: "-5%",
      trendDir: "down",
      icon: "bi-cash-dash",
      color: "danger",
    },
    {
      title: "Чистая прибыль",
      value: s.net_profit,
      trend: "+15%",
      trendDir: "up",
      icon: "bi-wallet2",
      color: "warning",
    },
  ];
});

const fetchStats = async () => {
  loading.value = true;
  try {
    const params = {};
    if (filters.value.date_from || filters.value.date_to) {
      params.date_from = filters.value.date_from;
      params.date_to = filters.value.date_to;
    } else {
      params.period = activePeriod.value;
    }
    data.value = await getDashboardStats(params);
  } catch (e) {
    console.error("Failed to load analytics", e);
  } finally {
    loading.value = false;
  }
};

const handlePeriodChange = (p) => {
  filters.value.date_from = "";
  filters.value.date_to = "";
  activePeriod.value = p;
  fetchStats();
};

const handleDateChange = () => {
  activePeriod.value = null;
  fetchStats();
};

const formatPrice = (price) => {
  return parseFloat(price || 0).toLocaleString("ru-RU") + " сом";
};

const formatNumber = (num) => {
  return parseFloat(num || 0).toLocaleString("ru-RU");
};

const getPriorityClass = (priority) => {
  switch (priority) {
    case "critical":
      return "bg-danger text-white";
    case "high":
      return "bg-warning text-dark";
    default:
      return "bg-info text-white";
  }
};

onMounted(fetchStats);
</script>

<template>
  <div class="analytics-dashboard p-4 animate-fade-in">
    
    <div
      class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-5"
    >
      <div>
        <h1 class="h3 fw-black mb-1">Бизнес-аналитика</h1>
        <p class="text-muted small mb-0">
          Комплексный отчет по продажам и финансам
        </p>
      </div>

      <div class="d-flex flex-wrap gap-3 align-items-center">
        
        <div
          class="d-flex align-items-center gap-2 bg-white p-2 px-3 rounded-pill shadow-sm"
        >
          <div class="d-flex align-items-center gap-2">
            <span class="text-muted small fw-bold">ОТ:</span>
            <input
              v-model="filters.date_from"
              type="date"
              @change="handleDateChange"
              class="form-control form-control-sm border-0 bg-light rounded-pill px-3"
              style="width: 140px"
            />
          </div>
          <div class="d-flex align-items-center gap-2 ms-2">
            <span class="text-muted small fw-bold">ДО:</span>
            <input
              v-model="filters.date_to"
              type="date"
              @change="handleDateChange"
              class="form-control form-control-sm border-0 bg-light rounded-pill px-3"
              style="width: 140px"
            />
          </div>
        </div>

        
        <div class="d-flex gap-2 bg-white p-1 rounded-pill shadow-sm">
          <button
            v-for="p in periods"
            :key="p.value"
            @click="handlePeriodChange(p.value)"
            class="btn btn-sm px-3 rounded-pill transition-all"
            :class="
              activePeriod === p.value ? 'btn-primary shadow-sm' : 'btn-light'
            "
          >
            {{ p.label }}
          </button>
        </div>
      </div>
    </div>

    
    <div v-if="data?.alerts?.length" class="alerts-section mb-5">
      <div
        v-for="(alert, idx) in data.alerts"
        :key="idx"
        class="alert-banner d-flex align-items-center p-3 mb-2 rounded-4 shadow-sm border-start border-4 border-warning"
        style="background: white"
      >
        <div
          class="alert-icon rounded-circle me-3 d-flex align-items-center justify-content-center bg-warning text-dark"
          style="width: 40px; height: 40px"
        >
          <i class="bi-box-seam"></i>
        </div>
        <div class="flex-grow-1">
          <div class="fw-bold small">{{ alert.message }}</div>
          <div class="text-muted x-small">Требуется ваше внимание</div>
        </div>
        <NuxtLink
          :to="`/admin/products`"
          class="btn btn-sm btn-light rounded-pill"
          >Перейти</NuxtLink
        >
      </div>
    </div>

    
    <div class="row g-4 mb-5">
      <div v-for="(s, idx) in stats" :key="idx" class="col-xl col-md-6">
        <div
          class="card border-0 shadow-sm rounded-4 p-4 kpi-card overflow-hidden h-100"
        >
          <div class="kpi-bg-icon">
            <i :class="['bi', s.icon]"></i>
          </div>
          <div class="position-relative">
            <div class="d-flex justify-content-between mb-3">
              <div
                :class="`text-${s.color} bg-${s.color}-subtle rounded-3 p-2`"
                style="line-height: 1"
              >
                <i :class="['bi', s.icon, 'fs-4']"></i>
              </div>
            </div>
            <p class="text-muted small fw-bold text-uppercase ls-1 mb-1">
              {{ s.title }}
            </p>
            <h2 class="fw-black mb-0">
              <UiCountUp :value="s.value" suffix=" сом" />
            </h2>
          </div>
        </div>
      </div>
    </div>

    <div v-if="loading && !data" class="py-5 text-center">
      <div class="spinner-border text-primary" role="status"></div>
      <p class="mt-3 text-muted">Собираем данные...</p>
    </div>

    <div v-else-if="data" class="row g-4">
      
      <div class="col-lg-8">
        
        <div class="card border-0 shadow-sm rounded-4 p-4 mb-4">
          <h5 class="fw-bold mb-4">Выручка по дням</h5>
          <div class="chart-wrapper" style="height: 350px">
            <svg
              viewBox="0 0 800 300"
              class="w-100 h-100"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stop-color="var(--bs-primary)"
                    stop-opacity="0.2"
                  />
                  <stop
                    offset="100%"
                    stop-color="var(--bs-primary)"
                    stop-opacity="0"
                  />
                </linearGradient>
              </defs>
              <path
                v-if="data.chart_data?.length > 1"
                :d="`M 0,300 ${data.chart_data
                  .map(
                    (d, i) =>
                      `L ${i * (800 / (data.chart_data.length - 1))},${
                        300 -
                        (d.total /
                          (Math.max(...data.chart_data.map((x) => x.total)) ||
                            1)) *
                          250
                      }`
                  )
                  .join(' ')} L 800,300 Z`"
                fill="url(#chartGrad)"
              />
              <path
                v-if="data.chart_data?.length > 1"
                :d="`M 0,${
                  300 -
                  (data.chart_data[0].total /
                    (Math.max(...data.chart_data.map((x) => x.total)) || 1)) *
                    250
                } ${data.chart_data
                  .map(
                    (d, i) =>
                      `L ${i * (800 / (data.chart_data.length - 1))},${
                        300 -
                        (d.total /
                          (Math.max(...data.chart_data.map((x) => x.total)) ||
                            1)) *
                          250
                      }`
                  )
                  .join(' ')}`"
                fill="none"
                stroke="var(--bs-primary)"
                stroke-width="4"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </div>
          <div class="d-flex justify-content-between mt-3 text-muted x-small">
            <span v-if="data.chart_data?.length">{{
              data.chart_data[0].date
            }}</span>
            <span v-if="data.chart_data?.length">{{
              data.chart_data[data.chart_data.length - 1].date
            }}</span>
          </div>
        </div>

        
        <div class="card border-0 shadow-sm rounded-4 p-4 mb-4">
          <h5 class="fw-bold mb-4">Складские остатки</h5>
          <div class="row">
            <div class="col-md-6">
              <div class="d-flex align-items-center mb-3">
                <div class="flex-shrink-0 bg-primary-subtle p-3 rounded-4 me-3">
                  <i class="bi bi-safe2 fs-4 text-primary"></i>
                </div>
                <div>
                  <div class="text-muted small">Рыночная стоимость</div>
                  <div class="h4 fw-black mb-0">
                    {{ formatPrice(data.inventory.total_market_value) }}
                  </div>
                </div>
              </div>
            </div>
            <div class="col-md-6">
              <div class="d-flex align-items-center mb-3">
                <div class="flex-shrink-0 bg-success-subtle p-3 rounded-4 me-3">
                  <i class="bi bi-piggy-bank fs-4 text-success"></i>
                </div>
                <div>
                  <div class="text-muted small">Себестоимость активов</div>
                  <div class="h4 fw-black mb-0">
                    {{ formatPrice(data.inventory.total_cost_value) }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="row mt-4 pt-3 border-top">
            <div class="col-6">
              <div class="d-flex justify-content-between">
                <span class="text-muted small">Мало на складе</span>
                <span class="badge bg-warning-subtle text-warning rounded-pill"
                  >{{ data.inventory.low_stock_count }} поз.</span
                >
              </div>
            </div>
            <div class="col-6 border-start">
              <div class="d-flex justify-content-between">
                <span class="text-muted small">Нет в наличии</span>
                <span class="badge bg-danger-subtle text-danger rounded-pill"
                  >{{ data.inventory.out_of_stock_count }} поз.</span
                >
              </div>
            </div>
          </div>
        </div>
      </div>

      
      <div class="col-lg-4">
        
        <div class="card border-0 shadow-sm rounded-4 p-4 mb-4">
          <h5 class="fw-bold mb-4">Структура прибыли</h5>
          <div class="mb-4">
            <div class="d-flex justify-content-between mb-1 small">
              <span>Валовая прибыль</span>
              <span class="fw-bold">{{
                formatPrice(data.summary.gross_profit)
              }}</span>
            </div>
            <div class="progress" style="height: 6px">
              <div class="progress-bar bg-success" style="width: 100%"></div>
            </div>
          </div>
          <div class="mb-4">
            <div class="d-flex justify-content-between mb-1 small text-danger">
              <span>Расходы и возвраты</span>
              <span class="fw-bold"
                >-{{ formatPrice(data.summary.expenses) }}</span
              >
            </div>
            <div class="progress" style="height: 6px">
              <div
                class="progress-bar bg-danger"
                :style="{
                  width:
                    (data.summary.expenses / (data.summary.gross_profit || 1)) *
                      100 +
                    '%',
                }"
              ></div>
            </div>
          </div>
          <div class="pt-3 border-top">
            <div class="d-flex justify-content-between align-items-center">
              <span class="text-muted">Итоговая прибыль</span>
              <h4
                class="fw-black mb-0"
                :class="
                  data.summary.net_profit >= 0 ? 'text-success' : 'text-danger'
                "
              >
                {{ formatPrice(data.summary.net_profit) }}
              </h4>
            </div>
          </div>
        </div>

        
        <div class="card border-0 shadow-sm rounded-4 p-4 mb-4">
          <h5 class="fw-bold mb-4">Детализация расходов</h5>
          <div v-if="data.summary.expense_breakdown?.length">
            <div
              v-for="exp in data.summary.expense_breakdown"
              :key="exp.category"
              class="mb-3 border-bottom border-light pb-2"
            >
              <div class="d-flex justify-content-between mb-1">
                <span class="text-muted small fw-bold text-uppercase">{{
                  getCategoryLabel(exp.category)
                }}</span>
                <span class="fw-bold small">{{ formatPrice(exp.total) }}</span>
              </div>
              <div class="progress" style="height: 4px">
                <div
                  class="progress-bar bg-danger opacity-50"
                  :style="{
                    width:
                      (exp.total / (data.summary.expenses || 1)) * 100 + '%',
                  }"
                ></div>
              </div>
            </div>
          </div>
          <div v-else class="text-center py-3 text-muted small">
            Нет данных по расходам за период
          </div>
        </div>

        
        <div
          class="card border-0 shadow-sm rounded-4 p-4 bg-primary text-white"
        >
          <h5 class="fw-bold mb-4">Клиентская база</h5>
          <div
            class="d-flex justify-content-between mb-3 border-bottom border-white border-opacity-10 pb-3"
          >
            <span>Всего клиентов</span>
            <span class="fw-black fs-5">{{ data.clients.total_count }}</span>
          </div>
          <div
            class="d-flex justify-content-between mb-3 border-bottom border-white border-opacity-10 pb-3"
          >
            <span>Активных покупателей</span>
            <span class="fw-black fs-5">{{
              data.clients.active_shopper_count
            }}</span>
          </div>
          <div class="d-flex justify-content-between pt-1">
            <div class="small opacity-75">Общая дебиторка</div>
            <div class="fw-black h4 mb-0">
              {{ formatPrice(data.clients.total_debts) }}
            </div>
          </div>
          <NuxtLink
            to="/admin/debts"
            class="btn btn-white btn-sm mt-4 w-100 rounded-pill fw-bold"
            >Управление долгами</NuxtLink
          >
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.analytics-dashboard {
  background-color: #f8fafc;
  min-height: 100vh;
  font-family: "Inter", sans-serif;
}

.fw-black {
  font-weight: 900;
}
.ls-1 {
  letter-spacing: 0.05em;
}
.x-small {
  font-size: 0.75rem;
}

.kpi-card {
  position: relative;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.kpi-card:hover {
  transform: translateY(-8px);
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1),
    0 10px 10px -5px rgba(0, 0, 0, 0.04) !important;
}

.kpi-bg-icon {
  position: absolute;
  right: -10px;
  bottom: -20px;
  font-size: 8rem;
  opacity: 0.03;
  transform: rotate(-15deg);
  pointer-events: none;
}

.alert-banner {
  transition: transform 0.2s ease;
}

.alert-banner:hover {
  transform: scale(1.01);
}

.progress {
  border-radius: 1rem;
}

.progress-bar {
  border-radius: 1rem;
}

.animate-fade-in {
  animation: fadeIn 0.6s ease-out;
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

.btn-white {
  background: white;
  color: var(--bs-primary);
  border: none;
}

.btn-white:hover {
  background: #f1f5f9;
}
</style>
