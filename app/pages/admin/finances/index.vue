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
    uiStore.error("Ошибка при удалении");
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
  <div class="finances-page p-4 animate-fade-in">
    <div class="d-flex justify-content-between align-items-center mb-4">
      <div>
        <h1 class="h3 fw-black mb-1">Учёт расходов и доходов</h1>
        <p class="text-muted small mb-0">
          Управление операционными затратами (налоги, интернет и пр.)
        </p>
      </div>

      <div class="d-flex gap-4">
        <div
          class="d-flex align-items-center bg-white shadow-sm px-4 py-2 rounded-4 border-start border-4 border-success"
        >
          <div class="me-3 bg-success-subtle p-2 rounded-circle text-success">
            <i class="bi bi-cash-stack fs-5"></i>
          </div>
          <div>
            <div class="small text-muted fw-bold">НАЛИЧНЫЕ</div>
            <div class="fw-black fs-5">{{ formatPrice(balances.cash) }}</div>
          </div>
        </div>
        <div
          class="d-flex align-items-center bg-white shadow-sm px-4 py-2 rounded-4 border-start border-4 border-primary"
        >
          <div class="me-3 bg-primary-subtle p-2 rounded-circle text-primary">
            <i class="bi bi-bank fs-5"></i>
          </div>
          <div>
            <div class="small text-muted fw-bold">НА СЧЕТУ</div>
            <div class="fw-black fs-5">{{ formatPrice(balances.bank) }}</div>
          </div>
        </div>
      </div>

      <button
        class="btn btn-primary rounded-pill px-4 shadow-sm fw-bold"
        @click="showModal = true"
      >
        <i class="bi bi-plus-lg me-2"></i> Добавить операцию
      </button>
    </div>

    
    <div class="card border-0 shadow-sm rounded-4 p-4 mb-4">
      <div class="row g-3 align-items-end">
        <div class="col-md-3">
          <label class="form-label small fw-bold text-muted text-uppercase"
            >Тип</label
          >
          <select
            v-model="filters.type"
            class="form-select border-0 bg-light rounded-3"
          >
            <option value="">Все типы</option>
            <option value="expense">Расходы</option>
            <option value="income">Прочие доходы</option>
          </select>
        </div>
        <div class="col-md-3">
          <label class="form-label small fw-bold text-muted text-uppercase"
            >Категория</label
          >
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
        <div class="col-md-2">
          <label class="form-label small fw-bold text-muted text-uppercase"
            >Сотрудник</label
          >
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
        <div class="col-md-2">
          <label class="form-label small fw-bold text-muted text-uppercase"
            >От</label
          >
          <input
            v-model="filters.date_from"
            type="date"
            class="form-control border-0 bg-light rounded-3"
          />
        </div>
        <div class="col-md-2">
          <label class="form-label small fw-bold text-muted text-uppercase"
            >До</label
          >
          <input
            v-model="filters.date_to"
            type="date"
            class="form-control border-0 bg-light rounded-3"
          />
        </div>
        <div class="col-md-2">
          <button
            class="btn btn-light w-100 rounded-3 text-truncate"
            @click="
              filters = {
                type: 'expense',
                category: '',
                user_id: '',
                date_from: '',
                date_to: '',
                page: 1,
              }
            "
          >
            Сбросить
          </button>
        </div>
      </div>
    </div>

    
    <div class="card border-0 shadow-sm rounded-4 overflow-hidden">
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead class="bg-light">
            <tr>
              <th
                class="ps-4 py-3 border-0 small text-uppercase fw-bold text-muted"
              >
                Дата
              </th>
              <th class="py-3 border-0 small text-uppercase fw-bold text-muted">
                Категория
              </th>
              <th class="py-3 border-0 small text-uppercase fw-bold text-muted">
                Описание
              </th>
              <th class="py-3 border-0 small text-uppercase fw-bold text-muted">
                Сотрудник
              </th>
              <th
                class="py-3 border-0 small text-uppercase fw-bold text-muted text-end"
              >
                Сумма
              </th>
              <th class="py-3 border-0 pe-4 text-end"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading" v-for="i in 3" :key="i">
              <td colspan="5" class="py-4 text-center">
                <div class="placeholder-glow">
                  <span class="placeholder col-12"></span>
                </div>
              </td>
            </tr>
            <tr v-else-if="transactions.length === 0">
              <td colspan="5" class="py-5 text-center text-muted">
                Операций не найдено
              </td>
            </tr>
            <tr v-for="t in transactions" :key="t.id">
              <td class="ps-4 fw-medium">{{ formatDate(t.created_at) }}</td>
              <td>
                <span
                  class="badge rounded-pill px-3"
                  :class="
                    t.type === 'expense'
                      ? 'bg-danger-subtle text-danger'
                      : 'bg-success-subtle text-success'
                  "
                >
                  {{ getCategoryLabel(t.category) }}
                </span>
              </td>
              <td class="text-muted small">{{ t.description || "—" }}</td>
              <td class="small">
                <div v-if="t.user" class="d-flex align-items-center">
                  <div
                    class="avatar-xs bg-light rounded-circle me-1 text-center"
                    style="
                      width: 20px;
                      height: 20px;
                      font-size: 10px;
                      line-height: 20px;
                    "
                  >
                    <i class="bi bi-person text-secondary"></i>
                  </div>
                  {{ t.user.name }}
                </div>
                <span v-else class="text-muted opacity-50">—</span>
              </td>
              <td
                class="text-end fw-bold"
                :class="t.type === 'expense' ? 'text-danger' : 'text-success'"
              >
                {{ t.type === "expense" ? "-" : "+"
                }}{{ formatPrice(t.amount) }}
                <div class="small fw-normal opacity-50">
                  {{ t.payment_method === "cash" ? "Наличные" : "Безнал" }}
                </div>
              </td>
              <td class="pe-4 text-end">
                <button
                  class="btn btn-sm btn-light text-primary rounded-pill me-2"
                  @click="handleEdit(t)"
                >
                  <i class="bi bi-pencil"></i>
                </button>
                <button
                  class="btn btn-sm btn-light-danger rounded-pill"
                  @click="handleDelete(t.id)"
                >
                  <i class="bi bi-trash"></i>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
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
.finances-page {
  background-color: #f8fafc;
  min-height: 100vh;
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
