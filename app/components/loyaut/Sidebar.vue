<template>
  <nav class="sidebar bg-light p-3 rounded-4 shadow-sm">
    <ul class="list-unstyled">
      
      <li class="mb-2">
        <NuxtLink to="/" class="text-decoration-none d-flex align-items-center">
          <i class="bi bi-house me-2"></i>
          <span>Главная</span>
        </NuxtLink>
      </li>

      
      <li v-if="authStore.hasPermission('orders.view')" class="mb-2">
        <NuxtLink
          to="/admin/orders"
          class="text-decoration-none d-flex align-items-center"
        >
          <i class="bi bi-receipt me-2"></i>
          <span>Заказы</span>
        </NuxtLink>
      </li>

      
      <li v-if="authStore.hasPermission('products.view')" class="mb-2">
        <NuxtLink
          to="/admin/products"
          class="text-decoration-none d-flex align-items-center"
        >
          <i class="bi bi-box-seam me-2"></i>
          <span>Товары</span>
        </NuxtLink>
      </li>

      
      <li v-if="authStore.hasPermission('reports.view')" class="mb-2">
        <NuxtLink
          to="/admin/reports"
          class="text-decoration-none d-flex align-items-center"
        >
          <i class="bi bi-graph-up me-2"></i>
          <span>Отчёты</span>
        </NuxtLink>
      </li>

      
      <li v-if="authStore.hasPermission('pos.access')" class="mb-2">
        <NuxtLink
          to="/admin/pos-sales"
          class="text-decoration-none d-flex align-items-center"
        >
          <i class="bi bi-cash-stack me-2"></i>
          <span>POS продажи</span>
        </NuxtLink>
      </li>

      
      <li v-if="authStore.isAdmin" class="mb-2">
        <NuxtLink
          to="/admin/settings"
          class="text-decoration-none d-flex align-items-center"
        >
          <i class="bi bi-gear me-2"></i>
          <span>Настройки</span>
        </NuxtLink>
      </li>

      
      <li v-if="authStore.isAdmin" class="mb-2">
        <NuxtLink
          to="/admin/users"
          class="text-decoration-none d-flex align-items-center"
        >
          <i class="bi bi-people me-2"></i>
          <span>Пользователи</span>
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>

<script setup lang="ts">
import { useAuthStore } from "@/stores/auth";
const authStore = useAuthStore();
</script>

<style scoped>
.sidebar {
  width: 250px;
  min-height: 100vh;
}
</style>
