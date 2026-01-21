<script setup>

const { addToCart } = useCart();
const authStore = useAuthStore();
const uiStore = useUiStore();
const { getBanners } = useBanners();
const { getPosts } = useBlog();
const config = useRuntimeConfig();
const { setSeo } = useSeo();

const productsStore = useProductsStore();
const title = "Главная страница";


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
const featuredProducts = computed(() => productsStore.products.slice(0, 8));


const loadData = async () => {
  loading.value = true;
  try {
    const [bannerRes, postRes] = await Promise.all([
      getBanners(),
      getPosts({ per_page: 3 }),
      productsStore.fetchProducts(),
      productsStore.fetchCategories(),
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
  if (product.image) {
    return product.image.startsWith("http")
      ? product.image
      : `${storageURL}${product.image}`;
  }
  return "https://dummyimage.com/300x300/0f172a/fff&text=Товар";
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
</script>

<template>
  <Head>
    <Title>{{ title }}</Title>
  </Head>

  <div class="home-page">
    
    <section class="hero-section mb-5">
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
        <div class="carousel-inner shadow-lg rounded-5 overflow-hidden">
          <div
            v-for="(banner, index) in banners"
            :key="banner.id"
            class="carousel-item"
            :class="{ active: index === 0 }"
            style="height: 500px"
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
                    class="col-12 col-lg-8 col-xl-7 text-white animate-slide-up py-4 py-md-5"
                  >
                    <h1
                      class="display-4 display-md-3 fw-bold mb-3 mb-md-4 shadow-text"
                    >
                      {{ banner.title }}
                    </h1>
                    <p
                      class="lead fs-5 fs-md-4 mb-3 mb-md-4 shadow-text opacity-90"
                    >
                      {{ banner.subtitle }}
                    </p>
                    <NuxtLink
                      :to="banner.link_url || '/catalog'"
                      class="btn btn-primary rounded-pill px-4 px-md-5 py-2 py-md-3 fw-bold shadow-lg transition-all"
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

      
      <div v-else class="hero-fallback container">
        <div
          class="p-5 mb-4 bg-dark text-white rounded-5 shadow-lg position-relative overflow-hidden luxury-hero"
          style="min-height: 450px; display: flex; align-items: center"
        >
          <div class="col-lg-7 position-relative z-1 px-4">
            <h1 class="display-3 fw-bold mb-4">Строительные инструменты</h1>
            <p class="lead mb-5 opacity-75">
              Профессиональные решения для вашего дома и бизнеса. Качество,
              проверенное временем.
            </p>
            <NuxtLink
              to="/catalog"
              class="btn btn-primary btn-lg rounded-pill px-5 py-3 fw-bold shadow-lg"
              >Начать покупки</NuxtLink
            >
          </div>
          <div class="position-absolute bottom-0 end-0 opacity-10 p-5">
            <i class="bi bi-tools display-1" style="font-size: 15rem"></i>
          </div>
        </div>
      </div>
    </section>

    
    <section class="categories-section py-5 mb-5">
      <div class="container">
        <div class="d-flex justify-content-between align-items-end mb-5">
          <div>
            <h2 class="section-title mb-2">
              <span class="section-title-text">Категории</span>
            </h2>
            <p class="text-muted mb-0">Найдите всё необходимое по разделам</p>
          </div>
          <NuxtLink
            to="/catalog"
            class="btn btn-outline-dark btn-sm rounded-pill px-4"
          >
            Все категории
          </NuxtLink>
        </div>

        <div class="row g-4">
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
                  v-if="category.image"
                  :src="storageURL + category.image"
                  class="category-img"
                  :alt="category.name"
                />
                <div v-else class="category-img-placeholder">
                  <i class="bi bi-tag fs-2 text-white opacity-50"></i>
                </div>
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

    
    <section class="products-section py-5 mb-5 bg-light">
      <div class="container">
        <div class="d-flex justify-content-between align-items-center mb-5">
          <h2 class="section-title mb-0">
            <span class="section-title-text">Популярные товары</span>
          </h2>
          <NuxtLink to="/catalog" class="btn btn-link text-decoration-none">
            Смотреть все товары
            <i class="bi bi-arrow-right ms-2"></i>
          </NuxtLink>
        </div>

        <div
          v-if="productsStore.products.length === 0 && loading"
          class="text-center py-5"
        >
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Загрузка...</span>
          </div>
          <p class="mt-3 text-muted">Загрузка товаров...</p>
        </div>
        <div
          v-else-if="productsStore.products.length === 0 && !loading"
          class="text-center py-5"
        >
          <p class="text-muted">Товары временно отсутствуют</p>
        </div>

        <div v-else class="row g-4">
          <div
            v-for="product in featuredProducts"
            :key="product.id"
            class="col-md-6 col-lg-4 col-xl-3"
          >
            <ProductCard :product="product" />
          </div>
        </div>
      </div>
    </section>

    
    <section class="features-section py-5">
      <div class="container">
        <div class="row g-4">
          <div class="col-md-6 col-lg-3">
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
          <div class="col-md-6 col-lg-3">
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
          <div class="col-md-6 col-lg-3">
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
          <div class="col-md-6 col-lg-3">
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
                    class="w-100 h-100 object-fit-cover"
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


.hero-section {
  position: relative;
  overflow: hidden;
}

.carousel-item {
  height: 500px;
}

.hero-slide {
  padding: 5rem 2rem;
  height: 100%;
  display: flex;
  align-items: center;
  background-size: cover;
  background-position: center;
  position: relative;
}

.hero-slide::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    135deg,
    rgba(15, 23, 42, 0.85) 0%,
    rgba(30, 41, 59, 0.75) 100%
  );
  z-index: 1;
}

.hero-slide > .container {
  position: relative;
  z-index: 2;
}

.hero-slide-1 {
  background-image: linear-gradient(
      135deg,
      rgba(15, 23, 42, 0.9) 0%,
      rgba(30, 41, 59, 0.8) 100%
    ),
    url("https://images.unsplash.com/photo-1504307651254-35680f05301a?w=1920");
}

.hero-slide-2 {
  background-image: linear-gradient(
      135deg,
      rgba(15, 23, 42, 0.9) 0%,
      rgba(30, 41, 59, 0.8) 100%
    ),
    url("https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=1920");
}

.hero-slide-3 {
  background-image: linear-gradient(
      135deg,
      rgba(15, 23, 42, 0.9) 0%,
      rgba(30, 41, 59, 0.8) 100%
    ),
    url("https://images.unsplash.com/photo-1504148455328-c376907d081c?w=1920");
}

.hero-title {
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
  animation: fadeInUp 0.8s ease;
}

.hero-text {
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);
  animation: fadeInUp 1s ease;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}


.section-title {
  position: relative;
  display: inline-block;
}

.section-title-text {
  position: relative;
  padding-bottom: 15px;
  font-size: 2rem;
  font-weight: 700;
  color: #1e293b;
}

.section-title-text::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 60px;
  height: 4px;
  background: linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%);
  border-radius: 2px;
}


