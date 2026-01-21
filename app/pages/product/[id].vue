<script setup>
const route = useRoute();
const { getProduct } = useProducts();
const { addToCart } = useCart();
const authStore = useAuthStore();
const uiStore = useUiStore();
const { setProductSeo, setBreadcrumbs } = useSeo();

const product = ref(null);
const pending = ref(false);
const isAdding = ref(false);
const error = ref(null);

const title = computed(() =>
  product.value ? product.value.name : "Страница товара"
);


const loadProduct = async () => {
  if (!route.params.id) return;

  pending.value = true;
  error.value = null;

  try {
    product.value = await getProduct(route.params.id);

    
    if (product.value) {
      setProductSeo(product.value);

      
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













const productImage = computed(() => {
  if (product.value?.image) {
    const storageURL = "http://127.0.0.1:8000/storage/";
    return product.value.image.startsWith("http")
      ? product.value.image
      : `${storageURL}${product.value.image}`;
  }
  return "https://via.placeholder.com/600x600/0f172a/38bdf8?text=Изображение+товара";
});


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
});
</script>

<template>
  <Head>
    <Title>{{ title }}</Title>
  </Head>

  <section class="product-page">
    
    <div v-if="pending" class="loading">
      <div class="spinner"></div>
      <p>Загрузка товара...</p>
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

    
    <div v-else class="product-container">
      
      <nav class="breadcrumbs">
        <NuxtLink to="/" class="breadcrumb-link">Главная</NuxtLink>
        <span class="breadcrumb-separator">/</span>
        <NuxtLink to="/catalog" class="breadcrumb-link">Каталог</NuxtLink>
        <span class="breadcrumb-separator">/</span>
        <NuxtLink
          :to="`/catalog?category_id=${product.category.id}`"
          class="breadcrumb-link"
          >{{ product.category.name }}</NuxtLink
        >
        <span class="breadcrumb-separator">/</span>
        <span class="breadcrumb-current">{{ product.name }}</span>
      </nav>

      <div class="product-content">
        
        <div class="product-gallery">
          <div class="main-image">
            <img :src="productImage" :alt="product.name" />
          </div>
          <div class="image-thumbnails" v-if="product.image">
            <div class="thumbnail active">
              <img :src="productImage" :alt="product.name" />
            </div>
          </div>
        </div>

        
        <div class="product-info">
          
          <div class="product-category">
            <NuxtLink
              :to="`/catalog?category_id=${product.category.id}`"
              class="category-badge text-decoration-none"
              >{{ product.category.name }}</NuxtLink
            >
          </div>

          
          <h1 class="product-title">{{ product.name }}</h1>

          
          <div class="product-price">
            <span class="price-value">{{ product.price }}</span>
            <span class="price-currency">сом</span>
          </div>

          
          <div class="product-stock">
            <span
              :class="[
                'stock-badge',
                product.quantity > 0 ? 'in-stock' : 'out-of-stock',
              ]"
            >
              {{
                product.in_stock && product.stock_quantity > 0
                  ? `В наличии (${
                      product.stock_quantity || product.quantity
                    } шт.)`
                  : "Нет в наличии"
              }}
            </span>
          </div>

          
          <div class="product-description">
            <h3>Описание</h3>
            <p>{{ product.short_description }}</p>
          </div>

          
          <div class="product-actions">
            <div class="quantity-selector">
              <label for="quantity">Количество:</label>
              <div class="quantity-controls">
                <button
                  @click="quantity = quantity - 1"
                  class="quantity-btn"
                  :disabled="quantity <= 1"
                >
                  −
                </button>
                <input
                  id="quantity"
                  type="number"
                  v-model.number="quantity"
                  min="1"
                  :max="product.stock_quantity || product.quantity"
                  class="quantity-input"
                />
                <button
                  @click="quantity = quantity + 1"
                  class="quantity-btn"
                  :disabled="
                    quantity >= (product.stock_quantity || product.quantity)
                  "
                >
                  +
                </button>
              </div>
            </div>

            <div class="d-flex gap-3">
              <button
                @click="handleAddToCart"
                class="add-to-cart-btn btn flex-grow-1"
                :class="{ 'btn-loading': isAdding }"
                :disabled="!product.in_stock || isAdding"
              >
                <i v-if="!isAdding" class="bi bi-cart-plus-fill me-2"></i>
                <span>{{ isAdding ? "Добавление..." : "В КОРЗИНУ" }}</span>
              </button>

              <button
                @click="handleBuyNow"
                class="btn btn-outline-dark px-4 fw-bold rounded-3"
                :disabled="!product.in_stock || isAdding"
              >
                КУПИТЬ В 1 КЛИК
              </button>
            </div>
          </div>

          
          <div class="product-meta">
            <div class="meta-item" v-if="product.id">
              <span class="meta-label">ID товара:</span>
              <span class="meta-value">#{{ product.id }}</span>
            </div>
            <div class="meta-item" v-if="product.sku">
              <span class="meta-label">Артикул (SKU):</span>
              <span class="meta-value">{{ product.sku }}</span>
            </div>
          </div>
        </div>
      </div>
      <div
        class="short-description rounded-3 mt-5 mb-5"
        style="background-color: #f5f5f5; padding: 20px"
        v-if="product.description"
      >
        <h3>Полное описание</h3>
        <p>{{ product.description }}</p>
      </div>
      <div
        class="d-flex flex-column rounded-3 mt-5 mb-5"
        style="background-color: #f5f5f5; padding: 20px"
        v-if="product.attributes"
      >
        <h1>Краткая информация</h1>
        <div class="product-characteristics fs-6">
          <p><i class="bi bi-info-circle text-info me-2"></i> Основные</p>
          <div
            class="characteristic-item"
            v-for="(value, key) in product.attributes"
            :key="key"
          >
            <span class="characteristic-label">{{ key }}</span>
            <span class="characteristic-dots"></span>
            <span class="characteristic-value">{{ value }}</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
