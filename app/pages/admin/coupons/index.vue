<script setup>
const { getCoupons, createCoupon, updateCoupon, deleteCoupon } = useCoupons();
const ui = useUiStore();

definePageMeta({
  layout: "admin",
  middleware: "permission",
  permission: "marketing.manage",
});

const loading = ref(true);
const coupons = ref([]);
const showModal = ref(false);
const editingCoupon = ref(null);
const saving = ref(false);
const form = ref({
  code: "",
  type: "percent",
  value: 0,
  min_order_amount: 0,
  usage_limit: null,
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
    usage_limit: null,
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

  if (saving.value) return;
  saving.value = true;
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
    // 422 (например, код уже занят) — показываем текст ошибки, а не общий
    const errors = e?.data?.errors;
    const firstError = errors ? Object.values(errors).flat()[0] : null;
    ui.addToast(firstError || e?.data?.message || "Ошибка сохранения", "error");
  } finally {
    saving.value = false;
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
    ui.addToast(e?.data?.message || "Ошибка удаления", "error");
  }
};

const formatMoney = (v) => (parseFloat(v) || 0).toLocaleString("ru-RU") + " сом";
const couponValue = (c) =>
  c.type === "percent" ? `${parseFloat(c.value) || 0}%` : formatMoney(c.value);
// Истёк — после конца дня «действует до»
const isExpired = (c) => !!c.expires_at && new Date(c.expires_at.split("T")[0] + "T23:59:59") < new Date();
const expiresText = (c) =>
  c.expires_at ? "до " + new Date(c.expires_at).toLocaleDateString("ru-RU") : "Бессрочно";
const statusText = (c) => {
  if (!c.is_active) return "Отключён";
  if (isExpired(c)) return "Истёк";
  return "Активен";
};

onMounted(fetchCoupons);
</script>

<template>
  <div class="adm-page p-3 p-md-4 animate-fade-in">
    <div class="adm-head">
      <div class="adm-head-title">
        <h1 class="h3">Купоны и акции</h1>
        <p class="text-muted small mb-0">Скидочные коды для покупателей</p>
      </div>
      <div class="adm-head-actions">
        <button class="btn btn-primary rounded-pill px-4 fw-bold" @click="openAddModal">
          <i class="bi bi-plus-lg me-1"></i>Создать купон
        </button>
      </div>
    </div>

    <div class="card border-0 shadow-sm rounded-4 overflow-hidden">
      <div v-if="loading" class="adm-empty">
        <div class="spinner-border text-primary" role="status"></div>
      </div>
      <div v-else-if="coupons.length === 0" class="adm-empty">
        <i class="bi bi-ticket-perforated fs-1 d-block mb-2 opacity-50"></i>
        Купонов пока нет
      </div>
      <template v-else>
        <!-- Телефон -->
        <div class="adm-mlist d-md-none">
          <div v-for="coupon in coupons" :key="coupon.id" class="adm-mcard">
            <div class="adm-mline">
              <span class="adm-mtitle coupon-code">{{ coupon.code }}</span>
              <span class="adm-mval text-primary">{{ couponValue(coupon) }}</span>
            </div>
            <div class="adm-mline">
              <span class="adm-msub">
                от {{ formatMoney(coupon.min_order_amount) }} ·
                {{ coupon.used_count || 0 }}{{ coupon.usage_limit ? ` / ${coupon.usage_limit}` : "" }} исп. ·
                <span :class="{ 'text-danger': isExpired(coupon) }">{{ expiresText(coupon) }}</span>
              </span>
              <span class="badge" :class="coupon.is_active && !isExpired(coupon) ? 'bg-success' : 'bg-secondary'">
                {{ statusText(coupon) }}
              </span>
            </div>
            <div class="adm-mline justify-content-end">
              <div class="adm-mactions">
                <button class="adm-ico primary" title="Изменить" @click="openEditModal(coupon)">
                  <i class="bi bi-pencil"></i>
                </button>
                <button class="adm-ico danger" title="Удалить" @click="remove(coupon.id)">
                  <i class="bi bi-trash"></i>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Планшет и десктоп -->
        <div class="adm-table-wrap d-none d-md-block" style="max-height: calc(100vh - 260px); min-height: 240px;">
          <table class="adm-table">
            <thead>
              <tr>
                <th>Код</th>
                <th>Тип</th>
                <th class="text-end">Скидка</th>
                <th class="text-end">Мин. заказ</th>
                <th class="text-center">Использовано</th>
                <th>Действует до</th>
                <th>Статус</th>
                <th class="text-end"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="coupon in coupons" :key="coupon.id">
                <td class="adm-nowrap"><span class="coupon-code">{{ coupon.code }}</span></td>
                <td class="adm-nowrap">
                  <span class="badge" :class="coupon.type === 'percent' ? 'bg-info-subtle text-info' : 'bg-success-subtle text-success'">
                    {{ coupon.type === "percent" ? "Процент" : "Фикс. сумма" }}
                  </span>
                </td>
                <td class="adm-nowrap text-end fw-bold">{{ couponValue(coupon) }}</td>
                <td class="adm-nowrap text-end">{{ formatMoney(coupon.min_order_amount) }}</td>
                <td class="adm-nowrap text-center">
                  {{ coupon.used_count || 0 }}{{ coupon.usage_limit ? ` / ${coupon.usage_limit}` : "" }}
                </td>
                <td class="adm-nowrap" :class="{ 'text-danger': isExpired(coupon) }">{{ expiresText(coupon) }}</td>
                <td class="adm-nowrap">
                  <span class="badge" :class="coupon.is_active && !isExpired(coupon) ? 'bg-success' : 'bg-secondary'">
                    {{ statusText(coupon) }}
                  </span>
                </td>
                <td class="adm-nowrap text-end">
                  <div class="d-inline-flex gap-1">
                    <button class="adm-ico primary" title="Изменить" @click="openEditModal(coupon)">
                      <i class="bi bi-pencil"></i>
                    </button>
                    <button class="adm-ico danger" title="Удалить" @click="remove(coupon.id)">
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
      <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
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
            <div class="row g-2">
              <div class="col-6 mb-3">
                <label class="form-label small fw-bold">Тип скидки</label>
                <select v-model="form.type" class="form-select rounded-3">
                  <option value="percent">Процент (%)</option>
                  <option value="fixed">Фиксированная</option>
                </select>
              </div>
              <div class="col-6 mb-3">
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
              <label class="form-label small fw-bold">Лимит использований</label>
              <input
                v-model.number="form.usage_limit"
                type="number"
                min="1"
                placeholder="Без лимита"
                class="form-control rounded-3"
              />
              <div v-if="editingCoupon" class="form-text">
                Использован: {{ editingCoupon.used_count || 0 }} раз. Один покупатель может применить купон только один раз.
              </div>
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
            <button
              class="btn btn-primary rounded-pill px-4"
              :disabled="saving"
              @click="save"
            >
              Готово
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.coupon-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 800;
  color: #0369a1;
  letter-spacing: 0.03em;
}
</style>
