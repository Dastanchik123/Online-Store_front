<script setup>
const {
  getSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  downloadReconciliationReport,
  registerSupplierPayment,
  getPurchases,
} = useAccounting();
const uiStore = useUiStore();

definePageMeta({
  layout: "admin",
  middleware: "purchaser",
});

const suppliers = ref([]);
const loading = ref(false);
const showModal = ref(false);
const editingSupplier = ref(null);
const form = ref({
  name: "",
  phone: "",
  email: "",
  address: "",
});


const showReconciliationModal = ref(false);
const selectedSupplierForReport = ref(null);
const today = new Date().toLocaleDateString("en-CA");
const reportDates = ref({
  date_from: today,
  date_to: today,
});


const showPaymentModal = ref(false);
const selectedSupplierForPayment = ref(null);
const unpaidPurchases = ref([]);
const loadingPurchases = ref(false);
const paymentForm = ref({
  purchase_id: "",
  amount: 0,
  payment_method: "cash",
});

const openPaymentModal = async (supplier) => {
  selectedSupplierForPayment.value = supplier;
  paymentForm.value = {
    purchase_id: "",
    amount: parseFloat(supplier.debt_to_supplier || 0),
    payment_method: "cash",
  };
  showPaymentModal.value = true;

  
  loadingPurchases.value = true;
  try {
    const res = await getPurchases({ supplier_id: supplier.id });
    const allPurchases = res.data || res;
    unpaidPurchases.value = allPurchases.filter(
      (p) => parseFloat(p.total_amount) > parseFloat(p.paid_amount)
    );

    if (unpaidPurchases.value.length > 0) {
      paymentForm.value.purchase_id = unpaidPurchases.value[0].id;
      paymentForm.value.amount = Math.min(
        parseFloat(supplier.debt_to_supplier || 0),
        parseFloat(unpaidPurchases.value[0].total_amount) -
          parseFloat(unpaidPurchases.value[0].paid_amount)
      );
    }
  } catch (error) {
    console.error("Error loading purchases:", error);
  } finally {
    loadingPurchases.value = false;
  }
};

const handleRegisterPayment = async () => {
  if (!paymentForm.value.purchase_id) {
    uiStore.error("Выберите закупку для оплаты");
    return;
  }
  if (paymentForm.value.amount <= 0) {
    uiStore.error("Сумма должна быть больше 0");
    return;
  }

  try {
    await registerSupplierPayment(paymentForm.value.purchase_id, {
      amount: paymentForm.value.amount,
      payment_method: paymentForm.value.payment_method,
    });
    uiStore.success("Оплата зарегистрирована");
    showPaymentModal.value = false;
    loadSuppliers();
  } catch (error) {
    uiStore.error(error.data?.message || "Ошибка при регистрации оплаты");
  }
};

const openReconciliationModal = (supplier) => {
  selectedSupplierForReport.value = supplier;
  showReconciliationModal.value = true;
};

const handleDownloadReport = async () => {
  if (!selectedSupplierForReport.value) return;
  try {
    await downloadReconciliationReport(
      selectedSupplierForReport.value.id,
      reportDates.value
    );
    showReconciliationModal.value = false;
    uiStore.success("Акт сверки сформирован");
  } catch (error) {
    uiStore.error(error.message || "Ошибка при генерации отчета");
  }
};

const loadSuppliers = async () => {
  loading.value = true;
  try {
    const response = await getSuppliers();
    suppliers.value = response.data || response;
  } catch (error) {
    console.error("Error loading suppliers:", error);
  } finally {
    loading.value = false;
  }
};

const openModal = (supplier = null) => {
  if (supplier) {
    editingSupplier.value = supplier;
    form.value = { ...supplier };
  } else {
    editingSupplier.value = null;
    form.value = { name: "", phone: "", email: "", address: "" };
  }
  showModal.value = true;
};

const handleSubmit = async () => {
  if (!form.value.name) {
    uiStore.error("Имя поставщика обязательно");
    return;
  }

  try {
    const payload = { ...form.value };
    if (editingSupplier.value) {
      await updateSupplier(editingSupplier.value.id, payload);
      uiStore.success("Данные обновлены");
    } else {
      await createSupplier(payload);
      uiStore.success("Поставщик добавлен");
    }
    showModal.value = false;
    await loadSuppliers();
  } catch (error) {
    let msg = "Ошибка сервера";
    if (error.data?.errors) {
      msg = Object.values(error.data.errors).flat().join(", ");
    } else if (error.data?.message) {
      msg = error.data.message;
    }
    uiStore.error(msg);
    console.error("Submit error:", error);
  }
};

