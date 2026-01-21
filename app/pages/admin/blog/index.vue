<script setup>
const { getPosts, deletePost } = useBlog();
const ui = useUiStore();
const config = useRuntimeConfig();

definePageMeta({
  layout: "admin",
  middleware: "admin",
});

const loading = ref(true);
const posts = ref([]);

const fetchPosts = async () => {
  loading.value = true;
  try {
    const res = await getPosts();
    posts.value = res.data;
  } catch (e) {
    ui.addToast("Ошибка загрузки статей", "danger");
  } finally {
    loading.value = false;
  }
};

const remove = async (id) => {
  const confirmed = await ui.showConfirm(
    "Удаление статьи",
    "Вы уверены, что хотите удалить эту статью?"
  );
  if (!confirmed) return;
  try {
    await deletePost(id);
    ui.addToast("Статья удалена", "success");
    fetchPosts();
  } catch (e) {
    ui.addToast("Ошибка удаления", "danger");
  }
};

onMounted(fetchPosts);
</script>

<template>
  <div class="p-4 animate-fade-in">
    <div class="d-flex justify-content-between align-items-center mb-4">
      <div>
        <h1 class="h3 fw-bold mb-1">Блог / Новости</h1>
        <p class="text-muted small">Управление статьями и новостями магазина</p>
      </div>
      <NuxtLink
        to="/admin/blog/create"
        class="btn btn-primary rounded-pill px-4"
      >
        <i class="bi bi-plus-lg me-2"></i> Написать статью
      </NuxtLink>
    </div>

    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border text-primary" role="status"></div>
    </div>

    <div v-else class="row g-4">
      <div v-for="post in posts" :key="post.id" class="col-xl-4 col-md-6">
        <div class="card border-0 shadow-sm rounded-4 overflow-hidden h-100">
          <div style="height: 160px">
            <img
              v-if="post.image_url"
              :src="post.image_url"
              class="w-100 h-100 object-fit-cover"
            />
            <div
              v-else
              class="w-100 h-100 bg-light d-flex align-items-center justify-content-center text-muted"
            >
              Нет изображения
            </div>
          </div>
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span
                class="badge"
                :class="
                  post.is_published
                    ? 'bg-success-subtle text-success'
                    : 'bg-warning-subtle text-warning'
                "
              >
                {{ post.is_published ? "Опубликовано" : "Черновик" }}
              </span>
              <small class="text-muted">{{
                new Date(post.created_at).toLocaleDateString()
              }}</small>
            </div>
            <h6 class="fw-bold text-truncate">{{ post.title }}</h6>
            <div class="d-flex justify-content-between align-items-center mt-3">
              <span class="small text-muted"
                ><i class="bi bi-person me-1"></i>{{ post.author?.name }}</span
              >
              <div>
                <NuxtLink
                  :to="`/admin/blog/${post.id}`"
                  class="btn btn-sm btn-light rounded-circle me-1"
                >
                  <i class="bi bi-pencil"></i>
                </NuxtLink>
                <button
                  class="btn btn-sm btn-light rounded-circle text-danger"
                  @click="remove(post.id)"
                >
                  <i class="bi bi-trash"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div v-if="posts.length === 0" class="col-12 text-center py-5 text-muted">
        Статей пока нет
      </div>
    </div>
  </div>
</template>
