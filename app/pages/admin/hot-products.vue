<script setup>
definePageMeta({
  layout: "admin",
  middleware: "permission",
  permission: "products.edit",
});

// ── Горячие товары для кассы ─────────────────────────────────────────
// Сначала создаётся группа, потом в неё добавляются товары. Список групп
// (и их порядок на кассе) хранится в настройке pos_hot_groups, у товара —
// hot_group и hot_order. На экране всегда открыта одна группа: товары
// разных групп не смешиваются ни в списке, ни при добавлении.

const { getProducts, updateProduct } = useProducts();
const ui = useUiStore();
const api = useApi();
const { settings, fetchPublicSettings } = useSettings();

const NO_GROUP = "__none__"; // товары, отмеченные горячими, но без группы (старые данные)

const hotProducts = ref([]);
const savedGroups = ref([]);
const isLoading = ref(false);
const busy = ref(false);
const activeGroup = ref(null);

const fetchHotProducts = async () => {
  isLoading.value = true;
  try {
    // noCache — после добавления/переноса нужен свежий список, не SWR-кэш
    const res = await getProducts({ is_hot: true, per_page: 500 }, { noCache: true });
    hotProducts.value = (res.data || []).slice().sort((a, b) => (a.hot_order || 0) - (b.hot_order || 0));
  } catch (e) {
    ui.error("Ошибка при загрузке горячих товаров");
  } finally {
    isLoading.value = false;
  }
};

const loadGroups = async () => {
  await fetchPublicSettings({ fresh: true });
  savedGroups.value = parseHotGroups(settings.value?.pos_hot_groups);
};

const groupOf = (p) => p.hot_group || NO_GROUP;

// Сохранённые группы + группы из старых данных, которых нет в списке
const groups = computed(() => {
  const fromProducts = [...new Set(hotProducts.value.map((p) => p.hot_group).filter(Boolean))];
  return [...savedGroups.value, ...fromProducts.filter((g) => !savedGroups.value.includes(g))];
});
const hasUngrouped = computed(() => hotProducts.value.some((p) => !p.hot_group));

const countIn = (g) => hotProducts.value.filter((p) => groupOf(p) === g).length;
const groupLabel = (g) => (g === NO_GROUP ? "Без группы" : g);

const groupProducts = computed(() =>
  activeGroup.value ? hotProducts.value.filter((p) => groupOf(p) === activeGroup.value) : [],
);

// Выбранная группа пропала (переименовали/удалили) — открываем первую
watch(
  [groups, hasUngrouped],
  () => {
    const all = [...groups.value, ...(hasUngrouped.value ? [NO_GROUP] : [])];
    if (!activeGroup.value || !all.includes(activeGroup.value)) {
      activeGroup.value = all[0] || null;
    }
  },
  { immediate: true },
);

const selectGroup = (g) => {
  activeGroup.value = g;
  resetSearch();
};

const persistGroups = async (list) => {
  const res = await api.apiFetch("/hot-groups", { method: "POST", body: { groups: list } });
  savedGroups.value = res?.groups || list;
};

// ── Создание группы ──
const newGroupName = ref("");
const createGroup = async () => {
  const name = newGroupName.value.trim();
  if (!name) return;
  if (groups.value.some((g) => g.toLowerCase() === name.toLowerCase())) {
    ui.addToast(`Группа «${name}» уже есть`, "warning");
    activeGroup.value = groups.value.find((g) => g.toLowerCase() === name.toLowerCase());
    return;
  }
  busy.value = true;
  try {
    await persistGroups([...groups.value, name]);
    newGroupName.value = "";
    selectGroup(name);
    ui.success(`Группа «${name}» создана — теперь добавьте в неё товары`);
  } catch (e) {
    ui.error(e?.data?.message || "Не удалось создать группу");
  } finally {
    busy.value = false;
  }
};

