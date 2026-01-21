<script setup>
const { getUser, logout } = useAuth();
const authStore = useAuthStore();
const ui = useUiStore();
const config = useRuntimeConfig();
const api = useApi();

definePageMeta({
  middleware: "auth",
});

const user = ref(null);
const debts = ref([]);
const loading = ref(false);
const loadingDebts = ref(false);
const fileInput = ref(null);

const getOrderStatusRu = (status) => {
  const statuses = {
    pending: "Ожидает обработки",
    processing: "В обработке",
    shipped: "Отправлен",
    delivered: "Доставлен",
    cancelled: "Отменен",
    refunded: "Возвращен",
  };
  return statuses[status] || status;
};

const getPaymentMethodRu = (method) => {
  const methods = {
    cash: "Наличные",
    bank_transfer: "Банковский перевод",
    mbank: "MBank",
    debt: "В долг",
    cod: "При получении",
  };
  return methods[method] || method;
};

const formatPrice = (price) => {
  if (price === null || price === undefined) return "0 сом";
  return (
    parseFloat(price).toLocaleString("ru-RU", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }) + " сом"
  );
};

const getImageUrl = (url) => {
  if (!url) return "";
  if (typeof url !== "string") return "";
  if (
    url.startsWith("http") &&
    !url.includes("localhost/storage") &&
    !url.includes("127.0.0.1/storage")
  ) {
    return url;
  }

  const config = useRuntimeConfig();
  const baseUrl = config.public.apiBase.replace(/\/api$/, "");

  let path = url;
  if (url.startsWith("http")) {
    const urlObj = new URL(url);
    path = urlObj.pathname;
  }

  if (!path.startsWith("/storage") && !path.startsWith("storage")) {
    path = "storage/" + (path.startsWith("/") ? path.substring(1) : path);
  }

  const finalPath = path.startsWith("/") ? path : "/" + path;
  return `${baseUrl}${finalPath}`;
};

const avatarUrl = computed(() => {
  if (user.value?.avatar_url) {
    return getImageUrl(user.value.avatar_url);
  }
  if (user.value?.avatar_path) {
    return getImageUrl(user.value.avatar_path);
  }
  return `https://ui-avatars.com/api/?name=${
    user.value?.name || "User"
  }&background=random&size=128`;
});

const handleAvatarUpload = async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("avatar", file);
  formData.append("name", user.value.name || "");
  formData.append("email", user.value.email || "");

  try {
    const res = await api.apiFetch("/user/profile", {
      method: "POST",
      body: formData,
    });

    authStore.user = res.user;
    user.value = res.user;
    ui.addToast("Аватар обновлен", "success");
  } catch (e) {
    ui.addToast("Ошибка обновления фото", "error");
  }
};

const loadUser = async () => {
  loading.value = true;
  try {
    user.value = await getUser();
  } catch (error) {
    console.error("Error loading user:", error);
  } finally {
    loading.value = false;
  }
};

const fetchDebts = async () => {
  loadingDebts.value = true;
  try {
    const res = await api.apiFetch("/my-debts");
    debts.value = res;
  } catch (error) {
    console.error("Error fetching debts:", error);
  } finally {
    loadingDebts.value = false;
  }
};

const handleLogout = async () => {
  await logout();
};

onMounted(() => {
  loadUser();
  fetchDebts();
});
</script>

