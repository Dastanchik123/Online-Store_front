<script setup>
definePageMeta({
  layout: "admin",
  middleware: "purchaser",
});

const authStore = useAuthStore();
const { getOrders } = useOrders();

const statistics = ref({
  totalProducts: 0,
  lowStockCount: 0,
  activeSuppliers: 0,
});

const { getProducts } = useProducts();
const { getSuppliers } = useAccounting();

const loadStats = async () => {
  try {
    const [products, sups] = await Promise.all([
      getProducts({ per_page: 1 }),
      getSuppliers(),
    ]);

    statistics.value.totalProducts = products.total || 0;
    
    
    statistics.value.activeSuppliers = Array.isArray(sups)
      ? sups.length
      : sups.data?.length || 0;
  } catch (e) {
    console.error(e);
  }
};

onMounted(() => {
  loadStats();
});
</script>

<template>
  <div class="manager-dashboard p-4 animate-fade-in">
    <div
      class="header-card mb-4 p-4 rounded-4 shadow-sm text-white glass-header"
    >
      <div class="row align-items-center">
        <div class="col">
          <h1 class="h3 mb-1 fw-bold">Панель Закупщика</h1>
          <p class="mb-0 opacity-75">
            Добро пожаловать, {{ authStore.user?.name }}. Здесь вы можете
            управлять закупками.
          </p>
        </div>
        <div class="col-auto">
          <div
            class="role-badge bg-white text-primary px-3 py-1 rounded-pill fw-bold small"
          >
            Закупщик
          </div>
        </div>
      </div>
    </div>

    <div class="row g-4 mb-4">
      <div class="col-md-6">
        <div class="stat-card p-4 rounded-4 shadow-sm border-0 bg-white">
          <div class="d-flex align-items-center mb-3">
            <div class="icon-box bg-primary-subtle text-primary rounded-3 me-3">
              <i class="bi bi-box-seam fs-4"></i>
            </div>
            <h6 class="text-muted mb-0 fw-bold">Всего товаров</h6>
          </div>
          <h2 class="fw-bold mb-0">{{ statistics.totalProducts }}</h2>
        </div>
      </div>
      <div class="col-md-6">
        <div class="stat-card p-4 rounded-4 shadow-sm border-0 bg-white">
          <div class="d-flex align-items-center mb-3">
            <div class="icon-box bg-info-subtle text-info rounded-3 me-3">
              <i class="bi bi-people fs-4"></i>
            </div>
            <h6 class="text-muted mb-0 fw-bold">Активных поставщиков</h6>
          </div>
          <h2 class="fw-bold mb-0">{{ statistics.activeSuppliers }}</h2>
        </div>
      </div>
    </div>

    <div class="row g-4">
      <div class="col-lg-8">
        <div class="card border-0 shadow-sm rounded-4 overflow-hidden">
          <div class="card-header bg-white border-0 p-4">
            <h5 class="fw-bold mb-0">Быстрые действия</h5>
          </div>
          <div class="card-body p-4 pt-0">
            <div class="row g-3">
              <div
                class="col-md-12"
                v-if="authStore.hasPermission('products.view')"
              >
                <NuxtLink
                  to="/admin/products"
                  class="action-btn p-4 rounded-4 d-flex align-items-center text-decoration-none border h-100"
                >
                  <div class="icon-box bg-info text-white rounded-3 me-3">
                    <i class="bi bi-box-seam fs-4"></i>
                  </div>
                  <div>
                    <div class="fw-bold text-dark">Каталог товаров</div>
                    <small class="text-muted">Управление товарами</small>
                  </div>
                </NuxtLink>
              </div>
              <div
                class="col-md-4"
                v-if="authStore.hasPermission('purchases.manage')"
              >
                <NuxtLink
                  to="/admin/purchases"
                  class="action-btn p-3 rounded-4 d-flex align-items-center text-decoration-none border h-100"
                >
                  <div class="icon-box bg-success text-white rounded-3 me-3">
                    <i class="bi bi-truck fs-4"></i>
                  </div>
                  <div>
                    <div class="fw-bold text-dark small">Закупки</div>
                  </div>
                </NuxtLink>
              </div>
              <div
                class="col-md-4"
                v-if="authStore.hasPermission('inventory.manage')"
              >
                <NuxtLink
                  to="/admin/inventory"
                  class="action-btn p-3 rounded-4 d-flex align-items-center text-decoration-none border h-100"
                >
                  <div class="icon-box bg-warning text-white rounded-3 me-3">
                    <i class="bi bi-arrow-left-right fs-4"></i>
                  </div>
                  <div>
                    <div class="fw-bold text-dark small">Инвентаризация</div>
                  </div>
                </NuxtLink>
              </div>
              <div
                class="col-md-4"
                v-if="authStore.hasPermission('suppliers.manage')"
              >
                <NuxtLink
                  to="/admin/suppliers"
                  class="action-btn p-3 rounded-4 d-flex align-items-center text-decoration-none border h-100"
                >
                  <div class="icon-box bg-secondary text-white rounded-3 me-3">
                    <i class="bi bi-people fs-4"></i>
                  </div>
                  <div>
                    <div class="fw-bold text-dark small">Поставщики</div>
                  </div>
                </NuxtLink>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="col-lg-4">
        <div
          class="card border-0 shadow-sm rounded-4 bg-primary text-white p-4 h-100"
        >
          <h5 class="fw-bold mb-3 text-white">Уведомления</h5>
          <div class="opacity-75 small">
            У вас нет новых системных уведомлений. Все операции идут в штатном
            режиме.
          </div>
          <div class="mt-auto">
            <i class="bi bi-shield-check fs-1 text-white-50"></i>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.glass-header {
  background: linear-gradient(135deg, #6366f1 0%, #4338ca 100%);
}
.icon-box {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.action-btn {
  transition: all 0.3s ease;
  background: #f8fafc;
}
.action-btn:hover {
  background: white;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
  border-color: #6366f1 !important;
}
.animate-fade-in {
  animation: fadeIn 0.5s ease-out;
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
</style>