#quantity::-webkit-outer-spin-button,
#quantity::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.product-characteristics {
  margin-top: 20px;
}

.characteristic-item {
  display: flex;
  align-items: baseline;
  margin-bottom: 10px;
}

.characteristic-label {
  font-weight: bold;
  text-transform: capitalize;
}

.characteristic-dots {
  flex: 1;
  border-bottom: 3px dotted #94a3b8;
  margin: 0 6px;
}

.product-page {
  min-height: calc(100vh - 200px);
  padding: 40px 20px;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
}


.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  gap: 20px;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 4px solid #e2e8f0;
  border-top-color: #38bdf8;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}


.error,
.not-found {
  text-align: center;
  padding: 60px 20px;
}

.error h2,
.not-found h2 {
  font-size: 32px;
  color: #1e293b;
  margin-bottom: 16px;
}

.back-link {
  display: inline-block;
  margin-top: 20px;
  color: #38bdf8;
  text-decoration: none;
  font-weight: 500;
  transition: color 0.2s;
}

.back-link:hover {
  color: #0ea5e9;
  text-decoration: underline;
}


.breadcrumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 32px;
  font-size: 14px;
  flex-wrap: wrap;
}

.breadcrumb-link {
  color: #64748b;
  text-decoration: none;
  transition: color 0.2s;
}

.breadcrumb-link:hover {
  color: #38bdf8;
}

.breadcrumb-separator {
  color: #cbd5e1;
}

.breadcrumb-current {
  color: #1e293b;
  font-weight: 500;
}


.product-container {
  max-width: 1200px;
  margin: 0 auto;
}

.product-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 60px;
  margin-top: 20px;
}


.product-gallery {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.main-image {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 16px;
  overflow: hidden;
  background: #f8fafc;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -1px rgba(0, 0, 0, 0.06);
  transition: transform 0.3s ease;
}

.main-image:hover {
  transform: scale(1.02);
}

.main-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-thumbnails {
  display: flex;
  gap: 12px;
}

.thumbnail {
  width: 80px;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s;
}

.thumbnail.active {
  border-color: #38bdf8;
}

.thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}


.product-info {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.product-category {
  margin-bottom: -8px;
}

.category-badge {
  display: inline-block;
  padding: 6px 12px;
  background: linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%);
  color: white;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.product-title {
  font-size: 36px;
  font-weight: 700;
  color: #1e293b;
  line-height: 1.2;
  margin: 0;
}

.product-price {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 8px;
}

.price-value {
  font-size: 48px;
  font-weight: 700;
  color: #0f172a;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.price-currency {
  font-size: 24px;
  color: #64748b;
  font-weight: 500;
}

.product-stock {
  margin-top: -8px;
}

.stock-badge {
  display: inline-block;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
}

.stock-badge.in-stock {
  background: #dcfce7;
  color: #166534;
}

.stock-badge.out-of-stock {
  background: #fee2e2;
  color: #991b1b;
}

.product-description {
  padding-top: 24px;
  border-top: 1px solid #e2e8f0;
}

.product-description h3 {
  font-size: 20px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 12px;
}

.product-description p {
  font-size: 16px;
  line-height: 1.6;
  color: #475569;
}


.product-actions {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 24px;
  border-top: 1px solid #e2e8f0;
}

.quantity-selector {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.quantity-selector label {
  font-size: 14px;
  font-weight: 500;
  color: #475569;
}

.quantity-controls {
  display: flex;
  align-items: center;
  gap: 0;
  width: fit-content;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
}

.quantity-btn {
  width: 40px;
  height: 40px;
  background: #f8fafc;
  border: none;
  font-size: 20px;
  font-weight: 600;
  color: #1e293b;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.quantity-btn:hover:not(:disabled) {
  background: #e2e8f0;
  color: #0f172a;
}

.quantity-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.quantity-input {
  width: 60px;
  height: 40px;
  border: none;
  text-align: center;
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
  background: white;
  outline: none;
}

.quantity-input::-webkit-inner-spin-button,
.quantity-input::-webkit-outer-spin-button {
  opacity: 1;
}

.add-to-cart-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 16px 32px;
  background: linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 6px -1px rgba(14, 165, 233, 0.3);
}

.add-to-cart-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 12px -2px rgba(14, 165, 233, 0.4);
}

.add-to-cart-btn:active:not(:disabled) {
  transform: translateY(0);
}

.add-to-cart-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.btn-icon {
  font-size: 20px;
}


.product-meta {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 24px;
  border-top: 1px solid #e2e8f0;
  font-size: 14px;
}

.meta-item {
  display: flex;
  gap: 8px;
}

.meta-label {
  color: #64748b;
  font-weight: 500;
}

.meta-value {
  color: #1e293b;
}


@media (max-width: 968px) {
  .product-content {
    grid-template-columns: 1fr;
    gap: 40px;
  }

  .product-title {
    font-size: 28px;
  }

  .price-value {
    font-size: 36px;
  }
}

@media (max-width: 640px) {
  .product-page {
    padding: 20px 16px;
  }

  .product-title {
    font-size: 24px;
  }

  .price-value {
    font-size: 32px;
  }

  .add-to-cart-btn {
    padding: 14px 24px;
    font-size: 16px;
  }
}
</style>
