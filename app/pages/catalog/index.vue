<script setup>
const { getProducts, getCategories } = useProducts();
const route = useRoute();
const router = useRouter();

const title = "Каталог товаров";

const filters = ref({
  category_id: route.query.category_id
    ? Number(route.query.category_id)
    : undefined,
  search: route.query.search || "",
  min_price: route.query.min_price ? Number(route.query.min_price) : undefined,
  max_price: route.query.max_price ? Number(route.query.max_price) : undefined,
  in_stock: route.query.in_stock === "true" ? true : undefined,
  sort_by: route.query.sort_by || "created_at",
  sort_order: route.query.sort_order || "desc",
  per_page: 15,
  page: route.query.page ? Number(route.query.page) : 1,
});

const products = ref(null);
const categories = ref([]);
const loading = ref(false);
const error = ref(null);
const viewMode = ref("grid");
const isCategoriesOpen = ref(true);

const loadData = async () => {
  loading.value = true;
  error.value = null;

  try {
    const [productsData, categoriesData] = await Promise.all([
      getProducts(filters.value),
      getCategories({ is_active: true }),
    ]);

    products.value = productsData;
    categories.value = categoriesData;
  } catch (err) {
    error.value = err.data?.message || "Ошибка загрузки данных";
  } finally {
    loading.value = false;
  }
};

const applyFilters = () => {
  const query = {};
  Object.entries(filters.value).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query[key] = value;
    }
  });

  if (query.page === filters.value.page && route.query.page) {
  }
  router.push({ query });
};

const resetFilters = () => {
  filters.value = {
    category_id: undefined,
    search: "",
    min_price: undefined,
    max_price: undefined,
    in_stock: undefined,
    sort_by: "created_at",
    sort_order: "desc",
    per_page: 15,
    page: 1,
  };
  router.push({ query: {} });
};

const handleSortChange = (event) => {
  const value = event.target.value;
  if (!value) return;

  const [by, order] = value.split(":");
  filters.value.sort_by = by;
  filters.value.sort_order = order;
  filters.value.page = 1;
  applyFilters();
};

