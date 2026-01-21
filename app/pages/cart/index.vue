<script setup>
const { getCart, updateCartItem, removeCartItem, clearCart } = useCart();
const cartStore = useCartStore();
const authStore = useAuthStore();
const uiStore = useUiStore();

definePageMeta({
  middleware: "auth",
});

const loading = ref(false);
const error = ref(null);


const loadCart = async () => {
  loading.value = true;
  error.value = null;

  try {
    await getCart();
  } catch (err) {
    error.value = err.data?.message || "Ошибка загрузки корзины";
  } finally {
    loading.value = false;
  }
};


const updateQuantity = async (itemId, newQuantity) => {
  if (newQuantity < 1) {
    await removeItem(itemId);
    return;
  }

  try {
    await updateCartItem(itemId, newQuantity);
  } catch (err) {
    uiStore.error(err.data?.message || "Ошибка обновления корзины");
  }
};


const removeItem = async (itemId) => {
  const confirmed = await uiStore.showConfirm(
    "Удаление товара",
    "Вы уверены, что хотите удалить этот товар из корзины?"
  );
  if (!confirmed) return;

  try {
    await removeCartItem(itemId);
    uiStore.success("Товар удален из корзины");
  } catch (err) {
    uiStore.error(err.data?.message || "Ошибка удаления товара");
  }
};


const handleClearCart = async () => {
  const confirmed = await uiStore.showConfirm(
    "Очистка корзины",
    "Вы уверены, что хотите полностью очистить корзину?"
  );
  if (!confirmed) return;

  try {
    await clearCart();
    uiStore.success("Корзина очищена");
  } catch (err) {
    uiStore.error(err.data?.message || "Ошибка очистки корзины");
  }
};


