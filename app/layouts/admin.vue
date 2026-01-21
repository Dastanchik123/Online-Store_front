<script setup lang="ts">
import { ref } from "vue";
const authStore = useAuthStore();
const config = useRuntimeConfig();
const { settings, fetchPublicSettings } = useSettings();
const isSidebarOpen = ref(false);

const toggleSidebar = () => {
  isSidebarOpen.value = !isSidebarOpen.value;
};
const closeSidebar = () => {
  isSidebarOpen.value = false;
};

onMounted(() => {
  fetchPublicSettings();
});
</script>

<template>
  <ClientOnly>
    <div
      v-if="authStore.isAdmin || authStore.isPurchaser || authStore.isCashier"
      class="admin-layout"
    >
      <div
        class="mobile-header d-lg-none d-flex align-items-center justify-content-between px-4 py-3 bg-white shadow-sm"
      >
        <div class="d-flex align-items-center">
          <button
            class="btn btn-link text-dark p-0 me-3"
            @click="toggleSidebar"
          >
            <i class="bi bi-list fs-1"></i>
          </button>
          <h4 class="fw-bold mb-0 text-dark">MyShop</h4>
        </div>
        <div
          class="avatar-circle bg-light border rounded-circle overflow-hidden"
          style="width: 36px; height: 36px"
        >
          <img
            v-if="authStore.user?.avatar_url"
            :src="authStore.user.avatar_url"
            class="w-100 h-100 object-fit-cover"
            alt="Avatar"
          />
          <div
            v-else
            class="w-100 h-100 d-flex align-items-center justify-content-center text-primary fw-bold"
          >
            {{ authStore.user?.name?.[0]?.toUpperCase() || "A" }}
          </div>
        </div>
      </div>

      <div
        class="sidebar-overlay d-lg-none"
        :class="{ show: isSidebarOpen }"
        @click="closeSidebar"
      ></div>

      <aside class="sidebar" :class="{ open: isSidebarOpen }">
        <div
          class="sidebar-header mb-4 d-flex justify-content-between align-items-start"
        >
          <div>
            <h3 class="fw-bold mb-0">
              <span class="text-primary">My</span>Shop
            </h3>
            <small class="opacity-50 text-white">Панель управления</small>
          </div>
          <button
            class="btn btn-link text-white d-lg-none p-0 opacity-50"
            @click="closeSidebar"
          >
            <i class="bi bi-x-lg fs-4"></i>
          </button>
        </div>

        <div class="nav-section mb-3">
          <div class="section-title">ОСНОВНОЕ</div>
          <NuxtLink to="/admin" v-if="authStore.isAdmin" @click="closeSidebar"
            ><i class="bi bi-speedometer2 me-2"></i>Дашборд</NuxtLink
          >
          <NuxtLink
            to="/purchaser"
            v-if="authStore.isPurchaser || authStore.isAdmin"
            @click="closeSidebar"
            ><i class="bi bi-briefcase me-2"></i>Панель Закупщика</NuxtLink
          >
          <NuxtLink
            to="/cashier"
            v-if="authStore.hasPermission('cashier.access')"
            @click="closeSidebar"
            ><i class="bi bi-wallet2 me-2"></i>Касса</NuxtLink
          >
          <NuxtLink
            to="/admin/pos-sales"
            v-if="authStore.hasPermission('pos.access')"
            @click="closeSidebar"
            ><i class="bi bi-shop me-2"></i>Оффлайн Продажи</NuxtLink
          >
          <NuxtLink
            to="/cashier/pos"
            v-if="authStore.hasPermission('pos.access')"
            @click="closeSidebar"
            ><i class="bi bi-calculator me-2"></i>POS Терминал</NuxtLink
          >
          <NuxtLink
            to="/admin/orders"
            v-if="authStore.hasPermission('orders.view')"
            @click="closeSidebar"
            ><i class="bi bi-cart-check me-2"></i>Заказы</NuxtLink
          >
          <NuxtLink
            to="/admin/products"
            v-if="authStore.hasPermission('products.view')"
            @click="closeSidebar"
            ><i class="bi bi-box me-2"></i>Товары</NuxtLink
          >
          <NuxtLink
            to="/admin/categories"
            v-if="authStore.hasPermission('categories.manage')"
            @click="closeSidebar"
            ><i class="bi bi-grid me-2"></i>Категории</NuxtLink
          >
        </div>

        <div
          class="nav-section mb-3"
          v-if="
            authStore.hasPermission('purchases.manage') ||
            authStore.hasPermission('inventory.manage') ||
            authStore.hasPermission('suppliers.manage')
          "
        >
          <div class="section-title">СКЛАД</div>
          <NuxtLink
            to="/admin/purchases"
            v-if="authStore.hasPermission('purchases.manage')"
            @click="closeSidebar"
            ><i class="bi bi-truck me-2"></i>Закупки (Приём)</NuxtLink
          >
          <NuxtLink
            to="/admin/inventory"
            v-if="authStore.hasPermission('inventory.manage')"
            @click="closeSidebar"
            ><i class="bi bi-arrow-left-right me-2"></i>Инвентаризация</NuxtLink
          >
          <NuxtLink
            to="/admin/suppliers"
            v-if="authStore.hasPermission('suppliers.manage')"
            @click="closeSidebar"
            ><i class="bi bi-people me-2"></i>Поставщики</NuxtLink
          >
        </div>

        <div
          class="nav-section mb-3"
          v-if="
            authStore.hasPermission('marketing.manage') ||
            authStore.hasPermission('blog.manage')
          "
        >
          <div class="section-title">МАРКЕТИНГ</div>
          <NuxtLink
            to="/admin/coupons"
            v-if="authStore.hasPermission('marketing.manage')"
            @click="closeSidebar"
            ><i class="bi bi-tag me-2"></i>Купоны / Акции</NuxtLink
          >
          <NuxtLink
            to="/admin/banners"
            v-if="authStore.hasPermission('marketing.manage')"
            @click="closeSidebar"
            ><i class="bi bi-images me-2"></i>Баннеры</NuxtLink
          >
          <NuxtLink
            to="/admin/hot-products"
            v-if="authStore.hasPermission('marketing.manage')"
            @click="closeSidebar"
            ><i class="bi bi-fire me-2"></i
            >{{ settings.pos_hot_products_title || "Горячие товары" }}</NuxtLink
          >
          <NuxtLink
            to="/admin/blog"
            v-if="authStore.hasPermission('blog.manage')"
            @click="closeSidebar"
            ><i class="bi bi-journal-text me-2"></i>Блог / Новости</NuxtLink
          >
        </div>

        <div
          class="nav-section mb-3"
          v-if="
            authStore.hasPermission('reports.view') ||
            authStore.hasPermission('debts.view')
          "
        >
          <div class="section-title">ФИНАНСЫ И АНАЛИТИКА</div>
          <NuxtLink
            to="/admin/analytics"
            v-if="authStore.hasPermission('reports.view')"
            @click="closeSidebar"
            ><i class="bi bi-bar-chart-line me-2"></i>Отчеты</NuxtLink
          >
          <NuxtLink
            to="/admin/finances"
            v-if="authStore.isAdmin"
            @click="closeSidebar"
            ><i class="bi bi-cash me-2"></i>Расходы / Финансы</NuxtLink
          >
          <NuxtLink
            to="/admin/debts"
            v-if="authStore.hasPermission('debts.view')"
            @click="closeSidebar"
            ><i class="bi bi-person-exclamation me-2"></i>Долги
            клиентов</NuxtLink
          >
        </div>

        <div class="nav-section">
          <div class="section-title">СИСТЕМА</div>
          <NuxtLink
            to="/admin/settings"
            v-if="authStore.hasPermission('settings.edit')"
            @click="closeSidebar"
            ><i class="bi bi-sliders me-2"></i>Настройки</NuxtLink
          >
          <NuxtLink
            to="/admin/permissions"
            v-if="authStore.isAdmin"
            @click="closeSidebar"
            ><i class="bi bi-shield-lock me-2"></i>Права доступа</NuxtLink
          >
          <NuxtLink
            to="/admin/users"
            v-if="authStore.hasPermission('users.manage')"
            @click="closeSidebar"
            ><i class="bi bi-person-gear me-2"></i>Пользователи</NuxtLink
          >
          <NuxtLink to="/" class="mt-4" @click="closeSidebar"
            ><i class="bi bi-shop me-2"></i>На сайт</NuxtLink
          >
        </div>
      </aside>

      <main class="content">
        <slot />
      </main>
      <UiToastContainer />
      <UiConfirmModal />
    </div>
    <div v-else class="vh-100 d-flex align-items-center justify-content-center">
      <div class="text-center">
        <h1 class="display-1 fw-bold text-muted">403</h1>
        <p class="lead">Доступ запрещен</p>
        <NuxtLink to="/" class="btn btn-primary">Вернуться в магазин</NuxtLink>
      </div>
    </div>
    <template #fallback>
      <div class="vh-100 d-flex align-items-center justify-content-center">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Загрузка...</span>
        </div>
      </div>
    </template>
  </ClientOnly>
