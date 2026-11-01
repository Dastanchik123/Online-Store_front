<script setup>
definePageMeta({
  layout: "admin",
  middleware: "permission",
  permission: "inventory.manage",
});

const { getProducts } = useProducts();
const productsStore = useProductsStore();

const PER_PAGE = 100;

const products = ref({
  data: [],
  current_page: 1,
  last_page: 1,
  total: 0,
});

const categories = computed(() => productsStore.categories);
const isLoading = ref(false);
const sortField = ref("none"); // none | stock_quantity
const sortOrder = ref("desc");

const filters = ref({
  search: "",
  category_id: "",
  stock_status: "all", // all | in | low | out — фильтруется на сервере
  page: 1,
});

const tableContainer = ref(null);

// Сортировка по остатку — по ВСЕМ товарам (на бэкенде), а не по странице
const toggleSort = (field) => {
  if (sortField.value === field) {
    if (sortOrder.value === "desc") sortOrder.value = "asc";
    else sortField.value = "none";
  } else {
    sortField.value = field;
    sortOrder.value = "desc";
  }
  filters.value.page = 1;
  fetchProducts();
};

let requestSeq = 0;
const fetchProducts = async () => {
  const seq = ++requestSeq;
  isLoading.value = true;
  tableContainer.value?.scrollTo({ top: 0, behavior: "auto" });
  try {
    const search = filters.value.search.trim();
    const data = await getProducts(
      {
        search: search || undefined,
        search_strict: search ? 1 : undefined,
        category_id: filters.value.category_id || undefined,
        stock_status: filters.value.stock_status !== "all" ? filters.value.stock_status : undefined,
        sort_by: sortField.value !== "none" ? sortField.value : "name",
        sort_order: sortField.value !== "none" ? sortOrder.value : "asc",
        page: filters.value.page,
        per_page: PER_PAGE,
        fields: "list",
      },
      { noCache: true },
    );
    // Ответ на устаревший запрос (быстро печатали в поиске) не показываем
    if (seq !== requestSeq) return;
    const rows = data?.data || data || [];
    const offset = ((data?.current_page || 1) - 1) * PER_PAGE;
    products.value = {
      data: rows.map((p, i) => ({ ...p, _idx: offset + i + 1 })),
      current_page: data?.current_page || 1,
      last_page: data?.last_page || 1,
      total: data?.total ?? rows.length,
    };
  } catch (error) {
    console.error("Error fetching stocks:", error);
  } finally {
    if (seq === requestSeq) isLoading.value = false;
  }
};

let searchTimer = null;
const onSearchInput = () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    filters.value.page = 1;
    fetchProducts();
  }, 400);
};

const applyFilter = () => {
  filters.value.page = 1;
  fetchProducts();
};

const changePage = (page) => {
  if (page < 1 || page > products.value.last_page) return;
  filters.value.page = page;
  fetchProducts();
};

const qtyOf = (p) => parseFloat(p.stock_quantity || 0);

const stockLevel = (p) => {
  const q = qtyOf(p);
  if (q <= 0) return "out";
  if (q <= 5) return "low";
  if (q <= 10) return "warn";
  return "ok";
};

const stockText = { out: "Нет", low: "Мало", warn: "Заканчивается", ok: "Есть" };

