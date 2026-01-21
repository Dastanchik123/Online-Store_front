<script setup lang="ts">
import { ref, onMounted, computed, watch } from "vue";
const { getAccountingReports } = useAccounting();

definePageMeta({
  layout: "admin",
  middleware: "admin",
});

const loading = ref(true);
const isInitialLoading = ref(true);
const reports = ref<any>(null);
const authStore = useAuthStore();
const today = new Date().toLocaleDateString("en-CA");
const filters = ref({
  date_from: today,
  date_to: today,
  user_id: "",
});

const staffList = ref<any[]>([]);
const isReturnsModalOpen = ref(false);

const fetchStaff = async () => {
  try {
    const data: any = await $fetch("http://127.0.0.1:8000/api/pos/staff", {
      headers: { Authorization: `Bearer ${useAuthStore().token}` },
    });
    staffList.value = data;
  } catch (error) {
    console.error("Staff fetch error:", error);
  }
};

const { getProducts } = useProducts();

const loadReports = async () => {
  loading.value = true;
  try {
    const [reportData, productsData]: [any, any] = await Promise.all([
      getAccountingReports(filters.value),
      getProducts({ per_page: 1000 }),
    ]);

    
    const data = reportData?.data || reportData;
    const summary = data?.summary || data;

    
    let localMarketValue = 0;
    let localCostValue = 0;

    if (productsData?.data) {
      localMarketValue = productsData.data.reduce((sum: number, p: any) => {
        const price = parseFloat(p.sale_price || p.price || 0);
        const qty = parseFloat(p.stock_quantity || 0);
        return sum + price * qty;
      }, 0);

      
      
      localCostValue = localMarketValue * 0.7; 
    }

    reports.value = {
      ...summary,
      recent_transactions:
        data?.recent_transactions || reportData?.recent_transactions || [],
      chart_data: data?.chart_data || reportData?.chart_data || [],
      inventory_market_value:
        summary?.inventory_market_value ||
        summary?.inventory_estimated_value ||
        localMarketValue,
      inventory_cost_estimate:
        summary?.inventory_cost_estimate || localCostValue,
      revenue:
        summary?.revenue ||
        summary?.total_revenue ||
        summary?.total_sales ||
        summary?.total_income,
      total_costs:
        summary?.total_costs ||
        summary?.total_expenses ||
        summary?.expenses ||
        summary?.total_expense,
      net_profit_estimate:
        summary?.net_profit_estimate || summary?.profit || summary?.net_profit,
      total_debts: summary?.total_debts || summary?.total_debt,
      avg_income_30: summary?.avg_income_30 || 0,
    };
  } catch (error) {
    console.error("Error loading reports:", error);
  } finally {
    loading.value = false;
    isInitialLoading.value = false;
  }
};

const formatPrice = (price: any) => {
  return parseFloat(price || 0).toLocaleString("ru-RU") + " сом";
};

const currentDate = computed(() => {
  return new Date().toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
});

onMounted(() => {
  loadReports();
  fetchStaff();
});

watch(filters, loadReports, { deep: true });
</script>

