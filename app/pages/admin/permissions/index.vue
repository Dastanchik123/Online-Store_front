<script setup>
const { getPermissionsByRole, updateRolePermissions } = usePermissions();
const ui = useUiStore();

definePageMeta({
  layout: "admin",
  middleware: "admin",
});

const roles = ["purchaser", "cashier", "user"];
const selectedRole = ref("purchaser");
const loading = ref(true);
const saving = ref(false);
const rolePermissions = ref([]);

const availablePermissions = [
  {
    id: "orders.view",
    label: "Просмотр заказов",
    desc: "Позволяет просматривать список всех заказов и их детали.",
  },
  {
    id: "orders.edit",
    label: "Управление заказами",
    desc: "Разрешает менять статусы заказов, отменять их и управлять возвратами.",
  },
  {
    id: "purchaser.access",
    label: "Доступ к Закупкам",
    desc: "Разрешает доступ к закупщику /purchaser.",
  },
  {
    id: "cashier.access",
    label: "Доступ к Кассе",
    desc: "Разрешает доступ к странице /cashier.",
  },
  {
    id: "pos.access",
    label: "POS Терминал",
    desc: "Прямые продажи в магазине (Оффлайн).",
  },
  {
    id: "products.view",
    label: "Просмотр товаров",
    desc: "Доступ к каталогу товаров в админ-панели.",
  },
  {
    id: "products.edit",
    label: "Редактирование товаров",
    desc: "Создание, изменение и удаление карточек товаров.",
  },
  {
    id: "categories.manage",
    label: "Управление категориями",
    desc: "Создание и редактирование структуры категорий.",
  },
  {
    id: "suppliers.manage",
    label: "Управление поставщиками",
    desc: "Ведение базы поставщиков.",
  },
  {
    id: "purchases.manage",
    label: "Закупки",
    desc: "Оформление поступлений товаров на склад.",
  },
  {
    id: "inventory.manage",
    label: "Инвентаризация",
    desc: "Проведение ревизии остатков.",
  },
  {
    id: "reports.view",
    label: "Финансовые отчеты",
    desc: "Просмотр статистики продаж и прибыли.",
  },
  {
    id: "debts.view",
    label: "Долги клиентов",
    desc: "Просмотр и управление долгами покупателей.",
  },
  {
    id: "settings.edit",
    label: "Настройки магазина",
    desc: "Изменение основных параметров сайта.",
  },
  {
    id: "marketing.manage",
    label: "Маркетинг",
    desc: "Управление скидочными купонами и баннерами.",
  },
  { id: "blog.manage", label: "Блог", desc: "Публикация новостей и статей." },
  {
    id: "users.manage",
    label: "Пользователи",
    desc: "Управление учётными записями клиентов и сотрудников.",
  },
];

const fetchRolePermissions = async () => {
  loading.value = true;
  try {
    const data = await getPermissionsByRole(selectedRole.value);
    rolePermissions.value = data.map((p) => p.permission);
  } catch (e) {
    ui.addToast("Ошибка загрузки прав", "error");
  } finally {
    loading.value = false;
  }
};

const save = async () => {
  saving.value = true;
  try {
    await updateRolePermissions(selectedRole.value, rolePermissions.value);
    ui.addToast("Права доступа обновлены", "success");
  } catch (e) {
    ui.addToast("Ошибка сохранения", "error");
  } finally {
    saving.value = false;
  }
};

watch(selectedRole, fetchRolePermissions);
onMounted(fetchRolePermissions);
</script>

