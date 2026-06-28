<script setup>
definePageMeta({
  layout: "admin",
  middleware: "purchaser",
});

const { getProducts } = useProducts();
const productsStore = useProductsStore();
const uiStore = useUiStore();

const products = ref({
  data: [],
  current_page: 1,
  last_page: 1,
  total: 0,
});

const categories = computed(() => productsStore.categories);
const isLoading = ref(false);
const sortField = ref('none'); // none, stock_quantity
const sortOrder = ref('desc'); // asc, desc

const toggleSort = (field) => {
  if (sortField.value === field) {
    if (sortOrder.value === 'desc') sortOrder.value = 'asc';
    else sortField.value = 'none';
  } else {
    sortField.value = field;
    sortOrder.value = 'desc';
  }
};

const filteredProducts = computed(() => {
  let list = [...(products.value.data || [])];
  
  if (sortField.value === 'stock_quantity') {
    list.sort((a, b) => {
      const qA = parseFloat(a.stock_quantity || 0);
      const qB = parseFloat(b.stock_quantity || 0);
      return sortOrder.value === 'asc' ? qA - qB : qB - qA;
    });
  }
  
  return list;
});

const filters = ref({
  search: "",
  category_id: "",
  stock_status: "all", // all, low, out, in
  page: 1,
  per_page: 100,
});

const fetchProducts = async () => {
  isLoading.value = true;
  try {
    const params = {
      ...filters.value,
      category_id: filters.value.category_id || undefined,
    };

    const data = await getProducts(params);
    
    let processedData = data.data || data;

    // Frontend filtering for stock status
    if (filters.value.stock_status !== 'all') {
        processedData = processedData.filter(p => {
            const qty = parseFloat(p.stock_quantity || 0);
            if (filters.value.stock_status === 'out') return qty <= 0;
            if (filters.value.stock_status === 'low') return qty > 0 && qty <= 5;
            if (filters.value.stock_status === 'in') return qty > 5;
            return true;
        });
    }

    products.value = {
        data: processedData,
        current_page: data.current_page || 1,
        last_page: data.last_page || 1,
        total: data.total || processedData.length
    };
  } catch (error) {
    console.error("Error fetching stocks:", error);
  } finally {
    isLoading.value = false;
  }
};

const changePage = (page) => {
  filters.value.page = page;
  fetchProducts();
};

const initResize = (e) => {
  const th = e.target.parentElement;
  const startX = e.pageX;
  const startWidth = th.offsetWidth;

  const onMouseMove = (moveEvent) => {
    const newWidth = startWidth + (moveEvent.pageX - startX);
    if (newWidth > 50) {
      th.style.width = `${newWidth}px`;
    }
  };

  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'default';
  };

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  document.body.style.cursor = 'col-resize';
};

const getRowClass = (qty) => {
  const q = parseFloat(qty || 0);
  if (q <= 0) return 'stock-critical'; // Самый красный
  if (q <= 5) return 'stock-low';      // Красный
  if (q <= 10) return 'stock-warning';  // Бледный красный
  return 'stock-ok'; // Зелёный (норма)
};

const getStockBadgeClass = (qty) => {
  const q = parseFloat(qty || 0);
  if (q <= 0) return "bg-danger text-white";
  if (q <= 5) return "bg-warning text-dark";
  return "bg-light text-muted"; // В наличии делаем просто светлым
};

const getStockStatusText = (qty) => {
  const q = parseFloat(qty || 0);
  if (q <= 0) return "Нет";
  if (q <= 5) return "Мало";
  return "Есть";
};

onMounted(async () => {
  await productsStore.fetchCategories();
  await fetchProducts();
});
</script>

