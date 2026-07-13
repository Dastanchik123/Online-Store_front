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
const isExportingPdf = ref(false);
const exportPdf = async () => {
  isExportingPdf.value = true;
  try {
    await downloadProductsExport(filters);
  } catch (error) {
    uiStore.error(error.message || "Ошибка при экспорте PDF");
  } finally {
    isExportingPdf.value = false;
  }
};

// ── Регулируемые колонки (как в Excel) ─────────────────────────────
// Перетаскивание границы в шапке меняет ширину колонки (с вертикальной
// направляющей на всю таблицу), двойной клик по границе подгоняет ширину
// под содержимое. Ширины сохраняются в localStorage.
const tableCols = [
  { label: "#", w: 52, cls: "ps-2 py-1" },
  { label: "Артикул", w: 105, cls: "py-1" },
  { label: "Товар", w: 300, cls: "py-1" },
  { label: "Категория", w: 140, cls: "py-1" },
  { label: "Стоимость", w: 105, cls: "py-1" },
  { label: "Остаток", w: 90, cls: "py-1" },
  { label: "Статус", w: 90, cls: "py-1" },
  { label: "Действия", w: 140, cls: "text-end pe-2 py-1" },
];
// v2: в v1 могли сохраниться ширины с суммой шире экрана
const COL_WIDTHS_KEY = "adminProducts:colWidths:v2";
const MIN_COL_WIDTH = 36;

const colWidths = ref(tableCols.map((c) => c.w));
const tableWidth = computed(() =>
  colWidths.value.reduce((sum, w) => sum + w, 0),
);

const loadColWidths = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(COL_WIDTHS_KEY) || "null");
    if (
      Array.isArray(saved) &&
      saved.length === tableCols.length &&
      saved.every((w) => Number.isFinite(w) && w >= MIN_COL_WIDTH)
    ) {
      colWidths.value = saved;
      return true;
    }
  } catch {}
  return false;
};

const saveColWidths = () => {
  try {
    localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(colWidths.value));
  } catch {}
};

// Первый визит (сохранённых ширин нет): распределяем колонки по ширине
// контейнера пропорционально дефолтам — без горизонтальной прокрутки
const fitColWidthsToContainer = async () => {
  await nextTick();
  const el = scrollContainer.value;
  if (!el || el.clientWidth < 300) return;
  const ratio = el.clientWidth / tableWidth.value;
  colWidths.value = colWidths.value.map((w) =>
    Math.max(MIN_COL_WIDTH, Math.floor(w * ratio)),
  );
};

// Направляющая линия при перетаскивании (как в Excel)
const resizeGuide = ref({ visible: false, x: 0, top: 0, height: 0 });

let colResize = null;

const onColResizeMove = (e) => {
  if (!colResize) return;
  const width = Math.max(
    MIN_COL_WIDTH,
    Math.round(colResize.startWidth + e.clientX - colResize.startX),
  );
  colWidths.value[colResize.index] = width;
  resizeGuide.value.x = colResize.startLeft + width;
};

const endColResize = () => {
  if (!colResize) return;
  colResize = null;
  resizeGuide.value.visible = false;
  document.removeEventListener("pointermove", onColResizeMove);
  document.removeEventListener("pointerup", endColResize);
  document.body.style.cursor = "";
  saveColWidths();
};

// Фактические ширины могут отличаться от заданных, когда таблица
// растянута до 100% контейнера — перед изменением фиксируем реальные
const snapshotRenderedWidths = () => {
  const ths = scrollContainer.value?.querySelectorAll("thead th");
  if (ths?.length === colWidths.value.length) {
    colWidths.value = Array.from(ths).map((th) =>
      Math.round(th.getBoundingClientRect().width),
    );
  }
};