<template>
  <div class="p-4 animate-fade-in">
    <div class="d-flex justify-content-between align-items-center mb-4">
      <div>
        <h1 class="h3 fw-bold mb-1">Права доступа</h1>
        <p class="text-muted small">
          Настройка разрешений для различных ролей пользователей
        </p>
      </div>
      <button
        class="btn btn-primary rounded-pill px-4"
        @click="save"
        :disabled="saving"
      >
        <span
          v-if="saving"
          class="spinner-border spinner-border-sm me-2"
        ></span>
        <i v-else class="bi bi-shield-check me-2"></i> Сохранить настройки
      </button>
    </div>

    <div class="row">
      <div class="col-lg-3 mb-4">
        <div
          class="card border-0 shadow-sm rounded-4 p-4 sticky-top"
          style="top: 20px; z-index: 1"
        >
          <h6 class="fw-bold mb-3">Выберите роль</h6>
          <div class="list-group list-group-flush">
            <button
              v-for="role in roles"
              :key="role"
              @click="selectedRole = role"
              class="list-group-item list-group-item-action border-0 rounded-3 mb-2 px-3 py-2 d-flex justify-content-between align-items-center transition-all"
              :class="{
                'bg-primary text-white shadow-md': selectedRole === role,
                'bg-light text-dark': selectedRole !== role,
              }"
            >
              <span class="text-capitalize fw-medium">{{ role }}</span>
              <i
                class="bi"
                :class="
                  selectedRole === role ? 'bi-check-circle-fill' : 'bi-circle'
                "
              ></i>
            </button>
          </div>
          <div
            class="alert alert-info mt-4 small mb-0 rounded-4 border-0 bg-info-subtle text-info-emphasis"
          >
            <div class="d-flex">
              <i class="bi bi-info-circle-fill me-2 fs-5"></i>
              <div>
                Роль <b>{{ selectedRole }}</b> определяет уровень доступа
                пользователя к системе.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="col-lg-9">
        <div class="card border-0 shadow-sm rounded-4 p-4">
          <div v-if="loading" class="text-center py-5">
            <div class="spinner-border text-primary" role="status"></div>
          </div>
          <div v-else>
            <div class="d-flex justify-content-between align-items-center mb-4">
              <h6 class="fw-bold m-0 fs-5">
                Разрешения:
                <span class="text-primary text-capitalize">{{
                  selectedRole
                }}</span>
              </h6>
              <div class="text-muted small">
                <i class="bi bi-lock me-1"></i> Всего прав:
                {{ rolePermissions.length }}
              </div>
            </div>

            <div class="row g-3">
              <div
                v-for="perm in availablePermissions"
                :key="perm.id"
                class="col-md-6"
              >
                <div
                  class="permission-card p-3 border rounded-4 h-100 d-flex gap-3 align-items-start transition-all cursor-pointer"
                  :class="{ 'active-perm': rolePermissions.includes(perm.id) }"
                  @click="
                    !rolePermissions.includes(perm.id)
                      ? rolePermissions.push(perm.id)
                      : rolePermissions.splice(
                          rolePermissions.indexOf(perm.id),
                          1,
                        )
                  "
                >
                  <div class="form-check form-switch pt-1">
                    <input
                      class="form-check-input"
                      type="checkbox"
                      :id="perm.id"
                      v-model="rolePermissions"
                      :value="perm.id"
                      @click.stop
                    />
                  </div>
                  <div>
                    <label
                      class="form-check-label fw-bold d-block text-dark cursor-pointer"
                      :for="perm.id"
                    >
                      {{ perm.label }}
                    </label>
                    <small
                      class="text-muted d-block mt-1"
                      style="line-height: 1.3"
                    >
                      {{ perm.desc }}
                    </small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.permission-card {
  background-color: #f8fafc;
  border-color: #e2e8f0 !important;
}

.permission-card:hover {
  background-color: #ffffff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  transform: translateY(-2px);
  border-color: #cbd5e1 !important;
}

.active-perm {
  background-color: #f0f9ff;
  border-color: #38bdf8 !important;
  box-shadow: 0 4px 12px rgba(56, 189, 248, 0.1);
}

.active-perm .form-check-input:checked {
  background-color: #0ea5e9;
  border-color: #0ea5e9;
}

.cursor-pointer {
  cursor: pointer;
}

.transition-all {
  transition: all 0.2s ease;
}
</style>