<template>
  <div class="stock-monitoring-page p-3 animate-fade-in h-100 d-flex flex-column">
    <!-- Header: Compact -->
    <div class="card border-0 shadow-sm rounded-4 luxury-header mb-3 overflow-hidden">
      <div class="luxury-header-pattern"></div>
      <div class="card-body p-3 position-relative z-1">
        <div class="row align-items-center">
          <div class="col">
            <h5 class="fw-bold mb-0 text-white"><i class="bi bi-layers me-2"></i>Мониторинг остатков</h5>
          </div>
          <div class="col-auto">
            <div class="stats-badge bg-white bg-opacity-10 rounded-pill px-3 py-1 text-white border border-white border-opacity-10 small">
              <span class="opacity-75 me-2">ВСЕГО SKU:</span>
              <span class="fw-bold">{{ products.total }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Filters: Compact -->
    <div class="card border-0 shadow-sm rounded-4 mb-3 filter-card">
      <div class="card-body p-2">
        <div class="row g-2">
          <div class="col-lg-4">
            <div class="input-group input-group-sm search-box">
              <span class="input-group-text bg-light border-0">
                <i class="bi bi-search text-muted"></i>
              </span>
              <input 
                v-model="filters.search" 
                type="text" 
                class="form-control bg-light border-0" 
                placeholder="Поиск товара..."
                @input="fetchProducts"
              />
            </div>
          </div>
          <div class="col-md-3">
            <select v-model="filters.category_id" class="form-select form-select-sm border-0 bg-light" @change="fetchProducts">
              <option value="">Все категории</option>
              <option v-for="cat in categories" :key="cat.id" :value="cat.id">
                {{ cat.name }}
              </option>
            </select>
          </div>
          <div class="col-md-3">
            <select v-model="filters.stock_status" class="form-select form-select-sm border-0 bg-light" @change="fetchProducts">
              <option value="all">Все товары</option>
              <option value="in">В наличии</option>
              <option value="low">Мало (1-5)</option>
              <option value="out">Нет (0)</option>
            </select>
          </div>
          <div class="col-md-2 d-flex gap-1">
            <button class="btn btn-sm btn-primary w-100 rounded-3" @click="fetchProducts">
              <i class="bi bi-filter"></i>
            </button>
            <button class="btn btn-sm btn-light rounded-3" @click="fetchProducts">
              <i class="bi bi-arrow-clockwise"></i>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Table: Scrollable & Denser -->
    <div class="card border-0 shadow-sm rounded-4 overflow-hidden inventory-table-card flex-grow-1">
      <div class="table-container custom-scrollbar" style="max-height: calc(100vh - 250px); overflow-y: auto;">
        <table class="table table-hover align-middle mb-0" style="table-layout: fixed;">
          <thead class="sticky-top bg-white z-2 shadow-sm">
            <tr>
              <th class="ps-4 py-2 col-resize" style="width: 140px; font-size: 0.7rem;">
                Артикул
                <div class="resizer" @mousedown="initResize($event)"></div>
              </th>
              <th class="py-2 col-resize" style="font-size: 0.7rem;">
                Товар
                <div class="resizer" @mousedown="initResize($event)"></div>
              </th>
              <th 
                class="text-center py-2 col-resize position-relative" 
                style="width: 130px; font-size: 0.7rem; cursor: pointer; user-select: none;"
                @click="toggleSort('stock_quantity')"
              >
                <div class="d-flex align-items-center justify-content-center gap-1">
                  Остаток
                  <i v-if="sortField === 'stock_quantity'" class="bi" :class="sortOrder === 'asc' ? 'bi-sort-up' : 'bi-sort-down'"></i>
                  <i v-else class="bi bi-hash opacity-25"></i>
                </div>
                <div class="resizer" @mousedown.stop="initResize($event)"></div>
              </th>
              <th class="text-end pe-4 py-2" style="width: 120px; font-size: 0.7rem;">Действия</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="isLoading">
              <td colspan="4" class="text-center p-4">
                <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
              </td>
            </tr>
            <tr v-else-if="filteredProducts.length === 0">
              <td colspan="4" class="text-center p-4 text-muted small">
                Ничего не найдено
              </td>
            </tr>
            <tr v-for="p in filteredProducts" :key="p.id" :class="getRowClass(p.stock_quantity)">
              <td class="ps-4 py-1 text-truncate">
                <div class="text-muted font-monospace fw-bold" style="font-size: 0.7rem;">{{ p.sku }}</div>
              </td>
              <td class="py-1">
                <div class="d-flex align-items-center overflow-hidden">
                  <div class="lh-1 text-truncate">
                    <div class="fw-bold text-dark mb-0 small text-truncate">{{ p.name }}</div>
                  </div>
                </div>
              </td>
              <td class="text-center py-1 text-nowrap">
                <div class="small fw-bold" :class="parseFloat(p.stock_quantity) <= 5 ? 'text-danger' : 'text-dark'">
                  {{ p.stock_quantity }} <span class="fw-normal text-muted" style="font-size: 0.7rem;">шт.</span>
                </div>
              </td>
              <td class="text-end pe-4 py-1">
                <div class="d-flex justify-content-end gap-1">
                  <NuxtLink :to="`/admin/inventory?product_id=${p.id}`" class="btn btn-xs btn-outline-primary rounded-pill p-1 px-2" title="Списать/Принять">
                    <i class="bi bi-plus-slash-minus" style="font-size: 0.8rem;"></i>
                  </NuxtLink>
                  <NuxtLink :to="`/admin/products/update-${p.id}`" class="btn btn-xs btn-light rounded-circle border shadow-sm p-1 px-2">
                    <i class="bi bi-pencil" style="font-size: 0.8rem;"></i>
                  </NuxtLink>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="products.last_page > 1" class="card-footer bg-white border-0 p-2 d-flex justify-content-center border-top">
        <nav>
          <ul class="pagination pagination-xs mb-0">
            <li class="page-item" :class="{ disabled: filters.page === 1 }">
              <button class="page-link" @click="changePage(filters.page - 1)" style="padding: 0.2rem 0.5rem; font-size: 0.7rem;">Назад</button>
            </li>
            <li class="page-item active">
              <span class="page-link" style="padding: 0.2rem 0.5rem; font-size: 0.7rem;">{{ filters.page }} из {{ products.last_page }}</span>
            </li>
            <li class="page-item" :class="{ disabled: filters.page === products.last_page }">
              <button class="page-link" @click="changePage(filters.page + 1)" style="padding: 0.2rem 0.5rem; font-size: 0.7rem;">Вперед</button>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  </div>
</template>

<style scoped>
.luxury-header {
  background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
  position: relative;
}

.luxury-header-pattern {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image: radial-gradient(circle at 2px 2px, rgba(255,255,255,0.05) 1px, transparent 0);
  background-size: 24px 24px;
}

.ls-1 {
  letter-spacing: 0.1em;
}

.search-box .input-group-text, .search-box .form-control {
  padding: 12px;
}

thead th {
  background: #f8fafc;
  color: #64748b;
  font-size: 0.75rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 1.25rem 1rem;
  border-bottom: 2px solid #f1f5f9;
}

.inventory-table-card tbody tr {
  transition: all 0.2s;
}

.inventory-table-card tbody tr:hover {
  background-color: #f8fafc;
  transform: scale(1.002);
}

.product-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.animate-fade-in {
  animation: fadeIn 0.5s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.stock-ok td {
  background-color: rgba(22, 163, 74, 0.06) !important;
}

.stock-critical td {
  background-color: rgba(220, 38, 38, 0.25) !important;
}

.stock-low td {
  background-color: rgba(220, 38, 38, 0.12) !important;
}

.stock-warning td {
  background-color: rgba(220, 38, 38, 0.06) !important;
}

.stock-critical:hover, .stock-low:hover, .stock-warning:hover {
  filter: brightness(0.95);
}

.col-resize {
  position: relative;
  user-select: none;
}

.resizer {
  position: absolute;
  top: 0;
  right: 0;
  width: 8px;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
}

.resizer:hover {
  background: rgba(0, 0, 0, 0.05);
  border-right: 2px solid #0d6efd;
}
</style>