const formatPrice = (price) => {
  return parseFloat(price).toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const { getImageUrl } = useImageUrl();

const getProductImage = (product) => {
  if (product.image) {
    return getImageUrl(product.image);
  }
  return "https://via.placeholder.com/300x300/0f172a/38bdf8?text=Товар";
};

watch(
  () => route.query,
  (newQuery) => {
    filters.value.category_id = newQuery.category_id
      ? Number(newQuery.category_id)
      : undefined;
    filters.value.search = newQuery.search || "";
    filters.value.min_price = newQuery.min_price
      ? Number(newQuery.min_price)
      : undefined;
    filters.value.max_price = newQuery.max_price
      ? Number(newQuery.max_price)
      : undefined;
    filters.value.in_stock = newQuery.in_stock === "true" ? true : undefined;
    filters.value.sort_by = newQuery.sort_by || "created_at";
    filters.value.sort_order = newQuery.sort_order || "desc";
    filters.value.page = newQuery.page ? Number(newQuery.page) : 1;
    loadData();
  },
  { immediate: true },
);

onMounted(() => {
  loadData();
});

const visiblePages = computed(() => {
  if (!products.value) return [];
  const total = products.value.last_page || 0;
  const current = products.value.current_page || 1;
  const delta = 2;
  const range = [];
  const rangeWithDots = [];
  let l;

  range.push(1);
  for (let i = current - delta; i <= current + delta; i++) {
    if (i < total && i > 1) {
      range.push(i);
    }
  }
  if (total > 1) range.push(total);

  for (let i of range) {
    if (l) {
      if (i - l === 2) {
        rangeWithDots.push(l + 1);
      } else if (i - l !== 1) {
        rangeWithDots.push("...");
      }
    }
    rangeWithDots.push(i);
    l = i;
  }

  return rangeWithDots;
});

const goToPage = (page) => {
  if (page === "...") return;
  router.push({ query: { ...route.query, page } });
  window.scrollTo({ top: 0, behavior: "smooth" });
};

const isMobileFiltersOpen = ref(false);
const toggleMobileFilters = () => {
  isMobileFiltersOpen.value = !isMobileFiltersOpen.value;
};
</script>

<template>
  <div class="catalog-page">
    <div class="container py-4">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h1 class="h3 fw-bold mb-0">{{ title }}</h1>
        <button
          class="btn btn-outline-primary d-lg-none"
          @click="toggleMobileFilters"
        >
          <i class="bi bi-filter"></i> Фильтры
        </button>
      </div>

      <div class="row g-4">
        <aside class="col-lg-3">
          <div
            class="filter-sidebar"
            :class="{ 'mobile-open': isMobileFiltersOpen }"
          >
            <div class="filter-header d-lg-none">
              <h5 class="mb-0">Фильтры</h5>
              <button class="btn-close" @click="toggleMobileFilters"></button>
            </div>

            <div class="filter-card shadow-sm">
              <div class="filter-section p-4 border-bottom">
                <div class="d-flex align-items-center mb-3">
                  <i class="bi bi-search text-primary me-2"></i>
                  <h6 class="mb-0 fw-bold">Поиск</h6>
                </div>
                <div class="search-input-wrapper">
                  <input
                    v-model="filters.search"
                    type="text"
                    class="form-control"
                    placeholder="Название товара..."
                    @keyup.enter="applyFilters"
                  />
                  <i class="bi bi-arrow-return-left search-icon"></i>
                </div>
              </div>

              <div class="filter-section p-0 border-bottom">
                <div
                  class="d-flex align-items-center justify-content-between p-4 cursor-pointer"
                  @click="isCategoriesOpen = !isCategoriesOpen"
                >
                  <div class="d-flex align-items-center">
                    <i class="bi bi-grid text-primary me-2"></i>
                    <h6 class="mb-0 fw-bold">Категории</h6>
                  </div>
                  <i
                    class="bi bi-chevron-down transition-transform"
                    :class="{ 'rotate-180': isCategoriesOpen }"
                  ></i>
                </div>

                <transition name="collapse">
                  <div
                    class="category-list px-4 pb-4"
                    v-show="isCategoriesOpen"
                  >
                    <div
                      class="category-item"
                      :class="{ active: !filters.category_id }"
                      @click="
                        filters.category_id = undefined;
                        applyFilters();
                      "
                    >
                      Все категории
                    </div>
                    <div
                      v-for="category in categories"
                      :key="category.id"
                      class="category-item"
                      :class="{ active: filters.category_id === category.id }"
                      @click="
                        filters.category_id = category.id;
                        applyFilters();
                      "
                    >
                      {{ category.name }}
                    </div>
                  </div>
                </transition>
              </div>

              <div class="filter-section p-4 border-bottom">
                <div class="d-flex align-items-center mb-3">
                  <i class="bi bi-currency-dollar text-primary me-2"></i>
                  <h6 class="mb-0 fw-bold">Цена (сом)</h6>
                </div>
                <div class="price-inputs row g-2">
                  <div class="col-6">
                    <div class="input-group input-group-sm">
                      <span class="input-group-text bg-white">От</span>
                      <input
                        v-model.number="filters.min_price"
                        type="number"
                        class="form-control"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div class="col-6">
                    <div class="input-group input-group-sm">
                      <span class="input-group-text bg-white">До</span>
                      <input
                        v-model.number="filters.max_price"
                        type="number"
                        class="form-control"
                        placeholder="Max"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div class="filter-section p-4 border-bottom">
                <div class="form-check form-switch mb-0">
                  <input
                    id="inStockCheck"
                    v-model="filters.in_stock"
                    class="form-check-input"
                    type="checkbox"
                    :true-value="true"
                    :false-value="undefined"
                    @change="applyFilters"
                  />
                  <label class="form-check-label fw-bold" for="inStockCheck">
                    Только в наличии
                  </label>
                </div>
              </div>

              <div class="p-4 d-grid gap-2">
                <button class="btn btn-primary" @click="applyFilters">
                  Применить фильтры
                </button>
                <button class="btn btn-light text-muted" @click="resetFilters">
                  Сбросить всё
                </button>
              </div>
            </div>
          </div>

          <div
            v-if="isMobileFiltersOpen"
            class="filter-overlay"
            @click="toggleMobileFilters"
          ></div>
        </aside>

        <main class="col-lg-9">
          <div
            class="catalog-toolbar d-flex justify-content-between align-items-center mb-4 p-3 bg-white shadow-sm rounded-3"
          >
            <div class="text-muted small">
              Найдено:
              <span class="fw-bold text-dark">{{ products?.total || 0 }}</span>
              товаров
            </div>
            <div class="d-flex gap-3 align-items-center">
              <select
                class="form-select form-select-sm border-0 bg-light"
                style="width: auto"
                :value="`${filters.sort_by}:${filters.sort_order}`"
                @change="handleSortChange"
              >
                <option value="created_at:desc">Сначала новые</option>
                <option value="price:asc">Сначала дешевые</option>
                <option value="price:desc">Сначала дорогие</option>
                <option value="name:asc">По названию (А-Я)</option>
              </select>
              <div class="view-toggles d-none d-sm-flex">
                <button
                  class="btn btn-sm btn-light"
                  :class="{ active: viewMode === 'grid' }"
                  @click="viewMode = 'grid'"
                >
                  <i class="bi bi-grid-3x3-gap"></i>
                </button>
                <button
                  class="btn btn-sm btn-light"
                  :class="{ active: viewMode === 'list' }"
                  @click="viewMode = 'list'"
                >
                  <i class="bi bi-view-list"></i>
                </button>
              </div>
            </div>
          </div>

          <div v-if="loading" class="text-center py-5">
            <div class="spinner-border text-primary" role="status">
              <span class="visually-hidden">Загрузка...</span>
            </div>
          </div>

          <div v-else-if="error" class="alert alert-danger" role="alert">
            {{ error }}
          </div>

          <div v-else-if="products && products.data?.length" class="row g-4">
            <div
              v-for="product in products.data"
              :key="product.id"
              :class="viewMode === 'grid' ? 'col-md-6 col-xl-4' : 'col-12'"
              class="product-card-wrapper"
            >
              <ProductCard :product="product" :view-mode="viewMode" />
            </div>
          </div>

          <div v-else class="text-center py-5">
            <p class="text-muted">Товары не найдены</p>
          </div>

          <nav
            v-if="products && products.last_page > 1"
            aria-label="Навигация по страницам"
            class="mt-4"
          >
            <ul class="pagination justify-content-center">
              <li
                class="page-item"
                :class="{ disabled: products.current_page === 1 }"
              >
                <button
                  class="page-link"
                  @click="goToPage(products.current_page - 1)"
                >
                  <i class="bi bi-chevron-left"></i>
                </button>
              </li>

              <li
                v-for="page in visiblePages"
                :key="page"
                class="page-item"
                :class="{
                  active: page === products.current_page,
                  disabled: page === '...',
                }"
              >
                <button class="page-link" @click="goToPage(page)">
                  {{ page }}
                </button>
              </li>

              <li
                class="page-item"
                :class="{
                  disabled: products.current_page === products.last_page,
                }"
              >
                <button
                  class="page-link"
                  @click="goToPage(products.current_page + 1)"
                >
                  <i class="bi bi-chevron-right"></i>
                </button>
              </li>
            </ul>
          </nav>
        </main>
      </div>
    </div>
  </div>
