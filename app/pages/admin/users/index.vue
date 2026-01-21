<script setup>
definePageMeta({
  layout: "admin",
  middleware: "admin",
});

const { getUsers, createUser } = useUsers();
const router = useRouter();
const uiStore = useUiStore();

const users = ref({
  data: [],
  current_page: 1,
  last_page: 1,
  total: 0,
  per_page: 15,
});

const isLoading = ref(false);
const isCreating = ref(false);
const showFilters = ref(false);

const filters = ref({
  search: "",
  role: "",
  page: 1,
});

const createModal = ref({
  isOpen: false,
  form: {
    name: "",
    email: "",
    password: "",
    role: "user",
    phone: "",
  },
});

let debounceTimer = null;

const fetchUsers = async () => {
  isLoading.value = true;
  try {
    const data = await getUsers({
      ...filters.value,
      role: filters.value.role || undefined,
    });
    users.value = data;
  } catch (error) {
    console.error(error);
  } finally {
    isLoading.value = false;
  }
};

const openCreateModal = () => {
  createModal.value.form = {
    name: "",
    email: "",
    password: "",
    role: "user",
    phone: "",
  };
  createModal.value.isOpen = true;
};

const submitCreateUser = async () => {
  if (
    !createModal.value.form.name ||
    !createModal.value.form.email ||
    !createModal.value.form.password
  ) {
    uiStore.error("Заполните обязательные поля");
    return;
  }

  isCreating.value = true;
  try {
    await createUser(createModal.value.form);
    uiStore.success("Пользователь создан");
    createModal.value.isOpen = false;
    fetchUsers();
  } catch (e) {
    console.error(e);
    const errors = e.data?.errors;
    if (errors) {
      uiStore.error(Object.values(errors).flat().join("\n"));
    } else {
      uiStore.error("Ошибка при создании пользователя");
    }
  } finally {
    isCreating.value = false;
  }
};

watch(
  () => filters.value.search,
  () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      filters.value.page = 1;
      fetchUsers();
    }, 500);
  }
);

const changePage = (page) => {
  if (page < 1 || page > users.value.last_page) return;
  filters.value.page = page;
  fetchUsers();
};

const goToUser = (id) => {
  router.push(`/admin/users/${id}`);
};

const getRoleBadge = (role) => {
  switch (role) {
    case "admin":
      return "badge bg-danger";
    case "manager":
      return "badge bg-primary";
    case "cashier":
      return "badge bg-warning text-dark";
    case "user":
      return "badge bg-info text-dark";
    default:
      return "badge bg-light text-dark";
  }
};

onMounted(() => {
  fetchUsers();
});
</script>