const startColResize = (index, e) => {
  snapshotRenderedWidths();
  const container = scrollContainer.value;
  const th = container?.querySelectorAll("thead th")[index];
  const containerRect = container?.getBoundingClientRect();
  colResize = {
    index,
    startX: e.clientX,
    startWidth: colWidths.value[index],
    startLeft: th ? th.getBoundingClientRect().left : e.clientX,
  };
  if (containerRect) {
    resizeGuide.value = {
      visible: true,
      x: colResize.startLeft + colResize.startWidth,
      top: containerRect.top,
      height: containerRect.height,
    };
  }
  document.addEventListener("pointermove", onColResizeMove);
  document.addEventListener("pointerup", endColResize);
  document.body.style.cursor = "col-resize";
};

// Двойной клик по границе — автоподбор ширины по содержимому (как в Excel)
const autofitColumn = (index) => {
  const el = scrollContainer.value;
  if (!el) return;
  snapshotRenderedWidths();
  let max = 0;
  el.querySelectorAll(
    `tbody tr.product-row td:nth-child(${index + 1})`,
  ).forEach((td) => {
    const inner = td.firstElementChild || td;
    max = Math.max(max, inner.scrollWidth);
  });
  const th = el.querySelectorAll("thead th")[index];
  if (th?.firstChild) max = Math.max(max, Math.ceil(th.scrollWidth * 0.6));
  if (max > 0) {
    colWidths.value[index] = Math.min(600, Math.max(MIN_COL_WIDTH, max + 26));
    saveColWidths();
  }
};

// ── Виртуальный скролл ─────────────────────────────────────────────
// Данные грузятся все разом, но в DOM живут только видимые строки
// (+буфер): рендер страницы не зависит от размера каталога.
const scrollContainer = ref(null);

// Высота таблицы подгоняется под остаток экрана от её верхней границы,
// чтобы сама страница не скроллилась (внизу остаётся строка «Всего
// товаров» + отступ страницы ≈ 76px)
const tableHeight = ref(null);
const updateTableHeight = () => {
  const el = scrollContainer.value;
  if (!el) return;
  const top = el.getBoundingClientRect().top + (window.scrollY || 0);
  tableHeight.value = Math.max(240, window.innerHeight - top - 76);
};

const tableHeightStyle = computed(() =>
  tableHeight.value
    ? `${tableHeight.value}px`
    : "calc(100vh - 260px)", // до первого замера
);

const rowHeight = ref(32); // фиксируется CSS, уточняется замером
const scrollTop = ref(0);
const viewportHeight = ref(600);
const VSCROLL_BUFFER = 40; // запас строк сверху и снизу за экраном
// Окно рендера сдвигается блоками по N строк: при плавном скролле Vue
// перерисовывает таблицу в разы реже, и она не «пустеет»
const VSCROLL_CHUNK = 20;

const vStart = computed(() => {
  const start = Math.max(
    0,
    Math.floor(scrollTop.value / rowHeight.value) - VSCROLL_BUFFER,
  );
  return Math.floor(start / VSCROLL_CHUNK) * VSCROLL_CHUNK;
});
const vEnd = computed(() => {
  const end =
    Math.floor(scrollTop.value / rowHeight.value) +
    Math.ceil(viewportHeight.value / rowHeight.value) +
    VSCROLL_BUFFER;
  return Math.min(
    products.value.data.length,
    Math.ceil(end / VSCROLL_CHUNK) * VSCROLL_CHUNK,
  );
});
const visibleProducts = computed(() =>
  products.value.data.slice(vStart.value, vEnd.value),
);
const padTop = computed(() => vStart.value * rowHeight.value);
const padBottom = computed(() =>
  Math.max(0, (products.value.data.length - vEnd.value) * rowHeight.value),
);

// Распорки раскрашены под «пустые строки»: если при очень быстром
// скролле рендер на миг отстанет, видна сетка, а не белая дыра
const spacerStripes = computed(
  () =>
    `repeating-linear-gradient(to bottom, #ffffff 0, #ffffff ${
      rowHeight.value - 1
    }px, #e2e8f0 ${rowHeight.value - 1}px, #e2e8f0 ${rowHeight.value}px)`,
);

