<script setup>
const route = useRoute();
const { getPost } = useBlog();
const config = useRuntimeConfig();
const { setSeo, setBreadcrumbs } = useSeo();

const post = ref(null);
const loading = ref(true);

onMounted(async () => {
  try {
    post.value = await getPost(route.params.slug);

    
    if (post.value) {
      setSeo({
        title: post.value.title,
        description:
          post.value.excerpt || post.value.content?.substring(0, 160),
        keywords: `блог, ${post.value.title}, новости`,
        image: post.value.image_url,
        type: "article",
        author: post.value.author?.name,
        publishedTime: post.value.created_at,
        modifiedTime: post.value.updated_at,
      });

      
      setBreadcrumbs([
        { name: "Главная", url: "/" },
        { name: "Блог", url: "/blog" },
        { name: post.value.title, url: `/blog/${post.value.slug}` },
      ]);
    }
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="container py-5 min-vh-100">
    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border text-primary" role="status"></div>
    </div>

    <div v-else-if="post" class="row justify-content-center">
      <article class="col-lg-8">
        <nav aria-label="breadcrumb" class="mb-4">
          <ol class="breadcrumb">
            <li class="breadcrumb-item"><NuxtLink to="/">Главная</NuxtLink></li>
            <li class="breadcrumb-item">
              <NuxtLink to="/blog">Блог</NuxtLink>
            </li>
            <li
              class="breadcrumb-item active text-truncate"
              aria-current="page"
            >
              {{ post.title }}
            </li>
          </ol>
        </nav>

        <h1 class="fw-bold display-5 mb-3">{{ post.title }}</h1>

        <div class="d-flex align-items-center mb-5 pb-3 border-bottom">
          <div
            class="avatar-sm bg-primary bg-opacity-10 text-primary rounded-circle d-flex align-items-center justify-content-center me-3"
            style="width: 40px; height: 40px"
          >
            <i class="bi bi-person"></i>
          </div>
          <div>
            <div class="fw-bold small">{{ post.author?.name }}</div>
            <div class="text-muted" style="font-size: 0.75rem">
              {{ new Date(post.created_at).toLocaleDateString() }}
            </div>
          </div>
        </div>

        <div
          v-if="post.image_url"
          class="mb-5 rounded-4 overflow-hidden shadow-sm"
        >
          <img :src="post.image_url" class="w-100 h-auto" />
        </div>

        <div class="post-content lh-lg fs-5 mb-5" v-html="post.content"></div>

        <div class="bg-light p-4 rounded-4 mb-5">
          <div class="d-flex align-items-center justify-content-between">
            <div class="fw-bold">Поделиться записью:</div>
            <div class="d-flex gap-3">
              <a href="#" class="btn btn-outline-dark rounded-circle btn-sm"
                ><i class="bi bi-facebook"></i
              ></a>
              <a href="#" class="btn btn-outline-dark rounded-circle btn-sm"
                ><i class="bi bi-instagram"></i
              ></a>
              <a href="#" class="btn btn-outline-dark rounded-circle btn-sm"
                ><i class="bi bi-telegram"></i
              ></a>
            </div>
          </div>
        </div>
      </article>
    </div>

    <div v-else class="text-center py-5">
      <h2>Статья не найдена</h2>
      <NuxtLink to="/blog" class="btn btn-primary mt-3"
        >Вернуться в блог</NuxtLink
      >
    </div>
  </div>
</template>

<style>
.post-content p {
  margin-bottom: 1.5rem;
}
.post-content img {
  max-width: 100%;
  height: auto;
  border-radius: 12px;
  margin: 2rem 0;
}
</style>
