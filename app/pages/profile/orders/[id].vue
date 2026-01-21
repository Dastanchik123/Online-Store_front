<script setup>
const route = useRoute();
const { getOrder, cancelOrder, downloadOrderInvoice } = useOrders();
const { createPayment, getPayments } = usePayments();
const { settings, fetchPublicSettings } = useSettings();
const uiStore = useUiStore();

definePageMeta({
  
});

const order = ref(null);
const payments = ref([]);
const loading = ref(false);
const error = ref(null);
const paymentLoading = ref(false);

const mbankQrImage = computed(
  () => settings.value?.payment_mbank_qr_image || ""
);


const getImageUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  const config = useRuntimeConfig();
  const baseUrl = config.public.apiBase.replace(/\/api$/, "");
  let path = url;
  if (!path.startsWith("/storage") && !path.startsWith("storage")) {
    path = "storage/" + (path.startsWith("/") ? path.substring(1) : path);
  }
  return `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
};


const loadOrder = async () => {
  loading.value = true;
  error.value = null;

  try {
    order.value = await getOrder(route.params.id);

    
    if (order.value) {
      try {
        const paymentsData = await getPayments({ order_id: order.value.id });
        payments.value = paymentsData.data || paymentsData || [];
      } catch (err) {
        
        console.error("Error loading payments:", err);
      }
    }
  } catch (err) {
    error.value = err.data?.message || "Ошибка загрузки заказа";
  } finally {
    loading.value = false;
  }
};


const handleCreatePayment = async () => {
  if (!order.value) return;

  
  const method = order.value.payment_method || "cash";

  paymentLoading.value = true;

  try {
    const payment = await createPayment({
      order_id: order.value.id,
      payment_method: method,
      amount: order.value.total,
      currency: order.value.currency || "KGS",
    });

    uiStore.success("Платеж успешно создан!");
    await loadOrder(); 
  } catch (err) {
    uiStore.error(err.data?.message || "Ошибка создания платежа");
  } finally {
    paymentLoading.value = false;
  }
};


const handleCancelOrder = async () => {
  const confirmed = await uiStore.showConfirm(
    "Отмена заказа",
    "Вы уверены, что хотите отменить заказ?"
  );

  if (!confirmed) return;

  try {
    await cancelOrder(route.params.id);
    uiStore.success("Заказ отменен");
    await loadOrder();
  } catch (err) {
    uiStore.error(err.data?.message || "Ошибка отмены заказа");
  }
};


const formatPrice = (price) => {
  return parseFloat(price).toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};


const getStatusBadge = (status) => {
  const badges = {
    pending: "warning",
    processing: "info",
    shipped: "primary",
    delivered: "success",
    cancelled: "danger",
    refunded: "secondary",
  };
  return badges[status] || "secondary";
};

const translateStatus = (status) => {
  const translations = {
    pending: "Ожидает",
    processing: "В обработке",
    shipped: "Отправлен",
    delivered: "Доставлен",
    cancelled: "Отменен",
    refunded: "Возвращен",
  };
  return translations[status] || status;
};

const translatePaymentStatus = (status) => {
  const translations = {
    pending: "Ожидает",
    completed: "Завершен",
    failed: "Ошибка",
    refunded: "Возвращен",
  };
  return translations[status] || status;
};

const translatePaymentMethod = (method) => {
  const translations = {
    mbank: "MBank",
    transfer: "Перевод",
    cash: "Оплата при получении",
    card: "Картой",
    qr: "QR-код",
  };
  return translations[method] || method;
};

onMounted(() => {
  loadOrder();
  fetchPublicSettings();
});
</script>

<template>
  <div class="order-detail-page">
    <div class="container py-5">
      <div class="mb-4">
        <NuxtLink to="/profile/orders" class="btn btn-outline-secondary mb-3">
          <i class="bi bi-arrow-left"></i> Назад к заказам
        </NuxtLink>
      </div>

      
      <div v-if="loading" class="text-center py-5">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Загрузка...</span>
        </div>
      </div>

      
      <div v-else-if="error" class="alert alert-danger" role="alert">
        {{ error }}
      </div>

      
      <div v-else-if="order" class="row">
        <div class="col-lg-8">
          
          <div class="card shadow-sm border-0 mb-4">
            <div
              class="card-header bg-primary text-white d-flex justify-content-between align-items-center"
            >
              <h5 class="mb-0">Заказ #{{ order.order_number }}</h5>
              <span class="badge" :class="`bg-${getStatusBadge(order.status)}`">
                {{ translateStatus(order.status) }}
              </span>
            </div>
            <div class="card-body">
              <div class="row mb-3">
                <div class="col-sm-4">
                  <strong>Дата заказа:</strong>
                </div>
                <div class="col-sm-8">
                  {{ new Date(order.created_at).toLocaleString("ru-RU") }}
                </div>
              </div>
              <div class="row mb-3">
                <div class="col-sm-4">
                  <strong>Статус:</strong>
                </div>
                <div class="col-sm-8">
                  <span
                    class="badge"
                    :class="`bg-${getStatusBadge(order.status)}`"
                  >
                    {{ translateStatus(order.status) }}
                  </span>
                </div>
              </div>
              <div class="row mb-3">
                <div class="col-sm-4">
                  <strong>Статус оплаты:</strong>
                </div>
                <div class="col-sm-8">
                  <span
                    class="badge"
                    :class="
                      order.payment_status === 'paid'
                        ? 'bg-success'
                        : 'bg-warning'
                    "
                  >
                    {{
                      order.payment_status === "paid" ? "Оплачен" : "Не оплачен"
                    }}
                  </span>
                </div>
              </div>
              <div class="row mb-3">
                <div class="col-sm-4">
                  <strong>Способ оплаты:</strong>
                </div>
                <div class="col-sm-8 text-muted">
                  {{
                    translatePaymentMethod(order.payment_method) || "Не указан"
                  }}
                </div>
              </div>
              <div v-if="order.notes" class="row mb-3">
                <div class="col-sm-4">
                  <strong>Примечания:</strong>
                </div>
                <div class="col-sm-8">{{ order.notes }}</div>
              </div>
            </div>
          </div>

          
          <div class="card shadow-sm border-0 mb-4">
            <div class="card-header bg-white">
              <h5 class="mb-0">Товары в заказе</h5>
            </div>
            <div class="card-body">
              <div class="table-responsive">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Товар</th>
                      <th>Количество</th>
                      <th>Цена</th>
                      <th>Итого</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="item in order.items" :key="item.id">
                      <td>{{ item.product_name }}</td>
                      <td>{{ item.quantity }}</td>
                      <td>{{ formatPrice(item.price) }} сом</td>
                      <td>{{ formatPrice(item.total) }} сом</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          
          <div v-if="order.shipping_address" class="card shadow-sm border-0">
            <div class="card-header bg-white">
              <h5 class="mb-0">Адрес доставки</h5>
            </div>
            <div class="card-body">
              <p class="mb-1">
                <strong
                  >{{ order.shipping_address.first_name }}
                  {{ order.shipping_address.last_name }}</strong
                >
              </p>
              <p class="mb-1">{{ order.shipping_address.address_line_1 }}</p>
              <p v-if="order.shipping_address.address_line_2" class="mb-1">
                {{ order.shipping_address.address_line_2 }}
              </p>
              <p class="mb-1">
                {{ order.shipping_address.city }},
                {{ order.shipping_address.postal_code }}
              </p>
              <p class="mb-0">
                <strong>Телефон:</strong> {{ order.shipping_address.phone }}
              </p>
            </div>
          </div>
        </div>

        
        <div class="col-lg-4">
          <div class="card shadow-sm border-0">
            <div class="card-header bg-primary text-white">
              <h5 class="mb-0">Итого</h5>
            </div>
            <div class="card-body">
              <div class="d-flex justify-content-between mb-2">
                <span>Товары:</span>
                <strong>{{ formatPrice(order.subtotal) }} сом</strong>
              </div>
              <div
                v-if="order.shipping_cost"
                class="d-flex justify-content-between mb-2"
              >
                <span>Доставка:</span>
                <strong class="text-primary">Договорная</strong>
              </div>
              <div
                v-if="order.discount"
                class="d-flex justify-content-between mb-2 text-success"
              >
                <span>Скидка:</span>
                <strong>-{{ formatPrice(order.discount) }} сом</strong>
              </div>
              <hr />
              <div class="d-flex justify-content-between">
                <span class="h5 mb-0">К оплате:</span>
                <strong class="h5 text-primary mb-0">
                  {{ formatPrice(order.total) }} сом
                </strong>
              </div>

              
              <div
                v-if="
                  order.payment_method === 'mbank' &&
                  order.payment_status !== 'paid' &&
                  order.status !== 'cancelled'
                "
                class="mt-4 p-3 bg-light rounded-4 text-center border border-primary border-opacity-25"
              >
                <h6 class="fw-bold mb-2">Оплата через MBank</h6>
                <div v-if="mbankQrImage" class="mb-3">
                  <img
                    :src="getImageUrl(mbankQrImage)"
                    alt="MBank QR"
                    class="img-fluid rounded-3 shadow-sm"
                    style="max-width: 150px"
                  />
                </div>
                <div class="small text-muted mb-2">
                  Отсканируйте QR или переведите по номеру:
                </div>
                <div class="fw-bold text-primary">
                  {{
                    settings?.payment_contact ||
                    settings?.contact_phone ||
                    "+996 XXX XXX XXX"
                  }}
                </div>
                <div
                  v-if="settings?.payment_recipient"
                  class="x-small text-muted mt-1"
                >
                  Получатель: {{ settings.payment_recipient }}
                </div>
              </div>

              
              <div
                v-if="
                  order.payment_method === 'transfer' &&
                  order.payment_status !== 'paid' &&
                  order.status !== 'cancelled'
                "
                class="mt-4 p-3 bg-light rounded-4 text-center border"
              >
                <h6 class="fw-bold mb-2">Банковский перевод</h6>
                <div class="small text-muted mb-2">Реквизиты для перевода:</div>
                <div class="fw-bold">
                  {{
                    settings?.payment_contact ||
                    settings?.contact_phone ||
                    "+996 XXX XXX XXX"
                  }}
                </div>
                <div
                  v-if="settings?.payment_recipient"
                  class="x-small text-muted mt-1"
                >
                  Получатель: {{ settings.payment_recipient }}
                </div>
              </div>

              
              <div v-if="payments.length > 0" class="mt-3 mb-3">
                <h6 class="mb-2">Платежи:</h6>
                <div
                  v-for="payment in payments"
                  :key="payment.id"
                  class="mb-2 p-2 bg-light rounded"
                >
                  <div class="d-flex justify-content-between">
                    <span class="small">{{
                      translatePaymentMethod(payment.payment_method)
                    }}</span>
                    <span
                      class="badge"
                      :class="
                        payment.status === 'completed'
                          ? 'bg-success'
                          : payment.status === 'failed'
                          ? 'bg-danger'
                          : 'bg-warning'
                      "
                    >
                      {{ translatePaymentStatus(payment.status) }}
                    </span>
                  </div>
                  <div class="small text-muted">
                    {{ formatPrice(payment.amount) }}
                    сом
                  </div>
                </div>
              </div>

              
              <div v-if="order.status === 'pending'" class="mt-3">
                <button
                  v-if="
                    order.payment_status !== 'paid' &&
                    order.payment_method !== 'cash'
                  "
                  class="btn btn-primary w-100 mb-2"
                  :disabled="paymentLoading"
                  @click="handleCreatePayment"
                >
                  <span
                    v-if="paymentLoading"
                    class="spinner-border spinner-border-sm me-2"
                    role="status"
                    aria-hidden="true"
                  ></span>
                  Оплатить заказ
                </button>
                <button class="btn btn-danger w-100" @click="handleCancelOrder">
                  Отменить заказ
                </button>
              </div>

              
              <div v-if="order.status === 'delivered'" class="mt-3">
                <button
                  class="btn btn-danger w-100"
                  @click="downloadOrderInvoice(order.id)"
                >
                  <i class="bi bi-file-earmark-pdf"></i> Скачать накладную (PDF)
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
