<script setup>
definePageMeta({
  layout: "admin",
  middleware: "admin",
});

const { getProducts, updateProduct } = useProducts();
const ui = useUiStore();
const { settings, fetchPublicSettings } = useSettings();

const hotProducts = ref([]);
const isLoading = ref(false);
const searchQuery = ref("");
const searchResults = ref([]);
const isSearching = ref(false);
const selectedGroup = ref("Общее");

const renameModal = ref({
  show: false,
  oldName: "",
  newName: "",
  isSaving: false,
});

const fetchHotProducts = async () => {
  isLoading.value = true;
  try {
    const res = await getProducts({
      is_hot: true,
      per_page: 100,
      sort: "hot_order",
      direction: "asc",
    });
    hotProducts.value = res.data || [];
  } catch (e) {
    ui.error("Ошибка при загрузке горячих товаров");
  } finally {
    isLoading.value = false;
  }
};

const searchForHot = async () => {
  if (searchQuery.value.length < 2) {
    searchResults.value = [];
    return;
  }
  isSearching.value = true;
  try {
    const res = await getProducts({ search: searchQuery.value, per_page: 10 });

    const hotIds = hotProducts.value.map((p) => p.id);
    searchResults.value = (res.data || []).filter(
      (p) => !hotIds.includes(p.id),
    );
  } catch (e) {
    console.error(e);
  } finally {
    isSearching.value = false;
  }
};

const addToHot = async (product) => {
  try {
    const newOrder =
      hotProducts.value.length > 0
        ? Math.max(...hotProducts.value.map((p) => p.hot_order || 0)) + 1
        : 1;

    const formData = new FormData();
    formData.append("is_hot", "1");
    formData.append("hot_order", newOrder.toString());
    formData.append("hot_group", selectedGroup.value);

    await updateProduct(product.id, formData);
    ui.success(`${product.name} добавлен в горячие`);
    searchQuery.value = "";
    searchResults.value = [];
    await fetchHotProducts();
  } catch (e) {
    ui.error("Не удалось добавить товар");
  }
};

const updateGroup = async (product, groupName) => {
  try {
    const formData = new FormData();
    formData.append("hot_group", groupName);
    await updateProduct(product.id, formData);
    ui.success("Группа обновлена");
    await fetchHotProducts();
  } catch (e) {
    ui.error("Ошибка обновления группы");
  }
};

const removeFromHot = async (product) => {
  if (!confirm(`Удалить ${product.name} из горячих?`)) return;
  try {
    const formData = new FormData();
    formData.append("is_hot", "0");
    formData.append("hot_order", "0");
    formData.append("hot_group", "");

    await updateProduct(product.id, formData);
    ui.success("Товар удален из списка");
    await fetchHotProducts();
  } catch (e) {
    ui.error("Ошибка при удалении");
  }
};

const moveItem = async (index, direction) => {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= hotProducts.value.length) return;

  const itemA = hotProducts.value[index];
  const itemB = hotProducts.value[newIndex];

  const tempOrder = itemA.hot_order;

  try {
    const fdA = new FormData();
    fdA.append("hot_order", itemB.hot_order.toString());

    const fdB = new FormData();
    fdB.append("hot_order", tempOrder.toString());

    await Promise.all([
      updateProduct(itemA.id, fdA),
      updateProduct(itemB.id, fdB),
    ]);

    await fetchHotProducts();
  } catch (e) {
    ui.error("Ошибка при изменении порядка");
  }
};

const groups = computed(() => {
  const allGroups = hotProducts.value.map((p) => p.hot_group || "Общее");
  return [...new Set(allGroups)].filter((g) => g !== "");
});

const renameGroup = async (oldName, newName) => {
  isLoading.value = true;
  try {
    const productsToUpdate = hotProducts.value.filter(
      (p) => (p.hot_group || "Общее") === oldName,
    );

    await Promise.all(
      productsToUpdate.map((p) => {
        const formData = new FormData();
        formData.append("hot_group", newName);
        return updateProduct(p.id, formData);
      }),
    );

    ui.success(`Группа "${oldName}" переименована в "${newName}"`);
    await fetchHotProducts();
  } catch (e) {
    ui.error("Ошибка при переименовании группы");
  } finally {
    isLoading.value = false;
  }
};

const triggerRenameGroup = (group) => {
  renameModal.value = {
    show: true,
    oldName: group,
    newName: group,
    isSaving: false,
  };
};

