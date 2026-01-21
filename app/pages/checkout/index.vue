<script setup>
const { getCart } = useCart();
const { createOrder } = useOrders();
const { getAddresses, createAddress } = useAddresses();
const { settings, fetchPublicSettings } = useSettings(); 
const cartStore = useCartStore();

definePageMeta({
  middleware: "auth",
});

const loading = ref(false);
const submitting = ref(false);
const error = ref(null);


const shippingAddress = ref({
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  country: "Кыргызстан",
  city: "Ош",
  state: "",
  postal_code: "",
  address_line_1: "",
  address_line_2: "",
  is_default: true,
});

const showTermsModal = ref(false);
const paymentMethod = ref("cash"); 
const notes = ref("");


const mbankQrImage = computed(
  () => settings.value?.payment_mbank_qr_image || ""
);

const mbankUrl = computed(() => {
  
  return settings.value?.payment_mbank_url || "https://mbank.kg/";
});


const getImageUrl = (url) => {
  if (!url) return "https://placehold.co/400x400?text=No+Image";
  if (url.startsWith("http")) return url;
  const config = useRuntimeConfig();
  const baseUrl = config.public.apiBase.replace(/\/api$/, "");

  
  let path = url;
  if (!path.startsWith("/storage") && !path.startsWith("storage")) {
    path = "storage/" + (path.startsWith("/") ? path.substring(1) : path);
  }

  return `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
};


const loadData = async () => {
  loading.value = true;
  error.value = null;

  try {
    await getCart();
    if (cartStore.isEmpty) {
      await navigateTo("/cart");
      return;
    }

    
    try {
      const addresses = await getAddresses({ type: "shipping" });
      if (addresses.length > 0) {
        const defaultAddress =
          addresses.find((a) => a.is_default) || addresses[0];
        Object.assign(shippingAddress.value, defaultAddress);
      }
    } catch (err) {
      
    }
  } catch (err) {
    error.value = err.data?.message || "Ошибка загрузки данных";
  } finally {
    loading.value = false;
  }
};


const handleSubmit = async () => {
  submitting.value = true;
  error.value = null;

  try {
    const orderData = {
      shipping_address: shippingAddress.value,
      payment_method: paymentMethod.value,
      notes: notes.value,
    };

    const order = await createOrder(orderData);

    
    cartStore.clearCart();

    
    await navigateTo(`/profile/orders/${order.id}`);
  } catch (err) {
    if (err.data?.errors) {
      error.value = Object.values(err.data.errors).flat().join(", ");
    } else {
      error.value = err.data?.message || "Ошибка оформления заказа";
    }
  } finally {
    submitting.value = false;
  }
};


const formatPrice = (price) => {
  return parseFloat(price).toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

onMounted(() => {
  loadData();
  fetchPublicSettings();
});
</script>

<template>
  <div class="checkout-page bg-light min-vh-100 py-5">
    <div class="container">
      
      <nav aria-label="breadcrumb" class="mb-4">
        <ol class="breadcrumb">
          <li class="breadcrumb-item"><NuxtLink to="/">Главная</NuxtLink></li>
          <li class="breadcrumb-item">
            <NuxtLink to="/cart">Корзина</NuxtLink>
          </li>
          <li class="breadcrumb-item active">Оформление заказа</li>
        </ol>
      </nav>

      <div class="row g-4">
        
        <div class="col-lg-8">
          <div class="card border-0 shadow-sm rounded-4 overflow-hidden mb-4">
            <div class="card-body p-4 p-md-5">
              <div class="d-flex align-items-center mb-4">
                <div class="step-badge me-3">1</div>
                <h3 class="mb-0 fw-bold">Контактная информация</h3>
              </div>

              <form @submit.prevent="handleSubmit">
                <div class="row g-3 mb-4">
                  <div class="col-md-6">
                    <label class="form-label fw-medium">Имя *</label>
                    <input
                      v-model="shippingAddress.first_name"
                      type="text"
                      class="form-control form-control-lg rounded-3"
                      required
                      placeholder="Асан"
                    />
                  </div>
                  <div class="col-md-6">
                    <label class="form-label fw-medium">Фамилия *</label>
                    <input
                      v-model="shippingAddress.last_name"
                      type="text"
                      class="form-control form-control-lg rounded-3"
                      required
                      placeholder="Үсөнов"
                    />
                  </div>
                  <div class="col-md-6">
                    <label class="form-label fw-medium">Телефон *</label>
                    <input
                      v-model="shippingAddress.phone"
                      type="tel"
                      class="form-control form-control-lg rounded-3"
                      required
                      placeholder="+996 (___) __-__-__"
                    />
                  </div>
                  <div class="col-md-6">
                    <label class="form-label fw-medium">Email</label>
                    <input
                      v-model="shippingAddress.email"
                      type="email"
                      class="form-control form-control-lg rounded-3"
                      placeholder="example@mail.com"
                    />
                  </div>
                </div>

                <div class="d-flex align-items-center mb-4 pt-3 border-top">
                  <div class="step-badge me-3">2</div>
                  <h3 class="mb-0 fw-bold">Адрес доставки</h3>
                </div>

                <div class="row g-3 mb-4">
                  <div class="col-12">
                    <label class="form-label fw-medium">Страна *</label>
                    <select
                      v-model="shippingAddress.country"
                      class="form-select form-select-lg rounded-3"
                      required
                    >
                      <option value="Кыргызстан">Кыргызстан</option>
                      <option value="Казахстан">Казахстан</option>
                      <option value="Россия">Россия</option>
                    </select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label fw-medium">Город *</label>
                    <input
                      v-model="shippingAddress.city"
                      type="text"
                      class="form-control form-control-lg rounded-3"
                      required
                      placeholder="Ош"
                    />
                  </div>
                  <div class="col-md-6">
                    <label class="form-label fw-medium">Почтовый индекс</label>
                    <input
                      v-model="shippingAddress.postal_code"
                      type="text"
                      class="form-control form-control-lg rounded-3"
                      placeholder="720000"
                    />
                  </div>
                  <div class="col-12">
                    <label class="form-label fw-medium"
                      >Адрес (улица, дом, квартира) *</label
                    >
                    <input
                      v-model="shippingAddress.address_line_1"
                      type="text"
                      class="form-control form-control-lg rounded-3"
                      required
                      placeholder="ул. Чуй, д. 1, кв. 10"
                    />
                  </div>
                  <div class="col-12">
                    <label class="form-label fw-medium"
                      >Дополнительная информация (ориентиры)</label
                    >
                    <input
                      v-model="shippingAddress.address_line_2"
                      type="text"
                      class="form-control form-control-lg rounded-3"
                      placeholder="Вход со двора..."
                    />
                  </div>
                </div>

                <div class="d-flex align-items-center mb-4 pt-3 border-top">
                  <div class="step-badge me-3">3</div>
                  <h3 class="mb-0 fw-bold">Способ оплаты</h3>
                </div>

                <div class="col-12">
                  <div
                    class="payment-option p-4 border rounded-4 cursor-pointer transition-all border-primary bg-primary-subtle"
                    @click="paymentMethod = 'cash'"
                  >
                    <div class="d-flex align-items-center">
                      <div
                        class="payment-icon bg-white p-3 rounded-3 shadow-sm me-4 text-primary"
                      >
                        <i class="bi bi-truck fs-3"></i>
                      </div>
                      <div>
                        <div class="fw-bold fs-5">Оплата при получении</div>
                        <small class="text-muted d-block opacity-75"
                          >Наличными или переводом.
                          <span
                            class="text-danger fw-bold d-block mt-1"
                            style="font-size: 0.75rem"
                            >При отказе оплачивается доставка и разгрузка.</span
                          ></small
                        >
                      </div>
                    </div>
                  </div>
                </div>

                

                <div class="d-flex align-items-center mb-4 pt-3 border-top">
                  <div class="step-badge me-3">4</div>
                  <h3 class="mb-0 fw-bold">Комментарий</h3>
                </div>

                <div class="mb-4">
                  <textarea
                    v-model="notes"
                    class="form-control rounded-3"
                    rows="3"
                    placeholder="Особые пожелания по доставке или заказу..."
                  ></textarea>
                </div>

                <div
                  class="alert alert-info border-0 rounded-4 p-3 d-flex align-items-center"
                >
                  <i class="bi bi-info-circle-fill fs-4 me-3"></i>
                  <div class="small">
                    Нажимая кнопку "Оформить заказ", вы соглашаетесь с
                    <a
                      href="#"
                      class="fw-bold text-decoration-none"
                      @click.prevent="showTermsModal = true"
                      >условиями оферты и политикой конфиденциальности.</a
                    >
                  </div>
                </div>

                <div class="d-flex flex-column flex-md-row gap-3 mt-5">
                  <NuxtLink
                    to="/cart"
                    class="btn btn-link text-decoration-none text-muted fw-bold px-0"
                  >
                    <i class="bi bi-arrow-left me-2"></i> Вернуться в корзину
                  </NuxtLink>
                  <button
                    type="submit"
                    class="btn btn-primary btn-lg rounded-pill px-5 ms-md-auto shadow-lg"
                    :disabled="submitting"
                  >
                    <span
                      v-if="submitting"
                      class="spinner-border spinner-border-sm me-2"
                    ></span>
                    {{ submitting ? "Оформление..." : "Оформить заказ" }}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        
        <div class="col-lg-4">
          <div
            class="card border-0 shadow-sm rounded-4 sticky-top"
            style="top: 2rem; z-index: 10"
          >
            <div class="card-body p-4">
              <h4 class="fw-bold mb-4">Итог заказа</h4>

              <div
                class="order-items-scroll mb-4 pe-2"
                style="max-height: 300px; overflow-y: auto"
              >
                <div
                  v-for="item in cartStore.getItems"
                  :key="item.id"
                  class="d-flex align-items-center mb-3 p-2 pt-3 rounded-3 hover-light transition-all"
                >
                  <div class="position-relative flex-shrink-0">
                    <img
                      :src="getImageUrl(item.product.image_url)"
                      class="rounded-3 shadow-sm border border-light"
                      style="width: 64px; height: 64px; object-fit: cover"
                    />
                    <span
                      class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-primary border-2 border-white shadow-sm"
                      style="
                        font-size: 0.7rem;
                        min-width: 22px;
                        height: 22px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                      "
                    >
                      {{ item.quantity }}
                    </span>
                  </div>
                  <div class="ms-3 flex-grow-1 overflow-hidden">
                    <h6
                      class="mb-1 text-truncate fw-bold"
                      style="font-size: 0.85rem"
                    >
                      {{ item.product.name }}
                    </h6>
                    <div class="text-muted small">
                      {{ formatPrice(item.price) }} сом
                    </div>
                  </div>
                  <div
                    class="ms-2 fw-bold text-nowrap"
                    style="font-size: 0.9rem"
                  >
                    {{ formatPrice(item.price * item.quantity) }}
                  </div>
                </div>
              </div>

              <div class="summary-details bg-light rounded-4 p-3 mb-4">
                <div class="d-flex justify-content-between mb-2">
                  <span class="text-muted text-uppercase small ls-1"
                    >Стоимость</span
                  >
                  <span class="fw-bold"
                    >{{ formatPrice(cartStore.total) }} сом</span
                  >
                </div>
                <div class="d-flex justify-content-between mb-2">
                  <span class="text-muted text-uppercase small ls-1"
                    >Доставка</span
                  >
                  <span class="text-success fw-bold small">Договорная</span>
                </div>
                <div
                  v-if="cartStore.discount > 0"
                  class="d-flex justify-content-between mb-2 text-danger"
                >
                  <span class="text-uppercase small ls-1">Скидка</span>
                  <span class="fw-bold"
                    >-{{ formatPrice(cartStore.discount) }} сом</span
                  >
                </div>
                <hr class="my-3 opacity-10" />
                <div class="d-flex justify-content-between align-items-end">
                  <span class="h5 mb-0 fw-bold">Итого</span>
                  <div class="text-end">
                    <div class="h3 mb-0 fw-black text-primary">
                      {{ formatPrice(cartStore.total) }} сом
                    </div>
                    
                  </div>
                </div>
              </div>

              <div class="payment-methods text-center">
                <p class="text-muted small mb-3">Безопасные способы оплаты</p>
                <div
                  class="d-flex justify-content-center gap-3 opacity-50 grayscale"
                >
                  <i class="bi bi-credit-card-2-front fs-3"></i>
                  <i class="bi bi-wallet2 fs-3"></i>
                  <i class="bi bi-cash fs-3"></i>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    
    <UiBaseModal
      v-if="showTermsModal"
      :show="showTermsModal"
      title="Условия оферты и Политика конфиденциальности"
      @close="showTermsModal = false"
    >
      <div class="p-3">
        <p class="mb-3">Я обязуюсь оплатить всю сумму товара.</p>
        <p class="mb-3">
          При закупке товара в долг, необходимо сообщить об этом заранее.
        </p>
        <p class="mb-0 fw-bold text-danger">
          При отказе от товара клиент должен оплатить услуги доставки и
          разгрузки.
        </p>
      </div>
      <template #footer>
        <button class="btn btn-primary" @click="showTermsModal = false">
          Понятно
        </button>
      </template>
    </UiBaseModal>
  </div>
</template>

<style scoped>
.checkout-page {
  font-family: "Inter", sans-serif;
  color: #1e293b;
}

.step-badge {
  width: 32px;
  height: 32px;
  background: #3b82f6;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.9rem;
}

.form-label {
  font-size: 0.9rem;
  color: #64748b;
  margin-bottom: 0.5rem;
}

.form-control,
.form-select {
  border: 1.5px solid #e2e8f0;
  padding: 0.75rem 1rem;
  font-size: 1rem;
  transition: all 0.2s ease;
}

.form-control:focus,
.form-select:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
  background: #fff;
}

.ls-1 {
  letter-spacing: 0.05em;
}

.fw-black {
  font-weight: 900;
}

.order-items-scroll::-webkit-scrollbar {
  width: 4px;
}

.order-items-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.order-items-scroll::-webkit-scrollbar-thumb {
  background: #e2e8f0;
  border-radius: 10px;
}

.grayscale {
  filter: grayscale(1);
}

.breadcrumb-item a {
  color: #64748b;
  text-decoration: none;
  font-size: 0.9rem;
}

.breadcrumb-item.active {
  color: #1e293b;
  font-weight: 600;
}

@media (max-width: 991px) {
  .sticky-top {
    position: static !important;
  }
}

.cursor-pointer {
  cursor: pointer;
}

.transition-all {
  transition: all 0.2s ease-in-out;
}

.payment-option:hover {
  border-color: #3b82f6;
  background-color: var(--bs-light);
}

.border-dashed {
  border: 2px dashed #e2e8f0;
}

.hover-light:hover {
  background-color: rgba(248, 250, 252, 1);
}

.animate-fade-in {
  animation: fadeIn 0.3s ease-in-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
