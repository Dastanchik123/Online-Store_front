<script setup>
definePageMeta({
  layout: "admin",
  middleware: "purchaser",
});

const uiStore = useUiStore();
const productsStore = useProductsStore();

const {
  getProducts,
  deleteProduct,
  downloadProductsExport,
  downloadProductsExcel,
  downloadProductBarcode,
} = useProducts();

const products = ref({
  data: [],
  current_page: 1,
  last_page: 1,
  total: 0,
  per_page: 15,
});

const categories = computed(() => productsStore.categories);
const isLoading = ref(false);

const filters = ref({
  search: "",
  category_id: "",
  is_active: "",
  page: 1,
  per_page: -1,
});

const formatPrice = (price) => {
  if (price === null || price === undefined) return "0 сом";
  return (
    parseFloat(price).toLocaleString("ru-RU", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }) + " сом"
  );
};

let searchTimeout = null;
const handleSearchInput = () => {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    filters.value.page = 1;
    fetchProducts();
  }, 500);
};

const fetchProducts = async () => {
  isLoading.value = true;
  const params = { ...filters.value };

  if (params.is_active === "") delete params.is_active;
  if (params.category_id === "") delete params.category_id;
  if (!params.search) delete params.search;

  try {
    const data = await getProducts(params);
    if (data && data.data && Array.isArray(data.data)) {
      products.value = data;
    } else if (Array.isArray(data)) {
      products.value = {
        data: data,
        current_page: 1,
        last_page: 1,
        total: data.length,
        per_page: params.per_page || 15,
      };
    } else {
      products.value = {
        data: [],
        current_page: 1,
        last_page: 1,
        total: 0,
        per_page: 15,
      };
    }
  } catch (error) {
    console.error("Error fetching products:", error);
  } finally {
    isLoading.value = false;
  }
};

const fetchCategories = async () => {
  try {
    await productsStore.fetchCategories();
  } catch (error) {
    console.error("Error fetching categories:", error);
  }
};

