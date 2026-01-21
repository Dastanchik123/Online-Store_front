<script setup>
const { items, fetchWishlist, toggleWishlist } = useWishlist();
const ui = useUiStore();

const loading = ref(true);

onMounted(async () => {
  await fetchWishlist();
  loading.value = false;
});

const removeFromWishlist = async (id) => {
  try {
    await toggleWishlist(id);
    ui.addToast("Товар удален из избранного", "info");
  } catch (e) {
    ui.addToast("Ошибка при удалении", "error");
  }
};
</script>

<template>
  <div class="container py-5 min-vh-100">
    <div class="d-flex justify-content-between align-items-center mb-5">
      <div>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-1">
            <li class="breadcrumb-item"><NuxtLink to="/">Главная</NuxtLink></li>
            <li class="breadcrumb-item active">Избранное</li>
          </ol>
        </nav>
        <h1 class="fw-bold h2 mb-0">Мои желания ❤️</h1>
      </div>
      <div class="text-muted small">{{ items.length }} товаров</div>
    </div>

    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border text-primary" role="status"></div>
    </div>

    <div v-else-if="items.length > 0" class="row g-4">
      <div
        v-for="item in items"
        :key="item.id"
        class="col-xl-3 col-lg-4 col-md-6"
      >
        <div
          class="card border-0 shadow-sm rounded-4 overflow-hidden h-100 product-wish-card"
        >
          <div class="position-relative" style="padding-top: 100%">
            <img
              :src="item.product.image_url"
              class="position-absolute top-0 start-0 w-100 h-100 object-fit-cover"
              :alt="item.product.name"
            />
            <button
              @click="removeFromWishlist(item.product_id)"
              class="btn btn-light rounded-circle position-absolute top-0 end-0 m-3 shadow-sm border-0"
            >
              <i class="bi bi-heart-fill text-danger"></i>
            </button>
          </div>
          <div class="card-body p-3">
            <h6 class="fw-bold text-truncate mb-1">{{ item.product.name }}</h6>
            <div class="d-flex justify-content-between align-items-center mt-2">
              <div class="fw-bold text-primary">
                {{ item.product.formatted_price }}
              </div>
              <NuxtLink
                :to="`/product/${item.product.id}`"
                class="btn btn-primary btn-sm rounded-pill px-3"
                >Купить</NuxtLink
              >
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="text-center py-5">
      <div class="mb-4">
        <i class="bi bi-heart-break display-1 text-muted opacity-25"></i>
      </div>
      <h3 class="fw-bold">Ваш список желаний пуст</h3>
      <p class="text-muted">
        Добавляйте товары, которые вам понравились, чтобы не потерять их!
      </p>
      <NuxtLink
        to="/catalog"
        class="btn btn-primary rounded-pill px-5 py-3 mt-3 shadow-sm"
        >В каталог</NuxtLink
      >
    </div>
  </div>
</template>

<style scoped>
.product-wish-card {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.product-wish-card:hover {
  transform: translateY(-8px);
}
</style>
