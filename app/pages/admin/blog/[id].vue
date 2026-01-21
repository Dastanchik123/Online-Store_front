<script setup>
const { getAdminPost, updatePost } = useBlog();
const ui = useUiStore();
const router = useRouter();
const route = useRoute();
const config = useRuntimeConfig();

definePageMeta({
  layout: "admin",
  middleware: "admin",
});

const form = ref({
  title: "",
  content: "",
  image: null,
  is_published: true,
});

const imagePreview = ref(null);
const loading = ref(true);
const saving = ref(false);
const postId = route.params.id;

onMounted(async () => {
  try {
    const post = await getAdminPost(postId);
    form.value.title = post.title;
    form.value.content = post.content;
    form.value.is_published = !!post.is_published;
    if (post.image_url) {
      imagePreview.value = post.image_url;
    }
  } catch (e) {
    ui.addToast("Ошибка при загрузке статьи", "danger");
    router.push("/admin/blog");
  } finally {
    loading.value = false;
  }
});

const handleImage = (e) => {
  const file = e.target.files[0];
  if (file) {
    form.value.image = file;
    imagePreview.value = URL.createObjectURL(file);
  }
};

const save = async () => {
  if (!form.value.title) {
    ui.addToast("Заголовок обязателен", "warning");
    return;
  }

  saving.value = true;
  try {
    const formData = new FormData();
    formData.append("_method", "PUT"); 
    formData.append("title", form.value.title);
    formData.append("content", form.value.content || "");
    formData.append("is_published", form.value.is_published ? "1" : "0");
    if (form.value.image) {
      formData.append("image", form.value.image);
    }

    await updatePost(postId, formData);
    ui.addToast("Статья успешно обновлена", "success");
    router.push("/admin/blog");
  } catch (e) {
    ui.addToast("Ошибка при сохранении", "danger");
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <div class="p-4 animate-fade-in">
    <div class="d-flex justify-content-between align-items-center mb-4">
      <div>
        <h1 class="h3 fw-bold mb-1">Редактирование статьи</h1>
        <NuxtLink
          to="/admin/blog"
          class="text-decoration-none small text-muted"
        >
          <i class="bi bi-arrow-left me-1"></i> Назад к списку
        </NuxtLink>
      </div>
      <button
        class="btn btn-primary rounded-pill px-4"
        @click="save"
        :disabled="saving || loading"
      >
        <span
          v-if="saving"
          class="spinner-border spinner-border-sm me-2"
        ></span>
        <i v-else class="bi bi-save me-2"></i> Сохранить
      </button>
    </div>

    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border text-primary"></div>
    </div>

    <div v-else class="row">
      <div class="col-lg-8">
        <div class="card border-0 shadow-sm rounded-4 p-4 mb-4">
          <div class="mb-3">
            <label class="form-label fw-bold">Заголовок</label>
            <input
              v-model="form.title"
              type="text"
              class="form-control rounded-3 py-2"
              placeholder="Введите название статьи..."
            />
          </div>

          <div class="mb-3">
            <label class="form-label fw-bold">Содержание</label>
            <textarea
              v-model="form.content"
              class="form-control rounded-3"
              rows="15"
              placeholder="Текст статьи (поддерживается HTML)..."
            ></textarea>
            <div class="form-text">
              Вы можете использовать HTML теги для форматирования.
            </div>
          </div>
        </div>
      </div>

      <div class="col-lg-4">
        <div class="card border-0 shadow-sm rounded-4 p-4 mb-4">
          <h6 class="fw-bold mb-3">Настройки публикации</h6>

          <div class="form-check form-switch mb-3">
            <input
              v-model="form.is_published"
              class="form-check-input"
              type="checkbox"
              id="publishCheck"
            />
            <label class="form-check-label" for="publishCheck"
              >Опубликовать</label
            >
          </div>

          <div class="mb-3">
            <label class="form-label fw-bold small">Обложка</label>
            <div
              v-if="imagePreview"
              class="mb-2 rounded-3 overflow-hidden position-relative"
              style="height: 150px"
            >
              <img :src="imagePreview" class="w-100 h-100 object-fit-cover" />
              <button
                @click="
                  imagePreview = null;
                  form.image = null;
                "
                class="btn btn-sm btn-danger position-absolute top-0 end-0 m-2 rounded-circle"
              >
                <i class="bi bi-x-lg"></i>
              </button>
            </div>
            <input
              type="file"
              @change="handleImage"
              class="form-control form-control-sm rounded-3"
              accept="image/*"
            />
            <div class="form-text small mt-1">
              Оставьте пустым, чтобы не менять
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