const handleDelete = async (id) => {
  const confirmed = await uiStore.showConfirm(
    "Удаление",
    "Вы уверены? Это действие нельзя отменить."
  );
  if (!confirmed) return;

  try {
    await deleteSupplier(id);
    uiStore.success("Удалено");
    loadSuppliers();
  } catch (error) {
    uiStore.error("Ошибка при удалении");
  }
};

const formatPrice = (price) => {
  if (price === undefined || price === null) return "0 сом";
  return parseFloat(price).toLocaleString("ru-RU") + " сом";
};

const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

onMounted(loadSuppliers);
</script>

<template>
  <div class="suppliers-page p-4">
    
    <div class="header-card mb-4 p-4 rounded-4 shadow-sm">
      <div class="row align-items-center">
        <div class="col-auto">
          <div class="header-icon-box bg-white text-primary shadow-sm">
            <i class="bi bi-truck-flatbed fs-4"></i>
          </div>
        </div>
        <div class="col">
          <h1 class="h3 mb-0 fw-bold text-white">Управление поставщиками</h1>
          <p class="mb-0 text-white-50">
            База контактов и детали сотрудничества
          </p>
        </div>
        <div class="col-auto">
          <button class="btn btn-add-supplier shadow-sm" @click="openModal()">
            <i class="bi bi-plus-lg me-2"></i>Добавить партнера
          </button>
        </div>
      </div>
    </div>

    
    <div class="card border-0 shadow-sm rounded-4 overflow-hidden">
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead>
            <tr>
              <th class="ps-4">Наименование</th>
              <th>Контакты</th>
              <th>Адрес</th>
              <th>Наш долг</th>
              <th class="text-end pe-4">Действия</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="5" class="text-center py-5">
                <div class="spinner-border text-primary" role="status"></div>
                <div class="mt-2 text-muted">Загрузка данных...</div>
              </td>
            </tr>
            <tr v-else-if="suppliers.length === 0">
              <td colspan="5" class="text-center py-5">
                <i
                  class="bi bi-person-x fs-1 text-muted opacity-25 d-block mb-3"
                ></i>
                <div class="text-muted">Поставщики не найдены</div>
              </td>
            </tr>
            <tr
              v-for="supplier in suppliers"
              :key="supplier.id"
              class="supplier-row"
            >
              <td class="ps-4">
                <div class="d-flex align-items-center">
                  <div class="supplier-avatar me-3">
                    {{ supplier.name ? supplier.name.charAt(0) : "?" }}
                  </div>
                  <div>
                    <div class="fw-bold text-dark h6 mb-0">
                      {{ supplier.name }}
                    </div>
                    <div class="text-muted small">ID: {{ supplier.id }}</div>
                  </div>
                </div>
              </td>
              <td>
                <div class="d-flex flex-column gap-1">
                  <span class="small d-flex align-items-center"
                    ><i class="bi bi-telephone text-primary me-2"></i
                    >{{ supplier.phone || "—" }}</span
                  >
                  <span class="small d-flex align-items-center"
                    ><i class="bi bi-envelope text-info me-2"></i
                    >{{ supplier.email || "—" }}</span
                  >
                </div>
              </td>
              <td class="text-muted small">
                <div class="text-truncate" style="max-width: 250px">
                  <i class="bi bi-geo-alt me-1"></i
                  >{{ supplier.address || "—" }}
                </div>
              </td>
              <td>
                <div
                  class="fw-bold"
                  :class="
                    parseFloat(supplier.debt_to_supplier || 0) > 0
                      ? 'text-danger'
                      : 'text-success'
                  "
                >
                  {{ formatPrice(supplier.debt_to_supplier) }}
                </div>
              </td>
              <td class="text-end pe-4">
                <div class="d-flex justify-content-end gap-2">
                  <button
                    v-if="parseFloat(supplier.debt_to_supplier || 0) > 0"
                    class="btn btn-action-pay"
                    @click="openPaymentModal(supplier)"
                    title="Оплатить долг"
                  >
                    <i class="bi bi-cash-coin"></i>
                  </button>
                  <button
                    class="btn btn-action-report"
                    @click="openReconciliationModal(supplier)"
                    title="Акт сверки (PDF)"
                  >
                    <i class="bi bi-file-earmark-pdf"></i>
                  </button>
                  <button
                    class="btn btn-action-edit"
                    @click="openModal(supplier)"
                    title="Редактировать"
                  >
                    <i class="bi bi-pencil-square"></i>
                  </button>
                  <button
                    class="btn btn-action-delete"
                    @click="handleDelete(supplier.id)"
                    title="Удалить"
                  >
                    <i class="bi bi-trash3"></i>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    
    <UiBaseModal
      :show="showModal"
      :title="editingSupplier ? 'Редактировать партнера' : 'Новый поставщик'"
      @close="showModal = false"
    >
      <div class="p-1">
        <div class="mb-3">
          <label class="form-label fw-bold small">Наименование *</label>
          <input
            v-model="form.name"
            type="text"
            class="form-control rounded-3"
            placeholder="ООО 'Поставка Плюс'"
            required
          />
        </div>
        <div class="row g-3 mb-3">
          <div class="col-md-6">
            <label class="form-label fw-bold small">Телефон</label>
            <input
              v-model="form.phone"
              type="text"
              class="form-control rounded-3"
              placeholder="+996..."
            />
          </div>
          <div class="col-md-6">
            <label class="form-label fw-bold small">Email</label>
            <input
              v-model="form.email"
              type="email"
              class="form-control rounded-3"
              placeholder="info@example.com"
            />
          </div>
        </div>
        <div class="mb-0">
          <label class="form-label fw-bold small">Адрес</label>
          <textarea
            v-model="form.address"
            class="form-control rounded-3"
            rows="3"
            placeholder="Город, улица, дом..."
          ></textarea>
        </div>
      </div>

      <template #footer>
        <div class="d-flex justify-content-end gap-2 w-100">
          <button
            type="button"
            class="btn btn-light px-4 rounded-pill"
            @click="showModal = false"
          >
            Отмена
          </button>
          <button
            class="btn btn-primary px-4 rounded-pill fw-bold shadow-sm"
            @click="handleSubmit"
          >
            {{ editingSupplier ? "Обновить данные" : "Создать запись" }}
          </button>
        </div>
      </template>
    </UiBaseModal>

    
    <UiBaseModal
      :show="showReconciliationModal"
      title="Сформировать акт сверки"
      @close="showReconciliationModal = false"
    >
      <div class="p-1">
        <p class="small text-muted mb-3">
          Выберите период для формирования акта взаиморасчетов с поставщиком
          <strong>{{ selectedSupplierForReport?.name }}</strong>
        </p>
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label fw-bold small">Дата с</label>
            <input
              v-model="reportDates.date_from"
              type="date"
              class="form-control rounded-3"
            />
          </div>
          <div class="col-md-6">
            <label class="form-label fw-bold small">Дата по</label>
            <input
              v-model="reportDates.date_to"
              type="date"
              class="form-control rounded-3"
            />
          </div>
        </div>
      </div>
      <template #footer>
        <div class="d-flex justify-content-end gap-2 w-100">
          <button
            type="button"
            class="btn btn-light px-4 rounded-pill"
            @click="showReconciliationModal = false"
          >
            Отмена
          </button>
          <button
            class="btn btn-danger px-4 rounded-pill fw-bold shadow-sm"
            @click="handleDownloadReport"
          >
            <i class="bi bi-file-earmark-pdf me-2"></i>Скачать PDF
          </button>
        </div>
      </template>
    </UiBaseModal>

    
    <UiBaseModal
      v-if="selectedSupplierForPayment"
      :show="showPaymentModal"
      :title="'Регистрация оплаты: ' + selectedSupplierForPayment.name"
      @close="showPaymentModal = false"
    >
      <div class="p-1">
        <div
          class="alert alert-info rounded-4 border-0 mb-4 d-flex align-items-center"
        >
          <i class="bi bi-info-circle-fill fs-4 me-3"></i>
          <div>
            <div class="fw-bold">
              Текущий долг:
              {{ formatPrice(selectedSupplierForPayment.debt_to_supplier) }}
            </div>
            <div class="small opacity-75">
              Выберите закупку для внесения платежа
            </div>
          </div>
        </div>

        <div v-if="loadingPurchases" class="text-center py-4">
          <div class="spinner-border text-primary" role="status"></div>
        </div>

        <div
          v-else-if="unpaidPurchases.length === 0"
          class="alert alert-warning rounded-4 border-0"
        >
          У поставщика нет активных неоплаченных закупок в системе.
        </div>

        <div v-else>
          <div class="mb-3">
            <label class="form-label fw-bold small">Закупка для оплаты *</label>
            <select
              v-model="paymentForm.purchase_id"
              class="form-select rounded-3"
            >
              <option v-for="p in unpaidPurchases" :key="p.id" :value="p.id">
                #{{ p.purchase_number || p.id }} от
                {{ formatDate(p.created_at) }} (Остаток:
                {{
                  formatPrice(
                    parseFloat(p.total_amount) - parseFloat(p.paid_amount)
                  )
                }})
              </option>
            </select>
          </div>

          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label fw-bold small">Сумма оплаты *</label>
              <div class="input-group">
                <input
                  v-model.number="paymentForm.amount"
                  type="number"
                  step="0.01"
                  class="form-control rounded-start-3"
                  placeholder="0.00"
                  required
                />
                <span class="input-group-text rounded-end-3">сом</span>
              </div>
            </div>
            <div class="col-md-6">
              <label class="form-label fw-bold small">Метод оплаты</label>
              <select
                v-model="paymentForm.payment_method"
                class="form-select rounded-3"
              >
                <option value="cash">💵 Наличные</option>
                <option value="bank_transfer">🏦 Перевод</option>
                <option value="card">💳 Карта</option>
              </select>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <div class="d-flex justify-content-end gap-2 w-100">
          <button
            type="button"
            class="btn btn-light px-4 rounded-pill"
            @click="showPaymentModal = false"
          >
            Отмена
          </button>
          <button
            class="btn btn-primary px-4 rounded-pill fw-bold shadow-sm"
            :disabled="unpaidPurchases.length === 0"
            @click="handleRegisterPayment"
          >
            Подтвердить оплату
          </button>
        </div>
      </template>
    </UiBaseModal>
  </div>
