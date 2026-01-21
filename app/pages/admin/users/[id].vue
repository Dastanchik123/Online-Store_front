<script setup>
definePageMeta({
  layout: "admin",
  middleware: "admin",
});

const route = useRoute();
const router = useRouter();
const uiStore = useUiStore();
const { getUser, updateUser, getUserHistory } = useUsers();
const { getOrders } = useOrders();

const userId = route.params.id;
const user = ref(null);
const orders = ref({ data: [], total: 0 });
const history = ref({ data: [], total: 0, last_page: 1, current_page: 1 });
const isLoading = ref(true);
const isSaving = ref(false);
const activeTab = ref("orders"); 
const passwordForm = ref({ password: "" });
const fileInput = ref(null);

const config = useRuntimeConfig();

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


const orderFilters = ref({ page: 1, per_page: 10 });
const historyFilters = ref({ page: 1, per_page: 15 });

const triggerFileInput = () => {
  fileInput.value.click();
};

const handleFileUpload = async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("avatar", file);

  try {
    isSaving.value = true;
    await updateUser(user.value.id, formData);
    uiStore.success("Аватар обновлен");
    await fetchUserData(); 
  } catch (e) {
    uiStore.error("Ошибка загрузки аватара");
    console.error(e);
  } finally {
    isSaving.value = false;
    event.target.value = ""; 
  }
};

const fetchUserData = async () => {
  try {
    user.value = await getUser(userId);
  } catch (e) {
    uiStore.error("Пользователь не найден");
    router.push("/admin/users");
  }
};

const fetchUserOrders = async () => {
  try {
    orders.value = await getOrders({
      user_id: userId,
      page: orderFilters.value.page,
      per_page: orderFilters.value.per_page,
    });
  } catch (e) {
    console.error(e);
  }
};

const fetchHistory = async () => {
  try {
    history.value = await getUserHistory(userId, {
      page: historyFilters.value.page,
    });
  } catch (e) {
    console.error(e);
  }
};

const loadData = async () => {
  isLoading.value = true;
  await fetchUserData();
  if (user.value) {
    await Promise.all([fetchUserOrders(), fetchHistory()]);
  }
  isLoading.value = false;
};

const saveRole = async () => {
  if (!user.value) return;
  isSaving.value = true;
  try {
    const payload = {
      role: user.value.role,
      phone: user.value.phone,
      name: user.value.name,
      email: user.value.email,
    };
    if (passwordForm.value.password) {
      payload.password = passwordForm.value.password;
    }
    await updateUser(user.value.id, payload);
    uiStore.success("Успешно сохранено");
    passwordForm.value.password = ""; 
  } catch (e) {
    uiStore.error("Ошибка сохранения");
  } finally {
    isSaving.value = false;
  }
};

const statusGetText = (status) => {
  const map = {
    pending: "Ожидание",
    processing: "Обработка",
    shipped: "Отправлен",
    delivered: "Доставлен",
    cancelled: "Отменен",
    refunded: "Возврат",
    paid: "Оплачено",
  };
  return map[status] || "Неизвестный статус";
};

const changeOrdersPage = (page) => {
  orderFilters.value.page = page;
  fetchUserOrders();
};

const changeHistoryPage = (page) => {
  historyFilters.value.page = page;
  fetchHistory();
};


const formatPrice = (price) =>
  parseFloat(price || 0).toLocaleString("ru-RU") + " сом";
const formatDate = (d) =>
  new Date(d).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const getStatusBadge = (status) => {
  const map = {
    pending: "bg-warning text-dark",
    processing: "bg-info text-white",
    shipped: "bg-primary",
    delivered: "bg-success",
    cancelled: "bg-secondary",
    refunded: "bg-danger",
    paid: "bg-success",
  };
  return `badge ${map[status] || "bg-light text-dark"}`;
};
const getHistoryIcon = (type) => {
  if (type === "order") return "bi-bag-check text-primary";
  if (type === "payment") return "bi-wallet2 text-success";
  return "bi-circle";
};

onMounted(loadData);
</script>

