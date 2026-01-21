<template>
  <header
    class="header"
    :class="{
      'header-scrolled': isScrolled,
      'mobile-menu-open': isMobileMenuOpen,
    }"
  >
    <nav class="nav container">
      <NuxtLink to="/" class="logo d-flex align-items-center gap-2">
        <span class="logo-text">{{ settings.site_name || "MyShop" }}</span>
      </NuxtLink>

      
      <ul class="menu d-none d-lg-flex">
        <li>
          <NuxtLink to="/" active-class="active">Главная</NuxtLink>
        </li>
        <li>
          <NuxtLink to="/blog" active-class="active">Блог</NuxtLink>
        </li>
        <li>
          <NuxtLink to="/about" active-class="active">О нас</NuxtLink>
        </li>
        <li>
          <NuxtLink to="/contacts" active-class="active">Контакты</NuxtLink>
        </li>
        <li>
          <NuxtLink to="/order-tracking" active-class="active"
            >Где мой заказ?</NuxtLink
          >
        </li>
        <li>
          <NuxtLink
            to="/wishlist"
            active-class="active"
            class="position-relative"
          >
            <i class="bi bi-heart"></i>
            <span
              v-if="wishlist.items.value.length > 0"
              class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger"
              style="font-size: 0.6rem"
              >{{ wishlist.items.value.length }}</span
            >
          </NuxtLink>
        </li>
        <li>
          <NuxtLink to="/cart" active-class="active" class="position-relative">
            <i class="bi bi-cart"></i>
            <div
              v-if="cartStore.itemsCount > 0"
              class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger cart-badge"
              :class="{ 'badge-bounce': isBadgeAnimating }"
            >
              {{ cartStore.itemsCount }}
            </div>
          </NuxtLink>
        </li>

        <li v-if="authStore.isAuthenticated">
          <div class="dropdown">
            <button
              class="btn-profile dropdown-toggle"
              type="button"
              data-bs-toggle="dropdown"
              aria-expanded="false"
            >
              <i class="bi bi-person-circle"></i>
              {{ authStore.user?.name || "Профиль" }}
            </button>
            <ul class="dropdown-menu dropdown-menu-end shadow-lg border-0">
              <li>
                <NuxtLink class="dropdown-item text-dark" to="/profile">
                  <i class="bi bi-person me-2"></i>Профиль
                </NuxtLink>
              </li>
              <li>
                <NuxtLink class="dropdown-item text-dark" to="/profile/orders">
                  <i class="bi bi-bag-check me-2"></i>Мои заказы
                </NuxtLink>
              </li>
              <li v-if="authStore.isPurchaser || authStore.isAdmin">
                <NuxtLink
                  class="dropdown-item text-primary py-2"
                  to="/purchaser"
                >
                  <i class="bi bi-briefcase-fill me-2"></i>Панель Закупщика
                </NuxtLink>
              </li>
              <li v-if="authStore.isCashier || authStore.isAdmin">
                <NuxtLink class="dropdown-item text-info py-2" to="/cashier">
                  <i class="bi bi-wallet2 me-2"></i>Рабочее место Кассира
                </NuxtLink>
              </li>
              <li v-if="authStore.isAdmin">
                <NuxtLink
                  class="dropdown-item text-primary fw-bold py-2"
                  to="/admin"
                >
                  <i class="bi bi-shield-lock-fill me-2"></i>Админ-панель
                </NuxtLink>
              </li>
              <li><hr class="dropdown-divider" /></li>
              <li>
                <button class="dropdown-item text-danger" @click="handleLogout">
                  <i class="bi bi-box-arrow-right me-2"></i>Выйти
                </button>
              </li>
            </ul>
          </div>
        </li>

        <li v-else>
          <NuxtLink to="/auth/login" class="btn-login">
            Войти <i class="bi bi-arrow-right-short"></i>
          </NuxtLink>
        </li>
      </ul>

      
      <div class="d-flex align-items-center gap-3 d-lg-none">
        <NuxtLink to="/cart" class="mobile-cart-btn position-relative">
          <i class="bi bi-cart fs-4"></i>
          <span
            v-if="cartStore.itemsCount > 0"
            class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger cart-badge"
            :class="{ 'badge-bounce': isBadgeAnimating }"
          >
            {{ cartStore.itemsCount }}
          </span>
        </NuxtLink>

        <button
          class="mobile-menu-toggle"
          @click="isMobileMenuOpen = !isMobileMenuOpen"
          aria-label="Меню"
        >
          <i class="bi" :class="isMobileMenuOpen ? 'bi-x-lg' : 'bi-list'"></i>
        </button>
      </div>

      
      <transition name="fade">
        <div
          v-if="isMobileMenuOpen"
          class="mobile-menu-overlay"
          @click="isMobileMenuOpen = false"
        ></div>
      </transition>

      
      <aside class="mobile-sidebar" :class="{ open: isMobileMenuOpen }">
        <div class="mobile-sidebar-header">
          <NuxtLink
            to="/"
            class="logo d-flex align-items-center gap-2"
            @click="isMobileMenuOpen = false"
          >
            <img
              v-if="settings.site_logo"
              :src="settings.site_logo"
              alt="Logo"
              class="logo-img"
            />
            <span class="logo-text">{{ settings.site_name || "MyShop" }}</span>
          </NuxtLink>
          <button
            class="btn-close btn-close-white"
            @click="isMobileMenuOpen = false"
          ></button>
        </div>

        <div class="mobile-sidebar-body">
          <ul class="mobile-nav-list">
            <li>
              <NuxtLink to="/" @click="isMobileMenuOpen = false">
                <i class="bi bi-house me-3"></i>Главная
              </NuxtLink>
            </li>
            <li>
              <NuxtLink to="/catalog" @click="isMobileMenuOpen = false">
                <i class="bi bi-grid me-3"></i>Каталог
              </NuxtLink>
            </li>
            <li>
              <NuxtLink to="/wishlist" @click="isMobileMenuOpen = false">
                <i class="bi bi-heart me-3"></i>Избранное
              </NuxtLink>
            </li>
            <li>
              <NuxtLink to="/cart" @click="isMobileMenuOpen = false">
                <i class="bi bi-cart me-3"></i>Корзина
              </NuxtLink>
            </li>
            <hr class="opacity-10" />
            <li>
              <NuxtLink to="/blog" @click="isMobileMenuOpen = false">
                <i class="bi bi-journal-text me-3"></i>Блог
              </NuxtLink>
            </li>
            <li>
              <NuxtLink to="/order-tracking" @click="isMobileMenuOpen = false">
                <i class="bi bi-truck me-3"></i>Отследить заказ
              </NuxtLink>
            </li>
            <li>
              <NuxtLink to="/about" @click="isMobileMenuOpen = false">
                <i class="bi bi-info-circle me-3"></i>О нас
              </NuxtLink>
            </li>
            <li>
              <NuxtLink to="/contacts" @click="isMobileMenuOpen = false">
                <i class="bi bi-telephone me-3"></i>Контакты
              </NuxtLink>
            </li>
          </ul>
          
          <ul
            class="mobile-nav-list border-top pt-3 border-secondary border-opacity-25"
          >
            <template v-if="authStore.isAuthenticated">
              <li class="mb-3 px-2">
                <div class="d-flex align-items-center text-white-50 small">
                  <i class="bi bi-person-circle fs-4 me-2"></i>
                  <div>
                    <div class="text-white fw-bold">
                      {{ authStore.user?.name }}
                    </div>
                    <div>{{ authStore.user?.email }}</div>
                  </div>
                </div>
              </li>
              <li>
                <NuxtLink to="/profile" @click="isMobileMenuOpen = false">
                  <i class="bi bi-person-gear me-3"></i>Профиль
                </NuxtLink>
              </li>
              <li>
                <NuxtLink
                  to="/profile/orders"
                  @click="isMobileMenuOpen = false"
                >
                  <i class="bi bi-bag-check me-3"></i>Мои заказы
                </NuxtLink>
              </li>
              <li v-if="authStore.isPurchaser || authStore.isAdmin">
                <NuxtLink
                  to="/purchaser"
                  @click="isMobileMenuOpen = false"
                  class="text-primary"
                >
                  <i class="bi bi-briefcase me-3"></i>Панель Закупщика
                </NuxtLink>
              </li>
              <li v-if="authStore.isCashier || authStore.isAdmin">
                <NuxtLink
                  to="/cashier"
                  @click="isMobileMenuOpen = false"
                  class="text-info"
                >
                  <i class="bi bi-wallet2 me-3"></i>Рабочее место Кассира
                </NuxtLink>
              </li>
              <li v-if="authStore.isAdmin">
                <NuxtLink
                  to="/admin"
                  @click="isMobileMenuOpen = false"
                  class="text-info fw-bold"
                >
                  <i class="bi bi-speedometer2 me-3"></i>Админ-панель
                </NuxtLink>
              </li>
              <li>
                <button
                  class="btn btn-link w-100 text-start text-danger text-decoration-none p-3 rounded-3 d-flex align-items-center"
                  @click="handleLogoutMobil"
                  style="background: rgba(220, 53, 69, 0.1)"
                >
                  <i class="bi bi-box-arrow-right me-3"></i>Выйти
                </button>
              </li>
            </template>
            <template v-else>
              <li>
                <NuxtLink
                  to="/auth/login"
                  @click="isMobileMenuOpen = false"
                  class="btn btn-primary w-100 justify-content-center text-dark fw-bold"
                >
                  <i class="bi bi-box-arrow-in-right me-2"></i>Войти /
                  Регистрация
                </NuxtLink>
              </li>
            </template>
          </ul>
        </div>
      </aside>
    </nav>
  </header>
