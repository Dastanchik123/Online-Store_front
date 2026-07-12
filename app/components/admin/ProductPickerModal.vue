<script setup>
const props = defineProps({
  show: Boolean,
  items: { type: Array, default: () => [] },
});
const emit = defineEmits(["close", "select", "create-product"]);

const { getProducts } = useProducts();
const productsStore = useProductsStore();

const categories = computed(() => productsStore.categories);
const selectedCategoryId = ref("");
const searchQuery = ref("");
const products = ref([]);
const isLoading = ref(false);

const quantityInCart = (productId) => {
  const item = props.items.find((i) => i.product_id === productId);
  return item ? item.quantity : 0;
};

const fetchProducts = async () => {
  isLoading.value = true;
  try {
    const query = searchQuery.value.trim();
    const res = await getProducts(
      {
        search: query || undefined,
        search_strict: query ? 1 : undefined,
        category_id: selectedCategoryId.value || undefined,
        per_page: 100,
        sort_by: "created_at",
        sort_order: "desc",
      },
      { noCache: true },
    );
    products.value = Array.isArray(res) ? res : res?.data || [];
  } catch (e) {
    console.error("Failed to load products", e);
  } finally {
    isLoading.value = false;
  }
};

let searchTimer = null;
watch(searchQuery, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(fetchProducts, 350);
});

const selectCategory = (id) => {
  selectedCategoryId.value = id;
  fetchProducts();
};

watch(
  () => props.show,
  async (visible) => {
    if (!visible) return;
    if (categories.value.length === 0) await productsStore.fetchCategories();
    await fetchProducts();
  },
);

const formatPrice = (price) => {
  if (price === null || price === undefined) return "0 сом";
  return parseFloat(price).toLocaleString("ru-RU") + " сом";
};

// Клик по товару сразу добавляет его в накладную и закрывает модалку —
// не нужно кликать несколько раз и отдельно жать «Готово»
const pickProduct = (product) => {
  emit("select", product);
  emit("close");
};
</script>

<template>
  <UiBaseModal :show="show" title="Выбор товара" size="xxl" @close="emit('close')">
    <div class="picker-wrap">
      <div class="picker-columns">
        <div class="picker-categories">
          <button
            class="cat-btn"
            :class="{ active: !selectedCategoryId }"
            @click="selectCategory('')"
          >
            Все категории
          </button>
          <button
            v-for="cat in categories"
            :key="cat.id"
            class="cat-btn"
            :class="{ active: selectedCategoryId === cat.id }"
            @click="selectCategory(cat.id)"
          >
            {{ cat.name }}
          </button>
          <button class="cat-btn create-btn" @click="emit('create-product')">
            <i class="bi bi-plus-lg me-1"></i>Новый товар
          </button>
        </div>

        <div class="picker-products">
          <div v-if="isLoading" class="text-center py-5">
            <div class="spinner-border text-primary" role="status"></div>
          </div>
          <table v-else class="table table-hover align-middle mb-0 picker-table">
            <thead class="bg-light sticky-top">
              <tr>
                <th class="ps-3">Артикул</th>
                <th>Товар</th>
                <th class="text-end">Цена зак.</th>
                <th class="text-end">Цена продажи</th>
                <th class="text-center">Остаток</th>
                <th class="text-center" width="90"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="p in products"
                :key="p.id"
                class="picker-row"
                @click="pickProduct(p)"
              >
                <td class="ps-3 text-muted font-monospace small">{{ p.sku || "—" }}</td>
                <td>
                  <div class="fw-bold text-dark small">{{ p.name }}</div>
                </td>
                <td class="text-end small">{{ formatPrice(p.purchase_price) }}</td>
                <td class="text-end small">{{ formatPrice(p.price) }}</td>
                <td class="text-center">
                  <span
                    class="badge"
                    :class="p.stock_quantity < 5 ? 'bg-danger-subtle text-danger' : 'bg-success-subtle text-success'"
                  >
                    {{ p.stock_quantity }}
                  </span>
                </td>
                <td class="text-center">
                  <span
                    v-if="quantityInCart(p.id)"
                    class="badge bg-primary-subtle text-primary"
                    style="font-size: 0.65rem"
                  >
                    В приёме: {{ quantityInCart(p.id) }}
                  </span>
                </td>
              </tr>
              <tr v-if="!products.length">
                <td colspan="6" class="text-center py-5 text-muted small">
                  Товары не найдены
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="picker-search">
        <div class="input-group">
          <span class="input-group-text border-0 bg-light"
            ><i class="bi bi-search"></i
          ></span>
          <input
            v-model="searchQuery"
            type="text"
            class="form-control border-0 bg-light"
            placeholder="Поиск товара по названию или SKU..."
          />
        </div>
      </div>
    </div>

    <template #footer>
      <div class="d-flex justify-content-end w-100">
        <button
          class="btn btn-primary rounded-pill px-4 fw-bold"
          @click="emit('close')"
        >
          Готово
        </button>
      </div>
    </template>
  </UiBaseModal>
</template>

<style scoped>
.picker-wrap {
  display: flex;
  flex-direction: column;
  height: 65vh;
}

.picker-columns {
  display: flex;
  flex: 1;
  min-height: 0;
  gap: 1rem;
  overflow: hidden;
}

.picker-categories {
  width: 220px;
  flex-shrink: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 8px;
  border-right: 1px solid #e2e8f0;
}

.cat-btn {
  text-align: left;
  border: none;
  background: transparent;
  padding: 0.5rem 0.75rem;
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #475569;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cat-btn:hover {
  background: #f1f5f9;
}

.cat-btn.active {
  background: #0ea5e9;
  color: white;
}

.create-btn {
  margin-top: auto;
  color: #0ea5e9;
  border-top: 1px solid #e2e8f0;
  border-radius: 0;
  padding-top: 0.75rem;
}

.picker-products {
  flex: 1;
  overflow-y: auto;
  min-width: 0;
}

.picker-table thead th {
  font-size: 0.7rem;
  text-transform: uppercase;
  color: #64748b;
  top: 0;
  z-index: 2;
}

.picker-row {
  cursor: pointer;
}

.picker-row:hover {
  background: #f1f5f9;
}

.picker-search {
  border-top: 1px solid #e2e8f0;
  padding-top: 0.75rem;
  margin-top: 0.75rem;
}

.picker-search .form-control,
.picker-search .input-group-text {
  background: #f1f5f9;
}
</style>
