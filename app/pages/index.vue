<script setup>

const { addToCart } = useCart();
const authStore = useAuthStore();
const uiStore = useUiStore();
const { getBanners } = useBanners();
const { getPosts } = useBlog();
const config = useRuntimeConfig();
const { setSeo } = useSeo();
const { getImageUrl } = useImageUrl();

const productsStore = useProductsStore();
const title = "Главная страница";

const searchQuery = ref('');
const showMoreLoading = ref(false);
const currentPage = ref(1);
const extendedProducts = ref([]);
const hasMore = ref(true);

const handleSearch = () => {
  if (!searchQuery.value.trim()) return;
  navigateTo(`/catalog?search=${encodeURIComponent(searchQuery.value.trim())}`);
};

const featuredProducts = computed(() => {
  if (extendedProducts.value.length > 0) return extendedProducts.value;
  return productsStore.products.slice(0, 8);
});

const handleShowMore = async () => {
  showMoreLoading.value = true;
  try {
    currentPage.value++;
    const res = await productsStore.fetchProducts({ 
      page: currentPage.value, 
      per_page: 40 
    });
    
    if (res && res.data && res.data.length < 40) {
      hasMore.value = false;
    }
    
    if (extendedProducts.value.length === 0) {
      extendedProducts.value = [...productsStore.products.slice(0, 8), ...res.data];
    } else {
      extendedProducts.value = [...extendedProducts.value, ...res.data];
    }
  } catch (e) {
    uiStore.error('Ошибка загрузки');
  } finally {
    showMoreLoading.value = false;
  }
};

setSeo({
  title: "Главная",
  description:
    "KurulushStore - Интернет-магазин с широким ассортиментом товаров. Электроника, одежда, товары для дома и многое другое. Быстрая доставка по всей стране!",
  keywords:
    "интернет-магазин, купить онлайн, электроника, одежда, товары для дома, доставка",
  type: "website",
});

const loading = ref(false);
const banners = ref([]);
const recentPosts = ref([]);


const categories = computed(() => productsStore.categories);
const loadData = async () => {
  loading.value = true;
  try {
    const [bannerRes, postRes] = await Promise.all([
      getBanners(),
      getPosts({ per_page: 3 }),
      productsStore.fetchProducts(),
      productsStore.fetchCategories(true),
    ]);
    banners.value = bannerRes;
    recentPosts.value = postRes.data || postRes;
  } catch (error) {
    console.error("Error loading data:", error);
    uiStore.error("Ошибка при загрузке данных");
  } finally {
    loading.value = false;
  }
};


const formatPrice = (price) => {
  if (!price) return "0.00";
  return parseFloat(price).toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};


const getProductImage = (product) => {
  if (product && product.image) {
    return getImageUrl(product.image);
  }
  return "https://dummyimage.com/300x300/0f172a/fff&text=Товар";
};

