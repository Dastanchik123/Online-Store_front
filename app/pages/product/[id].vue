<script setup>
const route = useRoute();
const { getProduct, getProducts } = useProducts();
const { addToCart } = useCart();
const authStore = useAuthStore();
const uiStore = useUiStore();
const { setProductSeo, setBreadcrumbs } = useSeo();
const { settings, fetchPublicSettings } = useSettings();

const product = ref(null);
const relatedProducts = ref([]);
const pending = ref(false);
const isAdding = ref(false);
const error = ref(null);

const title = computed(() =>
  product.value ? product.value.name : "Страница товара",
);

const loadProduct = async () => {
  if (!route.params.id) return;

  pending.value = true;
  error.value = null;

  try {
    product.value = await getProduct(route.params.id);

    if (product.value) {
      setProductSeo(product.value);

      // Загрузка похожих товаров
      if (product.value.category) {
        const related = await getProducts({
          category_id: product.value.category.id,
          per_page: 15,
        });
        
        // Логика подбора: исключаем текущий товар и выбираем 4 случайных
        const otherProducts = related.data.filter(
          (p) => p.id !== product.value.id
        );
        
        relatedProducts.value = otherProducts
          .sort(() => Math.random() - 0.5)
          .slice(0, 4);
      }

      setBreadcrumbs([
        { name: "Главная", url: "/" },
        { name: "Каталог", url: "/catalog" },
        ...(product.value.category
          ? [
              {
                name: product.value.category.name,
                url: `/catalog?category=${product.value.category.id}`,
              },
            ]
          : []),
        { name: product.value.name, url: `/product/${product.value.id}` },
      ]);
    }
  } catch (err) {
    error.value = err.data?.message || "Ошибка загрузки товара";
  } finally {
    pending.value = false;
  }
};

const { getImageUrl } = useImageUrl();

const activeImageIndex = ref(0);

const allImages = computed(() => {
  if (!product.value) return [];
  const images = [];
  if (product.value.image) {
    images.push(getImageUrl(product.value.image));
  }
  if (product.value.images && Array.isArray(product.value.images)) {
    product.value.images.forEach(img => {
      images.push(getImageUrl(img));
    });
  }
  if (images.length === 0) {
    images.push("https://via.placeholder.com/600x600/0f172a/38bdf8?text=Изображение+товара");
  }
  return images;
});

const currentDisplayImage = computed(() => {
  return allImages.value[activeImageIndex.value] || allImages.value[0];
});

const setActiveImage = (index) => {
  activeImageIndex.value = index;
};

const nextImage = () => {
  if (allImages.value.length <= 1) return;
  activeImageIndex.value = (activeImageIndex.value + 1) % allImages.value.length;
};

const prevImage = () => {
  if (allImages.value.length <= 1) return;
  activeImageIndex.value = (activeImageIndex.value - 1 + allImages.value.length) % allImages.value.length;
};

const touchStartX = ref(0);
const touchEndX = ref(0);

const handleTouchStart = (e) => {
  touchStartX.value = e.changedTouches[0].screenX;
};

const handleTouchEnd = (e) => {
  touchEndX.value = e.changedTouches[0].screenX;
  if (allImages.value.length > 1) {
    const slideThreshold = 40;
    if (touchEndX.value < touchStartX.value - slideThreshold) {
      nextImage();
    }
    if (touchEndX.value > touchStartX.value + slideThreshold) {
      prevImage();
    }
  }
};

// Lightbox
const lightboxOpen = ref(false);
const openLightbox = () => { lightboxOpen.value = true; document.body.style.overflow = 'hidden'; };
const closeLightbox = () => { lightboxOpen.value = false; document.body.style.overflow = ''; };

const handleKeydown = (e) => {
  if (!lightboxOpen.value) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowRight') nextImage();
  if (e.key === 'ArrowLeft') prevImage();
};

onMounted(() => { window.addEventListener('keydown', handleKeydown); });
onUnmounted(() => { window.removeEventListener('keydown', handleKeydown); });

const quantity = ref(1);