<template>
  <div class="profile-page">
    <div class="container py-5">
      <h2 class="mb-4">Профиль</h2>

      <div v-if="loading" class="text-center py-5">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Загрузка...</span>
        </div>
      </div>

      <div v-else class="row">
        <div class="col-lg-8">
          <div class="card shadow-sm border-0">
            <div class="card-header bg-primary text-white">
              <h5 class="mb-0">Личная информация</h5>
            </div>
            <div class="card-body">
              <div class="d-flex align-items-center mb-4 border-bottom pb-4">
                <div class="position-relative me-4">
                  <img
                    :src="avatarUrl"
                    class="rounded-circle object-fit-cover shadow-sm border border-2 border-white"
                    style="width: 100px; height: 100px"
                    alt="Avatar"
                  />
                  <button
                    class="btn btn-sm btn-primary position-absolute bottom-0 end-0 rounded-circle d-flex align-items-center justify-content-center border border-2 border-white shadow-sm"
                    style="width: 32px; height: 32px"
                    @click="fileInput.click()"
                    title="Изменить фото"
                  >
                    <i class="bi bi-pencil-fill" style="font-size: 0.75rem"></i>
                  </button>
                  <input
                    type="file"
                    ref="fileInput"
                    class="d-none"
                    accept="image/*"
                    @change="handleAvatarUpload"
                  />
                </div>
                <div>
                  <h4 class="mb-1 fw-bold">{{ user?.name }}</h4>
                  <p class="text-muted mb-0">{{ user?.email }}</p>
                </div>
              </div>

              <div class="row mb-3">
                <div class="col-sm-4 text-muted">
                  <strong>Дата регистрации:</strong>
                </div>
                <div class="col-sm-8">
                  {{
                    user?.created_at
                      ? new Date(user.created_at).toLocaleDateString("ru-RU")
                      : "Не указано"
                  }}
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="debts.length > 0"
            class="card shadow-sm border-0 mt-4 overflow-hidden"
          >
            <div
              class="card-header bg-danger text-white d-flex justify-content-between align-items-center"
            >
              <h5 class="mb-0">История долгов и оплат</h5>
              <span class="badge bg-white text-danger rounded-pill">
                {{ debts.length }} активных
              </span>
            </div>
            <div class="card-body p-0">
              <div v-if="loadingDebts" class="p-5 text-center">
                <div
                  class="spinner-border text-danger spinner-border-sm"
                  role="status"
                ></div>
                <div class="mt-2 small text-muted">Загрузка данных...</div>
              </div>

              <div v-else class="list-group list-group-flush">
                <div
                  v-for="debt in debts"
                  :key="debt.id"
                  class="list-group-item p-4"
                >
                  <div
                    class="d-flex justify-content-between align-items-start mb-3"
                  >
                    <div>
                      <h6 class="fw-bold mb-1">Заказ №{{ debt.order_id }}</h6>
                      <div class="small text-muted">
                        От
                        {{
                          new Date(debt.created_at).toLocaleDateString("ru-RU")
                        }}
                      </div>
                    </div>
                    <span
                      class="badge"
                      :class="{
                        'bg-success': debt.status === 'paid',
                        'bg-warning text-dark': debt.status === 'partial',
                        'bg-danger': debt.status === 'active',
                      }"
                    >
                      {{
                        debt.status === "paid"
                          ? "Оплачен"
                          : debt.status === "partial"
                          ? "Частично оплачен"
                          : "Не оплачен"
                      }}
                    </span>
                  </div>

                  <div class="row g-3 mb-3">
                    <div class="col-md-4">
                      <div class="p-2 bg-light rounded text-center">
                        <div
                          class="x-small text-muted text-uppercase fw-bold"
                          style="font-size: 0.65rem"
                        >
                          Всего
                        </div>
                        <div class="fw-bold">
                          {{ formatPrice(debt.total_amount) }}
                        </div>
                      </div>
                    </div>
                    <div class="col-md-4">
                      <div class="p-2 bg-light rounded text-center">
                        <div
                          class="x-small text-muted text-uppercase fw-bold"
                          style="font-size: 0.65rem"
                        >
                          Оплачено
                        </div>
                        <div class="fw-bold text-success">
                          {{ formatPrice(debt.paid_amount) }}
                        </div>
                      </div>
                    </div>
                    <div class="col-md-4">
                      <div
                        class="p-2 bg-light rounded text-center"
                        :class="{
                          'bg-danger-subtle': debt.remaining_amount > 0,
                        }"
                      >
                        <div
                          class="x-small text-muted text-uppercase fw-bold"
                          style="font-size: 0.65rem"
                        >
                          Остаток
                        </div>
                        <div
                          class="fw-bold"
                          :class="
                            debt.remaining_amount > 0 ? 'text-danger' : ''
                          "
                        >
                          {{ formatPrice(debt.remaining_amount) }}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div v-if="debt.payments?.length" class="mt-3">
                    <button
                      class="btn btn-sm btn-link text-decoration-none p-0 w-100 text-start d-flex justify-content-between align-items-center"
                      type="button"
                      data-bs-toggle="collapse"
                      :data-bs-target="'#payments-' + debt.id"
                    >
                      <span class="small fw-bold text-dark"
                        >История платежей</span
                      >
                      <i class="bi bi-chevron-down small"></i>
                    </button>
                    <div class="collapse mt-2" :id="'payments-' + debt.id">
                      <div class="table-responsive">
                        <table
                          class="table table-sm table-borderless mb-0"
                          style="font-size: 0.85rem"
                        >
                          <tbody class="text-muted">
                            <tr
                              v-for="payment in debt.payments"
                              :key="payment.id"
                            >
                              <td>
                                {{
                                  new Date(
                                    payment.created_at,
                                  ).toLocaleDateString("ru-RU")
                                }}
                              </td>
                              <td>
                                {{ getPaymentMethodRu(payment.payment_method) }}
                              </td>
                              <td class="text-end fw-bold text-success">
                                +{{ formatPrice(payment.amount) }}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="col-lg-4">
          <div class="card shadow-sm border-0 mb-3">
            <div class="card-body">
              <h5 class="card-title">Быстрые действия</h5>
              <div class="d-grid gap-2">
                <NuxtLink to="/profile/orders" class="btn btn-outline-primary">
                  <i class="bi bi-bag"></i> Мои заказы
                </NuxtLink>
                <button class="btn btn-outline-danger" @click="handleLogout">
                  <i class="bi bi-box-arrow-right"></i> Выйти
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