let scrollRaf = null;
const onTableScroll = () => {
  if (scrollRaf) return;
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = null;
    const el = scrollContainer.value;
    if (!el) return;
    scrollTop.value = el.scrollTop;
    viewportHeight.value = el.clientHeight;
    // высота строки могла измениться (смена стилей/зум) — если расчёт
    // разойдётся с реальностью, при прокрутке появляются пустые зоны
    const row = el.querySelector("tbody tr.product-row");
    if (row && row.offsetHeight > 20) rowHeight.value = row.offsetHeight;
  });
};

// после смены данных: замерить реальную высоту строки и пересинхронизировать
// scrollTop (браузер сам клампит его, когда список стал короче)
const syncVirtualScroll = async () => {
  await nextTick();
  const el = scrollContainer.value;
  if (!el) return;
  updateTableHeight();
  await nextTick(); // высота контейнера применяется в следующем тике
  const row = el.querySelector("tbody tr.product-row");
  if (row && row.offsetHeight > 20) rowHeight.value = row.offsetHeight;
  viewportHeight.value = el.clientHeight;
  scrollTop.value = el.scrollTop;
};

watch(() => products.value.data, syncVirtualScroll);

const filters = ref({
  search: "",
  category_id: "",
  is_active: "",
  page: 1,
  per_page: -1,
  // облегчённый ответ: только колонки таблицы, без description/attributes —
  // ответ уменьшается с мегабайт до десятков килобайт
  fields: "list",
  // строгий поиск: подстрока в названии/артикуле без регистра,
  // без «похожих» товаров по триграммам
  search_strict: 1,
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

const applyProductsData = (data, perPage) => {
  if (data && data.data && Array.isArray(data.data)) {
    products.value = data;
  } else if (Array.isArray(data)) {
    products.value = {
      data: data,
      current_page: 1,
      last_page: 1,
      total: data.length,
      per_page: perPage || 15,
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

  // Сквозной номер приклеен к товару, а не вычисляется от позиции окна:
  // иначе v-memo строк не работал бы (номер менялся бы при каждом сдвиге)
  products.value.data.forEach((p, i) => {
    p._idx = i + 1;
  });
};

const fetchProducts = async () => {
  const params = { ...filters.value };

  if (params.is_active === "") delete params.is_active;
  if (params.category_id === "") delete params.category_id;
  if (!params.search) delete params.search;

  // Лоадер — только если показать пока нечего. Если в localStorage есть
  // кеш, таблица рисуется из него мгновенно, а свежие данные приходят
  // фоном через onRefresh и тихо подменяют список.
  isLoading.value = products.value.data.length === 0;

  try {
    const data = await getProducts(params, {
      onRefresh: (fresh) => applyProductsData(fresh, params.per_page),
    });
    applyProductsData(data, params.per_page);
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
  const hasSavedWidths = loadColWidths();
  window.addEventListener("resize", updateTableHeight);
  // категории и товары не зависят друг от друга — грузим параллельно
  await Promise.all([fetchCategories(), fetchProducts()]);
  if (!hasSavedWidths) await fitColWidthsToContainer();
});

onUnmounted(() => {
  window.removeEventListener("resize", updateTableHeight);
  endColResize();
});
</script>

<template>
  <div class="products-page p-4 animate-fade-in">
    <!-- Направляющая при изменении ширины колонки (как в Excel) -->
    <div
      v-if="resizeGuide.visible"
      class="col-resize-guide"
      :style="{
        left: resizeGuide.x + 'px',
        top: resizeGuide.top + 'px',
        height: resizeGuide.height + 'px',
      }"
    ></div>
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
            @click="exportPdf"
            :disabled="isExportingPdf"
            class="btn btn-light rounded-pill px-4 py-2 fw-bold shadow-sm"
          >
            <span v-if="isExportingPdf" class="spinner-border spinner-border-sm me-2"></span>
            <i v-else class="bi bi-file-earmark-pdf me-2 text-danger"></i>
            {{ isExportingPdf ? "Формируется…" : "Отчет (PDF)" }}
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
        ref="scrollContainer"
        class="table-responsive custom-scrollbar"
        :style="{ minHeight: tableHeightStyle, maxHeight: tableHeightStyle, overflowY: 'auto', background: '#f8fafc' }"
        @scroll.passive="onTableScroll"
      >
        <table
          class="table table-hover align-middle mb-0 custom-table"
          :style="{ width: tableWidth + 'px' }"
        >
          <!-- table-layout: fixed — ширины колонок заданы жёстко и не
               пересчитываются при подмене строк виртуальным скроллом -->
          <thead class="sticky-top bg-white z-2">
            <tr>
              <th
                v-for="(col, i) in tableCols"
                :key="col.label"
                scope="col"
                :class="col.cls"
                class="position-relative"
                :style="{ width: colWidths[i] + 'px', fontSize: '0.7rem' }"
              >
                {{ col.label }}
                <span
                  class="col-resize-handle"
                  title="Тяните, чтобы изменить ширину. Двойной клик — по содержимому"
                  @pointerdown.prevent="startColResize(i, $event)"
                  @dblclick.stop="autofitColumn(i)"
                ></span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="padTop > 0" aria-hidden="true">
              <td colspan="8" :style="{ height: padTop + 'px', padding: 0, border: 0, background: spacerStripes }"></td>
            </tr>
            <!-- v-memo: строка перерисовывается только если сменился сам
                 товар — сдвиг окна виртуального скролла не трогает уже
                 отрисованные строки, поэтому рендер успевает за прокруткой -->
            <tr
              v-for="product in visibleProducts"
              :key="product.id"
              v-memo="[product]"
              class="product-row"
              style="cursor: pointer;"
              @dblclick="navigateTo(`/admin/products/update-${product.uuid || product.id}`)"
            >
              <td class="ps-2 text-muted py-1" style="font-size: 0.75rem;">
                {{ product._idx }}
              </td>
              <td class="py-1">
                <div class="text-muted font-monospace fw-bold" style="font-size: 0.75rem;">
                  {{ product.sku }}
                </div>
              </td>
              <td class="py-1">
                <div class="d-flex align-items-center">
                  <div class="lh-1">
                    <div class="fw-bold text-dark small product-name-clamp" :title="product.name">{{ product.name }}</div>
                  </div>
                </div>
              </td>
              <td class="py-1">
                <span class="category-pill shadow-xs" style="font-size: 0.7rem; padding: 0.1rem 0.6rem;">{{
                  product.category?.name || "—"
                }}</span>
              </td>
              <td class="py-1">
                <div class="fw-bold text-dark font-monospace small text-truncate">
                  {{ formatPrice(product.price) }}
                  <span
                    v-if="product.sale_price"
                    class="text-danger fw-bold"
                    style="font-size: 0.65rem;"
                  >
                    % {{ formatPrice(product.sale_price) }}
                  </span>
                </div>
              </td>
              <td class="py-1">
                <div class="stock-badge py-0 px-2" :class="stockClass(product)" style="font-size: 0.7rem;">
                  <span class="count">{{ product.stock_quantity }}</span>
                  <span class="unit ms-1">шт.</span>
                </div>
              </td>
              <td class="py-1">
                <div class="d-flex gap-1 flex-wrap">
                  <span
                    class="badge-status"
                    :class="product.is_active ? 'active' : 'inactive'"
                    style="font-size: 0.6rem; padding: 0.1rem 0.5rem;"
                  >
                    {{ product.is_active ? "Активен" : "Скрыт" }}
                  </span>
                </div>
              </td>
              <td class="text-end pe-4 py-1">
                <div class="d-flex justify-content-end gap-1">
                  <NuxtLink
                    :to="`/admin/products/update-${product.id}`"
                    class="btn-action edit shadow-sm"
                    style="width: 22px; height: 22px; font-size: 0.7rem;"
                    title="Изменить"
                  >
                    <i class="bi bi-pencil"></i>
                  </NuxtLink>
                  <NuxtLink
                    :to="`/admin/inventory?product_id=${product.id}`"
                    class="btn-action inventory shadow-sm"
                    title="Инвентаризация"
                    style="background: #e0f2fe; color: #0369a1; width: 22px; height: 22px; font-size: 0.7rem;"
                  >
                    <i class="bi bi-box-seam"></i>
                  </NuxtLink>
                  <button
                    @click="downloadProductBarcode(product.id)"
                    class="btn-action barcode shadow-sm"
                    style="width: 22px; height: 22px; font-size: 0.7rem;"
                    title="Штрих-код"
                  >
                    <i class="bi bi-upc-scan"></i>
                  </button>
                  <button
                    @click="handleDelete(product.id)"
                    class="btn-action delete shadow-sm"
                    style="width: 22px; height: 22px; font-size: 0.7rem;"
                    title="Удалить"
                  >
                    <i class="bi bi-trash"></i>
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="padBottom > 0" aria-hidden="true">
              <td colspan="8" :style="{ height: padBottom + 'px', padding: 0, border: 0, background: spacerStripes }"></td>
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

/* ── Excel-режим таблицы ────────────────────────────────────────────
   Плотные строки фиксированной высоты (32px) + сетка границ ячеек:
   на экран помещается вдвое больше товаров. Фиксированная высота
   обязательна для виртуального скролла. */
.product-row {
  height: 32px;
}

/* Жёсткая раскладка: ширины колонок берутся из thead и не зависят от
   содержимого строк — колонки не «дёргаются» при виртуальном скролле.
   border-collapse: separate — иначе границы «уезжают» со sticky-шапки */
.custom-table {
  table-layout: fixed;
  min-width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}

.custom-table th,
.custom-table td {
  border-right: 1px solid #e2e8f0;
  border-bottom: 1px solid #e2e8f0;
  padding-top: 2px;
  padding-bottom: 2px;
  vertical-align: middle;
}

.custom-table thead th {
  border-bottom: 2px solid #cbd5e1;
  background: #f1f5f9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Колонка с номером строки — серым фоном, как в Excel.
   nowrap обязателен: перенос цифр по вертикали ломает высоту строк */
.custom-table td:first-child {
  background: #f8fafc;
  color: #94a3b8;
  white-space: nowrap;
}

/* Вертикальная направляющая на время перетаскивания границы */
.col-resize-guide {
  position: fixed;
  width: 2px;
  background: #0ea5e9;
  z-index: 1050;
  pointer-events: none;
}

/* Разделитель в шапке: тянется мышью, двойной клик — автоподбор ширины */
.col-resize-handle {
  position: absolute;
  top: 0;
  right: -5px;
  width: 10px;
  height: 100%;
  cursor: col-resize;
  user-select: none;
  touch-action: none;
  z-index: 3;
}

.col-resize-handle::after {
  content: "";
  position: absolute;
  top: 20%;
  bottom: 20%;
  left: 4px;
  width: 2px;
  border-radius: 2px;
  background: transparent;
  transition: background 0.15s;
}

.col-resize-handle:hover::after {
  background: #0ea5e9;
}

/* У последней колонки ручка не должна вылезать за таблицу —
   иначе появляется паразитная горизонтальная прокрутка */
.custom-table th:last-child .col-resize-handle {
  right: 0;
  width: 6px;
}

.custom-table th:last-child .col-resize-handle::after {
  left: auto;
  right: 0;
}

.custom-table td {
  overflow: hidden;
}

/* Пилюля категории не должна распирать свою колонку */
.custom-table .category-pill {
  display: inline-block;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
}

/* Название — в одну строку с многоточием (полное — в title) */
.product-name-clamp {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
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
