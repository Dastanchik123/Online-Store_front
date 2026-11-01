<script setup lang="ts">
definePageMeta({
  layout: "admin",
  middleware: "admin",
});

const {
  getTransactions,
  createTransaction,
  deleteTransaction,
  expenseCategories,
  getCategoryLabel,
  updateTransaction,
} = useFinance();
const { getStaff } = usePos();
const { getDashboardStats } = useAccounting(); 
const uiStore = useUiStore();

const balances = ref({ cash: 0, bank: 0 });

const transactions = ref<any[]>([]);
const loading = ref(true);
const submitting = ref(false);
const showModal = ref(false);
const isEditing = ref(false);
const editId = ref<number | null>(null);

const filters = ref({
  type: "expense",
  category: "",
  payment_method: "",
  user_id: "",
  date_from: "",
  date_to: "",
  page: 1,
});

const staffList = ref<any[]>([]);

const fetchStaff = async () => {
  try {
    const data: any = await getStaff();
    staffList.value = data;
  } catch (error) {
    console.error("Staff fetch error:", error);
  }
};

const form = ref({
  type: "expense",
  amount: "",
  payment_method: "cash",
  category: "other",
  description: "",
  created_at: new Date().toISOString().substr(0, 10),
});

const fetchTransactions = async () => {
  loading.value = true;
  try {
    const response: any = await getTransactions(filters.value);
    transactions.value = response.data || [];
  } catch (error) {
    uiStore.error("Ошибка при загрузке транзакций");
  } finally {
    loading.value = false;
  }
};

const fetchBalances = async () => {
  try {
    
    const stats: any = await getDashboardStats();
    if (stats && stats.summary) {
      balances.value.cash = stats.summary.cash_balance;
      balances.value.bank = stats.summary.bank_balance;
    }
  } catch (error) {
    console.error("Balance fetch error:", error);
  }
};

const handleEdit = (item: any) => {
  isEditing.value = true;
  editId.value = item.id;
  form.value = {
    type: item.type,
    amount: item.amount,
    payment_method: item.payment_method || "cash",
    category: item.category,
    description: item.description,
    created_at: item.created_at
      ? item.created_at.substr(0, 10)
      : new Date().toISOString().substr(0, 10),
  };
  showModal.value = true;
};

const handleSubmit = async () => {
  submitting.value = true;
  try {
    if (isEditing.value && editId.value) {
      await updateTransaction(editId.value, form.value);
      uiStore.success("Запись обновлена");
    } else {
      await createTransaction(form.value);
      uiStore.success("Запись добавлена");
    }
    showModal.value = false;
    resetForm();
    fetchTransactions();
  } catch (error) {
    uiStore.error("Ошибка при сохранении");
  } finally {
    submitting.value = false;
  }
};

const handleDelete = async (id: number | string) => {
  const confirmed = await uiStore.showConfirm(
    "Удаление записи",
    "Вы уверены, что хотите удалить эту финансовую операцию?"
  );
  if (!confirmed) return;

  try {
    await deleteTransaction(id);
    uiStore.success("Запись удалена");
    fetchTransactions();
  } catch (error) {
    uiStore.error(error?.data?.message || "Ошибка при удалении");
  }
};

const resetForm = () => {
  isEditing.value = false;
  editId.value = null;
  form.value = {
    type: "expense",
    amount: "",
    payment_method: "cash",
    category: "other",
    description: "",
    created_at: new Date().toISOString().substr(0, 10),
  };
};

const resetFilters = () => {
  filters.value = {
    type: "expense",
    category: "",
    payment_method: "",
    user_id: "",
    date_from: "",
    date_to: "",
    page: 1,
  };
};

// Суммы по отфильтрованному списку — видно итог периода без калькулятора
const listTotals = computed(() =>
  transactions.value.reduce(
    (acc, t) => {
      const amount = Number(t.amount) || 0;
      if (t.type === "expense") acc.expense += amount;
      else acc.income += amount;
      return acc;
    },
    { expense: 0, income: 0 },
  ),
);