// ── Порядок групп ──
const moveGroup = async (g, dir) => {
  const list = [...groups.value];
  const i = list.indexOf(g);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  busy.value = true;
  try {
    await persistGroups(list);
  } catch (e) {
    ui.error("Не удалось изменить порядок групп");
  } finally {
    busy.value = false;
  }
};

// ── Переименование ──
const renameModal = ref({ show: false, oldName: "", newName: "", isSaving: false });
const triggerRenameGroup = (g) => {
  renameModal.value = { show: true, oldName: g, newName: g, isSaving: false };
};
const handleRenameGroup = async () => {
  const { oldName } = renameModal.value;
  const newName = renameModal.value.newName.trim();
  if (!newName || newName === oldName) {
    renameModal.value.show = false;
    return;
  }
  if (groups.value.some((g) => g !== oldName && g.toLowerCase() === newName.toLowerCase())) {
    ui.addToast(`Группа «${newName}» уже есть`, "warning");
    return;
  }
  renameModal.value.isSaving = true;
  try {
    // Сначала фиксируем полный список (вместе с группами из старых данных),
    // затем сервер одной транзакцией переименует группу и её товары
    await persistGroups(groups.value);
    const res = await api.apiFetch("/hot-groups/rename", {
      method: "POST",
      body: { old_name: oldName, new_name: newName },
    });
    savedGroups.value = res?.groups || savedGroups.value;
    if (activeGroup.value === oldName) activeGroup.value = newName;
    await fetchHotProducts();
    renameModal.value.show = false;
    ui.success(`Группа переименована в «${newName}»`);
  } catch (e) {
    ui.error(e?.data?.message || "Ошибка при переименовании группы");
  } finally {
    renameModal.value.isSaving = false;
  }
};

// ── Удаление ──
const deleteGroup = async (g) => {
  const n = countIn(g);
  const ok = await ui.showConfirm(
    "Удалить группу?",
    n > 0
      ? `Группа «${g}» и ${n} товар(ов) в ней будут убраны с кассы. Сами товары останутся в каталоге.`
      : `Пустая группа «${g}» будет удалена.`,
  );
  if (!ok) return;
  busy.value = true;
  try {
    await persistGroups(groups.value);
    const res = await api.apiFetch("/hot-groups/delete", { method: "POST", body: { name: g } });
    savedGroups.value = res?.groups || savedGroups.value.filter((x) => x !== g);
    await fetchHotProducts();
    ui.success("Группа удалена");
  } catch (e) {
    ui.error(e?.data?.message || "Не удалось удалить группу");
  } finally {
    busy.value = false;
  }
};

// ── Поиск и добавление товаров в открытую группу ──
const searchQuery = ref("");
const searchResults = ref([]);
const isSearching = ref(false);
const selectedToAdd = ref([]);

const resetSearch = () => {
  searchQuery.value = "";
  searchResults.value = [];
  selectedToAdd.value = [];
};

let searchTimer = null;
let searchSeq = 0;
const onSearchInput = () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(searchForHot, 300);
};

const searchForHot = async () => {
  const q = searchQuery.value.trim();
  if (q.length < 2) {
    searchResults.value = [];
    return;
  }
  const seq = ++searchSeq;
  isSearching.value = true;
  try {
    const res = await getProducts({ search: q, per_page: 40 }, { noCache: true });
    if (seq !== searchSeq) return;
    searchResults.value = (res.data || []).slice(0, 20);
  } catch (e) {
    console.error(e);
  } finally {
    if (seq === searchSeq) isSearching.value = false;
  }
};

// Товар уже горячий — в какой группе (чтобы не добавлять второй раз)
const hotGroupOf = (product) => {
  const hp = hotProducts.value.find((p) => p.id === product.id);
  return hp ? groupLabel(groupOf(hp)) : null;
};

