<script setup>
const { getCoupons, createCoupon, updateCoupon, deleteCoupon } = useCoupons();
const ui = useUiStore();

definePageMeta({
  layout: "admin",
  middleware: "admin",
});

const loading = ref(true);
const coupons = ref([]);
const showModal = ref(false);
const editingCoupon = ref(null);
const form = ref({
  code: "",
  type: "percent",
  value: 0,
  min_order_amount: 0,
  is_active: true,
  expires_at: "",
});

const fetchCoupons = async () => {
  loading.value = true;
  try {
    coupons.value = await getCoupons();
  } catch (e) {
    ui.addToast("Ошибка загрузки купонов", "error");
  } finally {
    loading.value = false;
  }
};

const openAddModal = () => {
  editingCoupon.value = null;
  form.value = {
    code: "",
    type: "percent",
    value: 0,
    min_order_amount: 0,
    is_active: true,
    expires_at: "",
  };
  showModal.value = true;
};

const openEditModal = (coupon) => {
  editingCoupon.value = coupon;
  form.value = {
    ...coupon,
    expires_at: coupon.expires_at ? coupon.expires_at.split("T")[0] : "",
  };
  showModal.value = true;
};

const save = async () => {
  if (!form.value.code) {
    ui.addToast("Код купона обязателен", "warning");
    return;
  }
  if (form.value.value <= 0) {
    ui.addToast("Значение скидки должно быть больше 0", "warning");
    return;
  }

  try {
    if (editingCoupon.value) {
      await updateCoupon(editingCoupon.value.id, form.value);
      ui.addToast("Купон обновлен", "success");
    } else {
      await createCoupon(form.value);
      ui.addToast("Купон создан", "success");
    }
    showModal.value = false;
    fetchCoupons();
  } catch (e) {
    ui.addToast("Ошибка сохранения", "error");
  }
};

const remove = async (id) => {
  const confirmed = await ui.showConfirm(
    "Удаление купона",
    "Вы уверены, что хотите удалить этот купон?",
  );
  if (!confirmed) return;
  try {
    await deleteCoupon(id);
    ui.addToast("Купон удален", "success");
    fetchCoupons();
  } catch (e) {
    ui.addToast("Ошибка удаления", "error");
  }
};

onMounted(fetchCoupons);
</script>

<template>
  <div class="p-4 animate-fade-in">
    <div class="d-flex justify-content-between align-items-center mb-4">
      <div>
        <h1 class="h3 fw-bold mb-1">Купоны и Акции</h1>
        <p class="text-muted small">
          Управление скидочными кодами для покупателей
        </p>
      </div>
      <button class="btn btn-primary rounded-pill px-4" @click="openAddModal">
        <i class="bi bi-plus-lg me-2"></i> Создать купон
      </button>
    </div>

    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border text-primary" role="status"></div>
    </div>

    <div v-else class="card border-0 shadow-sm rounded-4 overflow-hidden">
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead class="bg-light">
            <tr>
              <th class="ps-4">Код</th>
              <th>Тип</th>
              <th>Значение</th>
              <th>Мин. заказ</th>
              <th>Срок действия</th>
              <th>Статус</th>
              <th class="text-end pe-4">Действия</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="coupon in coupons" :key="coupon.id">
              <td class="ps-4">
                <span class="fw-bold text-primary">{{ coupon.code }}</span>
              </td>
              <td>
                <span
                  class="badge"
                  :class="
                    coupon.type === 'percent'
                      ? 'bg-info-subtle text-info'
                      : 'bg-success-subtle text-success'
                  "
                >
                  {{ coupon.type === "percent" ? "Процент" : "Фикс. сумма" }}
                </span>
              </td>
              <td>
                {{ coupon.value }}{{ coupon.type === "percent" ? "%" : " сом" }}
              </td>
              <td>{{ coupon.min_order_amount }} сом</td>
              <td>
                <span
                  :class="{
                    'text-danger':
                      coupon.expires_at &&
                      new Date(coupon.expires_at) < new Date(),
                  }"
                >
                  {{
                    coupon.expires_at
                      ? new Date(coupon.expires_at).toLocaleDateString()
                      : "Бессрочно"
                  }}
                </span>
              </td>
              <td>
                <span
                  class="badge"
                  :class="coupon.is_active ? 'bg-success' : 'bg-secondary'"
                >
                  {{ coupon.is_active ? "Активен" : "Отключен" }}
                </span>
              </td>
              <td class="text-end pe-4">
                <button
                  class="btn btn-sm btn-light rounded-circle me-2"
                  @click="openEditModal(coupon)"
                >
                  <i class="bi bi-pencil text-primary"></i>
                </button>
                <button
                  class="btn btn-sm btn-light rounded-circle"
                  @click="remove(coupon.id)"
                >
                  <i class="bi bi-trash text-danger"></i>
                </button>
              </td>
            </tr>
            <tr v-if="coupons.length === 0">
              <td colspan="7" class="text-center py-5 text-muted">
                Купонов пока нет
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
          <div class="modal-header border-0 pb-0">
            <h5 class="fw-bold">
              {{ editingCoupon ? "Редактировать купон" : "Новый купон" }}
            </h5>
            <button
              type="button"
              class="btn-close"
              @click="showModal = false"
            ></button>
          </div>
          <div class="modal-body p-4">
            <div class="mb-3">
              <label class="form-label small fw-bold">Код купона</label>
              <input
                v-model="form.code"
                type="text"
                class="form-control rounded-3"
                placeholder="SUMMER2024"
              />
            </div>
            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label small fw-bold">Тип скидки</label>
                <select v-model="form.type" class="form-select rounded-3">
                  <option value="percent">Процент (%)</option>
                  <option value="fixed">Фиксированная</option>
                </select>
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label small fw-bold">Значение</label>
                <input
                  v-model="form.value"
                  type="number"
                  class="form-control rounded-3"
                />
              </div>
            </div>
            <div class="mb-3">
              <label class="form-label small fw-bold"
                >Минимальная сумма заказа</label
              >
              <input
                v-model="form.min_order_amount"
                type="number"
                class="form-control rounded-3"
              />
            </div>
            <div class="mb-3">
              <label class="form-label small fw-bold">Дата истечения</label>
              <input
                v-model="form.expires_at"
                type="date"
                class="form-control rounded-3"
              />
            </div>
            <div class="form-check form-switch mt-4">
              <input
                v-model="form.is_active"
                class="form-check-input"
                type="checkbox"
                id="couponActive"
              />
              <label class="form-check-label fw-bold small" for="couponActive"
                >Купон активен</label
              >
            </div>
          </div>
          <div class="modal-footer border-0 pt-0">
            <button
              class="btn btn-light rounded-pill px-4"
              @click="showModal = false"
            >
              Отмена
            </button>
            <button class="btn btn-primary rounded-pill px-4" @click="save">
              Готово
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