<template>
  <div class="dashboard-page p-4 animate-fade-in">
    
    <div class="row align-items-end mb-5">
      <div class="col">
        <div
          class="badge bg-primary-subtle text-primary rounded-pill px-3 py-2 mb-2 fw-bold"
          style="font-size: 0.7rem; letter-spacing: 0.5px"
        >
          <i class="bi bi-calendar3 me-2"></i>{{ currentDate }}
        </div>
        <h1 class="h2 fw-bold text-dark-blue mb-1">
          С возвращением, Администратор! 👋
        </h1>
        <p class="text-muted mb-0">
          {{
            filters.date_from || filters.date_to
              ? "Вот отчет за выбранный период."
              : "Вот что произошло в вашем магазине сегодня."
          }}
        </p>
      </div>
      <div class="col-auto">
        <div
          class="d-flex align-items-center gap-3 bg-white p-2 rounded-4 shadow-sm border border-light"
        >
          <div class="d-flex align-items-center gap-2">
            <span
              class="small text-muted fw-bold text-uppercase ls-1"
              style="font-size: 0.65rem"
              >Сотрудник</span
            >
            <select
              v-model="filters.user_id"
              class="form-select form-select-sm border-0 bg-light rounded-pill px-3 fw-bold text-dark"
              style="font-size: 0.8rem; width: 140px"
            >
              <option value="">Все</option>
              <option
                v-for="staff in staffList"
                :key="staff.id"
                :value="staff.id"
              >
                {{ staff.name }}
              </option>
            </select>
          </div>
          <div class="d-flex align-items-center gap-2">
            <span
              class="small text-muted fw-bold text-uppercase ls-1"
              style="font-size: 0.65rem"
              >От</span
            >
            <input
              type="date"
              v-model="filters.date_from"
              class="form-control form-control-sm border-0 bg-light rounded-pill px-3 fw-bold text-dark"
              style="font-size: 0.8rem; width: 140px"
            />
          </div>
          <div class="d-flex align-items-center gap-2">
            <span
              class="small text-muted fw-bold text-uppercase ls-1"
              style="font-size: 0.65rem"
              >До</span
            >
            <input
              type="date"
              v-model="filters.date_to"
              class="form-control form-control-sm border-0 bg-light rounded-pill px-3 fw-bold text-dark"
              style="font-size: 0.8rem; width: 140px"
            />
          </div>
          <div class="vr mx-1 my-1 opacity-10"></div>
          <button
            class="btn btn-refresh shadow-none border-0 rounded-pill px-3 py-2 text-primary hover-bg-light"
            @click="loadReports"
            :disabled="loading"
          >
            <i
              class="bi bi-arrow-clockwise fs-5"
              :class="{ spin: loading }"
            ></i>
          </button>
          <div class="vr mx-1 my-1 opacity-10"></div>
          <button
            class="btn btn-refresh shadow-none border-0 rounded-pill px-3 py-2 text-danger hover-bg-light"
            @click="isReturnsModalOpen = true"
          >
            <i class="bi bi-arrow-counterclockwise fs-5"></i>
            <span class="ms-2 d-none d-md-inline small fw-bold">Возвраты</span>
          </button>
        </div>
      </div>
    </div>

    
    <div v-if="isInitialLoading" class="row g-4 mb-5">
      <div v-for="i in 4" :key="i" class="col-xl-3 col-md-6">
        <div class="card border-0 shadow-sm rounded-4 p-4 animate-pulse">
          <div
            class="bg-light rounded-circle mb-3"
            style="height: 48px; width: 48px"
          ></div>
          <div
            class="bg-light rounded-2 mb-2"
            style="height: 15px; width: 40%"
          ></div>
          <div
            class="bg-light rounded-2"
            style="height: 30px; width: 70%"
          ></div>
        </div>
      </div>
    </div>

    <div
      v-else-if="reports"
      class="row g-4 mb-5"
      :class="{ 'opacity-75 transition-all': loading }"
    >
      
      <div class="col-xl-3 col-md-6">
        <div class="stat-card glass-card luxury-blue">
          <div class="card-content">
            <div class="icon-box">
              <i class="bi bi-wallet2"></i>
            </div>
            <div class="info">
              <span class="label">ОБЩАЯ ВЫРУЧКА</span>
              <h2 class="amount">
                <UiCountUp :value="reports.revenue" suffix=" сом" />
              </h2>
            </div>
          </div>
          <div class="card-wave"></div>
        </div>
      </div>

      
      <div class="col-xl-3 col-md-6">
        <div class="stat-card glass-card luxury-rose">
          <div class="card-content">
            <div class="icon-box">
              <i class="bi bi-cart-dash"></i>
            </div>
            <div class="info">
              <span class="label">РАСХОДЫ / ЗАКУПКИ</span>
              <h2 class="amount">
                <UiCountUp :value="reports.total_costs" suffix=" сом" />
              </h2>
            </div>
          </div>
          <div class="card-wave red"></div>
        </div>
      </div>

      
      <div class="col-xl-3 col-md-6">
        <div class="stat-card glass-card luxury-emerald">
          <div class="card-content">
            <div class="icon-box">
              <i class="bi bi-graph-up-arrow"></i>
            </div>
            <div class="info">
              <span
                class="label"
                title="Прибыль = Выручка - (Затраты - Себестоимость склада)"
                >ЧИСТАЯ ПРИБЫЛЬ
                <i class="bi bi-info-circle small opacity-50 ms-1"></i>
              </span>
              <h2 class="amount">
                <UiCountUp :value="reports.net_profit_estimate" suffix=" сом" />
              </h2>
            </div>
          </div>
          <div class="card-wave green"></div>
        </div>
      </div>

      
      <div class="col-xl-3 col-md-6">
        <div class="stat-card glass-card luxury-amber">
          <div class="card-content">
            <div class="icon-box">
              <i class="bi bi-person-exclamation"></i>
            </div>
            <div class="info">
              <span class="label">ДОЛГИ КЛИЕНТОВ</span>
              <h2 class="amount">
                <UiCountUp :value="reports.total_debts" suffix=" сом" />
              </h2>
            </div>
          </div>
          <div class="card-wave yellow"></div>
        </div>
      </div>
    </div>

    <div
      v-if="!isInitialLoading && reports"
      class="row g-4"
      :class="{ 'opacity-75 transition-all': loading }"
    >
      
      <div class="col-lg-8">
        <div
          class="card border-0 shadow-sm rounded-4 luxury-table-card overflow-y-auto"
          style="max-height: 500px"
        >
          <div
            class="p-4 d-flex justify-content-between align-items-center border-bottom"
          >
            <h5 class="fw-bold mb-0 text-dark-blue">
              <i
                class="bi bi-clock-history me-2 text-primary"
                :class="{ spin: loading }"
              ></i
              >Последние транзакции
            </h5>
            <NuxtLink
              to="/admin/orders"
              class="btn btn-link text-primary text-decoration-none small fw-bold"
            >
              Все заказы <i class="bi bi-arrow-right ms-1"></i>
            </NuxtLink>
          </div>
          <div class="table-responsive-cards">
            <table class="table table-hover align-middle mb-0 custom-table">
              <thead class="d-none d-lg-table-header-group">
                <tr>
                  <th class="ps-4">Наименование / Описание</th>
                  <th>Тип</th>
                  <th>Сотрудник</th>
                  <th class="text-end">Сумма</th>
                  <th class="pe-4 text-end">Дата и время</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(tx, idx) in reports?.recent_transactions"
                  :key="idx"
                  class="transaction-row"
                >
                  <td class="ps-4" data-label="Описание">
                    <div class="d-flex align-items-center">
                      <div
                        class="avatar-sm rounded-3 bg-light d-flex align-items-center justify-content-center me-3 d-none d-lg-flex"
                      >
                        <i
                          :class="
                            tx.type === 'income'
                              ? 'bi bi-arrow-down-left-circle text-success'
                              : 'bi bi-arrow-up-right-circle text-danger'
                          "
                          class="fs-5"
                        ></i>
                      </div>
                      <div>
                        <div class="fw-bold text-dark small">
                          {{ tx.description }}
                        </div>
                        <div class="text-muted" style="font-size: 0.65rem">
                          ID: #{{ tx.id }}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td data-label="Тип">
                    <span
                      v-if="tx.type === 'income'"
                      class="badge-modern income"
                      >Доход</span
                    >
                    <span v-else class="badge-modern expense">Расход</span>
                  </td>
                  <td data-label="Сотрудник">
                    <div v-if="tx.user_id" class="small fw-bold">
                      <i class="bi bi-person me-1"></i>
                      {{ tx.user?.name || "ID:" + tx.user_id }}
                    </div>
                    <div v-else class="text-muted small opacity-50">
                      Система
                    </div>
                  </td>
                  <td data-label="Сумма" class="text-end fw-bold">
                    <span
                      :class="
                        tx.type === 'income' ? 'text-success' : 'text-danger'
                      "
                    >
                      {{ tx.type === "income" ? "+" : "-"
                      }}{{ formatPrice(tx.amount) }}
                    </span>
                  </td>
                  <td data-label="Дата" class="pe-4 text-end text-muted small">
                    <div class="fw-bold text-dark">
                      {{ new Date(tx.created_at).toLocaleDateString() }}
                    </div>
                    <div style="font-size: 0.65rem">
                      {{
                        new Date(tx.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      }}
                    </div>
                  </td>
                </tr>
                <tr v-if="!reports?.recent_transactions?.length">
                  <td colspan="4" class="text-center py-5">
                    <i class="bi bi-inbox fs-1 opacity-10 d-block mb-3"></i>
                    <span class="text-muted fw-semi-bold"
                      >Транзакции пока отсутствуют</span
                    >
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      
      <div class="col-lg-4">
        <div
          class="card border-0 shadow-sm rounded-4 h-100 p-0 overflow-hidden"
          style="background: #ffffff"
        >
          <div class="p-4 bg-dark text-white">
            <h5 class="fw-bold mb-0">Динамика за 30 дней</h5>
            <p class="small text-white-50 mb-0">Ежедневный доход</p>

            <div class="chart-container mt-4" style="height: 120px">
              <svg
                viewBox="0 0 300 100"
                class="w-100 h-100"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient
                    id="chartGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.8" />
                    <stop offset="100%" stop-color="#38bdf8" stop-opacity="0" />
                  </linearGradient>
                </defs>
                
                <path
                  v-if="reports.chart_data && reports.chart_data.length"
                  :d="`M 0,100 ${reports.chart_data
                    .map(
                      (d: any, i: number) =>
                        `L ${i * (300 / 29)},${
                          100 -
                          (d.total /
                            (Math.max(
                              ...reports.chart_data.map((x: any) => x.total)
                            ) || 1)) *
                            80
                        }`
                    )
                    .join(' ')} L 300,100 Z`"
                  fill="url(#chartGradient)"
                />
                
                <path
                  v-if="reports.chart_data && reports.chart_data.length"
                  :d="`M 0,${
                    100 -
                    (reports.chart_data[0].total /
                      (Math.max(...reports.chart_data.map((x: any) => x.total)) ||
                        1)) *
                      80
                  } ${reports.chart_data
                    .map(
                      (d: any, i: number) =>
                        `L ${i * (300 / 29)},${
                          100 -
                          (d.total /
                            (Math.max(
                              ...reports.chart_data.map((x: any) => x.total)
                            ) || 1)) *
                            80
                        }`
                    )
                    .join(' ')}`"
                  fill="none"
                  stroke="#38bdf8"
                  stroke-width="3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </div>
            <div
              class="d-flex justify-content-between mt-2 small text-white-50"
            >
              <span>{{ reports.chart_data[0]?.date }}</span>
              <span>{{
                reports.chart_data[reports.chart_data.length - 1]?.date
              }}</span>
            </div>
          </div>

          <div class="p-4">
            <div class="d-flex justify-content-between align-items-center mb-3">
              <span class="small text-muted fw-bold">АНАЛИТИКА</span>
              <span class="badge bg-primary-subtle text-primary">30 дней</span>
            </div>

            <div class="mb-3">
              <div class="small text-muted mb-1">Средний доход в день</div>
              <h4 class="fw-bold mb-0">
                <UiCountUp :value="reports.avg_income_30" suffix=" сом" />
              </h4>
            </div>

            <div class="actions-grid pt-3 border-top">
              <NuxtLink
                to="/admin/purchases"
                class="btn btn-outline-primary rounded-pill w-100 mb-2 py-2 fw-bold small"
              >
                <i class="bi bi-plus-circle me-1"></i> Принять товар
              </NuxtLink>
              <NuxtLink
                to="/admin/inventory"
                class="btn btn-outline-secondary rounded-pill w-100 py-2 fw-bold small"
              >
                <i class="bi bi-clipboard-check me-1"></i> Инвентаризация
              </NuxtLink>
            </div>
          </div>
        </div>
      </div>
    </div>

    
    <AdminReturnsHistoryModal
      :show="isReturnsModalOpen"
      @close="isReturnsModalOpen = false"
    />
  </div>
</template>

<style scoped>
.dashboard-page {
  background-color: #f8fafc;
  min-height: 100vh;
}

.text-dark-blue {
  color: #0f172a;
}


.btn-refresh {
  background: white;
  border: 1px solid #e2e8f0;
  color: #64748b;
  font-weight: 600;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.btn-refresh:hover:not(:disabled) {
  background: #f1f5f9;
  color: #0f172a;
  transform: translateY(-1px);
}
.spin {
  animation: rotate 1s linear infinite;
}
@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}


.stat-card {
  position: relative;
  overflow: hidden;
  border-radius: 24px;
  padding: 24px;
  min-height: 140px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid rgba(255, 255, 255, 0.4);
}

.stat-card:hover {
  transform: translateY(-8px) scale(1.02);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
}

.card-content {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
}

.icon-box {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  color: white;
  margin-right: 20px;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.05);
}

.info .label {
  font-size: 0.75rem;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.8);
  letter-spacing: 1px;
}

.info .amount {
  font-size: 1.4rem;
  font-weight: 800;
  color: white;
  margin-bottom: 0;
  margin-top: 4px;
}


.luxury-blue {
  background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%);
}
.luxury-rose {
  background: linear-gradient(135deg, #f43f5e 0%, #9f1239 100%);
}
.luxury-emerald {
  background: linear-gradient(135deg, #10b981 0%, #064e3b 100%);
}
.luxury-amber {
  background: linear-gradient(135deg, #f59e0b 0%, #92400e 100%);
}

.card-wave {
  position: absolute;
  top: 0;
  right: 0;
  width: 150px;
  height: 150px;
  background: radial-gradient(
    circle,
    rgba(255, 255, 255, 0.15) 0%,
    transparent 70%
  );
  transform: translate(30%, -30%);
  z-index: 1;
}

.card-wave.red {
  background: radial-gradient(
    circle,
    rgba(255, 255, 255, 0.2) 0%,
    transparent 70%
  );
}
.card-wave.green {
  background: radial-gradient(
    circle,
    rgba(255, 255, 255, 0.2) 0%,
    transparent 70%
  );
}
.card-wave.yellow {
  background: radial-gradient(
    circle,
    rgba(255, 255, 255, 0.2) 0%,
    transparent 70%
  );
}


.luxury-table-card {
  background: white;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(0, 0, 0, 0.05) !important;
}

.custom-table thead th {
  background: #f8fafc;
  padding: 18px 15px;
  color: #64748b;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid #f1f5f9;
}

.transaction-row {
  transition: background 0.2s;
}

.transaction-row:hover {
  background-color: #f8fafc;
}

.avatar-sm {
  width: 40px;
  height: 40px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.03);
}

.badge-modern {
  padding: 6px 16px;
  border-radius: 50px;
  font-size: 0.75rem;
  font-weight: 700;
}

.badge-modern.income {
  background: rgba(34, 197, 94, 0.1);
  color: #10b981;
}

.badge-modern.expense {
  background: rgba(239, 68, 68, 0.1);
  color: #f43f5e;
}


.storage-status-card {
  background: linear-gradient(165deg, #1e293b 0%, #0f172a 100%);
  position: relative;
  overflow: hidden;
}

.progress-circle-glow {
  width: 200px;
  height: 200px;
  border-radius: 50%;
  border: 10px solid rgba(59, 130, 246, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 40px rgba(59, 130, 246, 0.2);
}

.circle-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.action-btn {
  display: block;
  width: 100%;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: white;
  padding: 12px 20px;
  border-radius: 14px;
  margin-bottom: 12px;
  text-decoration: none;
  font-weight: 600;
  font-size: 0.9rem;
  transition: all 0.3s ease;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: translateX(5px);
  color: white;
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

.animate-pulse {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
  100% {
    opacity: 1;
  }
}
</style>