</template>

<script setup>
const authStore = useAuthStore();
const cartStore = useCartStore();
const { logout } = useAuth();
const { getCart } = useCart();
const wishlist = useWishlist();
const { fetchPublicSettings, settings } = useSettings();

const isBadgeAnimating = ref(false);
const isScrolled = ref(false);
const isMobileMenuOpen = ref(false);


const handleScroll = () => {
  isScrolled.value = window.scrollY > 20;
};

onMounted(() => {
  fetchPublicSettings();
  window.addEventListener("scroll", handleScroll);
  if (authStore.isAuthenticated) {
    loadCart();
    wishlist.fetchWishlist();
  }
});

onUnmounted(() => {
  window.removeEventListener("scroll", handleScroll);
});

const loadCart = async () => {
  try {
    await getCart();
  } catch (error) {
    console.error("Cart fetch error:", error);
  }
};

watch(
  () => authStore.isAuthenticated,
  (isAuth) => {
    if (isAuth) loadCart();
    else cartStore.clearCart();
  }
);

watch(
  () => cartStore.itemsCount,
  (newCount, oldCount) => {
    if (newCount !== oldCount) {
      isBadgeAnimating.value = true;
      setTimeout(() => (isBadgeAnimating.value = false), 300);
    }
  }
);

const handleLogout = async () => {
  await logout();
};

