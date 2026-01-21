<script setup>
import { ref, onMounted, computed, watch } from "vue";
const { getAdjustments, createAdjustment, updateAdjustment, deleteAdjustment } =
  useAccounting();
const { getProducts } = useProducts();
const uiStore = useUiStore();

definePageMeta({
  layout: "admin",
  middleware: "purchaser",
});

const loading = ref(false);
const adjustments = ref([]);
const products = ref([]);
const searchProductQuery = ref("");
const selectedProduct = ref(null);
const newQuantity = ref(0);
const reason = ref("");
const editingAdjustmentId = ref(null);
const isSearching = ref(false);

const today = new Date().toLocaleDateString("en-CA");
const historyFilters = ref({
  product_id: "",
  user_id: "",
  reason: "",
  date_from: today,
  date_to: today,
  search: "",
  page: 1,
  per_page: 15,
});

const historyData = ref({
  data: [],
  current_page: 1,
  last_page: 1,
  total: 0,
});

let debounceTimer = null;
watch(
  () => historyFilters.value.search,
  () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      historyFilters.value.page = 1;
      loadData();
    }, 500);
  }
);

const loadData = async () => {
  loading.value = true;
  try {
    const params = {
      ...historyFilters.value,
      product_id: historyFilters.value.product_id || undefined,
      user_id: historyFilters.value.user_id || undefined,
      reason: historyFilters.value.reason || undefined,
      date_from: historyFilters.value.date_from || undefined,
      date_to: historyFilters.value.date_to || undefined,
      search: historyFilters.value.search || undefined,
    };

    const [adjResponse, prodResponse] = await Promise.all([
      getAdjustments(params),
      getProducts({ per_page: 500 }),
    ]);

    if (adjResponse.data && Array.isArray(adjResponse.data)) {
      historyData.value = adjResponse;
      adjustments.value = adjResponse.data;
    } else {
      adjustments.value = adjResponse;
      historyData.value = {
        data: adjResponse,
        current_page: 1,
        last_page: 1,
        total: adjResponse.length,
      };
    }

    products.value = prodResponse.data || prodResponse;
  } catch (error) {
    console.error("Error loading data:", error);
  } finally {
    loading.value = false;
  }
};

const changeHistoryPage = (page) => {
  if (page < 1 || page > historyData.value.last_page) return;
  historyFilters.value.page = page;
  loadData();
};

const filteredProducts = computed(() => {
  
  if (!isSearching.value && !searchProductQuery.value) return [];

  if (!searchProductQuery.value) return products.value.slice(0, 20);
  return products.value
    .filter(
      (p) =>
        p.name.toLowerCase().includes(searchProductQuery.value.toLowerCase()) ||
        p.sku?.toLowerCase().includes(searchProductQuery.value.toLowerCase())
    )
    .slice(0, 100);
});


watch(searchProductQuery, async (newQuery) => {
  if (newQuery && newQuery.length > 1) {
    try {
      const res = await getProducts({ search: newQuery, per_page: 50 });
      const newItems = res.data || res;
      
      newItems.forEach((item) => {
        if (!products.value.find((p) => p.id === item.id)) {
          products.value.push(item);
        }
      });
    } catch (e) {
      console.error("Search error:", e);
    }
  }
});

const selectProduct = (p) => {
  selectedProduct.value = p;
  newQuantity.value = Number(p.stock_quantity || 0);
  searchProductQuery.value = "";
  isSearching.value = false;
};


const closeSearch = () => {
  setTimeout(() => {
    isSearching.value = false;
  }, 200);
};

const handleSubmit = async () => {
  if (!selectedProduct.value || !reason.value) {
    uiStore.error("Выберите товар и укажите причину");
    return;
  }

  try {
    const payload = {
      product_id: selectedProduct.value.id,
      new_quantity: newQuantity.value,
      reason: reason.value,
    };

    if (editingAdjustmentId.value) {
      await updateAdjustment(editingAdjustmentId.value, payload);
      uiStore.success("Корректировка обновлена!");
    } else {
      await createAdjustment(payload);
      uiStore.success("Корректировка успешно сохранена!");
    }
    cancelEdit();
    loadData();
  } catch (error) {
    uiStore.error("Ошибка: " + (error.data?.message || "Неизвестная ошибка"));
  }
};

