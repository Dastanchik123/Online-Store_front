<script setup>
const { getPermissionsByRole, updateRolePermissions, getRoles, createRole, deleteRole } =
  usePermissions();
const ui = useUiStore();

definePageMeta({
  layout: "admin",
  middleware: "admin",
});

// Роли больше не захардкожены — приходят из БД (таблица roles), их можно
// создавать/удалять прямо здесь. Роль admin сюда не попадает: у неё всегда
// полный доступ, редактировать её права нет смысла.
const roles = ref([]);
const rolesLoading = ref(true);
const selectedRole = ref("");
const loading = ref(true);
const saving = ref(false);
const rolePermissions = ref([]);

const showCreateForm = ref(false);
const newRoleName = ref("");
const newRoleLabel = ref("");
const creatingRole = ref(false);

const roleLabels = computed(() => {
  const map = {};
  for (const r of roles.value) map[r.name] = r.label;
  return map;
});

const fetchRoles = async () => {
  rolesLoading.value = true;
  try {
    const data = await getRoles();
    roles.value = data.filter((r) => r.name !== "admin");
    if (!selectedRole.value && roles.value.length) {
      selectedRole.value = roles.value[0].name;
    }
  } catch (e) {
    ui.addToast("Ошибка загрузки ролей", "error");
  } finally {
    rolesLoading.value = false;
  }
};

const submitNewRole = async () => {
  if (!newRoleName.value.trim() || !newRoleLabel.value.trim()) return;
  creatingRole.value = true;
  try {
    await createRole(newRoleName.value.trim(), newRoleLabel.value.trim());
    ui.addToast("Роль создана", "success");
    newRoleName.value = "";
    newRoleLabel.value = "";
    showCreateForm.value = false;
    await fetchRoles();
  } catch (e) {
    ui.addToast(
      e?.data?.message || "Ошибка создания роли (имя должно быть латиницей, напр. senior_cashier)",
      "error",
    );
  } finally {
    creatingRole.value = false;
  }
};

const removeRole = async (role) => {
  if (role.is_system) return;
  if (!confirm(`Удалить роль «${role.label}»?`)) return;
  try {
    await deleteRole(role.id);
    ui.addToast("Роль удалена", "success");
    if (selectedRole.value === role.name) selectedRole.value = "";
    await fetchRoles();
  } catch (e) {
    ui.addToast(
      e?.data?.message || "Не удалось удалить роль",
      "error",
    );
  }
};

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
    desc: "Создание и изменение карточек товаров.",
  },
  {
    id: "products.delete",
    label: "Удаление товаров",
    desc: "Безвозвратное удаление карточек товаров из каталога.",
  },
  {
    id: "categories.manage",
    label: "Управление категориями",
    desc: "Создание и редактирование структуры категорий.",
  },
  {
    id: "categories.delete",
    label: "Удаление категорий",
    desc: "Удаление категорий товаров.",
  },
  {
    id: "suppliers.manage",
    label: "Управление поставщиками",
    desc: "Ведение базы поставщиков.",
  },
  {
    id: "suppliers.delete",
    label: "Удаление поставщиков",
    desc: "Удаление карточек поставщиков.",
  },
  {
    id: "purchases.manage",
    label: "Закупки",
    desc: "Оформление поступлений товаров на склад.",
  },
  {
    id: "purchases.delete",
    label: "Удаление закупок",
    desc: "Удаление оформленных закупок.",
  },
  {
    id: "inventory.manage",
    label: "Инвентаризация",
    desc: "Проведение ревизии остатков.",
  },
  {
    id: "inventory.delete",
    label: "Удаление корректировок",
    desc: "Удаление записей инвентаризации.",
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
    id: "marketing.manage",
    label: "Маркетинг",
    desc: "Управление скидочными купонами и баннерами.",
  },
  { id: "blog.manage", label: "Блог", desc: "Публикация новостей и статей." },
];

const fetchRolePermissions = async () => {
  if (!selectedRole.value) return;
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
onMounted(async () => {
  await fetchRoles();
  await fetchRolePermissions();
});
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
          <div v-if="rolesLoading" class="text-center py-3">
            <div class="spinner-border spinner-border-sm text-primary"></div>
          </div>
          <div v-else class="list-group list-group-flush">
            <div
              v-for="role in roles"
              :key="role.id"
              class="d-flex align-items-center gap-1 mb-2"
            >
              <button
                @click="selectedRole = role.name"
                class="list-group-item list-group-item-action border-0 rounded-3 px-3 py-2 d-flex justify-content-between align-items-center transition-all flex-grow-1"
                :class="{
                  'bg-primary text-white shadow-md': selectedRole === role.name,
                  'bg-light text-dark': selectedRole !== role.name,
                }"
              >
                <span class="fw-medium">{{ role.label }}</span>
                <i
                  class="bi"
                  :class="
                    selectedRole === role.name ? 'bi-check-circle-fill' : 'bi-circle'
                  "
                ></i>
              </button>
              <button
                v-if="!role.is_system"
                class="btn btn-sm btn-outline-danger border-0"
                title="Удалить роль"
                @click="removeRole(role)"
              >
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </div>

          <div v-if="!showCreateForm" class="mt-2">
            <button
              class="btn btn-sm btn-outline-primary w-100 rounded-3"
              @click="showCreateForm = true"
            >
              <i class="bi bi-plus-lg me-1"></i>Новая роль
            </button>
          </div>
          <div v-else class="mt-2 p-3 bg-light rounded-3">
            <input
              v-model="newRoleName"
              type="text"
              class="form-control form-control-sm mb-2"
              placeholder="код роли, напр. senior_cashier"
            />
            <input
              v-model="newRoleLabel"
              type="text"
              class="form-control form-control-sm mb-2"
              placeholder="Название, напр. Старший кассир"
            />
            <div class="d-flex gap-2">
              <button
                class="btn btn-sm btn-primary flex-grow-1"
                :disabled="creatingRole"
                @click="submitNewRole"
              >
                Создать
              </button>
              <button
                class="btn btn-sm btn-outline-secondary"
                @click="showCreateForm = false"
              >
                Отмена
              </button>
            </div>
          </div>

          <div
            class="alert alert-info mt-4 small mb-0 rounded-4 border-0 bg-info-subtle text-info-emphasis"
          >
            <div class="d-flex">
              <i class="bi bi-info-circle-fill me-2 fs-5"></i>
              <div>
                Роль <b>{{ roleLabels[selectedRole] }}</b> определяет уровень доступа
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
                <span class="text-primary">{{
                  roleLabels[selectedRole]
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
