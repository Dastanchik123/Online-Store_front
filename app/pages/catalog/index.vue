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
  per_page: 84,
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
  clearTimeout(filtersDebounceTimer);
  filters.value.page = 1;

  const query = {};
  Object.entries(filters.value).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query[key] = value;
    }
  });

  router.push({ query });
  isMobileFiltersOpen.value = false;
};

let filtersDebounceTimer = null;
const applyFiltersDebounced = () => {
  clearTimeout(filtersDebounceTimer);
  filtersDebounceTimer = setTimeout(applyFilters, 450);
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
    per_page: 84,
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
  applyFilters();
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

// Улучшаем отступы и адаптивность глобально через стили
useHead({
  style: [
    {
      innerHTML: `
        .main-content-wrapper { 
          max-width: 2100px !important; 
          padding-left: 15px !important;
          padding-right: 15px !important;
        }
        @media (max-width: 576px) {
          .main-content-wrapper {
            padding-left: 10px !important;
            padding-right: 10px !important;
          }
        }
      `
    }
  ]
});
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
        <!-- Sidebar -->
        <aside class="col-lg-3">
          <div
            class="filter-sidebar"
            :class="{ 'mobile-open': isMobileFiltersOpen }"
          >
            <div class="filter-header d-lg-none">
              <h5 class="mb-0 fw-bold">Фильтры</h5>
              <button class="btn-close" @click="toggleMobileFilters"></button>
            </div>

            <div class="filter-card shadow-sm">
              <!-- Search -->
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
                  <i
                    class="bi bi-arrow-return-left search-icon"
                    title="Нажмите Enter для поиска"
                  ></i>
                </div>
              </div>

              <!-- Categories -->
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

              <!-- Price -->
              <div class="filter-section p-4 border-bottom">
                <div class="d-flex align-items-center mb-3">
                  <i class="bi bi-currency-dollar text-primary me-2"></i>
                  <h6 class="mb-0 fw-bold">Цена (сом)</h6>
                </div>
                <div class="price-inputs row g-2">
                  <div class="col-6">
                    <input
                      v-model.number="filters.min_price"
                      type="number"
                      class="form-control"
                      placeholder="От"
                      @input="applyFiltersDebounced"
                    />
                  </div>
                  <div class="col-6">
                    <input
                      v-model.number="filters.max_price"
                      type="number"
                      class="form-control"
                      placeholder="До"
                      @input="applyFiltersDebounced"
                    />
                  </div>
                </div>
              </div>

              <!-- В наличии -->
              <div class="filter-section p-4 border-bottom">
                <label class="d-flex align-items-center gap-2 cursor-pointer mb-0">
                  <input
                    type="checkbox"
                    class="form-check-input mt-0"
                    :checked="!!filters.in_stock"
                    @change="
                      filters.in_stock = $event.target.checked ? true : undefined;
                      applyFilters();
                    "
                  />
                  <span class="fw-medium">Только в наличии</span>
                </label>
              </div>

              <!-- Actions -->
              <div class="p-4 d-grid gap-2">
                <button class="btn btn-primary" @click="applyFilters">
                  Применить
                </button>
                <button class="btn btn-light" @click="resetFilters">
                  Сбросить
                </button>
              </div>
            </div>
          </div>
          <!-- Overlay for mobile -->
          <div
            v-if="isMobileFiltersOpen"
            class="filter-overlay"
            @click="toggleMobileFilters"
          ></div>
        </aside>

        <!-- Main Content -->
        <main class="col-lg-9">
          <div
            class="catalog-toolbar d-flex justify-content-between align-items-center mb-4 p-3 bg-white shadow-sm rounded-3"
          >
            <div class="text-muted small">
              Найдено: <span class="fw-bold">{{ products?.total || 0 }}</span>
            </div>
            <div class="d-flex gap-3 align-items-center">
              <select
                class="form-select form-select-sm border-0 bg-light"
                :value="`${filters.sort_by}:${filters.sort_order}`"
                @change="handleSortChange"
              >
                <option value="created_at:desc">Новинки</option>
                <option value="price:asc">Дешевле</option>
                <option value="price:desc">Дороже</option>
              </select>
            </div>
          </div>

          <!-- Grid -->
          <div v-if="loading" class="row g-2 g-md-3 products-grid">
            <div
              v-for="i in filters.per_page"
              :key="i"
              class="col-6 col-md-4 col-lg-3 product-grid-cell"
            >
              <ProductCardSkeleton />
            </div>
          </div>

          <div v-else-if="products?.data?.length" class="row g-2 g-md-3 products-grid">
            <div
              v-for="(product, index) in products.data"
              :key="product.id"
              class="col-6 col-md-4 col-lg-3 product-grid-cell"
            >
              <ProductCard :product="product" :eager="index < 8" />
            </div>
          </div>

          <div v-else class="text-center py-5">
            <p class="text-muted">Ничего не нашли...</p>
          </div>

          <!-- Pagination -->
          <nav v-if="products?.last_page > 1" class="mt-5">
            <ul class="pagination justify-content-center">
              <li class="page-item" :class="{ disabled: products.current_page === 1 }">
                <button class="page-link rounded-circle mx-1" @click="goToPage(products.current_page - 1)">
                  <i class="bi bi-chevron-left"></i>
                </button>
              </li>
              <li v-for="page in visiblePages" :key="page" class="page-item" :class="{ active: page === products.current_page }">
                <button class="page-link rounded-circle mx-1" @click="goToPage(page)">{{ page }}</button>
              </li>
              <li class="page-item" :class="{ disabled: products.current_page === products.last_page }">
                <button class="page-link rounded-circle mx-1" @click="goToPage(products.current_page + 1)">
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
  width: 100%;
}
.catalog-page .container {
  max-width: 1840px;
  margin: 0 auto;
}

.filter-sidebar {
  position: sticky;
  top: 100px;
  z-index: 100;
  transition: all 0.3s ease;
}

.filter-card {
  background: white;
  border-radius: 20px;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.search-input-wrapper {
  position: relative;
}

.search-input-wrapper .form-control {
  padding-right: 2.6rem;
}

.search-input-wrapper .search-icon {
  position: absolute;
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 7px;
  background: #f1f5f9;
  color: #94a3b8;
  font-size: 0.9rem;
  pointer-events: none;
}

.search-hint {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: #94a3b8;
}

.category-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 280px;
  overflow-y: auto;
}

.category-item {
  padding: 0.6rem 0.8rem;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.9rem;
  color: #64748b;
}

.category-item:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.category-item.active {
  background: #38bdf8;
  color: white;
  font-weight: 600;
}

.filter-header {
  padding: 1.25rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  background: #f8fafc;
}

@media (max-width: 991.98px) {
  .filter-sidebar {
    position: fixed;
    top: 0;
    left: -100%;
    width: 100% !important;
    max-width: 320px;
    height: 100vh;
    background: white;
    z-index: 2000;
    margin: 0;
    box-shadow: 20px 0 50px rgba(0, 0, 0, 0.2);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  .filter-sidebar.mobile-open {
    left: 0;
  }
  .filter-card {
    border: none;
    border-radius: 0;
    box-shadow: none !important;
    background: transparent;
  }
  .filter-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(15, 23, 42, 0.5);
    backdrop-filter: blur(4px);
    z-index: 1540;
  }
}

.page-link {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  color: #64748b;
}

.page-item.active .page-link {
  background-color: #38bdf8;
  color: white;
}
</style>