const isSelectedToAdd = (product) => selectedToAdd.value.some((p) => p.id === product.id);
const toggleSelectToAdd = (product) => {
  if (hotGroupOf(product)) return;
  if (isSelectedToAdd(product)) {
    selectedToAdd.value = selectedToAdd.value.filter((p) => p.id !== product.id);
  } else {
    selectedToAdd.value.push(product);
  }
};

const canAddToActive = computed(() => !!activeGroup.value && activeGroup.value !== NO_GROUP);

const addSelectedToGroup = async () => {
  if (!canAddToActive.value || selectedToAdd.value.length === 0) return;
  const group = activeGroup.value;
  busy.value = true;
  try {
    // Группа из старых данных — закрепляем её в списке групп
    if (!savedGroups.value.includes(group)) await persistGroups(groups.value);
    let nextOrder = hotProducts.value.reduce((m, p) => Math.max(m, p.hot_order || 0), 0) + 1;
    await Promise.all(
      selectedToAdd.value.map((product) => {
        const fd = new FormData();
        fd.append("is_hot", "1");
        fd.append("hot_order", String(nextOrder++));
        fd.append("hot_group", group);
        return updateProduct(product.id, fd);
      }),
    );
    ui.success(`Добавлено в «${group}»: ${selectedToAdd.value.length}`);
    resetSearch();
    await fetchHotProducts();
  } catch (e) {
    ui.error("Не удалось добавить товары");
  } finally {
    busy.value = false;
  }
};

// ── Действия с товаром ──
const moveToGroup = async (product, group) => {
  if (!group || group === groupOf(product)) return;
  busy.value = true;
  try {
    const fd = new FormData();
    fd.append("hot_group", group);
    await updateProduct(product.id, fd);
    ui.success(`«${product.name}» перенесён в «${group}»`);
    await fetchHotProducts();
  } catch (e) {
    ui.error("Не удалось перенести товар");
  } finally {
    busy.value = false;
  }
};

const removeFromHot = async (product) => {
  const ok = await ui.showConfirm("Убрать с кассы?", `«${product.name}» больше не будет в горячих товарах.`);
  if (!ok) return;
  busy.value = true;
  try {
    const fd = new FormData();
    fd.append("is_hot", "0");
    fd.append("hot_order", "0");
    fd.append("hot_group", "");
    await updateProduct(product.id, fd);
    ui.success("Товар убран из горячих");
    await fetchHotProducts();
  } catch (e) {
    ui.error("Ошибка при удалении");
  } finally {
    busy.value = false;
  }
};

// ── Порядок товаров внутри группы ──
// Меняет местами hot_order двух товаров. Порядок общий для всех групп, но
// меняем только соседей внутри открытой группы — другие группы не трогаются.
const swapOrder = async (a, b) => {
  const oa = a.hot_order || 0;
  let ob = b.hot_order || 0;
  if (oa === ob) ob = oa + 1; // одинаковые номера (старые данные) — разводим
  const fdA = new FormData();
  fdA.append("hot_order", String(ob));
  const fdB = new FormData();
  fdB.append("hot_order", String(oa));
  await Promise.all([updateProduct(a.id, fdA), updateProduct(b.id, fdB)]);
  a.hot_order = ob;
  b.hot_order = oa;
};

const moveItem = async (index, dir) => {
  const list = groupProducts.value;
  const j = index + dir;
  if (j < 0 || j >= list.length) return;
  busy.value = true;
  try {
    await swapOrder(list[index], list[j]);
    await fetchHotProducts();
  } catch (e) {
    ui.error("Ошибка при изменении порядка");
  } finally {
    busy.value = false;
  }
};

const draggedIndex = ref(null);
const dragOverIndex = ref(null);
const onDragEnd = () => {
  draggedIndex.value = null;
  dragOverIndex.value = null;
};
const onDropItem = async (targetIndex) => {
  const source = draggedIndex.value;
  onDragEnd();
  if (source === null || source === targetIndex) return;
  const list = [...groupProducts.value];
  const dir = targetIndex > source ? 1 : -1;
  busy.value = true;
  try {
    for (let i = source; i !== targetIndex; i += dir) {
      await swapOrder(list[i], list[i + dir]);
      [list[i], list[i + dir]] = [list[i + dir], list[i]];
    }
    await fetchHotProducts();
  } catch (e) {
    ui.error("Ошибка при изменении порядка");
  } finally {
    busy.value = false;
  }
};

