<script setup>
const props = defineProps({
  product: {
    type: Object,
    required: true,
  },
  viewMode: {
    type: String,
    default: "grid",
  },
});

const { addToCart } = useCart();
const authStore = useAuthStore();
const uiStore = useUiStore();
const router = useRouter();
const { toggleWishlist, isInWishlist } = useWishlist();
const { getImageUrl } = useImageUrl();

const formatPrice = (price) => {
  if (!price) return "0";
  return parseFloat(price).toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
};

const getProductImage = (product) => {
  if (product.image) return getImageUrl(product.image);
  return "https://dummyimage.com/300x300/e2e8f0/94a3b8&text=Фото";
};

const discountPercent = computed(() => {
  if (!props.product.sale_price || !props.product.price) return 0;
  return Math.round((1 - props.product.sale_price / props.product.price) * 100);
});

const handleAddToCart = async () => {
  if (!authStore.isAuthenticated) {
    await navigateTo("/auth/login");
    return;
  }
  try {
    await addToCart(props.product.id, 1);
    uiStore.success(
      `<div class="d-flex align-items-center">
        <span class="me-2">Товар добавлен!</span>
        <a href="/cart" class="btn btn-sm btn-light rounded-pill px-3 fw-bold text-primary" style="font-size:0.75rem">
          В корзину <i class="bi bi-arrow-right ms-1"></i>
        </a>
      </div>`,
      true,
    );
  } catch (error) {
    uiStore.error(error.data?.message || "Ошибка добавления в корзину");
  }
};

const handleBuyNow = async () => {
  if (!authStore.isAuthenticated) {
    await navigateTo("/auth/login");
    return;
  }
  try {
    await addToCart(props.product.id, 1);
    await router.push("/checkout");
  } catch (error) {
    uiStore.error("Ошибка при оформлении заказа");
  }
};
</script>

<template>
  <div class="product-card-container h-100">

    <!-- ===== GRID MODE — Marketplace style ===== -->
    <div v-if="viewMode === 'grid'" class="pc-grid h-100">

      <!-- Фото -->
      <NuxtLink :to="`/product/${product.id}`" class="pc-img-link stretched-link">
        <div class="pc-img-wrap ratio ratio-1x1">
          <img :src="getProductImage(product)" :alt="product.name" class="pc-img img-loading" />

          <!-- Бейдж скидки -->
          <div v-if="discountPercent > 0" class="pc-discount">
            -{{ discountPercent }}%
          </div>

          <!-- Нет в наличии -->
          <div v-if="!product.in_stock" class="pc-unavailable">
            <span>Нет в наличии</span>
          </div>

          <!-- Hover-оверлей: только на десктопе -->
          <div class="pc-hover-overlay">
            <span class="pc-quick-view">
              <i class="bi bi-eye me-1"></i> Просмотр
            </span>
          </div>
        </div>
      </NuxtLink>

      <!-- Кнопка избранного -->
      <button
        class="pc-wishlist"
        :class="{ active: isInWishlist(product.id) }"
        @click.stop.prevent="toggleWishlist(product.id)"
      >
        <i class="bi" :class="isInWishlist(product.id) ? 'bi-heart-fill' : 'bi-heart'"></i>
      </button>

      <!-- Инфо -->
      <div class="pc-body">
        <div class="pc-price-row">
          <span class="pc-price">{{ formatPrice(product.sale_price || product.price) }} <span class="pc-currency">сом</span></span>
          <span v-if="product.sale_price" class="pc-old-price">{{ formatPrice(product.price) }} сом</span>
        </div>

        <div class="pc-name">
          <span class="pc-title">{{ product.name }}</span>
        </div>

        <button
          class="pc-cart-btn"
          :disabled="!product.in_stock"
          @click="handleAddToCart"
        >
          <i class="bi bi-cart2"></i> В корзину
        </button>
        <button
          class="pc-buynow-btn"
          :disabled="!product.in_stock"
          @click="handleBuyNow"
        >
          Купить в 1 клик
        </button>
      </div>
    </div>

    <!-- ===== LIST MODE ===== -->
    <div v-else class="pc-list card shadow-sm border-0 overflow-hidden">
      <div class="row g-0 align-items-center">
        <div class="col-4 col-sm-3 col-md-2">
          <div class="ratio ratio-1x1 rounded-3 overflow-hidden">
            <img :src="getProductImage(product)" :alt="product.name" class="pc-img img-loading" />
          </div>
        </div>
        <div class="col-8 col-sm-9 col-md-10">
          <div class="card-body py-2 ps-3 ps-md-4">
            <h5 class="pc-list-name">{{ product.name }}</h5>
            <div class="d-flex align-items-baseline gap-2 mb-2">
              <span class="pc-price">{{ formatPrice(product.sale_price || product.price) }} сом</span>
              <span v-if="product.sale_price" class="pc-old-price">{{ formatPrice(product.price) }}</span>
            </div>
            <div class="d-flex flex-wrap gap-2 pc-list-actions">
              <button class="btn btn-primary btn-sm rounded-pill fw-bold" :disabled="!product.in_stock" @click="handleAddToCart">
                <i class="bi bi-cart-plus me-1"></i>В корзину
              </button>
              <button class="btn btn-outline-secondary btn-sm rounded-pill fw-bold" :disabled="!product.in_stock" @click="handleBuyNow">
                Купить сейчас
              </button>
              <NuxtLink :to="`/product/${product.id}`" class="btn btn-light btn-sm rounded-pill stretched-link">
                <i class="bi bi-info-circle"></i>
              </NuxtLink>
              <button
                class="btn btn-light btn-sm rounded-pill"
                :class="{ 'text-danger': isInWishlist(product.id) }"
                @click.stop.prevent="toggleWishlist(product.id)"
              >
                <i class="bi" :class="isInWishlist(product.id) ? 'bi-heart-fill' : 'bi-heart'"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* =========== GRID CARD =========== */