const handleLogoutMobil = async () => {
  isMobileMenuOpen.value = false;
  await logout();
};
</script>

<style scoped>
.header {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  z-index: 1000;
  padding: 1.25rem 0;
  transition: all 0.4s cubic-bezier(0.165, 0.84, 0.44, 1);
  background: #0f172a;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.header-scrolled {
  padding: 0.75rem 0;
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  border-bottom-color: rgba(255, 255, 255, 0.1);
}

.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.logo {
  color: #ffffff;
  font-size: 1.5rem;
  font-weight: 800;
  text-decoration: none;
  letter-spacing: -0.5px;
}

.logo-accent {
  color: #38bdf8;
}

.menu {
  display: flex;
  align-items: center;
  gap: 2.5rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.menu a {
  color: rgba(255, 255, 255, 0.75);
  text-decoration: none;
  font-weight: 500;
  font-size: 0.95rem;
  transition: all 0.3s ease;
}

.menu a:hover {
  color: #ffffff;
}

.active {
  color: #38bdf8 !important;
}


.btn-profile {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.05);
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 50px;
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-profile:hover {
  background: rgba(255, 255, 255, 0.15);
}

.btn-login {
  background: #38bdf8;
  color: #0f172a !important;
  padding: 0.6rem 1.5rem;
  border-radius: 50px;
  font-weight: 600;
  box-shadow: 0 4px 15px rgba(56, 189, 248, 0.3);
}

.btn-login:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(56, 189, 248, 0.4);
}


.mobile-menu-toggle {
  background: none;
  border: none;
  color: #ffffff;
  font-size: 1.75rem;
  padding: 0;
  cursor: pointer;
}

.mobile-cart-btn {
  color: #ffffff;
  text-decoration: none;
}


.mobile-sidebar {
  position: fixed;
  top: 0;
  right: -280px;
  width: 280px;
  height: 100vh;
  background: #0f172a;
  z-index: 2000;
  transition: transform 0.4s cubic-bezier(0.165, 0.84, 0.44, 1);
  display: flex;
  flex-direction: column;
  box-shadow: -10px 0 30px rgba(0, 0, 0, 0.5);
}

.mobile-sidebar.open {
  transform: translateX(-280px);
}

.mobile-sidebar-header {
  padding: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.mobile-sidebar-body {
  flex: 1;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.mobile-nav-list {
  list-style: none;
  padding: 0;
  margin: 0 0 2rem 0;
}

.mobile-nav-list li {
  margin-bottom: 1rem;
}

.mobile-nav-list a {
  color: rgba(255, 255, 255, 0.8);
  text-decoration: none;
  font-size: 1.1rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
}

.mobile-nav-list a:active {
  background: rgba(56, 189, 248, 0.1);
  color: #38bdf8;
}

.mobile-sidebar-footer {
  margin-top: auto;
  padding-top: 1.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.mobile-menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100vh;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  z-index: 1500;
}


.cart-badge {
  font-size: 0.65rem;
  padding: 0.35em 0.5em;
  transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.badge-bounce {
  animation: badgeBounce 0.3s ease;
}

@keyframes badgeBounce {
  0%,
  100% {
    transform: translate(-50%, -50%) scale(1);
  }
  50% {
    transform: translate(-50%, -50%) scale(1.4);
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.logo-img {
  height: 40px;
  width: auto;
  object-fit: contain;
}
</style>