const formatPrice = (v) => (parseFloat(v) || 0).toLocaleString("ru-RU") + " сом";

onMounted(async () => {
  await Promise.all([fetchHotProducts(), loadGroups()]);
});
</script>

<template>
  <div class="adm-page hot-page p-3 p-md-4">
    <div class="adm-head">
      <div class="adm-head-title">
        <h1 class="h3">{{ settings.pos_hot_products_title || "Горячие товары" }}</h1>
        <p class="text-muted small mb-0">
          Быстрые кнопки на кассе: создайте группу, затем добавьте в неё товары
        </p>
      </div>
      <span v-if="busy" class="spinner-border spinner-border-sm text-primary"></span>
    </div>

    <div class="row g-3">
      <!-- ── Группы ── -->
      <div class="col-lg-4 col-xl-3">
        <div class="card border-0 shadow-sm rounded-4 groups-card">
          <div class="card-body p-3">
            <div class="d-flex align-items-center mb-2">
              <span class="step-num">1</span>
              <h6 class="fw-bold mb-0">Группы</h6>
              <span class="ms-auto small text-muted">{{ groups.length }}</span>
            </div>

            <form class="d-flex gap-2 mb-3" @submit.prevent="createGroup">
              <input
                v-model="newGroupName"
                type="text"
                maxlength="50"
                class="form-control form-control-sm bg-light border-0 rounded-3"
                placeholder="Новая группа, напр. «Напитки»"
              />
              <button class="btn btn-sm btn-primary rounded-3 text-nowrap" :disabled="!newGroupName.trim() || busy">
                <i class="bi bi-plus-lg"></i><span class="d-none d-sm-inline ms-1">Создать</span>
              </button>
            </form>

            <div v-if="groups.length === 0 && !hasUngrouped && !isLoading" class="text-muted small text-center py-3">
              Групп пока нет — создайте первую
            </div>

            <!-- Десктоп: вертикальный список; телефон: лента -->
            <div class="group-list">
              <div
                v-for="(g, gi) in groups"
                :key="g"
                class="group-item"
                :class="{ active: activeGroup === g }"
                @click="selectGroup(g)"
              >
                <i class="bi bi-folder2 group-ico"></i>
                <span class="group-name" :title="g">{{ g }}</span>
                <span class="group-count">{{ countIn(g) }}</span>
                <div class="group-tools" @click.stop>
                  <button class="gt-btn" :disabled="gi === 0 || busy" title="Выше" @click="moveGroup(g, -1)">
                    <i class="bi bi-chevron-up"></i>
                  </button>
                  <button class="gt-btn" :disabled="gi === groups.length - 1 || busy" title="Ниже" @click="moveGroup(g, 1)">
                    <i class="bi bi-chevron-down"></i>
                  </button>
                  <button class="gt-btn" title="Переименовать" @click="triggerRenameGroup(g)">
                    <i class="bi bi-pencil"></i>
                  </button>
                  <button class="gt-btn danger" title="Удалить группу" :disabled="busy" @click="deleteGroup(g)">
                    <i class="bi bi-trash"></i>
                  </button>
                </div>
              </div>
              <div
                v-if="hasUngrouped"
                class="group-item ungrouped"
                :class="{ active: activeGroup === NO_GROUP }"
                @click="selectGroup(NO_GROUP)"
              >
                <i class="bi bi-question-circle group-ico"></i>
                <span class="group-name">Без группы</span>
                <span class="group-count">{{ countIn(NO_GROUP) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Товары выбранной группы ── -->
      <div class="col-lg-8 col-xl-9">
        <div class="card border-0 shadow-sm rounded-4 group-panel">
          <div v-if="!activeGroup" class="adm-empty py-5">
            <i class="bi bi-folder-plus fs-1 d-block mb-2"></i>
            Создайте группу слева — после этого в неё можно будет добавить товары
          </div>

          <template v-else>
            <div class="panel-head">
              <div class="min-w-0">
                <div class="small text-muted">Группа</div>
                <h5 class="fw-bold mb-0 text-truncate">{{ groupLabel(activeGroup) }}</h5>
              </div>
              <span class="badge bg-primary-subtle text-primary rounded-pill ms-auto">
                {{ groupProducts.length }} товар(ов)
              </span>
            </div>

            <!-- Шаг 2: добавление в ЭТУ группу -->
            <div v-if="canAddToActive" class="add-box">
              <div class="d-flex align-items-center mb-2">
                <span class="step-num">2</span>
                <span class="fw-bold small">Добавить товары в «{{ activeGroup }}»</span>
              </div>
              <div class="position-relative">
                <div class="input-group">
                  <span class="input-group-text border-0 bg-white">
                    <span v-if="isSearching" class="spinner-border spinner-border-sm text-muted"></span>
                    <i v-else class="bi bi-search"></i>
                  </span>
                  <input
                    v-model="searchQuery"
                    type="text"
                    class="form-control border-0"
                    placeholder="Название или артикул (от 2 символов)…"
                    @input="onSearchInput"
                  />
                  <button v-if="searchQuery" class="btn btn-white border-0" type="button" title="Очистить" @click="resetSearch">
                    <i class="bi bi-x-lg"></i>
                  </button>
                </div>

                <div v-if="searchResults.length" class="search-results">
                  <div
                    v-for="p in searchResults"
                    :key="p.id"
                    class="sr-item"
                    :class="{ picked: isSelectedToAdd(p), disabled: !!hotGroupOf(p) }"
                    @click="toggleSelectToAdd(p)"
                  >
                    <input
                      type="checkbox"
                      class="form-check-input m-0 flex-shrink-0"
                      :checked="isSelectedToAdd(p)"
                      :disabled="!!hotGroupOf(p)"
                      @click.stop="toggleSelectToAdd(p)"
                    />
                    <div class="min-w-0 flex-grow-1">
                      <div class="fw-bold small text-truncate">{{ p.name }}</div>
                      <div class="text-muted" style="font-size: 0.72rem;">
                        <span class="font-monospace">{{ p.sku || "—" }}</span> · {{ formatPrice(p.price) }}
                      </div>
                    </div>
                    <span v-if="hotGroupOf(p)" class="badge bg-light text-muted border text-truncate" style="max-width: 40%;">
                      уже в «{{ hotGroupOf(p) }}»
                    </span>
                  </div>
                </div>
                <div v-else-if="searchQuery.trim().length >= 2 && !isSearching" class="small text-muted mt-2">
                  Ничего не найдено
                </div>
              </div>

              <div v-if="selectedToAdd.length" class="add-bar">
                <span class="small fw-bold">Выбрано: {{ selectedToAdd.length }}</span>
                <button class="btn btn-sm btn-link text-muted ms-auto" @click="selectedToAdd = []">Снять</button>
                <button class="btn btn-sm btn-primary rounded-pill px-3" :disabled="busy" @click="addSelectedToGroup">
                  <i class="bi bi-plus-lg me-1"></i>Добавить в «{{ activeGroup }}»
                </button>
              </div>
            </div>
            <div v-else class="alert alert-warning small m-3 mb-0">
              Эти товары отмечены горячими, но без группы — на кассе их не видно.
              Перенесите каждый в нужную группу кнопкой справа.
            </div>

            <!-- Список товаров группы -->
            <div class="p-3">
              <div v-if="isLoading" class="adm-empty"><div class="spinner-border text-primary"></div></div>
              <div v-else-if="groupProducts.length === 0" class="adm-empty">
                <i class="bi bi-fire fs-1 d-block mb-2 opacity-50"></i>
                В группе пока нет товаров — найдите их поиском выше
              </div>
              <div v-else class="hot-list">
                <div
                  v-for="(p, index) in groupProducts"
                  :key="p.id"
                  class="hot-item"
                  draggable="true"
                  :class="{
                    'is-dragging': draggedIndex === index,
                    'is-drag-over': dragOverIndex === index && draggedIndex !== index,
                  }"
                  @dragstart="draggedIndex = index"
                  @dragover.prevent="dragOverIndex = index"
                  @drop.prevent="onDropItem(index)"
                  @dragend="onDragEnd"
                >
                  <i class="bi bi-grip-vertical drag-handle d-none d-md-inline" title="Перетащите, чтобы изменить порядок"></i>
                  <span class="order-num">{{ index + 1 }}</span>
                  <div class="hot-thumb">
                    <img
                      v-if="p.image_url"
                      :src="p.image_url"
                      class="img-loading"
                      @load="(e) => e.target.classList.add('is-loaded')"
                      @error="(e) => e.target.classList.add('is-loaded', 'is-broken')"
                    />
                    <span v-else>{{ p.name?.[0] }}</span>
                  </div>
                  <div class="min-w-0 flex-grow-1">
                    <div class="fw-bold small text-truncate" :title="p.name">{{ p.name }}</div>
                    <div class="text-muted text-truncate" style="font-size: 0.72rem;">
                      <span class="font-monospace">{{ p.sku || "—" }}</span> · {{ formatPrice(p.sale_price || p.price) }}
                    </div>
                  </div>
                  <div class="item-tools">
                    <button class="adm-ico" :disabled="index === 0 || busy" title="Выше" @click="moveItem(index, -1)">
                      <i class="bi bi-arrow-up"></i>
                    </button>
                    <button class="adm-ico" :disabled="index === groupProducts.length - 1 || busy" title="Ниже" @click="moveItem(index, 1)">
                      <i class="bi bi-arrow-down"></i>
                    </button>
                    <select
                      v-if="groups.length > 1 || activeGroup === NO_GROUP"
                      class="form-select form-select-sm move-select"
                      title="Перенести в другую группу"
                      :value="''"
                      :disabled="busy"
                      @change="(e) => { moveToGroup(p, e.target.value); e.target.value = ''; }"
                    >
                      <option value="" disabled>В группу…</option>
                      <option v-for="g in groups.filter((x) => x !== activeGroup)" :key="g" :value="g">{{ g }}</option>
                    </select>
                    <button class="adm-ico danger" title="Убрать из горячих" :disabled="busy" @click="removeFromHot(p)">
                      <i class="bi bi-x-lg"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <UiBaseModal
      :show="renameModal.show"
      title="Переименовать группу"
      @close="renameModal.show = false"
      @submit="handleRenameGroup"
    >
      <div class="mb-3">
        <label class="form-label small fw-bold">Новое название</label>
        <input v-model="renameModal.newName" type="text" maxlength="50" class="form-control rounded-3" placeholder="Напр: Напитки" />
        <div class="form-text">Название изменится у всех товаров группы.</div>
      </div>
      <template #footer>
        <div class="d-flex justify-content-end gap-2 w-100">
          <button class="btn btn-light rounded-pill px-4" @click="renameModal.show = false">Отмена</button>
          <button type="submit" class="btn btn-primary rounded-pill px-4" :disabled="renameModal.isSaving || !renameModal.newName.trim()">
            <span v-if="renameModal.isSaving" class="spinner-border spinner-border-sm me-2"></span>
            Сохранить
          </button>
        </div>
      </template>
    </UiBaseModal>
  </div>
</template>

<style scoped>
.min-w-0 {
  min-width: 0;
}
.step-num {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #0ea5e9;
  color: #fff;
  font-size: 0.72rem;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-right: 0.5rem;
  flex-shrink: 0;
}

/* ── Группы ── */
.group-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.group-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  min-width: 0;
}
.group-item:hover {
  background: #f1f5f9;
}
.group-item.active {
  background: #e0f2fe;
  border-color: #7dd3fc;
}
.group-item.ungrouped {
  color: #b45309;
}
.group-ico {
  color: #0ea5e9;
  flex-shrink: 0;
}
.group-item.active .group-ico {
  color: #0369a1;
}
.group-name {
  flex: 1;
  min-width: 0;
  font-weight: 700;
  font-size: 0.88rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.group-count {
  font-size: 0.72rem;
  font-weight: 700;
  color: #64748b;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 50px;
  padding: 0 7px;
  flex-shrink: 0;
}
.group-tools {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}
.gt-btn {
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #64748b;
  font-size: 0.75rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.gt-btn:hover:not(:disabled) {
  background: #fff;
  color: #0369a1;
}
.gt-btn.danger:hover:not(:disabled) {
  color: #dc2626;
}
.gt-btn:disabled {
  opacity: 0.3;
}

/* ── Панель группы ── */
.group-panel {
  min-height: 60vh;
}
.panel-head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1rem 0.75rem;
  border-bottom: 1px solid #f1f5f9;
}
.add-box {
  margin: 0.75rem 1rem 0;
  padding: 0.75rem;
  background: #f0f9ff;
  border: 1px dashed #7dd3fc;
  border-radius: 12px;
}
.add-box .input-group {
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}
.search-results {
  margin-top: 6px;
  max-height: 320px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
}
.sr-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
  min-width: 0;
}
.sr-item:last-child {
  border-bottom: 0;
}
.sr-item:hover {
  background: #f8fafc;
}
.sr-item.picked {
  background: #e0f2fe;
}
.sr-item.disabled {
  cursor: default;
  opacity: 0.6;
}
.add-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 8px 10px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
  position: sticky;
  bottom: 0;
}