const handleAddToCart = async () => {
  if (!authStore.isAuthenticated) {
    await navigateTo("/auth/login");
    return;
  }

  try {
    await addToCart(product.value.id, quantity.value);
    uiStore.success(`
      <div class="d-flex align-items-center">
        <span class="me-2">Товар добавлен!</span>
        <a href="/cart" class="btn btn-sm btn-light rounded-pill px-3 fw-bold decoration-none text-primary shadow-sm" style="font-size: 0.75rem">
          В корзину <i class="bi bi-arrow-right ms-1"></i>
        </a>
      </div>
    `);
  } catch (err) {
    uiStore.error(err.data?.message || "Ошибка добавления в корзину");
  } finally {
    isAdding.value = false;
  }
};

const handleBuyNow = async () => {
  if (!authStore.isAuthenticated) {
    await navigateTo("/auth/login");
    return;
  }

  try {
    await addToCart(product.value.id, quantity.value);
    await router.push("/checkout");
  } catch (error) {
    uiStore.error("Ошибка при оформлении заказа");
  }
};

onMounted(() => {
  loadProduct();
  fetchPublicSettings();
});

const activeTab = ref('description');

const whatsappLink = computed(() => {
  const base = settings.value?.social_whatsapp;
  if (!base || !product.value) return null;
  const message = `Добрый день. Меня интересует ${product.value.name}`;
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}text=${encodeURIComponent(message)}`;
});
</script>

<template>
  <Head>
    <Title>{{ title }}</Title>
  </Head>

  <section class="product-page">
    <div v-if="pending" class="loading-skeleton">
      <ProductSkeleton />
    </div>

    <div v-else-if="error" class="error">
      <h2>Ошибка загрузки</h2>
      <p>Не удалось загрузить информацию о товаре.</p>
      <NuxtLink to="/" class="back-link">Вернуться на главную</NuxtLink>
    </div>

    <div v-else-if="!product" class="not-found">
      <h2>Товар не найден</h2>
      <p>Товар с указанным ID не существует.</p>
      <NuxtLink to="/" class="back-link">Вернуться на главную</NuxtLink>
    </div>

    <div v-else class="product-container container py-3 py-lg-5">
      <!-- Навигация -->
      <nav class="mb-3 mb-lg-5">
        <ul class="breadcrumb-premium d-flex flex-wrap list-unstyled m-0">
          <li><NuxtLink to="/">Главная</NuxtLink></li>
          <li><NuxtLink to="/catalog">Каталог</NuxtLink></li>
          <li v-if="product.category">
            <NuxtLink :to="`/catalog?category_id=${product.category.id}`">{{ product.category.name }}</NuxtLink>
          </li>
          <li class="active">{{ product.name }}</li>
        </ul>
      </nav>

      <div class="row g-3 g-lg-5">
        <!-- Левая колонка: Галерея -->
        <div class="col-12 col-lg-7">
          <div class="gallery-wrapper">
             <div 
               class="main-image-container position-relative mb-3 shadow-sm rounded-4 overflow-hidden border bg-white"
               @touchstart="handleTouchStart"
               @touchend="handleTouchEnd"
             >
                <button 
                  v-if="allImages.length > 1" 
                  @click="prevImage" 
                  class="btn btn-light position-absolute start-0 top-50 translate-middle-y ms-2 ms-md-3 rounded-circle shadow-sm d-flex align-items-center justify-content-center" 
                  style="width: 38px; height: 38px; z-index: 10; opacity: 0.85;"
                >
                  <i class="bi bi-chevron-left"></i>
                </button>
                
                <img
                  :src="currentDisplayImage"
                  :alt="product.name"
                  class="img-fluid main-img-zoom img-loading"
                  style="cursor: zoom-in;"
                  @click="openLightbox"
                />

                <button 
                  v-if="allImages.length > 1" 
                  @click="nextImage" 
                  class="btn btn-light position-absolute end-0 top-50 translate-middle-y me-2 me-md-3 rounded-circle shadow-sm d-flex align-items-center justify-content-center" 
                  style="width: 38px; height: 38px; z-index: 10; opacity: 0.85;"
                >
                  <i class="bi bi-chevron-right"></i>
                </button>
             </div>
             <div class="thumb-strip d-flex gap-2 overflow-auto pb-2" v-if="allImages.length > 1">
                <div 
                  v-for="(img, index) in allImages" 
                  :key="index"
                  class="thumb-item flex-shrink-0" 
                  :class="{ active: activeImageIndex === index }"
                  @click="setActiveImage(index)"
                >
                  <img :src="img" :alt="product.name" class="img-loading" />
                </div>
             </div>
          </div>
        </div>

        <!-- Правая колонка: Инфо -->
        <div class="col-12 col-lg-5">
          <div class="product-sticky-info">
            <div class="badge bg-primary-soft text-primary rounded-pill px-3 py-2 mb-2 fw-bold small" v-if="product.category">
              {{ product.category.name }}
            </div>
            
            <h1 class="product-title fw-bold mb-2 text-dark">{{ product.name }}</h1>
            
            <div class="price-section mb-3 d-flex align-items-baseline gap-2">
              <span class="product-price fw-black text-primary mb-0">{{ product.price }} сом</span>
            </div>

            <div class="stock-status mb-3">
               <div :class="['stock-indicator d-flex align-items-center gap-2', product.in_stock ? 'text-success' : 'text-danger']">
                 <span class="pulse-dot" v-if="product.in_stock"></span>
                 <span class="fw-bold">
                   {{ product.in_stock ? 'В наличии' : 'Нет в наличии' }}
                 </span>
               </div>
            </div>

            <div class="short-desc mb-3 text-muted">
              {{ product.short_description }}
            </div>

            <div class="purchase-card p-3 rounded-3 shadow-sm border bg-white mb-3">
              <div class="d-flex align-items-center gap-2 mb-2">
                <label class="small text-muted fw-semibold mb-0">Кол-во:</label>
                <div class="qty-control d-flex align-items-center rounded-pill border bg-light" style="padding: 2px;">
                  <button class="btn btn-qty rounded-circle" @click="quantity > 1 ? quantity-- : null" :disabled="quantity <= 1">−</button>
                  <input type="number" v-model.number="quantity" class="qty-input" readonly />
                  <button class="btn btn-qty rounded-circle" @click="quantity < 99 ? quantity++ : null" :disabled="quantity >= 99">+</button>
                </div>
              </div>

              <div class="d-flex flex-column gap-2">
                <button 
                  class="btn btn-primary rounded-pill w-100 fw-bold py-2 shadow-primary"
                  @click="handleAddToCart"
                  :disabled="!product.in_stock || isAdding"
                >
                  <i class="bi bi-cart3 me-1"></i> {{ isAdding ? 'Добавляем...' : 'В КОРЗИНУ' }}
                </button>
                <button
                  class="btn btn-outline-dark rounded-pill w-100 fw-bold py-2"
                  @click="handleBuyNow"
                  :disabled="!product.in_stock"
                >
                  КУПИТЬ В 1 КЛИК
                </button>
                <a
                  v-if="whatsappLink"
                  :href="whatsappLink"
                  target="_blank"
                  rel="noopener"
                  class="btn btn-whatsapp rounded-pill w-100 fw-bold py-2"
                >
                  <i class="bi bi-whatsapp me-1"></i> ЗАКАЗАТЬ ЧЕРЕЗ WHATSAPP
                </a>
              </div>
            </div>

            <div v-if="product.sku" class="meta-list small text-muted">
              <p class="mb-0"><strong>Артикул:</strong> {{ product.sku }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Вкладки / Детальное описание -->
      <div class="row mt-4 pt-2">
        <div class="col-12 col-lg-8">
           <!-- Планшет / моб.: табы -->
           <div class="d-lg-none">
             <div class="details-nav d-flex gap-2 border-bottom mb-4">
               <button
                 class="btn btn-tab"
                 :class="{ active: activeTab === 'description' }"
                 @click="activeTab = 'description'"
               >Описание</button>
               <button
                 class="btn btn-tab"
                 :class="{ active: activeTab === 'attributes' }"
                 @click="activeTab = 'attributes'"
                 v-if="product.attributes && Object.keys(product.attributes).length"
               >Характеристики</button>
             </div>

             <div v-if="activeTab === 'description'" class="content-block mb-5">
                <div class="description-text text-secondary" style="white-space: pre-wrap; line-height: 1.8; font-size: 1rem;">
                  {{ product.description || 'Описание отсутствует' }}
                </div>
             </div>

             <div v-if="activeTab === 'attributes' && product.attributes" class="content-block mb-5">
                <div class="row g-2">
                  <div
                    v-for="(value, key) in product.attributes"
                    :key="key"
                    class="col-12 p-3 rounded-3 bg-light-soft d-flex justify-content-between align-items-center"
                  >
                    <span class="text-muted fw-medium">{{ key }}</span>
                    <span class="fw-bold text-dark text-end ms-3">{{ value }}</span>
                  </div>
                </div>
             </div>
           </div>

           <!-- Десктоп: описание и характеристики отдельными блоками, без табов -->
           <div class="d-none d-lg-block">
             <div class="content-block mb-5">
                <h2 class="section-title fw-bold mb-3">Описание</h2>
                <div class="description-text text-secondary" style="white-space: pre-wrap; line-height: 1.8; font-size: 1rem;">
                  {{ product.description || 'Описание отсутствует' }}
                </div>
             </div>

             <div v-if="product.attributes && Object.keys(product.attributes).length" class="content-block mb-5">
                <h2 class="section-title fw-bold mb-3">Характеристики</h2>
                <div class="row g-2">
                  <div
                    v-for="(value, key) in product.attributes"
                    :key="key"
                    class="col-12 p-3 rounded-3 bg-light-soft d-flex justify-content-between align-items-center"
                  >
                    <span class="text-muted fw-medium">{{ key }}</span>
                    <span class="fw-bold text-dark text-end ms-3">{{ value }}</span>
                  </div>
                </div>
             </div>
           </div>
        </div>
      </div>

      <!-- Похожие товары -->
      <div v-if="relatedProducts.length > 0" class="related-section mt-5 pt-5">
        <div class="d-flex justify-content-between align-items-end mb-4">
          <h2 class="fw-bold m-0 h1">Похожие товары</h2>
          <NuxtLink to="/catalog" class="text-primary text-decoration-none fw-bold">Смотреть всё <i class="bi bi-arrow-right ms-1"></i></NuxtLink>
        </div>
        <div class="row g-4 overflow-hidden" style="margin: -10px;">
          <div v-for="item in relatedProducts" :key="item.id" class="col-6 col-md-4 col-lg-3">
            <ProductCard :product="item" class="shadow-hover" />
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Lightbox -->
  <Teleport to="body">
    <Transition name="lightbox-fade">
      <div 
        v-if="lightboxOpen" 
        class="lightbox-overlay"
        @click.self="closeLightbox"
        @touchstart="handleTouchStart"
        @touchend="handleTouchEnd"
      >
        <button class="lightbox-close" @click="closeLightbox">
          <i class="bi bi-x-lg"></i>
        </button>

        <button v-if="allImages.length > 1" class="lightbox-nav lightbox-prev" @click="prevImage">
          <i class="bi bi-chevron-left"></i>
        </button>

        <div class="lightbox-img-wrap">
          <img :src="currentDisplayImage" :alt="product?.name" class="lightbox-img" />
        </div>

        <button v-if="allImages.length > 1" class="lightbox-nav lightbox-next" @click="nextImage">
          <i class="bi bi-chevron-right"></i>
        </button>

        <div v-if="allImages.length > 1" class="lightbox-counter">
          {{ activeImageIndex + 1 }} / {{ allImages.length }}
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Премиальная навигация */
.breadcrumb-premium {
  gap: 6px;
  font-size: 0.82rem;
  color: #64748b;
  flex-wrap: wrap;
}
.breadcrumb-premium li:not(:last-child)::after {
  content: "/";
  margin-left: 6px;
  color: #cbd5e1;
}
.breadcrumb-premium a {
  text-decoration: none;
  color: inherit;
  transition: color 0.2s;
}
.breadcrumb-premium a:hover { color: var(--bs-primary); }
.breadcrumb-premium .active {
  color: #1e293b;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
}

/* Галерея */
.main-image-container {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.main-img-zoom {
  max-height: 100%;
  width: 100%;
  object-fit: contain;
  transition: transform 0.4s ease;
}
.main-image-container:hover .main-img-zoom { transform: scale(1.04); }
.thumb-item {
  width: 64px;
  height: 64px;
  border-radius: 10px;
  border: 2px solid transparent;
  overflow: hidden;
  cursor: pointer;
  background: white;
  flex-shrink: 0;
}
.thumb-item.active { border-color: var(--bs-primary); }
.thumb-item img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
@media (min-width: 768px) {
  .thumb-item { width: 80px; height: 80px; }
}

/* Инфо блок */
.bg-primary-soft { background-color: rgba(var(--bs-primary-rgb), 0.1); }
.fw-black { font-weight: 900; }
.text-primary { color: var(--bs-primary) !important; }

.product-title {
  font-size: 1.6rem;
  line-height: 1.25;
}
.product-price {
  font-size: 1.75rem;
  font-weight: 900;
}
@media (min-width: 768px) {
  .product-title { font-size: 2.2rem; }
  .product-price { font-size: 2rem; }
}

.stock-indicator { font-size: 0.9rem; }
.pulse-dot {
  width: 8px;
  height: 8px;
  background-color: #10b981;
  border-radius: 50%;
  box-shadow: 0 0 0 rgba(16, 185, 129, 0.4);
  animation: pulse 2s infinite;
}
@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
  70% { box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
  100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
}

/* Карточка покупки */
.purchase-card {
  background: #f8fafc;
}
.btn-qty {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: white;
  color: #1e293b;
  font-weight: bold;
  transition: all 0.2s;
}
.btn-qty:hover:not(:disabled) {
  background: #e2e8f0;
}
.qty-input {
  width: 50px;
  border: none;
  background: transparent;
  text-align: center;
  font-weight: bold;
  outline: none;
}
.shadow-primary {
  box-shadow: 0 10px 20px -5px rgba(var(--bs-primary-rgb), 0.3);
}
.btn-whatsapp {
  background: #25d366;
  color: #fff;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}
.btn-whatsapp:hover {
  background: #1ebe5b;
  color: #fff;
}

/* Вкладки */
.btn-tab {
  border: none;
  background: none;
  padding: 12px 0;
  font-weight: 700;
  color: #64748b;
  position: relative;
  transition: color 0.2s;
}
.btn-tab.active {
  color: #1e293b;
}
.btn-tab.active::after {
  content: "";
  position: absolute;
  bottom: -1px;
  left: 0;
  width: 100%;
  height: 3px;
  background: var(--bs-primary);
  border-radius: 3px 3px 0 0;
}

.bg-light-soft {
  background: #f1f5f9;
}

.section-title {
  font-size: 1.35rem;
  color: #1e293b;
}

@media (max-width: 991px) {
  .product-sticky-info {
    position: static !important;
  }
}
.lightbox-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(5, 10, 20, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.lightbox-img-wrap {
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
.lightbox-img {
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 12px;
  box-shadow: 0 30px 80px rgba(0,0,0,0.6);
  user-select: none;
  -webkit-user-drag: none;
}
.lightbox-close {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.3);
  background: rgba(255,255,255,0.1);
  color: white;
  font-size: 1.1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s;
  z-index: 10;
}
.lightbox-close:hover { background: rgba(255,255,255,0.25); }
.lightbox-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.3);
  background: rgba(255,255,255,0.1);
  color: white;
  font-size: 1.3rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s;
  z-index: 10;
}
.lightbox-nav:hover { background: rgba(255,255,255,0.25); }
.lightbox-prev { left: 20px; }
.lightbox-next { right: 20px; }
.lightbox-counter {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  color: rgba(255,255,255,0.7);
  font-size: 0.9rem;
  font-weight: 600;
  background: rgba(255,255,255,0.1);
  padding: 5px 16px;
  border-radius: 20px;
}
.lightbox-fade-enter-active, .lightbox-fade-leave-active { transition: opacity 0.25s ease; }
.lightbox-fade-enter-from, .lightbox-fade-leave-to { opacity: 0; }

@media (max-width: 576px) {
  .lightbox-nav { display: none; }
}
</style>