<template>
  <div class="users-page p-4 animate-fade-in">
    <div
      class="header-card mb-4 p-4 rounded-4 shadow-sm text-white glass-header"
    >
      <div class="row align-items-center">
        <div class="col-lg-6">
          <h1 class="h3 mb-1 fw-bold">Пользователи</h1>
          <p class="mb-0 opacity-75 small">
            Управление клиентами и сотрудниками
          </p>
        </div>
        <div class="col-lg-6 text-end">
          <button
            class="btn btn-light rounded-pill px-4 fw-bold text-primary"
            @click="openCreateModal"
          >
            <i class="bi bi-person-plus me-2"></i>Добавить
          </button>
        </div>
      </div>
    </div>

    
    <div class="card border-0 shadow-sm rounded-4 mb-4 p-3">
      <div class="row g-2 align-items-center">
        <div class="col-md-4">
          <div class="input-group">
            <span class="input-group-text bg-white border-end-0"
              ><i class="bi bi-search text-muted"></i
            ></span>
            <input
              v-model="filters.search"
              type="text"
              class="form-control border-start-0 ps-0"
              placeholder="Поиск по имени, email..."
            />
          </div>
        </div>
        <div class="col-md-3">
          <select
            v-model="filters.role"
            class="form-select"
            @change="fetchUsers"
          >
            <option value="">Все роли</option>
            <option value="user">Пользователь</option>
            <option value="admin">Администратор</option>
            <option value="manager">Менеджер</option>
            <option value="cashier">Кассир</option>
          </select>
        </div>
        <div class="col-auto ms-auto">
          <button class="btn btn-light rounded-circle" @click="fetchUsers">
            <i class="bi bi-arrow-clockwise"></i>
          </button>
        </div>
      </div>
    </div>

    
    <div class="card border-0 shadow-sm rounded-4 overflow-hidden">
      <div v-if="isLoading" class="p-5 text-center">
        <div class="spinner-border text-primary" role="status"></div>
      </div>
      <div v-else class="table-responsive-cards">
        <table class="table table-hover align-middle mb-0 custom-table">
          <thead
            class="bg-light small text-muted text-uppercase d-none d-lg-table-header-group"
          >
            <tr>
              <th class="ps-4">Имя</th>
              <th>Контакты</th>
              <th>Роль</th>
              <th>Дата регистрации</th>
              <th class="text-end pe-4">Действия</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="users.data.length === 0">
              <td colspan="5" class="text-center p-5 text-muted">
                Пользователей не найдено
              </td>
            </tr>
            <tr
              v-for="user in users.data"
              :key="user.id"
              class="cursor-pointer"
              @click="goToUser(user.id)"
            >
              <td class="ps-4" data-label="Имя">
                <div class="d-flex align-items-center">
                  <div
                    class="avatar-sm me-2 d-lg-none bg-primary text-white rounded-circle d-flex align-items-center justify-content-center fw-bold"
                  >
                    {{ user.name?.[0] || "?" }}
                  </div>
                  <div class="fw-bold">{{ user.name }}</div>
                </div>
              </td>
              <td data-label="Email / Тел">
                <div class="small">{{ user.email }}</div>
                <div class="small text-muted">{{ user.phone || "-" }}</div>
              </td>
              <td data-label="Роль">
                <span :class="getRoleBadge(user.role)">{{ user.role }}</span>
              </td>
              <td data-label="Регистрация" class="text-muted small">
                {{ new Date(user.created_at).toLocaleDateString() }}
              </td>
              <td class="text-end pe-4 mobile-actions">
                <NuxtLink
                  :to="`/admin/debts?search=${user.name}`"
                  class="btn btn-sm btn-outline-danger shadow-sm p-1 px-2 border me-1"
                  title="Долги"
                  @click.stop
                >
                  <i class="bi bi-person-exclamation"></i>
                </NuxtLink>
                <button class="btn btn-sm btn-light rounded-circle shadow-sm">
                  <i class="bi bi-chevron-right"></i>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <div v-if="users.last_page > 1" class="p-3 d-flex justify-content-end">
        <nav>
          <ul class="pagination mb-0">
            <li
              class="page-item"
              :class="{ disabled: users.current_page === 1 }"
            >
              <button
                class="page-link"
                @click="changePage(users.current_page - 1)"
              >
                Назад
              </button>
            </li>
            <li class="page-item active">
              <span class="page-link">{{ users.current_page }}</span>
            </li>
            <li
              class="page-item"
              :class="{ disabled: users.current_page === users.last_page }"
            >
              <button
                class="page-link"
                @click="changePage(users.current_page + 1)"
              >
                Вперед
              </button>
            </li>
          </ul>
        </nav>
      </div>
    </div>

    
    <UiBaseModal
      :show="createModal.isOpen"
      title="Новый пользователь"
      @close="createModal.isOpen = false"
    >
      <div class="mb-3">
        <label class="form-label">Имя</label>
        <input
          type="text"
          v-model="createModal.form.name"
          class="form-control"
          placeholder="Иван Иванов"
        />
      </div>
      <div class="mb-3">
        <label class="form-label">Email</label>
        <input
          type="email"
          v-model="createModal.form.email"
          class="form-control"
          placeholder="user@example.com"
        />
      </div>
      <div class="mb-3">
        <label class="form-label">Телефон</label>
        <input
          type="text"
          v-model="createModal.form.phone"
          class="form-control"
          placeholder="+996..."
        />
      </div>
      <div class="mb-3">
        <label class="form-label">Пароль</label>
        <input
          type="text"
          v-model="createModal.form.password"
          class="form-control"
          placeholder="Минимум 8 символов"
        />
      </div>
      <div class="mb-3">
        <label class="form-label">Роль</label>
        <select v-model="createModal.form.role" class="form-select">
          <option value="user">Пользователь</option>
          <option value="manager">Менеджер</option>
          <option value="cashier">Кассир</option>
          <option value="admin">Администратор</option>
        </select>
      </div>

      <template #footer>
        <button
          class="btn btn-light rounded-pill px-4"
          @click="createModal.isOpen = false"
        >
          Отмена
        </button>
        <button
          class="btn btn-primary rounded-pill px-4"
          :disabled="isCreating"
          @click="submitCreateUser"
        >
          {{ isCreating ? "Создание..." : "Создать" }}
        </button>
      </template>
    </UiBaseModal>
  </div>
</template>

<style scoped>
.glass-header {
  background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%);
}
.cursor-pointer {
  cursor: pointer;
}
</style>
