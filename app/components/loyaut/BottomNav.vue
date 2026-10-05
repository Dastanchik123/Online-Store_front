<template>
  <nav
    class="bottom-nav d-lg-none"
    role="navigation"
    aria-label="Основная мобильная навигация"
  >
    <NuxtLink to="/" class="nav-item" active-class="active" exact-active-class="active">
      <i class="bi bi-house" aria-hidden="true"></i>
      <span>Главная</span>
    </NuxtLink>

    <NuxtLink to="/catalog" class="nav-item" active-class="active">
      <i class="bi bi-grid" aria-hidden="true"></i>
      <span>Каталог</span>
    </NuxtLink>

    <NuxtLink
      to="/tsd"
      class="nav-item nav-item-action"
      active-class="active"
      aria-label="Сканировать товар"
    >
      <span class="action-btn">
        <i class="bi bi-upc-scan" aria-hidden="true"></i>
      </span>
    </NuxtLink>

    <NuxtLink to="/cart" class="nav-item" active-class="active">
      <span class="position-relative">
        <i class="bi bi-cart" aria-hidden="true"></i>
        <span v-if="cartStore.itemsCount > 0" class="nav-badge">{{
          cartStore.itemsCount
        }}</span>
      </span>
      <span>Корзина</span>
    </NuxtLink>

    <button
      type="button"
      class="nav-item nav-item-more"
      :class="{ active: mobileMenu.isOpen.value }"
      aria-label="Ещё"
      :aria-expanded="mobileMenu.isOpen.value"
      @click="mobileMenu.toggle()"
    >
      <i class="bi bi-list" aria-hidden="true"></i>
      <span>Ещё</span>
    </button>
  </nav>
</template>

<script setup>
const cartStore = useCartStore();
const mobileMenu = useMobileMenu();
</script>

<style scoped>
.bottom-nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  /* Ниже .header (z-index: 1000 в Header.vue) — иначе панель перекрывает
     содержимое офф-канвас sidebar (он вложен в .header и своим z-index:2000
     ограничен стек-контекстом родителя, поэтому сравнивается с этим
     элементом как с 1000, а не 2000). */
  z-index: 900;
  display: flex;
  align-items: center;
  justify-content: space-around;
  background: #0f172a;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-bottom: env(safe-area-inset-bottom, 0);
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
}

.nav-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 0.4rem 0.25rem calc(0.4rem + env(safe-area-inset-bottom, 0) * 0);
  min-height: 56px;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  text-decoration: none;
  font-size: 0.68rem;
  font-weight: 600;
  line-height: 1.1;
  transition: color 0.2s ease;
}

.nav-item i {
  font-size: 1.3rem;
  line-height: 1;
}

.nav-item:active {
  transform: scale(0.94);
}

.nav-item.active {
  color: #38bdf8;
}

.nav-badge {
  position: absolute;
  top: -6px;
  right: -8px;
  background: #ef4444;
  color: #fff;
  font-size: 0.6rem;
  font-weight: 700;
  min-width: 15px;
  height: 15px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
}

/* Центральная кнопка-действие ("+"-эквивалент — сканирование товара) */
.nav-item-action {
  flex: 1;
  justify-content: flex-start;
  min-height: 56px;
}

.action-btn {
  width: 52px;
  height: 52px;
  margin-top: -26px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%);
  color: #0f172a;
  font-size: 1.5rem;
  box-shadow: 0 6px 16px rgba(56, 189, 248, 0.45);
  border: 3px solid #0f172a;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.nav-item-action:active .action-btn {
  transform: scale(0.92);
}

.nav-item-action.active .action-btn {
  box-shadow: 0 6px 20px rgba(56, 189, 248, 0.65);
}

.nav-item-more.active {
  color: #38bdf8;
}
</style>