<template>
  <div class="user-details-page p-4 animate-fade-in">
    
    <div class="mb-3">
      <button
        class="btn btn-link text-decoration-none ps-0 fw-bold"
        @click="router.back()"
      >
        <i class="bi bi-arrow-left me-1"></i> Назад к списку
      </button>
    </div>

    <div v-if="isLoading" class="text-center p-5">
      <div class="spinner-border text-primary" role="status"></div>
    </div>

    <div v-else-if="user" class="row g-4">
      
      <div class="col-lg-4">
        <div class="card border-0 shadow-sm rounded-4 h-100 overflow-hidden">
          <div class="card-header border-0 p-4 text-center bg-light-gradient">
            <div
              class="position-relative mx-auto mb-3"
              style="width: 100px; height: 100px; cursor: pointer"
              @click="triggerFileInput"
            >
              <div
                v-if="user.avatar_url"
                class="rounded-circle shadow-sm overflow-hidden w-100 h-100 border border-4 border-white"
              >
                <img
                  :src="getImageUrl(user.avatar_url)"
                  class="w-100 h-100 object-fit-cover"
                  alt="Avatar"
                />
              </div>
              <div
                v-else
                class="avatar-placeholder bg-white shadow-sm rounded-circle d-flex align-items-center justify-content-center text-primary w-100 h-100 border border-4 border-white"
                style="font-size: 2.5rem; font-weight: bold"
              >
                {{ user.name.charAt(0).toUpperCase() }}
              </div>
              <div
                class="position-absolute bottom-0 end-0 bg-primary text-white rounded-circle d-flex align-items-center justify-content-center shadow-sm"
                style="width: 32px; height: 32px"
              >
                <i class="bi bi-camera-fill small"></i>
              </div>
            </div>
            <input
              type="file"
              ref="fileInput"
              class="d-none"
              accept="image/*"
              @change="handleFileUpload"
            />

            <h4 class="fw-bold mb-1">{{ user.name }}</h4>
            <p class="text-muted mb-0 small">{{ user.email }}</p>
            <div class="mt-2">
              <span class="badge bg-dark">{{ user.role }}</span>
            </div>
          </div>
          <div class="card-body p-4">
            <h6 class="fw-bold text-uppercase text-muted small mb-3">
              Детали профиля
            </h6>
            <form @submit.prevent="saveRole">
              <div class="mb-3">
                <label class="small text-muted form-label">Имя</label>
                <input
                  type="text"
                  class="form-control"
                  v-model="user.name"
                  placeholder="Введите имя"
                />
              </div>
              <div class="mb-3">
                <label class="small text-muted form-label">Телефон</label>
                <input
                  type="text"
                  class="form-control"
                  v-model="user.phone"
                  placeholder="Введите номер телефона"
                />
              </div>
              <div class="mb-3">
                <label class="small text-muted form-label"
                  >Дата регистрации</label
                >
                <input
                  type="text"
                  class="form-control bg-light border-0"
                  :value="formatDate(user.created_at)"
                  readonly
                />
              </div>

              <hr class="my-4 op-1" />

              <h6 class="fw-bold text-uppercase text-muted small mb-3">
                Управление доступом
              </h6>
              <div class="mb-3">
                <label class="small text-muted form-label">Роль</label>
                <select class="form-select" v-model="user.role">
                  <option value="user">Пользователь</option>
                  <option value="purchaser">Закупщик</option>
                  <option value="cashier">Кассир</option>
                  <option value="admin">Администратор</option>
                </select>
              </div>

              <hr class="my-4 op-1" />

              <h6 class="fw-bold text-uppercase text-muted small mb-3">
                Безопасность
              </h6>
              <div class="mb-3">
                <label class="small text-muted form-label">Новый пароль</label>
                <input
                  type="password"
                  v-model="passwordForm.password"
                  class="form-control"
                  placeholder="Оставьте пустым, если не меняете"
                />
              </div>

              <button
                type="submit"
                class="btn btn-primary w-100 rounded-pill fw-bold"
                :disabled="isSaving"
              >
                {{ isSaving ? "Сохранение..." : "Сохранить изменения" }}
              </button>
            </form>
          </div>
        </div>
      </div>

      
      <div class="col-lg-8">
        <div class="card border-0 shadow-sm rounded-4 h-100">
          
          <div class="card-header bg-white border-bottom-0 pt-4 px-4 pb-0">
            <ul
              class="nav nav-pills card-header-pills bg-light rounded-pill p-1 d-inline-flex"
            >
              <li class="nav-item">
                <button
                  class="nav-link rounded-pill px-4"
                  :class="{
                    active: activeTab === 'orders',
                    'bg-white shadow-sm text-dark': activeTab === 'orders',
                    'text-muted': activeTab !== 'orders',
                  }"
                  @click="activeTab = 'orders'"
                >
                  Заказы
                </button>
              </li>
              <li class="nav-item">
                <button
                  class="nav-link rounded-pill px-4"
                  :class="{
                    active: activeTab === 'history',
                    'bg-white shadow-sm text-dark': activeTab === 'history',
                    'text-muted': activeTab !== 'history',
                  }"
                  @click="activeTab = 'history'"
                >
                  Хронология
                </button>
              </li>
            </ul>
          </div>

          <div class="card-body p-0">
            
            <div v-if="activeTab === 'orders'" class="animate-fade-in">
              <div class="table-responsive-cards">
                <table class="table table-hover align-middle mb-0">
                  <thead
                    class="bg-white text-muted small border-light border-bottom d-none d-lg-table-header-group"
                  >
                    <tr>
                      <th class="ps-4 py-3">Заказ</th>
                      <th>Дата</th>
                      <th>Сумма</th>
                      <th>Статус</th>
                      <th class="text-end pe-4">Действие</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-if="orders.data.length === 0">
                      <td colspan="5" class="text-center p-5 text-muted">
                        Нет заказов
                      </td>
                    </tr>
                    <tr v-for="order in orders.data" :key="order.id">
                      <td class="ps-4 fw-bold" data-label="Заказ">
                        #{{ order.id }}
                      </td>
                      <td data-label="Дата" class="small text-muted">
                        {{ formatDate(order.created_at) }}
                      </td>
                      <td data-label="Сумма" class="fw-bold">
                        {{ formatPrice(order.total) }}
                      </td>
                      <td data-label="Статус">
                        <span :class="getStatusBadge(order.status)">{{
                          statusGetText(order.status)
                        }}</span>
                      </td>
                      <td class="text-end pe-4 mobile-actions">
                        <NuxtLink
                          :to="`/admin/orders?search=${order.id}`"
                          class="btn btn-sm btn-outline-primary rounded-pill px-3"
                        >
                          Открыть
                        </NuxtLink>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              
              <div
                v-if="orders.last_page > 1"
                class="p-3 border-top border-light d-flex justify-content-end"
              >
                <nav>
                  <ul class="pagination pagination-sm mb-0">
                    <li
                      class="page-item"
                      :class="{ disabled: orders.current_page === 1 }"
                    >
                      <button
                        class="page-link"
                        @click="changeOrdersPage(orders.current_page - 1)"
                      >
                        Назад
                      </button>
                    </li>
                    <li class="page-item active">
                      <span class="page-link">{{ orders.current_page }}</span>
                    </li>
                    <li
                      class="page-item"
                      :class="{
                        disabled: orders.current_page === orders.last_page,
                      }"
                    >
                      <button
                        class="page-link"
                        @click="changeOrdersPage(orders.current_page + 1)"
                      >
                        Вперед
                      </button>
                    </li>
                  </ul>
                </nav>
              </div>
            </div>

            
            <div v-if="activeTab === 'history'" class="animate-fade-in">
              <div class="list-group list-group-flush">
                <div
                  v-if="history.data.length === 0"
                  class="p-5 text-center text-muted"
                >
                  История пуста
                </div>
                <div
                  v-for="(item, idx) in history.data"
                  :key="idx"
                  class="list-group-item px-4 py-3 border-light"
                >
                  <div
                    class="d-flex w-100 justify-content-between align-items-center"
                  >
                    <div class="d-flex align-items-center">
                      <div
                        class="icon-square me-3 rounded-circle bg-light d-flex align-items-center justify-content-center"
                        style="width: 40px; height: 40px"
                      >
                        <i
                          class="bi fs-5"
                          :class="getHistoryIcon(item.type)"
                        ></i>
                      </div>
                      <div class="lh-sm">
                        <div class="fw-bold text-dark mb-1">
                          {{ item.description }}
                        </div>
                        <div class="small text-muted">
                          <span v-if="item.type === 'order'"
                            >Заказ на сумму:</span
                          >
                          <span v-if="item.type === 'payment'">Оплата:</span>
                          <strong class="text-dark">{{
                            formatPrice(item.amount)
                          }}</strong>
                        </div>
                      </div>
                    </div>
                    <div class="text-end">
                      <small class="text-muted d-block">{{
                        formatDate(item.date)
                      }}</small>
                      <span
                        class="badge rounded-pill small mt-1"
                        :class="
                          item.type === 'payment'
                            ? 'bg-success-subtle text-success'
                            : 'bg-primary-subtle text-primary'
                        "
                      >
                        {{ item.type === "payment" ? "Оплата" : "Заказ" }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div
                v-if="history.last_page > 1"
                class="p-3 border-top border-light d-flex justify-content-end"
              >
                <nav>
                  <ul class="pagination pagination-sm mb-0">
                    <li
                      class="page-item"
                      :class="{ disabled: history.current_page === 1 }"
                    >
                      <button
                        class="page-link"
                        @click="changeHistoryPage(history.current_page - 1)"
                      >
                        Назад
                      </button>
                    </li>
                    <li class="page-item active">
                      <span class="page-link">{{ history.current_page }}</span>
                    </li>
                    <li
                      class="page-item"
                      :class="{
                        disabled: history.current_page === history.last_page,
                      }"
                    >
                      <button
                        class="page-link"
                        @click="changeHistoryPage(history.current_page + 1)"
                      >
                        Вперед
                      </button>
                    </li>
                  </ul>
                </nav>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bg-light-gradient {
  background: linear-gradient(180deg, #f8f9fa 0%, #e9ecef 100%);
}
.op-1 {
  opacity: 0.1;
}
</style>