.pc-grid {
  position: relative;
  background: #fff;
  display: flex;
  flex-direction: column;
}

.pc-img-link {
  display: block;
  text-decoration: none;
}

.pc-img-wrap {
  overflow: hidden;
  background: #f5f5f5;
}

.pc-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s ease;
  position: absolute;
  top: 0; left: 0;
}

.pc-grid:hover .pc-img {
  transform: scale(1.06);
}

/* Скидка */
.pc-discount {
  position: absolute;
  bottom: 8px;
  left: 8px;
  z-index: 3;
  background: #ff3f6c;
  color: #fff;
  font-size: 0.72rem;
  font-weight: 800;
  padding: 2px 7px;
  border-radius: 4px;
}

/* Нет в наличии */
.pc-unavailable {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.42);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 4;
}
.pc-unavailable span {
  background: rgba(0,0,0,0.6);
  color: #fff;
  font-size: 0.8rem;
  font-weight: 600;
  padding: 3px 12px;
  border-radius: 20px;
}

/* Кнопка избранного */
.pc-wishlist {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 5;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: none;
  background: rgba(255,255,255,0.9);
  color: #aaa;
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 4px rgba(0,0,0,0.15);
  transition: color 0.2s;
}
.pc-wishlist:hover, .pc-wishlist.active { color: #ff3f6c; background: #fff; }

/* Инфо-блок */
.pc-body {
  padding: 7px 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

/* Цена */
.pc-price-row {
  display: flex;
  align-items: baseline;
  gap: 5px;
  flex-wrap: wrap;
  line-height: 1;
}
.pc-price {
  font-size: 1rem;
  font-weight: 800;
  color: #0f172a;
}
.pc-currency {
  font-size: 0.68rem;
  font-weight: 500;
  color: #64748b;
}
.pc-old-price {
  font-size: 0.72rem;
  color: #94a3b8;
  text-decoration: line-through;
}

/* Название */
.pc-name {
  font-size: 0.76rem;
  color: #64748b;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 2.1em;
  line-height: 1.35;
}
.pc-brand { font-weight: 700; color: #334155; }
.pc-sep  { color: #cbd5e1; }
.pc-title { color: #64748b; }

/* Кнопка корзины */
.pc-cart-btn {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 100%;
  padding: 7px 4px;
  margin-top: 4px;
  background: #38bdf8;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s;
}
.pc-cart-btn:hover:not(:disabled) { background: #0ea5e9; }
.pc-cart-btn:disabled { background: #cbd5e1; cursor: not-allowed; }

/* Hover-оверлей (показывается при наведении мышкой) */
.pc-hover-overlay {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.2);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.3s ease;
  z-index: 6;
  text-decoration: none;
  pointer-events: none;
}
.pc-quick-view {
  background: #fff;
  color: #0f172a;
  font-size: 0.85rem;
  font-weight: 700;
  padding: 8px 22px;
  border-radius: 24px;
  transform: translateY(12px);
  transition: transform 0.25s ease;
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
}

/* Кнопка «Купить в 1 клик» (скрыта на мобильных) */
.pc-buynow-btn {
  position: relative;
  z-index: 2;
  display: none;
  width: 100%;
  padding: 6px 4px;
  background: transparent;
  color: #64748b;
  border: 1.5px solid #e2e8f0;
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 4px;
}
.pc-buynow-btn:hover:not(:disabled) {
  border-color: #38bdf8;
  color: #0ea5e9;
}
.pc-buynow-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* ===== Планшеты (≥576px) ===== */
@media (min-width: 576px) {
  .pc-grid {
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 2px 10px rgba(0,0,0,0.07);
    transition: box-shadow 0.3s ease, transform 0.3s ease;
  }
  .pc-grid:hover {
    box-shadow: 0 14px 32px rgba(0,0,0,0.13);
    transform: translateY(-5px);
  }
  .pc-grid:hover .pc-hover-overlay {
    opacity: 1;
  }
  .pc-grid:hover .pc-quick-view {
    transform: translateY(0);
  }
  .pc-body { padding: 10px 12px 14px; }
  .pc-price { font-size: 1.1rem; }
  .pc-name { font-size: 0.85rem; }
  .pc-cart-btn { font-size: 0.83rem; padding: 9px 8px; }
  .pc-buynow-btn { display: flex; align-items: center; justify-content: center; }
}

/* ===== Десктоп (≥992px) ===== */
@media (min-width: 992px) {
  .pc-body { padding: 12px 16px 16px; }
  .pc-price { font-size: 1.25rem; }
  .pc-name {
    font-size: 0.9rem;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    min-height: 2.4em;
  }
  .pc-cart-btn {
    font-size: 0.9rem;
    padding: 11px 10px;
    border-radius: 10px;
  }
  .pc-buynow-btn {
    font-size: 0.8rem;
    padding: 7px 8px;
    border-radius: 8px;
  }
  .pc-wishlist { width: 36px; height: 36px; font-size: 1.1rem; }
  .pc-discount { font-size: 0.8rem; padding: 3px 10px; }
}

/* =========== LIST CARD =========== */
.pc-list {
  border-radius: 16px;
  transition: box-shadow 0.3s ease;
}
.pc-list:hover { box-shadow: 0 8px 24px rgba(0,0,0,0.09) !important; }

.pc-list-cat {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  color: #38bdf8;
  letter-spacing: 0.05em;
}
.pc-list-actions {
  position: relative;
  z-index: 2;
}
.pc-list-name {
  cursor: pointer;
  font-size: 0.95rem;
  font-weight: 700;
  color: #0f172a;
  margin: 2px 0 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