const changePage = (page) => {
  if (page < 1 || page > products.value.last_page || page === "...") return;
  filters.value.page = page;
  fetchProducts();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

const handleDelete = async (id) => {
  const confirmed = await uiStore.showConfirm(
    "Удаление товара",
    "Вы уверены, что хотите удалить этот товар? Это действие нельзя будет отменить.",
  );
  if (!confirmed) return;

  try {
    await deleteProduct(id);
    await fetchProducts();
    uiStore.success("Товар успешно удален");
  } catch (error) {
    console.error("Error deleting product:", error);
    uiStore.error("Ошибка при удалении товара");
  }
};

const stockClass = (product) => {
  const qty = parseFloat(product.stock_quantity || 0);
  if (qty <= 0) return "out-of-stock";
  if (qty <= 5) return "low-stock";
  return "in-stock";
};

onMounted(async () => {
  await fetchCategories();
  await fetchProducts();
});
</script>

<template>
  <div class="products-page p-4 animate-fade-in">
    <div
      class="header-card mb-3 p-3 rounded-4 shadow-sm text-white glass-header"
    >
      <div class="row align-items-center">
        <div class="col">
          <h5 class="mb-0 fw-bold">Управление каталогом</h5>
          <p class="small mb-0 opacity-75">Товары, цены и остатки</p>
        </div>
        <div class="col-auto d-flex gap-2">
          <button
            @click="downloadProductsExcel(filters)"
            class="btn btn-light rounded-pill px-4 py-2 fw-bold shadow-sm"
          >
            <i class="bi bi-file-earmark-excel me-2 text-success"></i>Экспорт
            excel
          </button>
          <button
            @click="downloadProductsExport(filters)"
            class="btn btn-light rounded-pill px-4 py-2 fw-bold shadow-sm"
          >
            <i class="bi bi-file-earmark-pdf me-2 text-danger"></i>Отчет (PDF)
          </button>
          <NuxtLink
            to="/admin/products/create"
            class="btn btn-add rounded-pill px-4 py-2 fw-bold"
          >
            <i class="bi bi-plus-lg me-2"></i>Добавить товар
          </NuxtLink>
        </div>
      </div>
    </div>

    <div class="card border-0 shadow-sm rounded-4 luxury-filter-card mb-3">
      <div class="card-body p-3">
        <div class="row g-3">
          <div class="col-lg-4">
            <div class="input-group search-pill-inner">
              <span class="input-group-text border-0 ps-3"
                ><i class="bi bi-search"></i
              ></span>
              <input
                v-model="filters.search"
                @input="handleSearchInput"
                type="text"
                placeholder="Название или артикул..."
                class="form-control border-0"
              />
            </div>
          </div>
          <div class="col-md-3">
            <select
              v-model="filters.category_id"
              @change="fetchProducts"
              class="form-select border-0 bg-light rounded-pill px-3 py-2"
            >
              <option value="">Все категории</option>
              <option v-for="cat in categories" :key="cat.id" :value="cat.id">
                {{ cat.name }}
              </option>
            </select>
          </div>
          <div class="col-md-3">
            <select
              v-model="filters.is_active"
              @change="fetchProducts"
              class="form-select border-0 bg-light rounded-pill px-3 py-2"
            >
              <option value="">Все статусы</option>
              <option :value="true">🟢 Активные</option>
              <option :value="false">🔴 Скрытые</option>
            </select>
          </div>
          <div class="col-md-2 text-end">
            <button
              @click="fetchProducts"
              class="btn btn-refresh-round shadow-sm"
              title="Обновить"
            >
              <i class="bi bi-arrow-clockwise"></i>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div
      class="card border-0 shadow-sm rounded-4 luxury-table-card overflow-hidden"
    >
      <div class="card-header bg-white border-0 py-3 ps-4">
        <h5 class="mb-0 fw-bold text-dark">Список товаров</h5>
      </div>
      <div v-if="isLoading" class="p-5 text-center">
        <div class="spinner-border text-primary" role="status"></div>
        <div class="mt-3 text-muted fw-bold">Загружаем товары...</div>
      </div>

      <div
        v-else-if="products.data.length === 0"
        class="p-5 text-center text-muted"
      >
        <i class="bi bi-box-seam fs-1 opacity-25 d-block mb-3"></i>
        <span>Товары не найдены.</span>
      </div>

      <div
        v-else
        class="table-responsive-cards custom-scrollbar"
        style="max-height: 600px; overflow-y: auto"
      >
        <table class="table table-hover align-middle mb-0 custom-table">
          <thead>
            <tr>
              <th scope="col" class="ps-4" style="width: 50px">#</th>
              <th scope="col">Товар / Артикул</th>
              <th scope="col">Категория</th>
              <th scope="col">Стоимость</th>
              <th scope="col">Остаток</th>
              <th scope="col">Статус</th>
              <th scope="col" class="text-center text-lg-end pe-4">Действия</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(product, index) in products.data"
              :key="product.id"
              class="product-row"
            >
              <td class="ps-4 text-muted small fw-bold" data-label="#">
                {{ index + 1 }}
              </td>
              <td data-label="Товар">
                <div class="d-flex align-items-center">
                  <div class="product-img-box me-3">
                    <img
                      v-if="product.image_url"
                      :src="product.image_url"
                      class="rounded-3"
                      alt=""
                    />
                    <div v-else class="rounded-3 bg-light no-img">
                      <i class="bi bi-image"></i>
                    </div>
                  </div>
                  <div>
                    <div class="fw-bold text-dark">{{ product.name }}</div>
                    <div class="small text-muted font-monospace">
                      {{ product.sku }}
                    </div>
                  </div>
                </div>
              </td>
              <td data-label="Категория">
                <span class="category-pill shadow-xs">{{
                  product.category?.name || "Без категории"
                }}</span>
              </td>
              <td data-label="Стоимость">
                <div class="fw-bold text-dark font-monospace">
                  {{ formatPrice(product.price) }}
                </div>
                <div
                  v-if="product.sale_price"
                  class="small text-danger fw-bold"
                >
                  Акция: {{ formatPrice(product.sale_price) }}
                </div>
                <div class="small text-muted op-5 mt-1">
                  Закуп:
                  <span class="text-primary fw-semi-bold">{{
                    formatPrice(product.purchase_price || 0)
                  }}</span>
                </div>
              </td>
              <td data-label="Остаток">
                <div class="stock-badge" :class="stockClass(product)">
                  <span class="count">{{ product.stock_quantity }}</span>
                  <span class="unit">шт.</span>
                </div>
              </td>
              <td data-label="Статус">
                <div
                  class="d-flex gap-1 flex-wrap justify-content-end justify-content-lg-start"
                >
                  <span
                    class="badge-status"
                    :class="product.is_active ? 'active' : 'inactive'"
                  >
                    {{ product.is_active ? "Активен" : "Скрыт" }}
                  </span>
                  <span
                    v-if="!product.in_stock"
                    class="badge-status out-of-stock"
                    >Нет в наличии</span
                  >
                </div>
              </td>
              <td class="text-end pe-4 mobile-actions">
                <div class="d-flex justify-content-end gap-2">
                  <NuxtLink
                    :to="`/admin/products/update-${product.id}`"
                    class="btn-action edit shadow-sm"
                    title="Изменить"
                  >
                    <i class="bi bi-pencil-square"></i>
                  </NuxtLink>
                  <NuxtLink
                    :to="`/admin/inventory?product_id=${product.id}`"
                    class="btn-action inventory shadow-sm"
                    title="Инвентаризация"
                    style="background: #e0f2fe; color: #0369a1"
                  >
                    <i class="bi bi-box-seam"></i>
                  </NuxtLink>
                  <button
                    @click="downloadProductBarcode(product.id)"
                    class="btn-action barcode shadow-sm"
                    title="Печать штрих-кода"
                  >
                    <i class="bi bi-upc-scan"></i>
                  </button>
                  <button
                    @click="handleDelete(product.id)"
                    class="btn-action delete shadow-sm"
                    title="Удалить"
                  >
                    <i class="bi bi-trash3"></i>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="d-flex justify-content-between align-items-center mt-4 px-2">
      <div class="small fw-semi-bold text-muted">
        Всего товаров: <span class="text-dark">{{ products.data.length }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.products-page {
  background-color: #f8fafc;
  min-height: 100vh;
}

.glass-header {
  background: linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%);
}

.btn-add {
  background: white;
  color: #0369a1;
  border: none;
  transition: all 0.3s;
}
.btn-add:hover {
  background: #f1f5f9;
  transform: translateY(-2px);
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
}

.search-pill-inner {
  background: #f1f5f9;
  border-radius: 50px;
  overflow: hidden;
}
.search-pill-inner .input-group-text {
  background: transparent;
  color: #64748b;
}

.btn-refresh-round {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: white;
  border: 1px solid #e2e8f0;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
}
.btn-refresh-round:hover {
  background: #f1f5f9;
  transform: rotate(180deg);
}

.luxury-table-card {
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.05) !important;
}