const handleEdit = (adj) => {
  editingAdjustmentId.value = adj.id;
  selectedProduct.value = adj.product;
  
  
  newQuantity.value = adj.new_quantity;
  reason.value = adj.reason ?? "";

  
  window.scrollTo({ top: 0, behavior: "smooth" });
};

const cancelEdit = () => {
  editingAdjustmentId.value = null;
  selectedProduct.value = null;
  newQuantity.value = 0;
  reason.value = "";
};

const handleDelete = async (id) => {
  const confirmed = await uiStore.showConfirm(
    "Удаление корректировки",
    "Вы уверены? Это удалит запись о движении, но не отменит изменение остатка автоматически."
  );
  if (!confirmed) return;

  try {
    await deleteAdjustment(id);
    uiStore.success("Запись удалена");
    loadData();
  } catch (error) {
    uiStore.error("Ошибка при удалении");
  }
};

const getReasonTextInRu = (reason, reason_text) => {
  const translations = {
    damage: "📦 Брак / Повреждение",
    theft: "🚫 Кража",
    gift: "🎁 Подарок / Акция",
    surplus: "✨ Излишки",
    other: "⚙️ Прочее",
  };

  
  if (translations[reason_text]) return translations[reason_text];
  if (translations[reason]) return translations[reason];

  
  return reason_text || reason || "—";
};

onMounted(async () => {
  const route = useRoute();
  if (route.query.product_id) {
    historyFilters.value.product_id = route.query.product_id;
  }

  await loadData();

  
  if (route.query.product_id) {
    const prod = products.value.find((p) => p.id == route.query.product_id);
    if (prod) {
      selectProduct(prod);
    }
  }
});
</script>