const formatPrice = (price) => {
  return parseFloat(price).toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const couponCode = ref("");
const applyingCoupon = ref(false);
const api = useApi();

const discountAmount = computed(() => cartStore.discount);
const appliedCoupon = computed(() => cartStore.appliedCoupon);

const applyCoupon = async () => {
  if (!couponCode.value) return;
  applyingCoupon.value = true;
  try {
    const res = await api.apiFetch("/coupons/validate", {
      method: "POST",
      body: {
        code: couponCode.value,
        amount: cartStore.total,
      },
    });

    if (res.valid) {
      let discount = 0;
      if (res.type === "percent") {
        discount = (cartStore.total * res.value) / 100;
      } else {
        discount = res.value;
      }
      cartStore.setDiscount(discount, res.code);
      uiStore.addToast("Купон успешно применен!", "success");
    }
  } catch (e) {
    uiStore.addToast(e.data?.message || "Ошибка применения купона", "danger");
    cartStore.setDiscount(0, null);
  } finally {
    applyingCoupon.value = false;
  }
};

onMounted(() => {
  loadCart();
});
</script>

<template>
  <div class="cart-page">
    <div class="container py-5">
      <h2 class="mb-4">Корзина</h2>

      
      <div v-if="error" class="alert alert-danger" role="alert">
        {{ error }}
      </div>

      
      <div v-if="loading" class="text-center py-5">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Загрузка...</span>
        </div>
      </div>

      
      <div
        v-else-if="!cartStore.cart || cartStore.isEmpty"
        class="text-center py-5"
      >
        <i class="bi bi-cart-x fs-1 text-muted mb-3"></i>
        <h4 class="mb-3">Корзина пуста</h4>
        <p class="text-muted mb-4">
          Добавьте товары в корзину, чтобы продолжить покупки
        </p>
        <NuxtLink to="/catalog" class="btn btn-primary">
          Перейти в каталог
        </NuxtLink>
      </div>

      
      <div v-else class="row">
        <div class="col-lg-8">
          <div class="card shadow-sm border-0 mb-4">
            <div
              class="card-header bg-white d-flex justify-content-between align-items-center"
            >
              <h5 class="mb-0">Товары в корзине</h5>
              <button
                class="btn btn-sm btn-outline-danger"
                @click="handleClearCart"
              >
                <i class="bi bi-trash"></i> Очистить корзину
              </button>
            </div>
            <div class="card-body p-4 bg-light-subtle">
              <CartItem
                v-for="item in cartStore.getItems"
                :key="item.id"
                :item="item"
                @update-quantity="updateQuantity"
                @remove="removeItem"
              />
            </div>
          </div>

          
          <div class="card shadow-sm border-0 mb-4 rounded-4">
            <div class="card-body p-4">
              <h6 class="fw-bold mb-3 d-flex align-items-center">
                <i class="bi bi-tag-fill text-primary me-2"></i> Промокод
              </h6>
              <div class="input-group">
                <input
                  v-model="couponCode"
                  type="text"
                  class="form-control rounded-start-pill ps-4"
                  placeholder="Введите код купона"
                  :disabled="appliedCoupon || applyingCoupon"
                />
                <button
                  class="btn btn-dark rounded-end-pill px-4"
                  @click="applyCoupon"
                  :disabled="!couponCode || appliedCoupon || applyingCoupon"
                >
                  <span
                    v-if="applyingCoupon"
                    class="spinner-border spinner-border-sm"
                  ></span>
                  <span v-else>Применить</span>
                </button>
              </div>
              <div class="form-text small mt-2 ms-2">
                Если у вас есть купон на скидку, примените его здесь.
              </div>
            </div>
          </div>
        </div>

        
        <div class="col-lg-4">
          <div
            class="card shadow-sm border-0 sticky-top"
            style="top: 100px; z-index: 10; border-radius: 20px"
          >
            <div
              class="card-header bg-primary text-white py-3"
              style="border-radius: 20px 20px 0 0"
            >
              <h5 class="mb-0 fw-bold">Детали заказа</h5>
            </div>
            <div class="card-body p-4">
              <div class="d-flex justify-content-between mb-3 text-muted">
                <span>Количество:</span>
                <span class="fw-bold text-dark"
                  >{{ cartStore.itemsCount }} шт.</span
                >
              </div>
              <div class="d-flex justify-content-between mb-3 text-muted">
                <span>Промежуточный итог:</span>
                <span class="fw-bold text-dark"
                  >{{ formatPrice(cartStore.total) }} сом</span
                >
              </div>
              <div
                v-if="discountAmount > 0"
                class="d-flex justify-content-between mb-3 text-success"
              >
                <span>Скидка ({{ appliedCoupon }}):</span>
                <span class="fw-bold"
                  >-{{ formatPrice(discountAmount) }} сом</span
                >
              </div>
              <div class="d-flex justify-content-between mb-4 text-muted">
                <span>Доставка:</span>
                <span class="text-primary fw-bold">Договорная</span>
              </div>

              <hr class="my-4" />

              <div
                class="d-flex justify-content-between align-items-center mb-4"
              >
                <span class="h5 mb-0 fw-bold">Итого:</span>
                <div class="text-end">
                  <div class="h3 mb-0 fw-bolder text-primary">
                    {{
                      formatPrice(
                        cartStore.total - discountAmount > 0
                          ? cartStore.total - discountAmount
                          : 0
                      )
                    }}
                    сом
                  </div>
                </div>
              </div>

              <div class="d-grid gap-2">
                <NuxtLink
                  to="/checkout"
                  class="btn btn-primary btn-lg py-3 fw-bold shadow-sm checkout-btn"
                  :disabled="cartStore.isEmpty"
                >
                  Оформить заказ <i class="bi bi-arrow-right ms-2"></i>
                </NuxtLink>
                <NuxtLink
                  to="/catalog"
                  class="btn btn-link text-decoration-none text-muted mt-2 btn-sm"
                >
                  <i class="bi bi-arrow-left me-1"></i> Продолжить покупки
                </NuxtLink>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cart-item:last-child {
  border-bottom: none !important;
}

.checkout-btn {
  border-radius: 12px;
  transition: all 0.3s ease;
}

.checkout-btn:hover:not(:disabled) {
  transform: scale(1.02);
  box-shadow: 0 10px 20px rgba(56, 189, 248, 0.4) !important;
}
</style>