const handleRenameGroup = async () => {
  if (
    !renameModal.value.newName ||
    renameModal.value.newName === renameModal.value.oldName
  ) {
    renameModal.value.show = false;
    return;
  }

  renameModal.value.isSaving = true;
  try {
    await renameGroup(renameModal.value.oldName, renameModal.value.newName);
    renameModal.value.show = false;
  } catch (e) {
    // Error handled in renameGroup
  } finally {
    renameModal.value.isSaving = false;
  }
};

onMounted(() => {
  fetchHotProducts();
  fetchPublicSettings();
});
</script>

<template>
  <div class="container-fluid p-4">
    <div class="d-flex justify-content-between align-items-center mb-4">
      <div>
        <h1 class="h3 fw-bold text-gray-800">
          Управление
          {{ settings.pos_hot_products_title || "Горячими Товарами" }}
        </h1>
        <p class="text-muted small mb-0">
          Сгруппированные товары для POS дашборда
        </p>
      </div>
    </div>

    <div class="row g-4">
      <div class="col-lg-4">
        <div class="card border-0 shadow-sm rounded-4">
          <div class="card-body p-4">
            <h5 class="fw-bold mb-4">Добавить товар</h5>

            <div class="mb-3">
              <label class="form-label small text-muted fw-bold">ГРУППА</label>
              <div class="input-group">
                <input
                  v-model="selectedGroup"
                  type="text"
                  class="form-control border-0 bg-light"
                  list="groupSuggestions"
                  placeholder="Напр: Напитки"
                />
                <datalist id="groupSuggestions">
                  <option v-for="g in groups" :key="g" :value="g"></option>
                </datalist>
              </div>
            </div>

            <div class="search-box position-relative mb-4">
              <label class="form-label small text-muted fw-bold"
                >ПОИСК ТОВАРА</label
              >
              <div class="input-group">
                <span class="input-group-text border-0 bg-light"
                  ><i class="bi bi-search"></i
                ></span>
                <input
                  v-model="searchQuery"
                  @input="searchForHot"
                  type="text"
                  class="form-control border-0 bg-light py-2"
                  placeholder="Название или артикул..."
                />
              </div>

              <div
                v-if="searchResults.length > 0"
                class="search-results-dropdown shadow-lg rounded-4 mt-2 bg-white position-absolute w-100 z-3 border"
              >
                <div
                  v-for="p in searchResults"
                  :key="p.id"
                  @click="addToHot(p)"
                  class="p-3 border-bottom d-flex justify-content-between align-items-center cursor-pointer hover-bg"
                >
                  <div class="d-flex align-items-center">
                    <img
                      v-if="p.image_url"
                      :src="p.image_url"
                      class="rounded-circle me-3"
                      style="width: 32px; height: 32px; object-fit: cover"
                    />
                    <div>
                      <div class="fw-bold small">{{ p.name }}</div>
                      <small class="text-muted">SKU: {{ p.sku }}</small>
                    </div>
                  </div>
                  <i class="bi bi-plus-circle text-primary fs-5"></i>
                </div>
              </div>
            </div>

            <div class="alert alert-info border-0 rounded-4 small mb-0">
              <i class="bi bi-info-circle me-2"></i>
              Используйте поиск, чтобы найти товар и добавить его в список
              горячих для кассира.
            </div>
          </div>
        </div>

        <div
          class="card border-0 shadow-sm rounded-4 mt-4"
          v-if="groups.length > 0"
        >
          <div class="card-body p-4">
            <h5 class="fw-bold mb-3">Управление группами</h5>
            <div class="d-flex flex-wrap gap-2">
              <div
                v-for="g in groups"
                :key="g"
                class="group-rename-tag d-flex align-items-center bg-light rounded-pill px-3 py-2 border"
              >
                <span class="small fw-bold me-2">{{ g }}</span>
                <button
                  @click="triggerRenameGroup(g)"
                  class="btn btn-sm btn-link p-0 text-primary"
                  title="Переименовать группу"
                >
                  <i class="bi bi-pencil-square"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="col-lg-8">
        <div class="card border-0 shadow-sm rounded-4 min-vh-60">
          <div class="card-body p-4">
            <h5 class="fw-bold mb-4">Текущий список (Дашборд)</h5>

            <div v-if="isLoading" class="text-center py-5">
              <div class="spinner-border text-primary" role="status"></div>
            </div>

            <div
              v-else-if="hotProducts.length === 0"
              class="text-center py-5 opacity-50"
            >
              <i class="bi bi-fire fs-1 d-block mb-3"></i>
              <p>Список горячих товаров пуст</p>
            </div>

            <div v-else class="hot-list">
              <div
                v-for="(p, index) in hotProducts"
                :key="p.id"
                class="hot-item d-flex align-items-center p-3 mb-2 rounded-4 border bg-white"
              >
                <div class="order-badge me-3 fw-bold text-primary">
                  {{ index + 1 }}
                </div>

                <div class="hot-item-img me-3">
                  <img
                    v-if="p.image_url"
                    :src="p.image_url"
                    class="rounded-3"
                    style="width: 48px; height: 48px; object-fit: cover"
                  />
                  <div
                    v-else
                    class="rounded-3 bg-light d-flex align-items-center justify-content-center fw-bold"
                    style="width: 48px; height: 48px"
                  >
                    {{ p.name[0] }}
                  </div>
                </div>

                <div class="flex-grow-1">
                  <div
                    class="fw-bold mb-0 text-truncate"
                    style="max-width: 250px"
                  >
                    {{ p.name }}
                  </div>
                  <div class="d-flex align-items-center gap-2 mt-1">
                    <span
                      class="badge bg-primary-subtle text-primary border-0 rounded-pill x-small px-2"
                    >
                      {{ p.hot_group || "Без группы" }}
                    </span>
                    <small class="text-muted">SKU: {{ p.sku }}</small>
                  </div>
                </div>

                <div class="actions d-flex align-items-center gap-2">
                  <div class="dropdown">
                    <button
                      class="btn btn-xs btn-outline-secondary rounded-pill me-2 px-2"
                      data-bs-toggle="dropdown"
                    >
                      Группа
                    </button>
                    <div class="dropdown-menu p-2 shadow-lg border-0 rounded-4">
                      <input
                        type="text"
                        class="form-control form-control-sm mb-2"
                        placeholder="Новая группа..."
                        @keyup.enter="
                          (e) => {
                            updateGroup(p, e.target.value);
                            e.target
                              .closest('.dropdown-menu')
                              .classList.remove('show');
                          }
                        "
                      />
                      <div class="dropdown-header x-small text-uppercase">
                        Выбрать существующую
                      </div>
                      <a
                        v-for="g in groups"
                        :key="g"
                        @click="updateGroup(p, g)"
                        class="dropdown-item rounded-3 x-small cursor-pointer"
                        >{{ g }}</a
                      >
                    </div>
                  </div>
                  <button
                    @click="moveItem(index, -1)"
                    :disabled="index === 0"
                    class="btn btn-sm btn-light rounded-circle"
                  >
                    <i class="bi bi-chevron-up"></i>
                  </button>
                  <button
                    @click="moveItem(index, 1)"
                    :disabled="index === hotProducts.length - 1"
                    class="btn btn-sm btn-light rounded-circle"
                  >
                    <i class="bi bi-chevron-down"></i>
                  </button>
                  <button
                    @click="removeFromHot(p)"
                    class="btn btn-sm btn-light-danger rounded-circle text-danger ms-2"
                  >
                    <i class="bi bi-trash"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Модальное окно переименования группы -->
    <UiBaseModal
      :show="renameModal.show"
      title="Переименовать группу"
      @close="renameModal.show = false"
      @submit="handleRenameGroup"
    >
      <div class="mb-3">
        <label class="form-label small fw-bold">Новое название группы</label>
        <input
          v-model="renameModal.newName"
          type="text"
          class="form-control rounded-3"
          placeholder="Напр: Напитки"
        />
        <div class="form-text x-small">
          Это название изменится у всех товаров в этой группе.
        </div>
      </div>

      <template #footer>
        <div class="d-flex justify-content-end gap-2 w-100">
          <button
            class="btn btn-light rounded-pill px-4"
            @click="renameModal.show = false"
          >
            Отмена
          </button>
          <button
            type="submit"
            class="btn btn-primary rounded-pill px-4"
            :disabled="renameModal.isSaving || !renameModal.newName"
          >
            <span
              v-if="renameModal.isSaving"
              class="spinner-border spinner-border-sm me-2"
            ></span>
            Сохранить
          </button>
        </div>
      </template>
    </UiBaseModal>
  </div>
</template>

<style scoped>
.min-vh-60 {
  min-height: 60vh;
}

.hot-item {
  transition: all 0.2s;
}

.hot-item:hover {
  border-color: #3b82f6 !important;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1);
}

.order-badge {
  width: 24px;
}

.btn-light-danger {
  background-color: #fee2e2;
  border: none;
}
.btn-light-danger:hover {
  background-color: #fecaca;
}

.search-results-dropdown {
  max-height: 400px;
  overflow-y: auto;
}

.hover-bg:hover {
  background-color: #f8fafc;
}
</style>
