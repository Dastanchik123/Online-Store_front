<script setup>
const { getPosts } = useBlog();
const config = useRuntimeConfig();

const loading = ref(true);
const posts = ref([]);
const page = ref(1);
const lastPage = ref(1);

const fetchPosts = async () => {
  loading.value = true;
  try {
    const res = await getPosts({ page: page.value });
    posts.value = res.data;
    lastPage.value = res.last_page;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
};

onMounted(fetchPosts);
</script>

<template>
  <div class="container py-5">
    <div class="text-center mb-5 animate-fade-in">
      <h1 class="fw-bold display-4 mb-2">Наш Блог 📖</h1>
      <p class="text-muted lead">
        Новости, советы и обзоры товаров нашего магазина
      </p>
    </div>

    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border text-primary" role="status"></div>
    </div>

    <div v-else-if="posts.length > 0">
      <div class="row g-4 mb-5">
        <div v-for="post in posts" :key="post.id" class="col-lg-4 col-md-6">
          <NuxtLink
            :to="`/blog/${post.slug}`"
            class="text-decoration-none text-dark"
          >
            <div
              class="card border-0 shadow-sm rounded-4 overflow-hidden h-100 blog-card"
            >
              <div class="position-relative" style="height: 220px">
                <img
                  v-if="post.image_url"
                  :src="post.image_url"
                  class="w-100 h-100 object-fit-cover"
                />
                <div
                  v-else
                  class="w-100 h-100 bg-light d-flex align-items-center justify-content-center text-muted"
                >
                  MyShop News
                </div>
                <div class="position-absolute bottom-0 start-0 m-3">
                  <span class="badge bg-primary rounded-pill px-3">{{
                    new Date(post.created_at).toLocaleDateString()
                  }}</span>
                </div>
              </div>
              <div class="card-body p-4">
                <h4 class="fw-bold mb-3">{{ post.title }}</h4>
                <p class="text-muted small text-truncate-3 mb-0">
                  {{
                    post.content.replace(/<[^>]*>/g, "").substring(0, 150)
                  }}...
                </p>
                <div
                  class="mt-4 pt-3 border-top d-flex justify-content-between align-items-center"
                >
                  <span class="small fw-bold opacity-75"
                    ><i class="bi bi-person me-2"></i
                    >{{ post.author?.name }}</span
                  >
                  <span class="text-primary small fw-bold"
                    >Читать далее <i class="bi bi-arrow-right ms-1"></i
                  ></span>
                </div>
              </div>
            </div>
          </NuxtLink>
        </div>
      </div>

      
      <nav v-if="lastPage > 1" class="d-flex justify-content-center">
        <ul class="pagination pagination-rounded">
          <li class="page-item" :class="{ disabled: page === 1 }">
            <button
              class="page-link"
              @click="
                page--;
                fetchPosts();
              "
            >
              <i class="bi bi-chevron-left"></i>
            </button>
          </li>
          <li
            v-for="p in lastPage"
            :key="p"
            class="page-item"
            :class="{ active: page === p }"
          >
            <button
              class="page-link"
              @click="
                page = p;
                fetchPosts();
              "
            >
              {{ p }}
            </button>
          </li>
          <li class="page-item" :class="{ disabled: page === lastPage }">
            <button
              class="page-link"
              @click="
                page++;
                fetchPosts();
              "
            >
              <i class="bi bi-chevron-right"></i>
            </button>
          </li>
        </ul>
      </nav>
    </div>

    <div v-else class="text-center py-5">
      <p class="text-muted">Статей пока нет.</p>
    </div>
  </div>
</template>

<style scoped>
.blog-card {
  transition: all 0.3s ease;
}
.blog-card:hover {
  transform: translateY(-10px);
  box-shadow: 0 15px 30px rgba(0, 0, 0, 0.1) !important;
}
.text-truncate-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
