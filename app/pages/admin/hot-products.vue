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
const activeFilterGroup = ref(null);
const selectedToAdd = ref([]);

const NEW_GROUP_OPTION = "__new__";
const groupSelectValue = ref(NEW_GROUP_OPTION);
const newGroupName = ref("Общее");

const selectedGroup = computed(() =>
  groupSelectValue.value === NEW_GROUP_OPTION
    ? newGroupName.value.trim()
    : groupSelectValue.value,
);

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

const isSelectedToAdd = (product) =>
  selectedToAdd.value.some((p) => p.id === product.id);

const toggleSelectToAdd = (product) => {
  if (isSelectedToAdd(product)) {
    selectedToAdd.value = selectedToAdd.value.filter(
      (p) => p.id !== product.id,
    );
  } else {
    selectedToAdd.value.push(product);
  }
};

const addSelectedToHot = async () => {
  if (selectedToAdd.value.length === 0) return;
  try {
    let nextOrder =
      hotProducts.value.length > 0
        ? Math.max(...hotProducts.value.map((p) => p.hot_order || 0)) + 1
        : 1;

    await Promise.all(
      selectedToAdd.value.map((product) => {
        const formData = new FormData();
        formData.append("is_hot", "1");
        formData.append("hot_order", (nextOrder++).toString());
        formData.append("hot_group", selectedGroup.value);
        return updateProduct(product.id, formData);
      }),
    );

    ui.success(`Добавлено товаров: ${selectedToAdd.value.length}`);
    selectedToAdd.value = [];
    searchQuery.value = "";
    searchResults.value = [];
    await fetchHotProducts();
  } catch (e) {
    ui.error("Не удалось добавить товары");
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

const moveItem = async (list, index, direction) => {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= list.length) return;

  const itemA = list[index];
  const itemB = list[newIndex];

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

const filteredHotProducts = computed(() => {
  if (!activeFilterGroup.value) return hotProducts.value;
  return hotProducts.value.filter(
    (p) => (p.hot_group || "Общее") === activeFilterGroup.value,
  );
});

const toggleFilterGroup = (g) => {
  activeFilterGroup.value = activeFilterGroup.value === g ? null : g;
};

const groupInitialized = ref(false);

watch(
  groups,
  (list) => {
    if (list.length === 0) {
      if (!groupInitialized.value) groupSelectValue.value = NEW_GROUP_OPTION;
      return;
    }
    if (!groupInitialized.value) {
      groupSelectValue.value = list[0];
      groupInitialized.value = true;
      return;
    }
    if (
      groupSelectValue.value !== NEW_GROUP_OPTION &&
      !list.includes(groupSelectValue.value)
    ) {
      groupSelectValue.value = list[0];
    }
  },
  { immediate: true },
);

watch(activeFilterGroup, (g) => {
  if (g) groupSelectValue.value = g;
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
              <select
                v-model="groupSelectValue"
                class="form-select border-0 bg-light"
              >
                <option v-for="g in groups" :key="g" :value="g">{{ g }}</option>
                <option :value="NEW_GROUP_OPTION">+ Новая группа...</option>
              </select>
              <input
                v-if="groupSelectValue === NEW_GROUP_OPTION"
                v-model="newGroupName"
                type="text"
                class="form-control border-0 bg-light mt-2"
                placeholder="Название новой группы"
              />
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
                v-if="selectedToAdd.length > 0"
                class="d-flex align-items-center justify-content-between bg-light rounded-4 p-3 mt-2"
              >
                <span class="small fw-bold"
                  >Выбрано: {{ selectedToAdd.length }}</span
                >
                <button
                  @click="addSelectedToHot"
                  class="btn btn-primary btn-sm rounded-pill px-3"
                >
                  <i class="bi bi-plus-lg me-1"></i>Добавить в «{{
                    selectedGroup
                  }}»
                </button>
              </div>

              <div
                v-if="searchResults.length > 0"
                class="search-results-dropdown shadow-lg rounded-4 mt-2 bg-white position-absolute w-100 z-3 border"
              >
                <div
                  v-for="p in searchResults"
                  :key="p.id"
                  @click="toggleSelectToAdd(p)"
                  class="p-3 border-bottom d-flex justify-content-between align-items-center cursor-pointer hover-bg"
                  :class="{ 'bg-primary-subtle': isSelectedToAdd(p) }"
                >
                  <div class="d-flex align-items-center">
                    <input
                      type="checkbox"
                      class="form-check-input me-3"
                      :checked="isSelectedToAdd(p)"
                      @click.stop="toggleSelectToAdd(p)"
                    />
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
                  <i
                    class="bi fs-5"
                    :class="
                      isSelectedToAdd(p)
                        ? 'bi-check-circle-fill text-success'
                        : 'bi-plus-circle text-primary'
                    "
                  ></i>
                </div>
              </div>
            </div>

            <div class="alert alert-info border-0 rounded-4 small mb-0">
              <i class="bi bi-info-circle me-2"></i>
              Используйте поиск, чтобы найти и отметить несколько товаров —
              они добавятся в выбранную группу за один раз.
            </div>
          </div>
        </div>

        <div
          class="card border-0 shadow-sm rounded-4 mt-4"
          v-if="groups.length > 0"
        >
          <div class="card-body p-4">
            <h5 class="fw-bold mb-3">Управление группами</h5>
            <p class="text-muted x-small mb-3">
              Нажмите на группу, чтобы отфильтровать список справа
            </p>
            <div class="d-flex flex-wrap gap-2">
              <div
                v-for="g in groups"
                :key="g"
                @click="toggleFilterGroup(g)"
                class="group-rename-tag d-flex align-items-center rounded-pill px-3 py-2 border cursor-pointer"
                :class="
                  activeFilterGroup === g
                    ? 'bg-primary text-white border-primary'
                    : 'bg-light'
                "
              >
                <span class="small fw-bold me-2">{{ g }}</span>
                <button
                  @click.stop="triggerRenameGroup(g)"
                  class="btn btn-sm btn-link p-0"
                  :class="activeFilterGroup === g ? 'text-white' : 'text-primary'"
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
            <div
              class="d-flex align-items-center justify-content-between mb-4"
            >
              <h5 class="fw-bold mb-0">
                Текущий список (Дашборд)
                <span v-if="activeFilterGroup" class="text-muted fw-normal small"
                  >— {{ activeFilterGroup }}</span
                >
              </h5>
              <button
                v-if="activeFilterGroup"
                @click="activeFilterGroup = null"
                class="btn btn-sm btn-light rounded-pill px-3"
              >
                <i class="bi bi-x-lg me-1"></i>Сбросить фильтр
              </button>
            </div>

            <div v-if="isLoading" class="text-center py-5">
              <div class="spinner-border text-primary" role="status"></div>
            </div>

            <div
              v-else-if="filteredHotProducts.length === 0"
              class="text-center py-5 opacity-50"
            >
              <i class="bi bi-fire fs-1 d-block mb-3"></i>
              <p>Список горячих товаров пуст</p>
            </div>

            <div v-else class="hot-list">
              <div
                v-for="(p, index) in filteredHotProducts"
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
                    @click="moveItem(filteredHotProducts, index, -1)"
                    :disabled="index === 0"
                    class="btn btn-sm btn-light rounded-circle"
                  >
                    <i class="bi bi-chevron-up"></i>
                  </button>
                  <button
                    @click="moveItem(filteredHotProducts, index, 1)"
                    :disabled="index === filteredHotProducts.length - 1"
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