const formatPrice = (price: any) => {
  return parseFloat(price || 0).toLocaleString("ru-RU") + " сом";
};

const formatDate = (dateStr: any) => {
  return new Date(dateStr).toLocaleDateString("ru-RU");
};

onMounted(() => {
  fetchTransactions();
  fetchBalances();
  fetchStaff();
});
watch(filters, fetchTransactions, { deep: true });
</script>

<template>
  <div class="adm-page p-3 p-md-4 animate-fade-in">
    <div class="adm-head">
      <div class="adm-head-title">
        <h1 class="h3">Учёт расходов и доходов</h1>
        <p class="text-muted small mb-0">
          Операционные затраты: налоги, интернет и пр.
        </p>
      </div>
      <div class="adm-head-actions">
        <button
          class="btn btn-primary rounded-pill px-4 shadow-sm fw-bold"
          @click="resetForm(); showModal = true"
        >
          <i class="bi bi-plus-lg me-1"></i> Добавить операцию
        </button>
      </div>
    </div>

    <div class="adm-stats">
      <div class="adm-stat">
        <div class="adm-stat-ico bg-success-subtle text-success">
          <i class="bi bi-cash-stack"></i>
        </div>
        <div class="min-w-0">
          <div class="adm-stat-label">Наличные</div>
          <div class="adm-stat-value">{{ formatPrice(balances.cash) }}</div>
        </div>
      </div>
      <div class="adm-stat">
        <div class="adm-stat-ico bg-primary-subtle text-primary">
          <i class="bi bi-bank"></i>
        </div>
        <div class="min-w-0">
          <div class="adm-stat-label">На счету</div>
          <div class="adm-stat-value">{{ formatPrice(balances.bank) }}</div>
        </div>
      </div>
      <div class="adm-stat">
        <div class="adm-stat-ico bg-danger-subtle text-danger">
          <i class="bi bi-arrow-down-right"></i>
        </div>
        <div class="min-w-0">
          <div class="adm-stat-label">Расходы в списке</div>
          <div class="adm-stat-value text-danger">{{ formatPrice(listTotals.expense) }}</div>
        </div>
      </div>
      <div class="adm-stat">
        <div class="adm-stat-ico bg-success-subtle text-success">
          <i class="bi bi-arrow-up-right"></i>
        </div>
        <div class="min-w-0">
          <div class="adm-stat-label">Доходы в списке</div>
          <div class="adm-stat-value text-success">{{ formatPrice(listTotals.income) }}</div>
        </div>
      </div>
    </div>

    <div class="card border-0 shadow-sm rounded-4 p-3 mb-3">
      <div class="adm-filters">
        <div>
          <label class="form-label">Тип</label>
          <select
            v-model="filters.type"
            class="form-select border-0 bg-light rounded-3"
          >
            <option value="">Все типы</option>
            <option value="expense">Расходы</option>
            <option value="income">Прочие доходы</option>
          </select>
        </div>
        <div>
          <label class="form-label">Категория</label>
          <select
            v-model="filters.category"
            class="form-select border-0 bg-light rounded-3"
          >
            <option value="">Все категории</option>
            <option
              v-for="cat in expenseCategories"
              :key="cat.value"
              :value="cat.value"
            >
              {{ cat.label }}
            </option>
          </select>
        </div>
        <div>
          <label class="form-label">Способ оплаты</label>
          <select
            v-model="filters.payment_method"
            class="form-select border-0 bg-light rounded-3"
          >
            <option value="">Все</option>
            <option value="cash">Наличные</option>
            <option value="bank">Безнал</option>
          </select>
        </div>
        <div>
          <label class="form-label">Сотрудник</label>
          <select
            v-model="filters.user_id"
            class="form-select border-0 bg-light rounded-3"
          >
            <option value="">Все</option>
            <option
              v-for="staff in staffList"
              :key="staff.id"
              :value="staff.id"
            >
              {{ staff.name }}
            </option>
          </select>
        </div>
        <div>
          <label class="form-label">С даты</label>
          <input
            v-model="filters.date_from"
            type="date"
            class="form-control border-0 bg-light rounded-3"
          />
        </div>
        <div>
          <label class="form-label">По дату</label>
          <input
            v-model="filters.date_to"
            type="date"
            class="form-control border-0 bg-light rounded-3"
          />
        </div>
        <div>
          <button class="btn btn-light rounded-3 w-100" @click="resetFilters">
            <i class="bi bi-x-circle me-1"></i>Сбросить
          </button>
        </div>
      </div>
    </div>

    <div class="card border-0 shadow-sm rounded-4 overflow-hidden">
      <div v-if="loading" class="adm-empty">
        <div class="spinner-border text-primary"></div>
      </div>
      <div v-else-if="transactions.length === 0" class="adm-empty">
        <i class="bi bi-wallet2 fs-1 d-block mb-2 opacity-50"></i>
        Операций не найдено
      </div>
      <template v-else>
        <!-- Телефон: карточки -->
        <div class="adm-mlist d-md-none">
          <div v-for="t in transactions" :key="t.id" class="adm-mcard">
            <div class="adm-mline">
              <span class="adm-mtitle">{{ getCategoryLabel(t.category) }}</span>
              <span
                class="adm-mval"
                :class="t.type === 'expense' ? 'text-danger' : 'text-success'"
              >
                {{ t.type === "expense" ? "−" : "+" }}{{ formatPrice(t.amount) }}
              </span>
            </div>
            <div v-if="t.description" class="adm-msub text-wrap">{{ t.description }}</div>
            <div class="adm-mline">
              <span class="adm-msub">
                {{ formatDate(t.created_at) }} ·
                {{ t.payment_method === "cash" ? "Наличные" : "Безнал" }}
                <template v-if="t.user"> · {{ t.user.name }}</template>
              </span>
              <div class="adm-mactions">
                <button class="adm-ico primary" title="Изменить" @click="handleEdit(t)">
                  <i class="bi bi-pencil"></i>
                </button>
                <button class="adm-ico danger" title="Удалить" @click="handleDelete(t.id)">
                  <i class="bi bi-trash"></i>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Планшет и десктоп: плотная таблица -->
        <div class="adm-table-wrap d-none d-md-block" style="max-height: calc(100vh - 380px); min-height: 240px;">
          <table class="adm-table">
            <thead>
              <tr>
                <th class="adm-num">#</th>
                <th>Дата</th>
                <th>Категория</th>
                <th>Описание</th>
                <th>Сотрудник</th>
                <th>Оплата</th>
                <th class="text-end">Сумма</th>
                <th class="text-end" style="width: 80px;"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(t, i) in transactions" :key="t.id">
                <td class="adm-num">{{ i + 1 }}</td>
                <td class="adm-nowrap">{{ formatDate(t.created_at) }}</td>
                <td class="adm-nowrap">
                  <span
                    class="badge rounded-pill px-2"
                    :class="
                      t.type === 'expense'
                        ? 'bg-danger-subtle text-danger'
                        : 'bg-success-subtle text-success'
                    "
                  >
                    {{ getCategoryLabel(t.category) }}
                  </span>
                </td>
                <td class="adm-clip text-muted" :title="t.description">{{ t.description || "—" }}</td>
                <td class="adm-nowrap">{{ t.user?.name || "—" }}</td>
                <td class="adm-nowrap text-muted">
                  {{ t.payment_method === "cash" ? "Наличные" : "Безнал" }}
                </td>
                <td
                  class="adm-nowrap text-end fw-bold"
                  :class="t.type === 'expense' ? 'text-danger' : 'text-success'"
                >
                  {{ t.type === "expense" ? "−" : "+" }}{{ formatPrice(t.amount) }}
                </td>
                <td class="adm-nowrap text-end">
                  <div class="d-inline-flex gap-1">
                    <button class="adm-ico primary" title="Изменить" @click="handleEdit(t)">
                      <i class="bi bi-pencil"></i>
                    </button>
                    <button class="adm-ico danger" title="Удалить" @click="handleDelete(t.id)">
                      <i class="bi bi-trash"></i>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>

    
    <div v-if="showModal" class="modal-backdrop fade show"></div>
    <div v-if="showModal" class="modal fade show d-block" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 shadow-lg rounded-4">
          <div class="modal-header border-0 p-4">
            <h5 class="modal-title fw-black">
              {{ isEditing ? "Редактирование операции" : "Новая операция" }}
            </h5>
            <button
              type="button"
              class="btn-close"
              @click="showModal = false"
            ></button>
          </div>
          <form @submit.prevent="handleSubmit">
            <div class="modal-body p-4 pt-0">
              <div class="mb-3">
                <label class="form-label small fw-bold">Тип операции</label>
                <div class="d-flex gap-2">
                  <input
                    type="radio"
                    v-model="form.type"
                    value="expense"
                    class="btn-check"
                    id="typeExp"
                  />
                  <label
                    class="btn btn-outline-danger w-100 rounded-3"
                    for="typeExp"
                    >Расход</label
                  >

                  <input
                    type="radio"
                    v-model="form.type"
                    value="income"
                    class="btn-check"
                    id="typeInc"
                  />
                  <label
                    class="btn btn-outline-success w-100 rounded-3"
                    for="typeInc"
                    >Прочий доход</label
                  >
                </div>
              </div>

              <div class="row g-3">
                <div class="col-md-6">
                  <label class="form-label small fw-bold">Сумма (сом) *</label>
                  <input
                    v-model="form.amount"
                    type="number"
                    step="0.01"
                    class="form-control rounded-3"
                    required
                    placeholder="0.00"
                  />
                </div>
                <div class="col-md-6">
                  <label class="form-label small fw-bold"
                    >Способ оплаты *</label
                  >
                  <select
                    v-model="form.payment_method"
                    class="form-select rounded-3"
                    required
                  >
                    <option value="cash">Наличные</option>
                    <option value="bank">Безнал (Карта / MBank)</option>
                  </select>
                </div>
                <div class="col-md-6">
                  <label class="form-label small fw-bold">Дата *</label>
                  <input
                    v-model="form.created_at"
                    type="date"
                    class="form-control rounded-3"
                    required
                  />
                </div>
                <div class="col-12">
                  <label class="form-label small fw-bold">Категория *</label>
                  <select
                    v-model="form.category"
                    class="form-select rounded-3"
                    required
                  >
                    <option
                      v-for="cat in expenseCategories"
                      :key="cat.value"
                      :value="cat.value"
                    >
                      {{ cat.label }}
                    </option>
                  </select>
                </div>
                <div class="col-12">
                  <label class="form-label small fw-bold"
                    >Описание / Примечание</label
                  >
                  <textarea
                    v-model="form.description"
                    class="form-control rounded-3"
                    rows="3"
                    placeholder="Например: За интернет за декабрь"
                  ></textarea>
                </div>
              </div>
            </div>
            <div class="modal-footer border-0 p-4">
              <button
                type="button"
                class="btn btn-light rounded-pill px-4"
                @click="showModal = false"
              >
                Отмена
              </button>
              <button
                type="submit"
                class="btn btn-primary rounded-pill px-4 fw-bold"
                :disabled="submitting"
              >
                <span
                  v-if="submitting"
                  class="spinner-border spinner-border-sm me-2"
                ></span>
                Сохранить
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.min-w-0 {
  min-width: 0;
}
.fw-black {
  font-weight: 900;
}
.btn-light-danger {
  color: #dc3545;
  background-color: #fff5f5;
  border: none;
}
.btn-light-danger:hover {
  background-color: #dc3545;
  color: white;
}
.modal-backdrop {
  z-index: 1050;
}
.modal {
  z-index: 1060;
}
</style>