<template>
  <div class="inventory-page p-4">
    
    <div class="header-card mb-4 p-4 rounded-4 shadow-sm text-white">
      <div class="row align-items-center">
        <div class="col-auto">
          <div class="header-icon-box bg-white text-info shadow-sm">
            <i class="bi bi-box-seam fs-4"></i>
          </div>
        </div>
        <div class="col">
          <h1 class="h3 mb-1 fw-bold">Склад: Инвентаризация</h1>
          <p class="mb-0 text-white-50">
            Контроль и корректировка остатков продукции
          </p>
        </div>
      </div>
    </div>

    <div class="row g-4 animate-slide-up">
      
      <div class="col-lg-4">
        <div
          class="card border-0 shadow-sm rounded-4 h-100 adjustment-form-card"
        >
          <div
            class="p-4 bg-light border-bottom d-flex justify-content-between align-items-center"
          >
            <h5 class="fw-bold mb-0">
              {{
                editingAdjustmentId ? "Правка записи" : "Новая корректировка"
              }}
            </h5>
            <button
              v-if="editingAdjustmentId"
              class="btn btn-sm btn-link text-secondary"
              @click="cancelEdit"
            >
              Отмена
            </button>
          </div>

          <div class="p-4">
            <div class="mb-4 position-relative">
              <label class="form-label small text-muted fw-bold"
                >ВЫБОР ТОВАРА</label
              >
              <div class="input-group search-pill overflow-hidden">
                <span class="input-group-text border-0 ps-3"
                  ><i class="bi bi-search"></i
                ></span>
                <input
                  v-model="searchProductQuery"
                  type="text"
                  class="form-control border-0"
                  placeholder="Название или SKU..."
                  @focus="isSearching = true"
                  @blur="closeSearch"
                />
              </div>
              <div
                v-if="editingAdjustmentId"
                class="small text-muted mt-1 px-2"
              >
                <i class="bi bi-info-circle me-1"></i> Товар нельзя изменить
                после фиксации
              </div>

              <div
                v-if="isSearching && filteredProducts.length > 0"
                class="search-results-dropdown shadow-lg rounded-4 mt-2 border animate-fade-in"
              >
                <div
                  v-for="p in filteredProducts"
                  :key="p.id"
                  class="search-item p-3 border-bottom"
                  @click="selectProduct(p)"
                >
                  <div class="fw-bold text-dark small">{{ p.name }}</div>
                  <div
                    class="d-flex justify-content-between align-items-center mt-1"
                  >
                    <span class="text-muted" style="font-size: 0.7rem"
                      >SKU: {{ p.sku || "N/A" }}</span
                    >
                    <span class="badge bg-light text-primary rounded-pill"
                      >Остаток: {{ p.stock_quantity }}</span
                    >
                  </div>
                </div>
              </div>
            </div>

            <div
              v-if="selectedProduct"
              class="selected-product-box p-3 rounded-4 mb-4 border animate-scale-in"
            >
              <div class="d-flex align-items-center mb-3">
                <div class="product-blob me-3"></div>
                <div class="fw-bold text-dark small line-clamp-2">
                  {{ selectedProduct.name }}
                </div>
              </div>

              <div class="mb-4">
                <div class="d-flex justify-content-between mb-2">
                  <span class="text-muted small">Доступно сейчас:</span>
                  <span class="fw-bold text-primary"
                    >{{ selectedProduct.stock_quantity }} шт.</span
                  >
                </div>
                <label class="form-label small text-muted fw-bold"
                  >ФАКТИЧЕСКИЙ ОСТАТОК</label
                >
                <div
                  class="quantity-input-wrapper d-flex align-items-center bg-light rounded-pill p-1"
                  :class="{ 'opacity-50': !!editingAdjustmentId }"
                >
                  <button
                    type="button"
                    class="btn btn-qty"
                    @click="newQuantity > 0 ? newQuantity-- : null"
                    :disabled="!!editingAdjustmentId"
                  >
                    <i class="bi bi-dash"></i>
                  </button>
                  <input
                    v-model.number="newQuantity"
                    type="number"
                    class="form-control text-center border-0 bg-transparent font-monospace fw-bold"
                    min="0"
                    :disabled="!!editingAdjustmentId"
                  />
                  <button
                    type="button"
                    class="btn btn-qty"
                    @click="newQuantity++"
                    :disabled="!!editingAdjustmentId"
                  >
                    <i class="bi bi-plus"></i>
                  </button>
                </div>
                <div
                  v-if="editingAdjustmentId"
                  class="small text-center text-muted mt-2"
                >
                  Количество в истории не редактируется
                </div>
                <div class="mt-2 text-center">
                  <span
                    class="small py-1 px-3 rounded-pill"
                    :class="
                      newQuantity < selectedProduct.stock_quantity
                        ? 'bg-danger-subtle text-danger'
                        : 'bg-success-subtle text-success'
                    "
                  >
                    <i
                      class="bi"
                      :class="
                        newQuantity < selectedProduct.stock_quantity
                          ? 'bi-arrow-down-short'
                          : 'bi-arrow-up-short'
                      "
                    ></i>
                    Разница:
                    {{ Math.abs(newQuantity - selectedProduct.stock_quantity) }}
                    шт.
                  </span>
                </div>
              </div>

              <div class="mb-0">
                <label class="form-label small text-muted fw-bold"
                  >ПРИЧИНА ИЗМЕНЕНИЯ</label
                >
                <select
                  v-model="reason"
                  class="form-select border-0 bg-light rounded-3 px-3 py-2"
                >
                  <option value="">Выберите причину...</option>
                  <option value="damage">📦 Брак / Повреждение</option>
                  <option value="theft">🚫 Кража</option>
                  <option value="gift">🎁 Подарок / Акция</option>
                  <option value="surplus">✨ Излишки (Инвентаризация)</option>
                  <option value="other">⚙️ Прочее</option>
                </select>
              </div>
            </div>

            <button
              class="btn btn-save-adj w-100 py-3 rounded-pill mt-2"
              :class="{ 'btn-warning': editingAdjustmentId }"
              :disabled="!selectedProduct || !reason"
              @click="handleSubmit"
            >
              {{
                editingAdjustmentId
                  ? "Обновить запись"
                  : "Зафиксировать остаток"
              }}
            </button>
          </div>
        </div>
      </div>

      
      <div class="col-lg-8">
        <div class="card border-0 shadow-sm rounded-4 h-100 overflow-hidden">
          <div
            class="p-4 border-bottom bg-white d-flex justify-content-between align-items-center"
          >
            <h5 class="fw-bold mb-0">История складских движений</h5>
            <button class="btn btn-refresh-circle shadow-sm" @click="loadData">
              <i class="bi bi-arrow-clockwise"></i>
            </button>
          </div>
          <div class="row g-2 p-3 bg-light border-bottom align-items-end mx-0">
            <div class="col-md-3">
              <label class="small text-muted fw-bold mb-1">Причина</label>
              <select
                v-model="historyFilters.reason"
                class="form-select form-select-sm rounded-pill"
                @change="loadData"
              >
                <option value="">Все причины</option>
                <option value="damage">📦 Брак</option>
                <option value="theft">🚫 Кража</option>
                <option value="gift">🎁 Подарок</option>
                <option value="surplus">✨ Излишки</option>
                <option value="other">⚙️ Прочее</option>
              </select>
            </div>
            <div class="col-md-2">
              <label class="small text-muted fw-bold mb-1">С даты</label>
              <input
                v-model="historyFilters.date_from"
                type="date"
                class="form-control form-control-sm rounded-pill"
                @change="loadData"
              />
            </div>
            <div class="col-md-2">
              <label class="small text-muted fw-bold mb-1">По дату</label>
              <input
                v-model="historyFilters.date_to"
                type="date"
                class="form-control form-control-sm rounded-pill"
                @change="loadData"
              />
            </div>
            <div class="col-md-3">
              <label class="small text-muted fw-bold mb-1">Поиск</label>
              <input
                v-model="historyFilters.search"
                type="text"
                class="form-control form-control-sm rounded-pill"
                placeholder="Товар или SKU..."
              />
            </div>
            <div class="col-md-2 text-end">
              <button
                class="btn btn-sm btn-outline-secondary rounded-pill w-100"
                @click="
                  Object.assign(historyFilters, {
                    reason: '',
                    date_from: '',
                    date_to: '',
                    search: '',
                    page: 1,
                  });
                  loadData();
                "
              >
                Сброс
              </button>
            </div>
          </div>
          <div class="table-responsive-cards">
            <table class="table table-hover align-middle mb-0">
              <thead class="d-none d-lg-table-header-group">
                <tr>
                  <th class="ps-4">Штамп времени</th>
                  <th>Товар / Артикул</th>
                  <th class="text-center">Тип</th>
                  <th class="text-center">Кол-во</th>
                  <th class="text-center">Причина</th>
                  <th class="pe-4 text-end">Действия</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="adj in adjustments" :key="adj.id" class="adj-row">
                  <td class="ps-4" data-label="Время">
                    <div class="fw-bold text-dark small">
                      #{{ adj.id }} —
                      {{ new Date(adj.created_at).toLocaleDateString() }}
                    </div>
                    <div class="text-muted small" style="font-size: 0.65rem">
                      {{
                        new Date(adj.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      }}
                    </div>
                  </td>
                  <td data-label="Товар">
                    <div class="fw-bold text-dark small mb-0">
                      {{ adj.product?.name || "Удаленный товар" }}
                    </div>
                    <div class="text-muted" style="font-size: 0.7rem">
                      SKU: {{ adj.product?.sku || "N/A" }}
                    </div>
                  </td>
                  <td data-label="Тип" class="text-center">
                    <span
                      v-if="
                        (adj.difference ??
                          adj.quantity_change ??
                          adj.change_amount ??
                          0) > 0
                      "
                      class="badge-type positive"
                      >Оприходование</span
                    >
                    <span
                      v-else-if="
                        (adj.difference ??
                          adj.quantity_change ??
                          adj.change_amount ??
                          0) < 0
                      "
                      class="badge-type negative"
                      >Списание</span
                    >
                    <span v-else class="badge-type text-muted border"
                      >Коррекция (0)</span
                    >
                  </td>
                  <td
                    data-label="Кол-во"
                    class="text-center fw-bold font-monospace"
                    :class="
                      (adj.difference ??
                        adj.quantity_change ??
                        adj.change_amount ??
                        0) >= 0
                        ? 'text-success'
                        : 'text-danger'
                    "
                  >
                    {{
                      (adj.difference ??
                        adj.quantity_change ??
                        adj.change_amount ??
                        0) > 0
                        ? "+"
                        : ""
                    }}{{
                      adj.difference ??
                      adj.quantity_change ??
                      adj.change_amount ??
                      adj.quantity ??
                      0
                    }}
                  </td>
                  <td data-label="Причина" class="text-center">
                    <span class="text-muted small italic-reason">{{
                      getReasonTextInRu(adj.reason_text, adj.reason)
                    }}</span>
                  </td>
                  <td class="pe-4 text-end mobile-actions">
                    <div class="d-flex justify-content-end gap-1">
                      <button
                        class="btn btn-sm btn-light rounded-circle border shadow-sm p-1"
                        @click="handleEdit(adj)"
                        title="Править"
                      >
                        <i class="bi bi-pencil fs-6 text-primary"></i>
                      </button>
                      <button
                        class="btn btn-sm btn-light rounded-circle border shadow-sm p-1"
                        @click="handleDelete(adj.id)"
                        title="Удалить"
                      >
                        <i class="bi bi-trash fs-6 text-danger"></i>
                      </button>
                    </div>
                  </td>
                </tr>
                <tr v-if="adjustments.length === 0">
                  <td colspan="6" class="text-center py-5">
                    <i class="bi bi-journal-x fs-1 opacity-25 d-block mb-3"></i>
                    <div class="text-muted">Движений пока не зафиксировано</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <div
            v-if="historyData.last_page > 1"
            class="p-3 border-top bg-light d-flex justify-content-center"
          >
            <nav>
              <ul class="pagination-premium mb-0">
                <li :class="{ disabled: historyData.current_page <= 1 }">
                  <button
                    @click="changeHistoryPage(historyData.current_page - 1)"
                  >
                    <i class="bi bi-chevron-left"></i>
                  </button>
                </li>
                <li
                  v-for="page in historyData.last_page"
                  :key="page"
                  :class="{ active: page === historyData.current_page }"
                >
                  <button @click="changeHistoryPage(page)">{{ page }}</button>
                </li>
                <li
                  :class="{
                    disabled: historyData.current_page >= historyData.last_page,
                  }"
                >
                  <button
                    @click="changeHistoryPage(historyData.current_page + 1)"
                  >
                    <i class="bi bi-chevron-right"></i>
                  </button>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.header-card {
  background: linear-gradient(135deg, #0891b2 0%, #155e75 100%);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.header-icon-box {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.search-pill {
  background: #f1f5f9;
  border-radius: 50px;
}

.search-results-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: white;
  z-index: 2000;
  max-height: 380px;
  overflow-y: auto;
  box-shadow: 0 15px 40px rgba(0, 0, 0, 0.2);
  border: 1px solid #e2e8f0;
  scrollbar-width: thin;
}

