<script setup>
definePageMeta({
  layout: "admin",
  middleware: "purchaser",
});

const uiStore = useUiStore();
const productsStore = useProductsStore();
const api = useApi();
const { getImageUrl } = useImageUrl();

const { createCategory, updateCategory, deleteCategory } = useProducts();

const categories = computed(() => productsStore.categories);
const isLoading = ref(false);
const isModalOpen = ref(false);
const isEditing = ref(false);
const isSaving = ref(false);
const errors = ref({});

const form = ref({
  id: null,
  name: "",
  slug: "",
  description: "",
  parent_id: "",
  is_active: true,
  sort_order: 0,
  image: null,
});

const selectedFile = ref(null);

const handleFileChange = (event) => {
  const file = event.target.files[0];
  if (file) {
    selectedFile.value = file;
  }
};

const fetchCategories = async (force = false) => {
  isLoading.value = true;
  try {
    await productsStore.fetchCategories(force);
  } catch (error) {
    uiStore.error("Ошибка загрузки категорий");
  } finally {
    isLoading.value = false;
  }
};

const openCreateModal = () => {
  isEditing.value = false;
  form.value = {
    id: null,
    name: "",
    slug: "",
    description: "",
    parent_id: "",
    is_active: true,
    sort_order: 0,
    image: null,
  };
  selectedFile.value = null;
  errors.value = {};
  isModalOpen.value = true;
};

const openEditModal = (category) => {
  isEditing.value = true;
  form.value = { ...category, parent_id: category.parent_id || "" };
  selectedFile.value = null;
  errors.value = {};
  isModalOpen.value = true;
};

const closeModal = () => {
  isModalOpen.value = false;
};

const handleSubmit = async () => {
  errors.value = {};
  isSaving.value = true;
  try {
    const formData = new FormData();
    formData.append("name", form.value.name);
    if (form.value.slug) formData.append("slug", form.value.slug);
    if (form.value.description)
      formData.append("description", form.value.description);
    if (form.value.parent_id)
      formData.append("parent_id", form.value.parent_id);
    formData.append("is_active", form.value.is_active ? "1" : "0");
    formData.append("sort_order", form.value.sort_order.toString());

    if (selectedFile.value) {
      formData.append("image", selectedFile.value);
    }

    if (isEditing.value) {
      await updateCategory(form.value.id, formData);
    } else {
      await createCategory(formData);
    }
    closeModal();
    productsStore.invalidateCategories();
    await fetchCategories(true);
    uiStore.success(
      `Категория успешно ${isEditing.value ? "обновлена" : "создана"}`,
    );
  } catch (error) {
    if (error.data && error.data.errors) {
      errors.value = error.data.errors;
    } else {
      console.error(error);
      uiStore.error("Ошибка при сохранении категории");
    }
  } finally {
    isSaving.value = false;
  }
};

const handleDelete = async (id) => {
  const confirmed = await uiStore.showConfirm(
    "Удаление категории",
    "Вы уверены? Это может удалить и все подкатегории!",
  );
  if (!confirmed) return;

  try {
    await deleteCategory(id);
    productsStore.invalidateCategories();
    await fetchCategories(true);
    uiStore.success("Категория удалена");
  } catch (error) {
    console.error(error);
    uiStore.error("Ошибка при удалении");
  }
};

onMounted(() => {
  fetchCategories();
});
</script>