</template>

<style scoped>
.admin-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background-color: #f8fafc;
}

@media (max-width: 991px) {
  .admin-layout {
    flex-direction: column;
  }
}

.mobile-header {
  flex-shrink: 0;
  z-index: 1000;
}

.sidebar {
  width: 280px;
  height: 100%;
  color: #fff;
  padding: 40px 0 40px 24px;
  background: linear-gradient(180deg, #0f172a 0%, #1e293b 100%);
  box-shadow: 10px 0 30px rgba(0, 0, 0, 0.05);
  flex-shrink: 0;
  overflow-y: auto;
  z-index: 1200;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.sidebar::-webkit-scrollbar {
  display: none;
}
.sidebar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.sidebar-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1100;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
  backdrop-filter: blur(2px);
}
.sidebar-overlay.show {
  opacity: 1;
  pointer-events: auto;
}

.sidebar-header {
  padding-right: 24px;
  margin-bottom: 3rem !important;
}

.sidebar-header h3 {
  letter-spacing: -0.5px;
}

.section-title {
  font-size: 0.65rem;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.25);
  letter-spacing: 1.5px;
  padding: 0 1.2rem;
  margin-bottom: 0.8rem;
  margin-top: 1.5rem;
}

.sidebar a {
  display: flex;
  align-items: center;
  margin: 6px 0;
  color: rgba(255, 255, 255, 0.5);
  text-decoration: none;
  border-radius: 16px 0 0 16px;
  padding: 0.85rem 1.4rem;
  font-size: 0.92rem;
  font-weight: 500;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.sidebar a i {
  font-size: 1.1rem;
  opacity: 0.7;
  transition: transform 0.3s;
}

.sidebar a:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.03);
}

.sidebar a:hover i {
  transform: translateX(3px);
  opacity: 1;
}

.sidebar a.router-link-active {
  color: #3b82f6;
  background-color: #f8fafc;
  font-weight: 700;
  box-shadow: -4px 0 0 #3b82f6;
}

.sidebar a.router-link-active i {
  color: #3b82f6;
  opacity: 1;
}

.content {
  flex: 1;
  padding: 0;
  overflow-y: auto;
  height: 100%;
}

.page-enter-active,
.page-leave-active {
  transition: opacity 0.3s, transform 0.3s;
}
.page-enter-from,
.page-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

@media (max-width: 991px) {
  .sidebar {
    position: fixed;
    height: 100%;
    transform: translateX(-100%);
    box-shadow: none;
  }
  .sidebar.open {
    transform: translateX(0);
    box-shadow: 10px 0 50px rgba(0, 0, 0, 0.5);
  }
}
</style>