.custom-table thead th {
  background: #f8fafc;
  padding: 18px 15px;
  color: #64748b;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  position: sticky;
  top: 0;
  z-index: 10;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
}

.product-row {
  transition: background 0.2s;
}
.product-row:hover {
  background-color: #f1f5f9;
}

.product-img-box {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
}
.product-img-box img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
}
.product-img-box .no-img {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #cbd5e1;
  font-size: 1.2rem;
}

.badge-status {
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 0.65rem;
  font-weight: 800;
  text-transform: uppercase;
  display: inline-block;
}
.badge-status.active {
  background: #dcfce7;
  color: #16a34a;
}
.badge-status.inactive {
  background: #f1f5f9;
  color: #64748b;
}
.badge-status.out-of-stock {
  background: #fee2e2;
  color: #dc2626;
}
.stock-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 50px;
  font-size: 0.75rem;
  font-weight: 700;
}
.stock-badge.out-of-stock {
  background: #fee2e2;
  color: #dc2626;
}
.stock-badge.low-stock {
  background: #fff7ed;
  color: #ea580c;
}
.stock-badge.in-stock {
  background: #f0fdf4;
  color: #16a34a;
}

.btn-action {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e2e8f0;
  background: white;
  transition: all 0.2s;
  text-decoration: none;
}
.btn-action.edit:hover {
  background: #eff6ff;
  color: #3b82f6;
  border-color: #3b82f6;
}
.btn-action.delete:hover {
  background: #fef2f2;
  color: #dc2626;
  border-color: #dc2626;
}
.btn-action.barcode:hover {
  background: #f5f3ff;
  color: #8b5cf6;
  border-color: #8b5cf6;
}

.pagination-premium {
  display: flex;
  list-style: none;
  gap: 6px;
}
.pagination-premium li button {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: white;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  font-size: 0.85rem;
}
.pagination-premium li.active button {
  background: #0ea5e9;
  color: white;
  border-color: #0ea5e9;
  box-shadow: 0 4px 12px rgba(14, 165, 233, 0.25);
}

.text-danger-custom {
  color: #f43f5e;
}

.animate-fade-in {
  animation: fadeIn 0.4s ease-out;
}
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