<template>
  <div class="container-fluid p-4">
    <div class="d-flex justify-content-between align-items-center mb-4">
      <h1 class="h3 text-gray-800">Категории</h1>
      <button @click="openCreateModal" class="btn btn-primary">
        + Создать категорию
      </button>
    </div>

    <div class="card shadow-sm">
      <div v-if="isLoading" class="p-5 text-center text-muted">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Загрузка...</span>
        </div>
      </div>
      <div
        v-else-if="categories.length === 0"
        class="p-5 text-center text-muted"
      >
        Нет категорий
      </div>

      <div v-else class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th scope="col" class="ps-4">ID</th>
              <th scope="col">Фото</th>
              <th scope="col">Название</th>
              <th scope="col">Slug</th>
              <th scope="col">Активность</th>
              <th scope="col" class="text-end pe-4">Действия</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="cat in categories" :key="cat.id">
              <td class="ps-4 text-muted">{{ cat.id }}</td>
              <td>
                <img
                  v-if="cat.image"
                  :src="getImageUrl(cat.image)"
                  class="rounded bg-light"
                  style="width: 40px; height: 40px; object-fit: cover"
                  alt=""
                />
                <div
                  v-else
                  class="rounded bg-light d-flex align-items-center justify-content-center text-muted"
                  style="width: 40px; height: 40px"
                >
                  <i class="bi bi-image small"></i>
                </div>
              </td>
              <td class="fw-medium">
                {{ cat.name }}
                <span v-if="cat.parent_id" class="badge bg-secondary ms-2"
                  >Подкатегория</span
                >
              </td>
              <td class="text-muted">{{ cat.slug }}</td>
              <td>
                <span
                  class="badge rounded-pill"
                  :class="cat.is_active ? 'text-bg-success' : 'text-bg-danger'"
                >
                  {{ cat.is_active ? "Активна" : "Скрыта" }}
                </span>
              </td>
              <td class="text-end pe-4">
                <button
                  @click="openEditModal(cat)"
                  class="btn btn-sm btn-outline-primary me-2"
                >
                  <i class="bi bi-pencil"></i>
                </button>
                <button
                  @click="handleDelete(cat.id)"
                  class="btn btn-sm btn-outline-danger"
                >
                  <i class="bi bi-trash"></i>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <UiBaseModal
      :show="isModalOpen"
      :title="isEditing ? 'Редактировать категорию' : 'Создать категорию'"
      @close="closeModal"
    >
      <form id="categoryForm" @submit.prevent="handleSubmit">
        <div class="mb-4">
          <label class="form-label fw-semibold">Название *</label>
          <input
            v-model="form.name"
            type="text"
            class="form-control form-control-lg"
            :class="{ 'is-invalid': errors.name }"
            placeholder="Напр. Электроника"
            required
          />
          <div v-if="errors.name" class="invalid-feedback">
            {{ errors.name[0] }}
          </div>
        </div>

        <div class="mb-4">
          <label class="form-label fw-semibold">Изображение категории</label>
          <div v-if="isEditing && form.image && !selectedFile" class="mb-2">
            <img
              :src="getImageUrl(form.image)"
              class="img-thumbnail"
              style="height: 100px"
              alt="Текущее фото"
            />
          </div>
          <input
            type="file"
            class="form-control"
            :class="{ 'is-invalid': errors.image }"
            accept="image/*"
            @change="handleFileChange"
          />
          <div class="form-text">Рекомендуемый формат: WEBP, JPG, PNG</div>
          <div v-if="errors.image" class="invalid-feedback">
            {{ errors.image[0] }}
          </div>
        </div>

        <div class="mb-4">
          <label class="form-label fw-semibold">Slug (ЧПУ)</label>
          <input
            v-model="form.slug"
            type="text"
            class="form-control"
            placeholder="Автоматически если пусто"
          />
          <div v-if="errors.slug" class="invalid-feedback d-block">
            {{ errors.slug[0] }}
          </div>
        </div>

        <div class="mb-4">
          <label class="form-label fw-semibold">Родительская категория</label>
          <select v-model="form.parent_id" class="form-select">
            <option value="">Нет (Корневая)</option>
            <option
              v-for="cat in categories"
              :key="cat.id"
              :value="cat.id"
              v-show="cat.id !== form.id"
            >
              {{ cat.name }}
            </option>
          </select>
        </div>

        <div class="mb-4">
          <div class="form-check form-switch">
            <input
              v-model="form.is_active"
              class="form-check-input"
              type="checkbox"
              id="is_active"
              role="switch"
            />
            <label class="form-check-label fw-medium" for="is_active">
              Отображать категорию на сайте
            </label>
          </div>
        </div>
      </form>

      <template #footer>
        <div class="d-flex justify-content-end gap-3 w-100">
          <button type="button" class="btn btn-light px-4" @click="closeModal">
            Отмена
          </button>
          <button
            type="submit"
            form="categoryForm"
            class="btn btn-primary px-4 shadow-sm"
            :class="{ 'btn-loading': isSaving }"
            :disabled="isSaving"
          >
            <i v-if="!isSaving" class="bi bi-save me-2"></i>
            {{ isSaving ? "" : "Сохранить" }}
          </button>
        </div>
      </template>
    </UiBaseModal>
  </div>
</template>