.search-item {
  cursor: pointer;
  transition: all 0.2s;
  border-left: 3px solid transparent;
}

.search-item:hover {
  background: #f8fafc;
  border-left-color: #0891b2;
}

.selected-product-box {
  background: #fff;
}

.product-blob {
  width: 8px;
  height: 24px;
  background: #0891b2;
  border-radius: 10px;
}

.quantity-input-wrapper {
  border: 1px solid #e2e8f0;
}

.btn-qty {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: white;
  color: #334155;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  position: relative;
}

.btn-qty:hover {
  background: #0891b2;
  color: white;
}

.btn-save-adj {
  background: #0891b2;
  color: white;
  border: none;
  font-weight: 700;
  transition: all 0.3s;
}

.btn-save-adj:hover:not(:disabled) {
  background: #0e7490;
  transform: translateY(-2px);
  box-shadow: 0 10px 15px -3px rgba(8, 145, 178, 0.3);
}

.btn-save-adj:disabled {
  background: #cbd5e1;
}

thead th {
  background: #f8fafc;
  color: #64748b;
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 1rem;
}

.adj-row:hover {
  background-color: #f1f5f9;
}

.badge-type {
  padding: 0.4rem 1rem;
  border-radius: 50px;
  font-size: 0.75rem;
  font-weight: 700;
}

.badge-type.positive {
  background: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}
.badge-type.negative {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.italic-reason {
  font-style: italic;
  opacity: 0.7;
}

.btn-refresh-circle {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid #f1f5f9;
  background: white;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
}

.btn-refresh-circle:hover {
  background: #f1f5f9;
  transform: rotate(180deg);
}

.animate-slide-up {
  animation: slideUp 0.4s ease-out;
}
.animate-fade-in {
  animation: fadeIn 0.3s ease-out;
}
.animate-scale-in {
  animation: scaleIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}


.pagination-premium {
  display: flex;
  list-style: none;
  gap: 6px;
  padding: 0;
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
  background: #0891b2;
  color: white;
  border-color: #0891b2;
  box-shadow: 0 4px 12px rgba(8, 145, 178, 0.25);
}
.pagination-premium li.disabled button {
  opacity: 0.5;
  cursor: not-allowed;
}

@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes scaleIn {
  from {
    transform: scale(0.95);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