.category-card-premium {
  display: block;
  border-radius: 16px;
  overflow: hidden;
  position: relative;
  transition: all 0.4s cubic-bezier(0.165, 0.84, 0.44, 1);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
  background: #1e293b;
}

.category-image-container {
  height: 200px;
  position: relative;
  overflow: hidden;
}

@media (max-width: 768px) {
  .category-image-container {
    height: 160px;
  }
}

.category-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.6s ease;
}

.category-img-placeholder {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #334155 0%, #0f172a 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.category-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    to top,
    rgba(15, 23, 42, 0.9) 0%,
    rgba(15, 23, 42, 0.2) 60%
  );
  transition: opacity 0.3s ease;
}

.category-content {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  padding: 1.25rem;
  z-index: 2;
  transition: transform 0.3s ease;
}

.category-name {
  font-weight: 700;
  font-size: 1.1rem;
  margin-bottom: 0;
}

.category-explore {
  opacity: 0.8;
  transform: translateY(10px);
  transition: all 0.3s ease;
}


.category-card-premium:hover {
  transform: translateY(-8px);
  box-shadow: 0 15px 30px rgba(0, 0, 0, 0.2);
}

.category-card-premium:hover .category-img {
  transform: scale(1.1);
}

.category-card-premium:hover .category-explore {
  opacity: 1;
  transform: translateY(0);
}

.category-card-premium:hover .category-content {
  transform: translateY(-5px);
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