</template>

<style scoped>
.catalog-page {
  background-color: #f8fafc;
  min-height: 100vh;
}

.filter-sidebar {
  position: sticky;
  top: 100px;
  z-index: 100;
}

.filter-card {
  background: white;
  border-radius: 20px;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.filter-section {
  padding: 1.25rem;
}

.category-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 280px;
  overflow-y: auto;
  padding-right: 8px;
}

.category-list::-webkit-scrollbar {
  width: 4px;
}

.category-list::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 10px;
}

.category-list::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 10px;
}

.category-list::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

.category-item {
  padding: 0.5rem 0.8rem;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.9rem;
  color: #64748b;
  border: 1px solid transparent;
}

.category-item:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.category-item.active {
  background: #38bdf8;
  color: white;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(56, 189, 248, 0.3);
}

.search-input-wrapper {
  position: relative;
}

.search-icon {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
  font-size: 0.9rem;
}

.input-group-text {
  border: none;
  font-size: 0.8rem;
  font-weight: 600;
  color: #94a3b8;
}

.form-control:focus {
  border-color: #38bdf8;
  box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.1);
}

.catalog-toolbar {
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.view-toggles .btn {
  border: none;
  background: transparent;
  color: #94a3b8;
  padding: 0.4rem 0.6rem;
}

.view-toggles .btn.active {
  color: #38bdf8;
  background: #f1f5f9;
}

@media (max-width: 991.98px) {
  .filter-sidebar {
    position: fixed;
    top: 0;
    left: -100%;
    width: 300px;
    height: 100vh;
    background: white;
    z-index: 1050;
    transition: left 0.3s ease;
    overflow-y: auto;
    padding-bottom: 2rem;
  }

  .filter-sidebar.mobile-open {
    left: 0;
  }

  .filter-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(4px);
    z-index: 1040;
  }

  .filter-card {
    border-radius: 0;
    box-shadow: none !important;
  }
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
  background: #f8fafc;
}

.product-image-wrapper img {
  transition: transform 0.5s ease;
}

.product-card:hover .product-image-wrapper img {
  transform: scale(1.1);
}

.transition-transform {
  transition: transform 0.3s ease;
}

.rotate-180 {
  transform: rotate(180deg);
}

.cursor-pointer {
  cursor: pointer;
}

.collapse-enter-active,
.collapse-leave-active {
  transition: all 0.3s ease-in-out;
  max-height: 500px;
  overflow: hidden;
}

.collapse-enter-from,
.collapse-leave-to {
  max-height: 0;
  opacity: 0;
  padding-bottom: 0 !important;
}

.line-clamp-1 {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.product-card-wrapper {
  transition: transform 0.3s ease;
}

.product-card-wrapper:hover {
  transform: translateY(-5px);
}

.list-card {
  transition: all 0.3s ease;
}

.list-card:hover {
  background-color: #f1f5f9;
  border-color: #38bdf8 !important;
}

.product-overlay {
  background: rgba(15, 23, 42, 0.7);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.product-card:hover .product-overlay {
  opacity: 1;
}
</style>
