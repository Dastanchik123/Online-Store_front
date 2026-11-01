<script setup>
const props = defineProps({
  show: Boolean,
});
const emit = defineEmits(["close"]);

const router = useRouter();
const { recognizeProductPhoto } = useProducts();
const { getImageUrl } = useImageUrl();

const fileInput = ref(null);
const previewUrl = ref("");
const isLoading = ref(false);
const errorMessage = ref("");
const items = ref([]);
const similarProducts = ref([]);

const reset = () => {
  previewUrl.value = "";
  errorMessage.value = "";
  items.value = [];
  similarProducts.value = [];
  isLoading.value = false;
};

// Снимок с телефона весит 3–8 МБ, а для сравнения картинок хватает
// 1024px — ужимаем в браузере, на мобильном интернете это в разы быстрее
const MAX_SIDE = 1024;
const compressPhoto = async (file) => {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob && blob.size < file.size ? new File([blob], "photo.jpg", { type: "image/jpeg" }) : file;
  } catch {
    // Старый браузер или формат, который не читается (например HEIC) — шлём как есть
    return file;
  }
};

const close = () => {
  reset();
  emit("close");
};

const openFilePicker = () => {
  fileInput.value?.click();
};

const onFileSelected = async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  errorMessage.value = "";
  items.value = [];
  similarProducts.value = [];
  previewUrl.value = URL.createObjectURL(file);
  isLoading.value = true;

  try {
    const res = await recognizeProductPhoto(await compressPhoto(file));
    similarProducts.value = res?.similar_products || [];
    items.value = res?.items || [];
    if (similarProducts.value.length === 0 && items.value.length === 0) {
      errorMessage.value =
        res?.error ||
        "Похожих товаров не нашли. Сфотографируйте товар крупнее, на однотонном фоне, или найдите его по названию.";
    }
  } catch (e) {
    console.error("Photo recognition failed", e);
    errorMessage.value = "Не удалось отправить фото. Проверьте соединение и попробуйте снова.";
  } finally {
    isLoading.value = false;
    event.target.value = "";
  }
};

const getProductImage = (product) => {
  if (product.image) return getImageUrl(product.image);
  return "https://via.placeholder.com/120x120/0f172a/38bdf8?text=Товар";
};

const goToProduct = (product) => {
  close();
  router.push(`/product/${product.id}`);
};

// Если по фото не нашлось карточек товара напрямую — переходим в каталог
// с лучшей поисковой фразой от ИИ, это даёт триграммный fallback-поиск
const searchByQuery = (query) => {
  close();
  router.push({ path: "/catalog", query: { search: query } });
};
</script>

<template>
  <UiBaseModal :show="show" title="Поиск по фото" size="lg" @close="close">
    <div class="photo-search">
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        capture="environment"
        class="d-none"
        @change="onFileSelected"
      />

      <div v-if="!previewUrl" class="upload-zone" @click="openFilePicker">
        <i class="bi bi-camera fs-1 text-primary"></i>
        <p class="fw-medium mb-1 mt-2">Сфотографируйте товар</p>
        <p class="text-muted small mb-0">
          Нажмите, чтобы сделать фото или выбрать из галереи
        </p>
      </div>

      <div v-else class="preview-block">
        <img :src="previewUrl" alt="Фото товара" class="preview-image" />

        <div v-if="isLoading" class="text-center py-4">
          <div class="spinner-border text-primary mb-2" role="status"></div>
          <p class="text-muted small mb-0">Ищем похожие товары…</p>
          <p class="text-muted small mb-0">Первый поиск может занять до минуты</p>
        </div>

        <template v-else>
          <div v-if="errorMessage" class="alert alert-warning small mt-3 mb-0">
            {{ errorMessage }}
          </div>

          <div v-if="similarProducts.length" class="mt-3">
            <h6 class="fw-bold mb-2">Похожие товары</h6>
            <div
              v-for="product in similarProducts"
              :key="product.id"
              class="matched-product d-flex align-items-center gap-3 p-2 border rounded mb-2 cursor-pointer"
              @click="goToProduct(product)"
            >
              <img :src="getProductImage(product)" class="matched-thumb" alt="" />
              <div class="flex-grow-1 overflow-hidden">
                <div class="fw-medium text-truncate">{{ product.name }}</div>
                <div class="text-muted small">
                  {{ product.sale_price || product.price }} сом
                  <span v-if="product.category?.name"> · {{ product.category.name }}</span>
                </div>
              </div>
              <i class="bi bi-chevron-right text-muted"></i>
            </div>
          </div>

          <div v-for="(item, idx) in items" :key="idx" class="recognized-item mt-3">
            <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
              <span v-if="item.category" class="badge bg-light text-dark border">
                {{ item.category }}
              </span>
              <span v-if="item.brand || item.brand_raw" class="badge bg-light text-dark border">
                {{ item.brand || item.brand_raw }}
              </span>
              <span v-if="item.color" class="badge bg-light text-dark border">
                {{ item.color }}
              </span>
            </div>

            <div v-if="item.matched_products?.length" class="matched-products">
              <div
                v-for="product in item.matched_products"
                :key="product.id"
                class="matched-product d-flex align-items-center gap-3 p-2 border rounded mb-2 cursor-pointer"
                @click="goToProduct(product)"
              >
                <img :src="getProductImage(product)" class="matched-thumb" alt="" />
                <div class="flex-grow-1 overflow-hidden">
                  <div class="fw-medium text-truncate">{{ product.name }}</div>
                  <div class="text-muted small">{{ product.price }} сом</div>
                </div>
                <i class="bi bi-chevron-right text-muted"></i>
              </div>
            </div>

            <div v-else-if="item.search_queries?.length" class="d-flex flex-wrap gap-2">
              <button
                v-for="(query, qIdx) in item.search_queries"
                :key="qIdx"
                class="btn btn-sm btn-outline-primary"
                @click="searchByQuery(query)"
              >
                {{ query }}
              </button>
            </div>
          </div>

          <button class="btn btn-light w-100 mt-3" @click="reset">
            <i class="bi bi-arrow-repeat me-1"></i>Попробовать другое фото
          </button>
        </template>
      </div>
    </div>
  </UiBaseModal>
</template>

<style scoped>
.upload-zone {
  border: 2px dashed var(--bs-primary, #0d6efd);
  border-radius: 12px;
  padding: 3rem 1.5rem;
  text-align: center;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.upload-zone:hover {
  background-color: rgba(13, 110, 253, 0.05);
}

.preview-image {
  width: 100%;
  max-height: 260px;
  object-fit: contain;
  border-radius: 8px;
  background: #f8f9fa;
}

.matched-thumb {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 6px;
  flex-shrink: 0;
}

.matched-product:hover {
  background-color: #f8f9fa;
}
</style>