const formatPrice = (price) =>
  parseFloat(price || 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " сом";

onMounted(async () => {
  await productsStore.fetchCategories();
  await fetchProducts();
});
</script>

<template>
  <div class="adm-page stock-page p-3 p-md-4 animate-fade-in">
    <div class="adm-head header-card glass-header text-white rounded-4 shadow-sm p-3">
      <div class="adm-head-title">
        <h1 class="h4 mb-0"><i class="bi bi-layers me-2"></i>Мониторинг остатков</h1>
        <p class="mb-0 opacity-75 small">Найдено позиций: {{ products.total }}</p>
      </div>
      <div class="adm-head-actions">
        <NuxtLink to="/admin/inventory" class="btn btn-light rounded-pill fw-bold">
          <i class="bi bi-clipboard-check me-1"></i>Инвентаризация
        </NuxtLink>
      </div>
    </div>

    <div class="card border-0 shadow-sm rounded-4 mb-3 p-3">
      <div class="adm-filters">
        <div class="adm-filter-full adm-filter-wide">
          <label class="form-label">Поиск</label>
          <div class="input-group search-pill-inner">
            <span class="input-group-text border-0 ps-3"><i class="bi bi-search"></i></span>
            <input
              v-model="filters.search"
              type="text"
              class="form-control border-0"
              placeholder="Название или артикул…"
              @input="onSearchInput"
            />
          </div>
        </div>
        <div>
          <label class="form-label">Категория</label>
          <select v-model="filters.category_id" class="form-select rounded-3" @change="applyFilter">
            <option value="">Все категории</option>
            <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
          </select>
        </div>
        <div>
          <label class="form-label">Остаток</label>
          <select v-model="filters.stock_status" class="form-select rounded-3" @change="applyFilter">
            <option value="all">Все товары</option>
            <option value="in">🟢 В наличии (&gt; 5)</option>
            <option value="low">🟠 Мало (1–5)</option>
            <option value="out">🔴 Нет (0 и меньше)</option>
          </select>
        </div>
      </div>
    </div>

    <div class="card border-0 shadow-sm rounded-4 overflow-hidden">
      <div class="card-header bg-white border-0 py-2 px-3 d-flex align-items-center gap-2">
        <h6 class="mb-0 fw-bold">Остатки</h6>
        <span v-if="isLoading" class="spinner-border spinner-border-sm text-primary"></span>
        <div class="ms-auto d-flex align-items-center gap-2 small text-muted">
          <span class="legend out"></span>Нет
          <span class="legend low ms-2"></span>Мало
          <span class="legend warn ms-2"></span>≤ 10
        </div>
      </div>

      <div
        ref="tableContainer"
        class="adm-table-wrap stock-scroll"
        :class="{ 'is-refetching': isLoading && products.data.length > 0 }"
      >
        <div v-if="isLoading && products.data.length === 0" class="adm-empty">
          <div class="spinner-border text-primary"></div>
        </div>
        <div v-else-if="products.data.length === 0" class="adm-empty">
          <i class="bi bi-box-seam fs-1 d-block mb-2 opacity-50"></i>
          Ничего не найдено
        </div>
        <template v-else>
          <!-- Телефон: карточки -->
          <div class="adm-mlist d-md-none">
            <div v-for="p in products.data" :key="p.id" class="adm-mcard" :class="'lvl-' + stockLevel(p)">
              <div class="adm-mline">
                <span class="adm-mtitle">{{ p.name }}</span>
                <span class="adm-mval" :class="qtyOf(p) <= 5 ? 'text-danger' : 'text-dark'">
                  {{ formatQty(p.stock_quantity) }} <small class="fw-normal text-muted">{{ p.unit || "шт" }}</small>
                </span>
              </div>
              <div class="adm-mline">
                <span class="adm-msub">
                  <span class="font-monospace">{{ p.sku || "—" }}</span> · {{ p.category?.name || "—" }} ·
                  {{ formatPrice(p.price) }}
                </span>
                <div class="adm-mactions">
                  <NuxtLink :to="`/admin/inventory?product_id=${p.id}`" class="adm-ico primary" title="Списать / принять">
                    <i class="bi bi-plus-slash-minus"></i>
                  </NuxtLink>
                  <NuxtLink :to="`/admin/products/update-${p.id}`" class="adm-ico" title="Изменить товар">
                    <i class="bi bi-pencil"></i>
                  </NuxtLink>
                </div>
              </div>
            </div>
          </div>

          <!-- Планшет и десктоп: таблица в стиле «Товаров» -->
          <table class="adm-table stock-table d-none d-md-table">
            <colgroup>
              <col style="width: 52px" />
              <col style="width: 130px" />
              <col />
              <col style="width: 160px" />
              <col style="width: 110px" />
              <col style="width: 120px" />
              <col style="width: 120px" />
              <col style="width: 84px" />
            </colgroup>
            <thead>
              <tr>
                <th class="adm-num">#</th>
                <th>Артикул</th>
                <th>Товар</th>
                <th>Категория</th>
                <th class="text-end">Цена</th>
                <th class="text-end sortable" @click="toggleSort('stock_quantity')">
                  Остаток
                  <i
                    class="bi ms-1"
                    :class="
                      sortField === 'stock_quantity'
                        ? sortOrder === 'asc'
                          ? 'bi-sort-up text-primary'
                          : 'bi-sort-down text-primary'
                        : 'bi-arrow-down-up opacity-50'
                    "
                  ></i>
                </th>
                <th>Статус</th>
                <th class="text-end"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in products.data" :key="p.id" :class="'lvl-' + stockLevel(p)">
                <td class="adm-num">{{ p._idx }}</td>
                <td class="adm-nowrap font-monospace fw-bold text-muted small text-truncate" :title="p.sku">{{ p.sku }}</td>
                <td class="text-truncate fw-bold" :title="p.name">{{ p.name }}</td>
                <td class="text-truncate">
                  <span class="cat-pill">{{ p.category?.name || "—" }}</span>
                </td>
                <td class="text-end adm-nowrap font-monospace small">{{ formatPrice(p.price) }}</td>
                <td class="text-end adm-nowrap fw-bold" :class="qtyOf(p) <= 5 ? 'text-danger' : 'text-dark'">
                  {{ formatQty(p.stock_quantity) }}
                  <span class="fw-normal text-muted small">{{ p.unit || "шт" }}</span>
                </td>
                <td class="adm-nowrap">
                  <span class="stock-chip" :class="stockLevel(p)">{{ stockText[stockLevel(p)] }}</span>
                </td>
                <td class="text-end adm-nowrap">
                  <div class="d-inline-flex gap-1">
                    <NuxtLink :to="`/admin/inventory?product_id=${p.id}`" class="adm-ico primary" title="Списать / принять">
                      <i class="bi bi-plus-slash-minus"></i>
                    </NuxtLink>
                    <NuxtLink :to="`/admin/products/update-${p.id}`" class="adm-ico" title="Изменить товар">
                      <i class="bi bi-pencil"></i>
                    </NuxtLink>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </template>
      </div>

      <div
        v-if="products.last_page > 1"
        class="card-footer bg-white border-top p-2 d-flex justify-content-center align-items-center gap-2"
      >
        <button class="btn btn-sm btn-light rounded-pill px-3" :disabled="filters.page <= 1 || isLoading" @click="changePage(filters.page - 1)">
          <i class="bi bi-chevron-left"></i><span class="d-none d-sm-inline ms-1">Назад</span>
        </button>
        <span class="small fw-bold text-muted px-2">{{ filters.page }} из {{ products.last_page }}</span>
        <button class="btn btn-sm btn-light rounded-pill px-3" :disabled="filters.page >= products.last_page || isLoading" @click="changePage(filters.page + 1)">
          <span class="d-none d-sm-inline me-1">Вперёд</span><i class="bi bi-chevron-right"></i>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stock-scroll {
  max-height: calc(100vh - 330px);
  min-height: 240px;
  background: #f8fafc;
}
.stock-scroll.is-refetching .adm-mlist,
.stock-scroll.is-refetching tbody {
  opacity: 0.5;
  pointer-events: none;
  transition: opacity 0.15s;
}
/* Жёсткая раскладка колонок, как на «Товарах»: строки в одну линию */
.stock-table {
  table-layout: fixed;
}
.stock-table td {
  overflow: hidden;
  height: 34px;
}
.stock-table .sortable {
  cursor: pointer;
  user-select: none;
}
.stock-table .sortable:hover {
  color: #0369a1;
}
.cat-pill {
  display: inline-block;
  max-width: 100%;
  padding: 0.05rem 0.55rem;
  border-radius: 50px;
  background: #f1f5f9;
  color: #475569;
  font-size: 0.72rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
}
.stock-chip {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: 6px;
  font-size: 0.65rem;
  font-weight: 800;
  text-transform: uppercase;
}
.stock-chip.out { background: #dc2626; color: #fff; }
.stock-chip.low { background: #fee2e2; color: #dc2626; }
.stock-chip.warn { background: #fef3c7; color: #b45309; }
.stock-chip.ok { background: #dcfce7; color: #16a34a; }

/* Подсветка строки по уровню остатка — лёгкая полоса слева */
.stock-table tr.lvl-out > td:first-child { box-shadow: inset 3px 0 0 #dc2626; }
.stock-table tr.lvl-low > td:first-child { box-shadow: inset 3px 0 0 #f87171; }
.stock-table tr.lvl-warn > td:first-child { box-shadow: inset 3px 0 0 #fbbf24; }
.stock-table tr.lvl-out > td { background: #fef2f2; }
.adm-mcard.lvl-out { box-shadow: inset 3px 0 0 #dc2626; background: #fef2f2; }
.adm-mcard.lvl-low { box-shadow: inset 3px 0 0 #f87171; }
.adm-mcard.lvl-warn { box-shadow: inset 3px 0 0 #fbbf24; }

.legend {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 3px;
}
.legend.out { background: #dc2626; }
.legend.low { background: #f87171; }
.legend.warn { background: #fbbf24; }

.search-pill-inner {
  background: #f1f5f9;
  border-radius: 0.5rem;
  overflow: hidden;
}
.search-pill-inner .input-group-text,
.search-pill-inner .form-control {
  background: transparent;
}
.search-pill-inner .input-group-text {
  color: #64748b;
}
@media (max-width: 767.98px) {
  .stock-scroll {
    max-height: none;
  }
}
</style>
