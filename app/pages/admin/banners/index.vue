<script setup>
const { getBanners, createBanner, updateBanner, deleteBanner, reorderBanners } =
  useBanners();
const ui = useUiStore();
const config = useRuntimeConfig();

definePageMeta({
  layout: "admin",
  middleware: "admin",
});

const loading = ref(true);
const banners = ref([]);
const showModal = ref(false);
const editingBanner = ref(null);
const form = ref({
  title: "",
  subtitle: "",
  link_url: "",
  button_text: "",
  section: "home_hero",
  is_active: true,
  order: 0,
});
const imageFile = ref(null);

const fetchBanners = async () => {
  loading.value = true;
  try {
    banners.value = await getBanners();
  } catch (e) {
    ui.addToast("Ошибка загрузки баннеров", "danger");
  } finally {
    loading.value = false;
  }
};

const openAddModal = () => {
  editingBanner.value = null;
  form.value = {
    title: "",
    subtitle: "",
    link_url: "",
    button_text: "",
    section: "home_hero",
    is_active: true,
    order: banners.value.length,
  };
  imageFile.value = null;
  showModal.value = true;
};

const openEditModal = (banner) => {
  editingBanner.value = banner;
  form.value = { ...banner };
  imageFile.value = null;
  showModal.value = true;
};

const handleFileChange = (e) => {
  imageFile.value = e.target.files[0];
};

const save = async () => {
  
  if (!form.value.title) {
    ui.addToast("Заголовок обязателен", "warning");
    return;
  }
  if (!editingBanner.value && !imageFile.value) {
    ui.addToast("Выберите изображение для баннера", "warning");
    return;
  }

  const formData = new FormData();
  Object.keys(form.value).forEach((key) => {
    if (key === "is_active") {
      formData.append(key, form.value[key] ? "1" : "0");
    } else {
      formData.append(key, form.value[key] ?? "");
    }
  });
  if (imageFile.value) {
    formData.append("image", imageFile.value);
  }

  try {
    if (editingBanner.value) {
      await updateBanner(editingBanner.value.id, formData);
      ui.addToast("Баннер обновлен", "success");
    } else {
      await createBanner(formData);
      ui.addToast("Баннер создан", "success");
    }
    showModal.value = false;
    fetchBanners();
  } catch (e) {
    
    if (e.data && e.data.errors) {
      const errors = Object.values(e.data.errors).flat();
      ui.addToast(errors[0] || "Ошибка валидации", "danger");
    } else {
      ui.addToast("Ошибка сохранения", "danger");
    }
  }
};

const remove = async (id) => {
  const confirmed = await ui.showConfirm(
    "Удаление баннера",
    "Вы уверены, что хотите удалить этот баннер?"
  );
  if (!confirmed) return;
  try {
    await deleteBanner(id);
    ui.addToast("Баннер удален", "success");
    fetchBanners();
  } catch (e) {
    ui.addToast("Ошибка удаления", "danger");
  }
};

onMounted(fetchBanners);
</script>

<template>
  <div class="p-4 animate-fade-in">
    <div class="d-flex justify-content-between align-items-center mb-4">
      <div>
        <h1 class="h3 fw-bold mb-1">Управление баннерами</h1>
        <p class="text-muted small">Баннеры для главной страницы (слайдер)</p>
      </div>
      <button class="btn btn-primary rounded-pill px-4" @click="openAddModal">
        <i class="bi bi-plus-lg me-2"></i> Добавить баннер
      </button>
    </div>

    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border text-primary" role="status"></div>
    </div>

    <div v-else class="row g-4">
      <div v-for="banner in banners" :key="banner.id" class="col-xl-4 col-md-6">
        <div class="card border-0 shadow-sm rounded-4 overflow-hidden h-100">
          <div class="position-relative" style="height: 180px">
            <img
              :src="banner.image_url"
              class="w-100 h-100 object-fit-cover"
              :alt="banner.title"
            />
            <div class="position-absolute top-0 end-0 p-2 d-flex gap-2">
              <span
                class="badge"
                :class="banner.is_active ? 'bg-success' : 'bg-secondary'"
                >{{ banner.is_active ? "Активен" : "Отключен" }}</span
              >
              <span class="badge bg-dark">#{{ banner.order }}</span>
            </div>
          </div>
          <div class="card-body">
            <h6 class="fw-bold mb-1">{{ banner.title || "Без названия" }}</h6>
            <p class="small text-muted mb-3">
              {{ banner.subtitle || "Без подзаголовка" }}
            </p>
            <div class="d-flex justify-content-between align-items-center">
              <span class="small text-primary fw-bold">{{
                banner.section
              }}</span>
              <div>
                <button
                  class="btn btn-sm btn-light rounded-circle me-1"
                  @click="openEditModal(banner)"
                >
                  <i class="bi bi-pencil"></i>
                </button>
                <button
                  class="btn btn-sm btn-light rounded-circle text-danger"
                  @click="remove(banner.id)"
                >
                  <i class="bi bi-trash"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div
        v-if="banners.length === 0"
        class="col-12 text-center py-5 text-muted"
      >
        Баннеры не созданы
      </div>
    </div>

    
    <div v-if="showModal" class="modal-backdrop fade show"></div>
    <div v-if="showModal" class="modal fade show d-block" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 shadow-lg rounded-4">
          <div class="modal-header border-0 pb-0">
            <h5 class="fw-bold">
              {{ editingBanner ? "Редактировать баннер" : "Новый баннер" }}
            </h5>
            <button
              type="button"
              class="btn-close"
              @click="showModal = false"
            ></button>
          </div>
          <div class="modal-body p-4">
            <div class="mb-3">
              <label class="form-label small fw-bold">Заголовок</label>
              <input
                v-model="form.title"
                type="text"
                class="form-control rounded-3"
              />
            </div>
            <div class="mb-3">
              <label class="form-label small fw-bold">Подзаголовок</label>
              <input
                v-model="form.subtitle"
                type="text"
                class="form-control rounded-3"
              />
            </div>
            <div class="mb-3">
              <label class="form-label small fw-bold">Изображение</label>
              <input
                type="file"
                @change="handleFileChange"
                class="form-control rounded-3"
              />
              <small class="text-muted" v-if="editingBanner"
                >Оставьте пустым, чтобы не менять</small
              >
            </div>
            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label small fw-bold">Текст кнопки</label>
                <input
                  v-model="form.button_text"
                  type="text"
                  class="form-control rounded-3"
                  placeholder="Купить"
                />
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label small fw-bold">Ссылка (URL)</label>
                <input
                  v-model="form.link_url"
                  type="text"
                  class="form-control rounded-3"
                  placeholder="/catalog/..."
                />
              </div>
            </div>
            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label small fw-bold">Порядок</label>
                <input
                  v-model="form.order"
                  type="number"
                  class="form-control rounded-3"
                />
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label small fw-bold">Секция</label>
                <select v-model="form.section" class="form-select rounded-3">
                  <option value="home_hero">Главный слайдер</option>
                  <option value="middle_banner">Реклама в середине</option>
                </select>
              </div>
            </div>
            <div class="form-check form-switch mt-2">
              <input
                v-model="form.is_active"
                class="form-check-input"
                type="checkbox"
                id="bannerActive"
              />
              <label class="form-check-label fw-bold small" for="bannerActive"
                >Баннер активен</label
              >
            </div>
          </div>
          <div class="modal-footer border-0 pt-0">
            <button
              class="btn btn-light rounded-pill px-4"
              @click="showModal = false"
            >
              Отмена
            </button>
            <button class="btn btn-primary rounded-pill px-4" @click="save">
              Сохранить
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
