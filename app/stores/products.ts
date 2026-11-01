import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { useApi } from "~/composables/useApi";

export const HOME_PAGE_SIZE = 40;

export const useProductsStore = defineStore("products", () => {
  const products = ref<any[]>([]);
  const categories = ref<any[]>([]);
  const lastProductsFetch = ref<number | null>(null);
  const lastCategoriesFetch = ref<number | null>(null);
  const cacheTimeout = 5 * 60 * 1000; 

  
  let _fetchingProducts: Promise<any> | null = null;
  let _fetchingCategories: Promise<any> | null = null;

  const areProductsFresh = computed(() => {
    if (!lastProductsFetch.value) return false;
    return Date.now() - lastProductsFetch.value < cacheTimeout;
  });

  const areCategoriesFresh = computed(() => {
    if (!lastCategoriesFetch.value) return false;
    return Date.now() - lastCategoriesFetch.value < cacheTimeout;
  });

  async function fetchProducts(params: any = {}, force = false) {
    if (!force && areProductsFresh.value && products.value.length > 0 && Object.keys(params).length === 0) {
      return products.value;
    }

    try {
      const api = useApi();
      // Без параметров — это витрина главной: популярные (в наличии, по
      // продажам), сразу 40 штук, чтобы «Показать ещё» раскрыл их без запроса
      const query = Object.keys(params).length === 0
        ? { sort_by: "popular", per_page: HOME_PAGE_SIZE }
        : params;
      const isHome = Object.keys(params).length === 0;
      const toList = (res: any) => (Array.isArray(res) ? res : res?.data || []);
      // SWR отдаёт витрину из кэша (до суток), а свежий ответ приходит фоном —
      // без onRefresh покупатель видел старые цены до следующего захода
      const response: any = await api.apiFetch("/products", {
        params: query,
        ...(isHome && {
          onRefresh: (fresh: any) => {
            products.value = toList(fresh);
            lastProductsFetch.value = Date.now();
          },
        }),
      });

      if (isHome) {
        products.value = toList(response);
        lastProductsFetch.value = Date.now();
      }
      
      return response; // Возвращаем полный ответ для пагинации
    } catch (error) {
      console.error("Ошибка загрузки продуктов:", error);
      throw error;
    }
  }

  async function fetchCategories(force = false) {
    if (!force && areCategoriesFresh.value && categories.value.length > 0) {
      return categories.value;
    }

    if (_fetchingCategories) return _fetchingCategories;

    _fetchingCategories = (async () => {
      try {
        const api = useApi();
        const response: any = await api.apiFetch("/categories");

        categories.value = Array.isArray(response)
          ? response
          : response?.data || [];

        lastCategoriesFetch.value = Date.now();
        return categories.value;
      } catch (error) {
        lastCategoriesFetch.value = null;
        console.error("Ошибка загрузки категорий:", error);
        throw error;
      } finally {
        _fetchingCategories = null;
      }
    })();

    return _fetchingCategories;
  }

  function invalidateProducts() {
    lastProductsFetch.value = null;
  }

  function invalidateCategories() {
    lastCategoriesFetch.value = null;
  }

  function clearCache() {
    products.value = [];
    categories.value = [];
    lastProductsFetch.value = null;
    lastCategoriesFetch.value = null;
  }

  return {
    products,
    categories,
    lastProductsFetch,
    lastCategoriesFetch,
    fetchProducts,
    fetchCategories,
    invalidateProducts,
    invalidateCategories,
    clearCache,
    areProductsFresh,
    areCategoriesFresh,
  };
});