</template>

<style scoped>
.header-card {
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  border: 1px solid rgba(255, 255, 255, 0.05);
  position: relative;
  overflow: hidden;
}

.header-card::before {
  content: "";
  position: absolute;
  top: -50%;
  right: -10%;
  width: 300px;
  height: 300px;
  background: radial-gradient(
    circle,
    rgba(56, 189, 248, 0.1) 0%,
    transparent 70%
  );
  border-radius: 50%;
}

.header-icon-box {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-add-supplier {
  background: #38bdf8;
  color: #0f172a;
  border-radius: 50px;
  font-weight: 700;
  padding: 0.7rem 1.5rem;
  border: none;
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.btn-add-supplier:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 20px rgba(56, 189, 248, 0.3);
  background: #7dd3fc;
}

.supplier-avatar {
  width: 44px;
  height: 44px;
  background: #f1f5f9;
  color: #38bdf8;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 1.2rem;
  border: 2px solid #fff;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

thead th {
  background: #f8fafc;
  color: #64748b;
  font-size: 0.75rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 1rem;
  border-top: none;
}

.supplier-row {
  transition: background-color 0.2s;
}

.supplier-row:hover {
  background-color: #f1f5f9;
}

.btn-action-report,
.btn-action-edit,
.btn-action-delete,
.btn-action-pay {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  transition: all 0.2s;
}

.btn-action-pay {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

.btn-action-pay:hover {
  background: #10b981;
  color: white;
}

.btn-action-report {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.btn-action-report:hover {
  background: #dc2626;
  color: white;
}

.btn-action-edit {
  background: rgba(56, 189, 248, 0.1);
  color: #0284c7;
}

.btn-action-edit:hover {
  background: #38bdf8;
  color: white;
}

.btn-action-delete {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.btn-action-delete:hover {
  background: #ef4444;
  color: white;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(8px);
  z-index: 1050;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-content-custom {
  background: white;
  width: 100%;
  max-width: 500px;
  border-radius: 28px;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

.modal-header-custom {
  padding: 1.5rem;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.animate-slide-up {
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
</style>