const getCategoryImage = (category) => {
  if (category && category.image) {
    return getImageUrl(category.image);
  }
  const name = category ? category.name : "Категория";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
    <rect width="100%" height="100%" fill="#1e293b"/>
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="28" font-weight="bold" fill="#38bdf8">${name}</text>
  </svg>`;
  try {
    const base64 = btoa(unescape(encodeURIComponent(svg)));
    return `data:image/svg+xml;base64,${base64}`;
  } catch (e) {
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
};


const handleAddToCart = async (productId) => {
  if (!authStore.isAuthenticated) {
    await navigateTo("/auth/login");
    return;
  }

  try {
    await addToCart(productId, 1);
    uiStore.success("Товар добавлен в корзину!");
  } catch (error) {
    uiStore.error(error.data?.message || "Ошибка добавления в корзину");
  }
};

onMounted(() => {
  loadData();
});

useHead({
  style: [
    {
      innerHTML: `
        .main-content-wrapper {
          padding-left: 8px !important;
          padding-right: 8px !important;
        }
        @media (min-width: 768px) {
          .main-content-wrapper {
            padding-left: 12px !important;
            padding-right: 12px !important;
          }
        }
      `
    }
  ]
});
</script>

<template>
  <Head>
    <Title>{{ title }}</Title>
  </Head>

  <div class="home-page">

    <!-- Поиск -->
    <div class="search-top-bar">
      <div class="container px-3">
        <form class="search-bar-wrap" @submit.prevent="handleSearch">
          <div class="search-bar">
            <i class="bi bi-search search-icon"></i>
            <input
              v-model="searchQuery"
              type="text"
              class="search-input"
              placeholder="Поиск товаров..."
              autocomplete="off"
            />
            <button type="submit" class="search-btn">
              <i class="bi bi-search"></i> <span class="d-none d-sm-inline">Найти</span>
            </button>
          </div>
        </form>
      </div>
    </div>

    <section class="hero-section mb-3 mb-md-5">
      <div
        id="heroCarousel"
        class="carousel slide carousel-fade"
        data-bs-ride="carousel"
        v-if="banners.length > 0"
      >
        <div class="carousel-indicators">
          <button
            v-for="(banner, index) in banners"
            :key="banner.id"
            type="button"
            data-bs-target="#heroCarousel"
            :data-bs-slide-to="index"
            :class="{ active: index === 0 }"
            :aria-label="'Slide ' + (index + 1)"
          ></button>
        </div>
        <div class="carousel-inner shadow-lg rounded-4 rounded-md-5 overflow-hidden">
          <div
            v-for="(banner, index) in banners"
            :key="banner.id"
            class="carousel-item"
            :class="{ active: index === 0 }"
          >
            <div
              class="h-100 w-100 position-relative"
              :style="{
                background: `linear-gradient(rgba(15, 23, 42, 0.45), rgba(15, 23, 42, 0.55)), url(${banner.image_url}) center/cover no-repeat`,
              }"
            >
              <div class="container h-100 d-flex align-items-center">
                <div class="row w-100">
                  <div
                    class="col-12 col-lg-8 col-xl-7 text-white animate-slide-up py-3 py-md-5"
                  >
                    <h1
                      class="hero-banner-title fw-bold mb-2 mb-md-4 shadow-text"
                    >
                      {{ banner.title }}
                    </h1>
                    <p
                      class="hero-banner-text mb-2 mb-md-4 shadow-text opacity-90"
                    >
                      {{ banner.subtitle }}
                    </p>
                    <NuxtLink
                      :to="banner.link_url || '/catalog'"
                      class="btn btn-primary rounded-pill px-4 py-2 px-md-5 py-md-3 fw-bold shadow-lg transition-all"
                    >
                      {{ banner.button_text || "СМОТРЕТЬ КАТАЛОГ" }}
                    </NuxtLink>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <button
          class="carousel-control-prev"
          type="button"
          data-bs-target="#heroCarousel"
          data-bs-slide="prev"
        >
          <span class="carousel-control-prev-icon" aria-hidden="true"></span>
          <span class="visually-hidden">Previous</span>
        </button>
        <button
          class="carousel-control-next"
          type="button"
          data-bs-target="#heroCarousel"
          data-bs-slide="next"
        >
          <span class="carousel-control-next-icon" aria-hidden="true"></span>
          <span class="visually-hidden">Next</span>
        </button>
      </div>

      
      <div v-else class="hero-fallback container px-3">
        <div
          class="p-3 p-md-5 mb-4 bg-dark text-white rounded-4 shadow-lg position-relative overflow-hidden luxury-hero"
          style="min-height: 260px; display: flex; align-items: center"
        >
          <div class="col-lg-7 position-relative z-1 px-2 px-md-4">
            <h1 class="hero-banner-title fw-bold mb-3">Строительные инструменты</h1>
            <p class="hero-banner-text mb-4 opacity-75">
              Профессиональные решения для вашего дома и бизнеса.
            </p>
            <NuxtLink
              to="/catalog"
              class="btn btn-primary rounded-pill px-4 py-2 px-md-5 py-md-3 fw-bold shadow-lg"
              >Начать покупки</NuxtLink
            >
          </div>
          <div class="position-absolute bottom-0 end-0 opacity-10 p-3 p-md-5 d-none d-md-block">
            <i class="bi bi-tools display-1" style="font-size: 15rem"></i>
          </div>
        </div>
      </div>
    </section>


    <section class="categories-section py-3 py-md-5 mb-3 mb-md-5">
      <div class="container px-3">
        <div class="d-flex justify-content-between align-items-end mb-3 mb-md-5">
          <div>
            <h2 class="section-title mb-1">
              <span class="section-title-text">Категории</span>
            </h2>
            <p class="text-muted mb-0 d-none d-md-block">Найдите всё необходимое по разделам</p>
          </div>
          <NuxtLink
            to="/catalog"
            class="btn btn-outline-dark btn-sm rounded-pill px-3 px-md-4"
          >
            Все
          </NuxtLink>
        </div>

        <div class="row g-2 g-md-4">
          <div
            v-for="(category, index) in categories"
            :key="index"
            class="col-6 col-md-4 col-lg-3"
          >
            <NuxtLink
              :to="`/catalog?category_id=${category.id}`"
              class="category-card-premium text-decoration-none"
            >
              <div class="category-image-container">
                <img
                  :src="getCategoryImage(category)"
                  class="category-img img-loading"
                  :alt="category.name"
                />
                <div class="category-overlay"></div>
                <div class="category-content">
                  <h5 class="category-name text-white mb-1">
                    {{ category.name }}
                  </h5>
                  <div class="category-explore text-white-50 small">
                    Смотреть <i class="bi bi-arrow-right ms-1"></i>
                  </div>
                </div>
              </div>
            </NuxtLink>
          </div>
        </div>
      </div>
    </section>

    
    <section class="products-section py-3 py-md-5 mb-3 mb-md-5 bg-light">
      <div class="container px-3">
        <div class="d-flex justify-content-between align-items-center mb-3 mb-md-5">
          <h2 class="section-title mb-0">
            <span class="section-title-text">Популярные товары</span>
          </h2>
          <NuxtLink to="/catalog" class="btn btn-link text-decoration-none small">
            Все товары
            <i class="bi bi-arrow-right ms-1"></i>
          </NuxtLink>
        </div>

        <div
          v-if="productsStore.products.length === 0 && loading"
          class="row g-2 g-md-3 products-grid"
        >
          <div v-for="i in 8" :key="i" class="col-6 col-md-3 product-grid-cell">
             <ProductCardSkeleton />
          </div>
        </div>
        <div
          v-else-if="productsStore.products.length === 0 && !loading"
          class="text-center py-5"
        >
          <p class="text-muted">Товары временно отсутствуют</p>
        </div>

        <div v-else class="row g-2 g-md-3 products-grid">
          <div
            v-for="product in featuredProducts"
            :key="product.id"
            class="col-6 col-md-3 product-grid-cell"
          >
            <ProductCard :product="product" />
          </div>
        </div>

        <div v-if="productsStore.products.length > 0 && hasMore" class="text-center mt-4">
          <button
            class="btn-show-more"
            :disabled="showMoreLoading"
            @click="handleShowMore"
          >
            <span v-if="showMoreLoading">
              <span class="spinner-border spinner-border-sm me-2" role="status"></span>
              Загрузка...
            </span>
            <span v-else>
              <i class="bi bi-grid me-2"></i>Показать ещё
            </span>
          </button>
        </div>
        <div v-if="!hasMore" class="text-center mt-4">
          <NuxtLink to="/catalog" class="btn btn-outline-primary rounded-pill px-5 py-2 fw-bold">
            Перейти в полный каталог <i class="bi bi-arrow-right ms-2"></i>
          </NuxtLink>
        </div>
      </div>
    </section>

    
    <section class="features-section py-5">
      <div class="container">
        <div class="row g-4 features-row">
          <div class="col-md-6 col-lg-3 features-col">
            <div class="feature-item text-center">
              <div class="feature-icon mb-3">
                <i class="bi bi-truck fs-1 text-white"></i>
              </div>
              <h5 class="fw-bold mb-2">Быстрая доставка</h5>
              <p class="text-muted small mb-0">
                Доставка по всей стране в кратчайшие сроки
              </p>
            </div>
          </div>
          <div class="col-md-6 col-lg-3 features-col">
            <div class="feature-item text-center">
              <div class="feature-icon mb-3">
                <i class="bi bi-shield-check fs-1 text-white"></i>
              </div>
              <h5 class="fw-bold mb-2">Гарантия качества</h5>
              <p class="text-muted small mb-0">
                Все товары проходят проверку качества
              </p>
            </div>
          </div>
          <div class="col-md-6 col-lg-3 features-col">
            <div class="feature-item text-center">
              <div class="feature-icon mb-3">
                <i class="bi bi-currency-exchange fs-1 text-white"></i>
              </div>
              <h5 class="fw-bold mb-2">Выгодные цены</h5>
              <p class="text-muted small mb-0">
                Конкурентные цены на весь ассортимент
              </p>
            </div>
          </div>
          <div class="col-md-6 col-lg-3 features-col">
            <div class="feature-item text-center">
              <div class="feature-icon mb-3">
                <i class="bi bi-headset fs-1 text-white"></i>
              </div>
              <h5 class="fw-bold mb-2">Поддержка 24/7</h5>
              <p class="text-muted small mb-0">
                Круглосуточная поддержка клиентов
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>

    
    <section v-if="recentPosts.length > 0" class="blog-section py-5 mb-5">
      <div class="container">
        <div class="d-flex justify-content-between align-items-center mb-5">
          <h2 class="section-title mb-0">
            <span class="section-title-text">Последние новости</span>
          </h2>
          <NuxtLink to="/blog" class="btn btn-link text-decoration-none">
            Читать блог
            <i class="bi bi-arrow-right ms-2"></i>
          </NuxtLink>
        </div>
        <div class="row g-4">
          <div v-for="post in recentPosts" :key="post.id" class="col-md-4">
            <NuxtLink :to="`/blog/${post.slug}`" class="text-decoration-none">
              <div
                class="card h-100 border-0 shadow-sm rounded-4 overflow-hidden blog-card"
              >
                <div style="height: 200px">
                  <img
                    v-if="post.image_url"
                    :src="post.image_url"
                    class="w-100 h-100 object-fit-cover img-loading"
                  />
                  <div
                    v-else
                    class="w-100 h-100 bg-light d-flex align-items-center justify-content-center text-muted"
                  >
                    News
                  </div>
                </div>
                <div class="card-body p-4">
                  <small class="text-muted mb-2 d-block">{{
                    new Date(post.created_at).toLocaleDateString()
                  }}</small>
                  <h5 class="fw-bold text-dark mb-0 text-truncate">
                    {{ post.title }}
                  </h5>
                </div>
              </div>
            </NuxtLink>
          </div>
        </div>
      </div>
    </section>

    
    
  </div>
</template>

<style scoped>
.staff-access {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%) !important;
}
.hover-lift:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 15px rgba(0, 0, 0, 0.3);
}

/* ===== ПОИСК (над банером) ===== */
.search-top-bar {
  background: #ffffff;
  padding: 12px 0;
  border-bottom: 1px solid #f0f4f8;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.search-bar-wrap {
  max-width: 640px;
  margin: 0 auto;
}
.search-bar {
  display: flex;
  align-items: center;
  background: #f1f5f9;
  border: 2px solid #e2e8f0;
  border-radius: 50px;
  padding: 5px 6px 5px 18px;
  transition: border-color 0.25s ease, background 0.25s ease, box-shadow 0.25s ease;
}
.search-bar:focus-within {
  border-color: #38bdf8;
  background: #fff;
  box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.1);
}
.search-icon {
  color: #94a3b8;
  font-size: 1rem;
  flex-shrink: 0;
  margin-right: 10px;
}
.search-input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 0.95rem;
  color: #0f172a;
}
.search-input::placeholder { color: #94a3b8; }
.search-btn {
  background: #38bdf8;
  color: #fff;
  border: none;
  border-radius: 40px;
  padding: 7px 20px;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.2s;
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}
.search-btn:hover { background: #0ea5e9; }

/* ===== КНОПКА «ПОКАЗАТЬ ЕЩЁ» ===== */
.btn-show-more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 40px;
  background: #fff;
  color: #0f172a;
  border: 2px solid #e2e8f0;
  border-radius: 50px;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.25s ease;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.btn-show-more:hover:not(:disabled) {
  border-color: #38bdf8;
  color: #0ea5e9;
  box-shadow: 0 6px 20px rgba(56, 189, 248, 0.2);
  transform: translateY(-2px);
}
.btn-show-more:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.hero-section {
  position: relative;
  overflow: hidden;
}

.carousel-item {
  height: 500px;
}

.hero-banner-title {
  font-size: 1.5rem;
  line-height: 1.2;
}
.hero-banner-text {
  font-size: 0.9rem;
  line-height: 1.5;
}

@media (min-width: 768px) {
  .hero-banner-title { font-size: 2.5rem; }
  .hero-banner-text { font-size: 1.15rem; }
}
@media (min-width: 1200px) {
  .hero-banner-title { font-size: 3rem; }
  .hero-banner-text { font-size: 1.25rem; }
}

@media (max-width: 576px) {
  .carousel-item { height: 280px; }
}
@media (min-width: 577px) and (max-width: 768px) {
  .carousel-item { height: 350px; }
}

.section-title {
  position: relative;
  margin-bottom: 1rem;
}

.section-title-text {
  font-size: 1.4rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.5px;
}

@media (min-width: 768px) {
  .section-title { margin-bottom: 2rem; }
  .section-title-text { font-size: 2.25rem; }
}

.category-card-premium {
  display: block;
  border-radius: 16px;
  overflow: hidden;
  position: relative;
  transition: all 0.4s cubic-bezier(0.165, 0.84, 0.44, 1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.category-image-container {
  height: 220px;
  position: relative;
}

@media (max-width: 576px) {
  .category-image-container {
    height: 140px;
  }
  .category-name {
    font-size: 0.95rem !important;
  }
}

.category-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.8s ease;
}

.category-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0) 70%);
}

.category-content {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  padding: 1.25rem;
  z-index: 2;
}

.category-name {
  font-weight: 700;
  color: white;
}

.category-card-premium:hover .category-img {
  transform: scale(1.15);
}

.feature-icon {
  width: 60px;
  height: 60px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #38bdf8;
  border-radius: 16px;
  color: white;
  box-shadow: 0 8px 16px rgba(56, 189, 248, 0.2);
}

.blog-card {
  transition: all 0.3s ease;
}

.blog-card:hover {
  transform: translateY(-8px);
  box-shadow: 0 15px 30px rgba(0, 0, 0, 0.1) !important;
}

.product-card {
  transition: all 0.3s ease;
  border-radius: 12px;
  overflow: hidden;
}

.product-card:hover {
  transform: translateY(-8px);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15) !important;
}

.product-image-wrapper {
  overflow: hidden;
  background: red;
  object-fit: cover;
}

.product-image-wrapper img {
  transition: transform 0.5s ease;
}

.product-card:hover .product-image-wrapper img {
  transform: scale(1.1);
}

.product-overlay {
  background: rgba(15, 23, 42, 0.7);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.product-card:hover .product-overlay {
  opacity: 1;
}


.feature-item {
  padding: 30px 20px;
  transition: transform 0.3s ease;
}

@media (max-width: 767.98px) {
  .features-row {
    flex-wrap: nowrap;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
    padding-bottom: 8px;
    margin-left: 0;
    margin-right: 0;
    scrollbar-width: none;
  }
  .features-row::-webkit-scrollbar {
    display: none;
  }
  .features-col {
    flex: 0 0 78%;
    max-width: 78%;
    scroll-snap-align: center;
  }
  .feature-item {
    padding: 24px 16px;
  }
}

.feature-item:hover {
  transform: translateY(-5px);
}

.feature-icon {
  width: 80px;
  height: 80px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%);
  border-radius: 50%;
  color: white !important;
}


@media (max-width: 768px) {
  .carousel-item {
    height: 400px;
  }

  .hero-title {
    font-size: 2rem !important;
  }

  .hero-text {
    font-size: 1rem !important;
  }

  .section-title-text {
    font-size: 1.5rem;
  }
}
</style>
