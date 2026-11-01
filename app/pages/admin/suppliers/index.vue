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
const authStore = useAuthStore();

definePageMeta({
  layout: "admin",
  middleware: "permission",
  permission: "suppliers.manage",
});

const suppliers = ref([]);
const loading = ref(false);

// Поиск по уже загруженному списку (поставщиков немного — без запроса)
const supplierSearch = ref("");
const visibleSuppliers = computed(() => {
  const q = supplierSearch.value.trim().toLowerCase();
  if (!q) return suppliers.value;
  return suppliers.value.filter((s) =>
    [s.name, s.phone, s.email, s.address].some((v) => String(v || "").toLowerCase().includes(q)),
  );
});

const supplierDebt = (s) => parseFloat(s.debt_to_supplier || 0);
// Отрицательный долг — переплата/возврат: поставщик должен нам
const debtText = (s) => {
  const d = supplierDebt(s);
  if (d < 0) return "−" + formatPrice(Math.abs(d)) + " нам";
  return formatPrice(d);
};
const debtClass = (s) => {
  const d = supplierDebt(s);
  if (d > 0) return "text-danger";
  if (d < 0) return "text-success";
  return "text-muted";
};
const supplierTotals = computed(() =>
  suppliers.value.reduce(
    (acc, s) => {
      const d = supplierDebt(s);
      if (d > 0) acc.weOwe += d;
      else acc.theyOwe += -d;
      return acc;
    },
    { weOwe: 0, theyOwe: 0 },
  ),
);
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
    uiStore.error(apiErrorMessage(error, "Ошибка при регистрации оплаты"));
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
    uiStore.error(error?.data?.message || "Ошибка при удалении");
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
  <div class="adm-page suppliers-page p-3 p-md-4">
    <div class="adm-head header-card rounded-4 shadow-sm p-3">
      <div class="header-icon-box bg-white text-primary shadow-sm d-none d-sm-flex">
        <i class="bi bi-truck-flatbed fs-5"></i>
      </div>
      <div class="adm-head-title">
        <h1 class="h4 mb-0 text-white">Поставщики</h1>
        <p class="mb-0 text-white-50 small">Контакты и взаиморасчёты</p>
      </div>
      <div class="adm-head-actions">
        <button class="btn btn-add-supplier shadow-sm" @click="openModal()">
          <i class="bi bi-plus-lg me-1"></i>Добавить поставщика
        </button>
      </div>
    </div>

    <div class="adm-stats">
      <div class="adm-stat">
        <div class="adm-stat-ico bg-primary-subtle text-primary"><i class="bi bi-people"></i></div>
        <div class="min-w-0">
          <div class="adm-stat-label">Поставщиков</div>
          <div class="adm-stat-value">{{ suppliers.length }}</div>
        </div>
      </div>
      <div class="adm-stat">
        <div class="adm-stat-ico bg-danger-subtle text-danger"><i class="bi bi-exclamation-circle"></i></div>
        <div class="min-w-0">
          <div class="adm-stat-label">Мы должны</div>
          <div class="adm-stat-value text-danger">{{ formatPrice(supplierTotals.weOwe) }}</div>
        </div>
      </div>
      <div class="adm-stat">
        <div class="adm-stat-ico bg-success-subtle text-success"><i class="bi bi-arrow-down-left-circle"></i></div>
        <div class="min-w-0">
          <div class="adm-stat-label">Должны нам</div>
          <div class="adm-stat-value text-success">{{ formatPrice(supplierTotals.theyOwe) }}</div>
        </div>
      </div>
    </div>

    <div class="card border-0 shadow-sm rounded-4 overflow-hidden">
      <div class="p-3 border-bottom bg-white">
        <div class="input-group search-inline">
          <span class="input-group-text border-0 bg-light"><i class="bi bi-search text-muted"></i></span>
          <input
            v-model="supplierSearch"
            type="text"
            class="form-control border-0 bg-light"
            placeholder="Название, телефон или адрес…"
          />
        </div>
      </div>

      <div v-if="loading" class="adm-empty">
        <div class="spinner-border text-primary"></div>
      </div>
      <div v-else-if="visibleSuppliers.length === 0" class="adm-empty">
        <i class="bi bi-person-x fs-1 d-block mb-2 opacity-50"></i>
        Поставщики не найдены
      </div>
      <template v-else>
        <!-- Телефон -->
        <div class="adm-mlist d-md-none">
          <div v-for="supplier in visibleSuppliers" :key="supplier.id" class="adm-mcard">
            <div class="adm-mline">
              <span class="adm-mtitle d-flex align-items-center gap-2">
                <span class="supplier-avatar sm">{{ supplier.name ? supplier.name.charAt(0) : "?" }}</span>
                <span class="text-truncate">{{ supplier.name }}</span>
              </span>
              <span class="adm-mval" :class="debtClass(supplier)">{{ debtText(supplier) }}</span>
            </div>
            <div class="adm-msub">
              <a v-if="supplier.phone" :href="`tel:${supplier.phone}`" class="text-decoration-none">
                <i class="bi bi-telephone me-1"></i>{{ supplier.phone }}
              </a>
              <span v-else>—</span>
              <template v-if="supplier.address"> · {{ supplier.address }}</template>
            </div>
            <div class="adm-mline justify-content-end">
              <div class="adm-mactions">
                <button v-if="supplierDebt(supplier) > 0" class="adm-ico success" title="Оплатить долг" @click="openPaymentModal(supplier)">
                  <i class="bi bi-cash-coin"></i>
                </button>
                <button class="adm-ico danger" title="Акт сверки (PDF)" @click="openReconciliationModal(supplier)">
                  <i class="bi bi-file-earmark-pdf"></i>
                </button>
                <button class="adm-ico primary" title="Редактировать" @click="openModal(supplier)">
                  <i class="bi bi-pencil"></i>
                </button>
                <button
                  v-if="authStore.hasPermission('suppliers.delete')"
                  class="adm-ico danger"
                  title="Удалить"
                  @click="handleDelete(supplier.id)"
                >
                  <i class="bi bi-trash3"></i>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Планшет и десктоп -->
        <div class="adm-table-wrap d-none d-md-block" style="max-height: calc(100vh - 420px); min-height: 240px;">
          <table class="adm-table">
            <thead>
              <tr>
                <th class="adm-num">#</th>
                <th>Наименование</th>
                <th>Телефон</th>
                <th>Email</th>
                <th>Адрес</th>
                <th class="text-end">Наш долг</th>
                <th class="text-end">Действия</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(supplier, i) in visibleSuppliers" :key="supplier.id">
                <td class="adm-num">{{ i + 1 }}</td>
                <td class="adm-nowrap fw-bold">{{ supplier.name }}</td>
                <td class="adm-nowrap">{{ supplier.phone || "—" }}</td>
                <td class="adm-nowrap text-muted">{{ supplier.email || "—" }}</td>
                <td class="adm-clip text-muted" :title="supplier.address">{{ supplier.address || "—" }}</td>
                <td
                  class="adm-nowrap text-end fw-bold"
                  :class="debtClass(supplier)"
                  :title="supplierDebt(supplier) < 0 ? 'Образовалось после возврата товара поставщику' : ''"
                >
                  {{ debtText(supplier) }}
                </td>
                <td class="adm-nowrap text-end">
                  <div class="d-inline-flex gap-1">
                    <button v-if="supplierDebt(supplier) > 0" class="adm-ico success" title="Оплатить долг" @click="openPaymentModal(supplier)">
                      <i class="bi bi-cash-coin"></i>
                    </button>
                    <button class="adm-ico danger" title="Акт сверки (PDF)" @click="openReconciliationModal(supplier)">
                      <i class="bi bi-file-earmark-pdf"></i>
                    </button>
                    <button class="adm-ico primary" title="Редактировать" @click="openModal(supplier)">
                      <i class="bi bi-pencil"></i>
                    </button>
                    <button
                      v-if="authStore.hasPermission('suppliers.delete')"
                      class="adm-ico danger"
                      title="Удалить"
                      @click="handleDelete(supplier.id)"
                    >
                      <i class="bi bi-trash3"></i>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
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

.adm-head .header-icon-box {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  flex-shrink: 0;
}
.supplier-avatar.sm {
  width: 28px;
  height: 28px;
  font-size: 0.85rem;
  border-radius: 8px;
  border: 0;
  box-shadow: none;
  flex-shrink: 0;
}
.search-inline .input-group-text,
.search-inline .form-control {
  border-radius: 0;
}
.search-inline .input-group-text {
  border-radius: 0.6rem 0 0 0.6rem;
}
.search-inline .form-control {
  border-radius: 0 0.6rem 0.6rem 0;
}
.min-w-0 {
  min-width: 0;
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
