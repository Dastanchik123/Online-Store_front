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
const { items, toggleWishlist, isInWishlist } = useWishlist();
const { getImageUrl } = useImageUrl();

const formatPrice = (price) => {
  if (!price) return "0.00";
  return parseFloat(price).toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
};

const getProductImage = (product) => {
  if (product.image) {
    return getImageUrl(product.image);
  }
  return "https://dummyimage.com/300x300/0f172a/fff&text=Товар";
};

const handleAddToCart = async () => {
  if (!authStore.isAuthenticated) {
    await navigateTo("/auth/login");
    return;
  }

  try {
    await addToCart(props.product.id, 1);
    uiStore.success(
      `
      <div class="d-flex align-items-center">
        <span class="me-2">Товар добавлен!</span>
        <a href="/cart" class="btn btn-sm btn-light rounded-pill px-3 fw-bold decoration-none text-primary shadow-sm" style="font-size: 0.75rem">
          В корзину <i class="bi bi-arrow-right ms-1"></i>
        </a>
      </div>
    `,
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
    <div
      v-if="viewMode === 'grid'"
      class="product-card-premium card h-100 shadow-sm border-0"
    >
      <div
        class="product-image-wrapper position-relative ratio ratio-1x1 overflow-hidden"
      >
        <img
          :src="getProductImage(product)"
          :alt="product.name"
          class="card-img-top product-img"
          style="object-fit: cover"
        />

        <div
          class="position-absolute top-0 start-0 m-3 d-flex flex-column gap-2 z-2"
        >
          <span
            v-if="product.sale_price"
            class="badge bg-danger rounded-pill shadow-sm px-3 py-2"
          >
            SALE
          </span>
          <span
            v-if="!product.in_stock"
            class="badge bg-secondary rounded-pill shadow-sm px-3 py-2"
          >
            Нет в наличии
          </span>
        </div>

        <button
          class="btn-wishlist position-absolute top-0 end-0 m-3 z-3"
          :class="{ active: isInWishlist(product.id) }"
          @click.stop.prevent="toggleWishlist(product.id)"
        >
          <i
            class="bi"
            :class="isInWishlist(product.id) ? 'bi-heart-fill' : 'bi-heart'"
          ></i>
        </button>

        <div
          class="product-overlay d-flex flex-column align-items-center justify-content-center"
        >
          <NuxtLink
            :to="`/product/${product.id}`"
            class="btn btn-light rounded-pill px-4 py-2 fw-bold text-dark shadow-lg btn-quick-view mb-2"
          >
            <i class="bi bi-eye me-2"></i>Просмотр
          </NuxtLink>
        </div>
      </div>

      <div class="card-body d-flex flex-column p-4">
        <div class="mb-2">
          <NuxtLink
            v-if="product.category"
            :to="`/catalog?category_id=${product.category.id}`"
            class="text-primary text-decoration-none small fw-bold text-uppercase ls-1"
          >
            {{ product.category.name }}
          </NuxtLink>
        </div>

        <h5 class="card-title fw-bold mb-2 text-dark name-clamp">
          {{ product.name }}
        </h5>

        <div class="price-block mb-3">
          <template v-if="product.sale_price">
            <span class="h4 fw-bolder text-primary mb-0 me-2">{{
              formatPrice(product.sale_price)
            }}</span>
            <span class="text-muted text-decoration-line-through small">{{
              formatPrice(product.price)
            }}</span>
          </template>
          <template v-else>
            <span class="h4 fw-bolder text-primary mb-0">{{
              formatPrice(product.price)
            }}</span>
          </template>
          <span class="text-muted small ms-1">сом</span>
        </div>

        <div class="d-grid gap-2 mt-auto">
          <button
            class="btn btn-primary d-flex align-items-center justify-content-center py-2 px-3 rounded-3 shadow-md transition-all btn-add-cart"
            :disabled="!product.in_stock"
            @click="handleAddToCart"
          >
            <i class="bi bi-cart-plus-fill me-2 fs-5"></i>
            <span class="fw-bold">В КОРЗИНУ</span>
          </button>

          <button
            class="btn btn-outline-secondary py-2 px-3 rounded-3 border-2 fw-bold small transition-all btn-one-click"
            :disabled="!product.in_stock"
            @click="handleBuyNow"
          >
            КУПИТЬ В 1 КЛИК
          </button>
        </div>
      </div>
    </div>

    <div
      v-else
      class="product-card-list card shadow-sm border-0 p-3 overflow-hidden"
    >
      <div class="row g-0 align-items-center">
        <div class="col-4 col-sm-3 col-md-2">
          <div
            class="ratio ratio-1x1 rounded-4 overflow-hidden shadow-sm product-image-wrapper"
          >
            <img
              :src="getProductImage(product)"
              class="img-fluid product-img"
              :alt="product.name"
              style="object-fit: cover"
            />
          </div>
        </div>
        <div class="col-8 col-sm-9 col-md-10">
          <div class="card-body py-0 ps-3 ps-md-4">
            <div class="d-flex justify-content-between align-items-start mb-2">
              <div>
                <span
                  v-if="product.category"
                  class="small text-primary fw-bold text-uppercase ls-1"
                >
                  {{ product.category.name }}
                </span>
                <h5 class="card-title fw-bold mt-1 text-dark mb-0">
                  {{ product.name }}
                </h5>
              </div>
              <div class="text-end">
                <div class="h4 fw-bolder text-primary mb-0">
                  {{ formatPrice(product.sale_price || product.price) }}
                  <small class="fw-normal">сом</small>
                </div>
                <small
                  v-if="product.sale_price"
                  class="text-muted text-decoration-line-through"
                >
                  {{ formatPrice(product.price) }}
                </small>
              </div>
            </div>

            <div class="d-flex flex-wrap gap-2 mt-3">
              <button
                class="btn btn-primary rounded-pill px-4 fw-bold shadow-md btn-add-cart"
                :disabled="!product.in_stock"
                @click="handleAddToCart"
              >
                <i class="bi bi-cart-plus me-2"></i>В корзину
              </button>

              <button
                class="btn btn-outline-secondary rounded-pill px-4 fw-bold btn-one-click"
                :disabled="!product.in_stock"
                @click="handleBuyNow"
              >
                Купить сейчас
              </button>

              <NuxtLink
                :to="`/product/${product.id}`"
                class="btn btn-light rounded-pill px-3"
              >
                <i class="bi bi-info-circle"></i>
              </NuxtLink>

              <button
                class="btn btn-light rounded-pill px-3 ms-1"
                :class="{ 'text-danger': isInWishlist(product.id) }"
                @click.stop.prevent="toggleWishlist(product.id)"
              >
                <i
                  class="bi"
                  :class="
                    isInWishlist(product.id) ? 'bi-heart-fill' : 'bi-heart'
                  "
                ></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.product-card-premium {
  transition: all 0.4s cubic-bezier(0.165, 0.84, 0.44, 1);
  border-radius: 20px;
  background: #ffffff;
}

.product-card-premium:hover {
  transform: translateY(-10px);
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.12) !important;
}

.product-img {
  transition: transform 0.8s ease;
}

.product-card-premium:hover .product-img {
  transform: scale(1.1);
}

.product-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(2px);
  opacity: 0;
  transition: opacity 0.3s ease;
  z-index: 10;
  pointer-events: none;
}

.product-overlay .btn-quick-view {
  pointer-events: auto;
}

.product-card-premium:hover .product-overlay {
  opacity: 1;
}

.ls-1 {
  letter-spacing: 0.05rem;
}

.name-clamp {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 2.8rem;
}

.shadow-md {
  box-shadow: 0 4px 12px rgba(56, 189, 248, 0.25);
}

.btn-add-cart {
  border: none;
  background: linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%);
  transition: all 0.3s ease;
}

.btn-add-cart:hover:not(:disabled) {
  transform: scale(1.02);
  filter: brightness(1.1);
  box-shadow: 0 8px 20px rgba(56, 189, 248, 0.4);
}

.btn-add-cart:active:not(:disabled) {
  transform: scale(0.98);
}

.btn-one-click {
  font-size: 0.8rem;
  letter-spacing: 0.5px;
  border-width: 2px !important;
}

.btn-one-click:hover:not(:disabled) {
  background-color: #f8fafc;
  color: #1e293b;
  border-color: #1e293b;
}

.btn-quick-view {
  transform: translateY(20px);
  transition: all 0.3s ease;
}

.product-card-premium:hover .btn-quick-view {
  transform: translateY(0);
}

.product-card-list {
  border-radius: 20px;
  transition: all 0.3s ease;
}

.product-card-list:hover {
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08) !important;
}

.btn-wishlist {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.9);
  color: #1e293b;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(4px);
}

.btn-wishlist:hover {
  transform: scale(1.1);
  background: #ffffff;
  color: #ef4444;
}

.btn-wishlist.active {
  color: #ef4444;
  background: #ffffff;
}
</style>