/* ── Товары группы ── */
.hot-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.hot-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  min-width: 0;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.hot-item:hover {
  border-color: #7dd3fc;
  box-shadow: 0 2px 8px rgba(14, 165, 233, 0.08);
}
.hot-item.is-dragging {
  opacity: 0.4;
}
.hot-item.is-drag-over {
  border-style: dashed;
  border-color: #0ea5e9;
  background: #f0f9ff;
}
.drag-handle {
  cursor: grab;
  color: #94a3b8;
}
.order-num {
  width: 22px;
  text-align: center;
  font-weight: 800;
  color: #0ea5e9;
  font-size: 0.85rem;
  flex-shrink: 0;
}
.hot-thumb {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  color: #64748b;
  overflow: hidden;
  flex-shrink: 0;
}
.hot-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.item-tools {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.move-select {
  width: 130px;
  border-radius: 8px;
  font-size: 0.78rem;
}

/* ── Телефон ── */
@media (max-width: 991.98px) {
  /* Группы — горизонтальная лента чипов */
  .group-list {
    flex-direction: row;
    overflow-x: auto;
    gap: 6px;
    padding-bottom: 4px;
    -webkit-overflow-scrolling: touch;
  }
  .group-item {
    flex: 0 0 auto;
    max-width: 85vw;
    background: #f8fafc;
    border-color: #e2e8f0;
  }
  .group-item:not(.active) .group-tools {
    display: none;
  }
  .group-panel {
    min-height: 0;
  }
}
@media (max-width: 575.98px) {
  .hot-item {
    flex-wrap: wrap;
  }
  .item-tools {
    width: 100%;
    justify-content: flex-end;
    padding-top: 6px;
    border-top: 1px dashed #e2e8f0;
  }
  .move-select {
    flex: 1;
    width: auto;
  }
  .add-bar .btn-primary {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 60%;
  }
}
</style>
