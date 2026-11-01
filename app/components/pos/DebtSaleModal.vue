<template>
  <Teleport to="body">
    <Transition name="debt-modal">
      <div
        v-if="show"
        class="debt-backdrop"
        @click.self="close"
        @keydown="onKeydown"
      >
        <div
          ref="dialogEl"
          class="debt-dialog bg-white rounded-4 shadow-lg"
          role="dialog"
          aria-modal="true"
          aria-labelledby="debt-modal-title"
        >
          <!-- Шапка: сумма чека всегда перед глазами -->
          <div class="debt-header d-flex align-items-center gap-3 p-4">
            <div class="debt-header-icon rounded-4">
              <i class="bi bi-journal-bookmark-fill"></i>
            </div>
            <div class="flex-grow-1 min-w-0">
              <h5 id="debt-modal-title" class="fw-bold mb-0">
                Продажа в долг
              </h5>
              <div class="small text-muted">
                К оплате:
                <span class="fw-bold text-dark">{{ money(total) }} сом</span>
              </div>
            </div>
            <button
              type="button"
              class="btn-close"
              aria-label="Закрыть"
              @click="close"
            ></button>
          </div>

          <div class="debt-body px-4 pb-2">
            <!-- 1. Клиент -->
            <section class="debt-section">
              <div class="debt-step-label">
                <span class="debt-step">1</span> Клиент
              </div>

              <div
                v-if="customer"
                class="debt-customer d-flex align-items-center gap-3 p-3 rounded-4"
              >
                <div class="debt-avatar">
                  {{ initials(customer.name) }}
                </div>
                <div class="flex-grow-1 min-w-0">
                  <div class="fw-bold text-truncate">{{ customer.name }}</div>
                  <div class="small text-muted text-truncate">
                    {{ customer.phone || customer.email || "Без контактов" }}
                  </div>
                </div>
                <button
                  type="button"
                  class="btn btn-sm btn-light rounded-pill px-3"
                  @click="changeCustomer"
                >
                  Сменить
                </button>
              </div>

              <div v-else class="position-relative">
                <div class="input-group debt-input-group">
                  <span class="input-group-text bg-transparent border-0 ps-3">
                    <span
                      v-if="searching"
                      class="spinner-border spinner-border-sm text-primary"
                    ></span>
                    <i v-else class="bi bi-person-search text-primary"></i>
                  </span>
                  <input
                    ref="searchEl"
                    v-model="query"
                    type="text"
                    class="form-control border-0 shadow-none py-3"
                    placeholder="Имя или телефон клиента…"
                    autocomplete="off"
                    @input="onSearchInput"
                    @keydown.down.prevent="moveResult(1)"
                    @keydown.up.prevent="moveResult(-1)"
                  />
                </div>
                <div
                  v-if="results.length"
                  class="debt-results shadow rounded-4 border bg-white"
                  role="listbox"
                >
                  <button
                    v-for="(u, i) in results"
                    :key="u.id"
                    type="button"
                    role="option"
                    :aria-selected="i === resultIndex"
                    class="debt-result d-block w-100 text-start px-3 py-2"
                    :class="{ active: i === resultIndex }"
                    @mouseenter="resultIndex = i"
                    @click="pickCustomer(u)"
                  >
                    <div class="fw-semibold small">{{ u.name }}</div>
                    <div class="x-small text-muted">
                      {{ u.phone || u.email }}
                    </div>
                  </button>
                </div>
                <div
                  v-else-if="query.length >= 2 && !searching && !creating"
                  class="d-flex align-items-center gap-2 small text-muted mt-2 ps-1"
                >
                  Клиент не найден.
                  <button
                    type="button"
                    class="btn btn-link btn-sm p-0 fw-semibold"
                    @click="startCreate"
                  >
                    <i class="bi bi-person-plus me-1"></i>Добавить нового
                  </button>
                </div>

                <!-- Новый клиент: имя и номер. По номеру он сможет войти на
                     сайт через SMS и увидит свои покупки и долги -->
                <div v-if="creating" class="debt-new-customer rounded-4 p-3 mt-2">
                  <div class="row g-2">
                    <div class="col-12">
                      <input
                        ref="newNameEl"
                        v-model="newCustomer.name"
                        type="text"
                        class="form-control"
                        placeholder="Имя клиента"
                        autocomplete="off"
                      />
                    </div>
                    <div class="col-12">
                      <div class="input-group">
                        <span class="input-group-text">+996</span>
                        <input
                          v-model="newCustomer.phone"
                          type="tel"
                          inputmode="numeric"
                          class="form-control"
                          placeholder="555 123 456"
                          autocomplete="off"
                        />
                      </div>
                    </div>
                  </div>
                  <div v-if="createError" class="text-danger small mt-2">
                    {{ createError }}
                  </div>
                  <div class="d-flex gap-2 mt-2">
                    <button
                      type="button"
                      class="btn btn-sm btn-light rounded-pill px-3"
                      @click="creating = false"
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      class="btn btn-sm btn-primary rounded-pill px-3 flex-grow-1"
                      :disabled="savingCustomer"
                      @click="saveCustomer"
                    >
                      <span
                        v-if="savingCustomer"
                        class="spinner-border spinner-border-sm me-1"
                      ></span>
                      Добавить клиента
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <!-- 2. Первый взнос -->
            <section class="debt-section">
              <div class="debt-step-label">
                <span class="debt-step">2</span> Первый взнос
                <span class="text-muted fw-normal">(необязательно)</span>
              </div>

              <div class="row g-2">
                <div class="col-6">
                  <label class="debt-field">
                    <span class="debt-field-label">
                      <i class="bi bi-cash-stack text-success"></i> Наличные
                    </span>
                    <input
                      ref="cashEl"
                      v-model.number="cash"
                      type="number"
                      inputmode="decimal"
                      min="0"
                      step="0.01"
                      class="form-control form-control-lg fw-bold"
                      placeholder="0"
                      @focus="$event.target.select()"
                    />
                  </label>
                </div>
                <div class="col-6">
                  <label class="debt-field">
                    <span class="debt-field-label">
                      <i class="bi bi-qr-code text-primary"></i> QR GoPay
                    </span>
                    <input
                      v-model.number="qr"
                      type="number"
                      inputmode="decimal"
                      min="0"
                      step="0.01"
                      class="form-control form-control-lg fw-bold"
                      placeholder="0"
                      @focus="$event.target.select()"
                    />
                  </label>
                </div>
              </div>

              <div class="d-flex flex-wrap gap-2 mt-2">
                <button
                  v-for="p in presets"
                  :key="p.label"
                  type="button"
                  class="btn btn-sm rounded-pill debt-chip"
                  :class="{ active: isPresetActive(p) }"
                  @click="applyPreset(p)"
                >
                  {{ p.label }}
                </button>
              </div>
              <div v-if="qrPart > 0" class="debt-hint mt-2">
                <i class="bi bi-info-circle"></i>
                Покупатель оплатит {{ money(qrPart) }} сом по QR — долг
                оформится после подтверждения банка.
              </div>
            </section>

            <!-- 3. Срок погашения -->
            <section class="debt-section">
              <div class="debt-step-label">
                <span class="debt-step">3</span> Срок погашения
              </div>
              <div class="d-flex flex-wrap gap-2 align-items-center">
                <button
                  v-for="t in terms"
                  :key="t.label"
                  type="button"
                  class="btn btn-sm rounded-pill debt-chip"
                  :class="{ active: dueDate === termDate(t.days) }"
                  @click="dueDate = termDate(t.days)"
                >
                  {{ t.label }}
                </button>
                <input
                  v-model="dueDate"
                  type="date"
                  :min="termDate(1)"
                  class="form-control form-control-sm rounded-pill debt-date"
                />
              </div>
              <div class="small text-muted mt-1 ps-1">
                {{
                  dueDate
                    ? `Вернуть до ${formatDue(dueDate)}`
                    : "Без срока — вернёт, когда сможет"
                }}
              </div>
            </section>

            <!-- Итог -->
            <section class="debt-summary rounded-4 p-3 mb-2">
              <div class="d-flex justify-content-between small text-muted">
                <span>К оплате</span>
                <span>{{ money(total) }} сом</span>
              </div>
              <div class="d-flex justify-content-between small text-muted">
                <span>Первый взнос</span>
                <span>− {{ money(paid) }} сом</span>
              </div>
              <div
                class="progress my-2"
                role="progressbar"
                :aria-valuenow="paidPercent"
                aria-valuemin="0"
                aria-valuemax="100"
                style="height: 6px"
              >
                <div
                  class="progress-bar bg-success"
                  :style="{ width: paidPercent + '%' }"
                ></div>
              </div>
              <div class="d-flex justify-content-between align-items-baseline">
                <span class="fw-bold">Останется в долг</span>
                <span class="debt-remainder fw-black">
                  {{ money(remainder) }} <small>сом</small>
                </span>
              </div>
            </section>

            <div v-if="error" class="debt-error small mb-2" role="alert">
              <i class="bi bi-exclamation-triangle-fill me-1"></i>{{ error }}
            </div>
          </div>

          <div class="debt-footer d-flex gap-2 p-4 pt-2">
            <button
              type="button"
              class="btn btn-light rounded-pill px-4"
              @click="close"
            >
              Отмена <span class="opacity-50 small">Esc</span>
            </button>
            <button
              type="button"
              class="btn btn-primary rounded-pill flex-grow-1 fw-bold py-2"
              :disabled="!!error || submitting"
              @click="confirm"
            >
              <span
                v-if="submitting"
                class="spinner-border spinner-border-sm me-2"
              ></span>
              <i v-else class="bi bi-check2-circle me-1"></i>
              Оформить в долг {{ money(remainder) }} сом
              <span class="opacity-50 small ms-1">Enter</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
// Оформление продажи в долг на кассе: клиент, первый взнос (наличные и/или
// QR), срок погашения — в одном окне. Саму продажу проводит касса по
// событию confirm.
const props = defineProps({
  show: { type: Boolean, default: false },
  total: { type: Number, default: 0 },
  initialCustomer: { type: Object, default: null },
  submitting: { type: Boolean, default: false },
});
const emit = defineEmits(["close", "confirm"]);

const { searchUsers, createCustomer } = usePos();

const presets = [
  { label: "Без взноса", share: 0 },
  { label: "10%", share: 0.1 },
  { label: "25%", share: 0.25 },
  { label: "50%", share: 0.5 },
];
const terms = [
  { label: "7 дней", days: 7 },
  { label: "14 дней", days: 14 },
  { label: "30 дней", days: 30 },
  { label: "Без срока", days: null },
];

const dialogEl = ref(null);
const searchEl = ref(null);
const cashEl = ref(null);

const customer = ref(null);
const query = ref("");
const results = ref([]);
const resultIndex = ref(0);
const searching = ref(false);
const cash = ref(0);
const qr = ref(0);
const dueDate = ref("");

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const money = (n) =>
  round2(n).toLocaleString("ru-RU", { maximumFractionDigits: 2 });

const cashPart = computed(() => Math.max(round2(cash.value), 0));
const qrPart = computed(() => Math.max(round2(qr.value), 0));
const paid = computed(() => round2(cashPart.value + qrPart.value));
const remainder = computed(() => Math.max(round2(props.total - paid.value), 0));
const paidPercent = computed(() =>
  props.total > 0
    ? Math.min(Math.round((paid.value / props.total) * 100), 100)
    : 0,
);

// Те же правила, что проверяет сервер (PosSaleService::checkPayment)
const error = computed(() => {
  if (!customer.value) return "Выберите клиента, на которого оформить долг.";
  if (Number(cash.value) < 0 || Number(qr.value) < 0)
    return "Сумма взноса не может быть отрицательной.";
  if (qrPart.value > props.total)
    return "По QR нельзя оплатить больше суммы чека.";
  if (remainder.value <= 0)
    return "Взнос покрывает весь чек — долга нет. Проведите обычную продажу.";
  return "";
});

const termDate = (days) => {
  if (days === null) return "";
  const d = new Date();
  d.setDate(d.getDate() + days);
  // Локальная дата, а не UTC: toISOString сдвигал бы её ночью
  const pad = (v) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const formatDue = (value) =>
  new Date(`${value}T00:00:00`).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

const initials = (name = "") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";

const isPresetActive = (p) =>
  qrPart.value === 0 && cashPart.value === round2(props.total * p.share);

const applyPreset = (p) => {
  cash.value = round2(props.total * p.share);
  qr.value = 0;
};

let searchTimer = null;
let searchSeq = 0;
const onSearchInput = () => {
  clearTimeout(searchTimer);
  if (query.value.trim().length < 2) {
    results.value = [];
    searching.value = false;
    return;
  }
  searching.value = true;
  searchTimer = setTimeout(async () => {
    // Ответ на устаревший запрос не должен перезаписать свежий
    const seq = ++searchSeq;
    const data = await searchUsers(query.value.trim());
    if (seq !== searchSeq) return;
    results.value = data?.data || data || [];
    resultIndex.value = 0;
    searching.value = false;
  }, 250);
};

const moveResult = (delta) => {
  if (!results.value.length) return;
  const n = results.value.length;
  resultIndex.value = (resultIndex.value + delta + n) % n;
};

const pickCustomer = (u) => {
  customer.value = u;
  query.value = "";
  results.value = [];
  nextTick(() => cashEl.value?.focus());
};

const changeCustomer = () => {
  customer.value = null;
  nextTick(() => searchEl.value?.focus());
};

// Новый клиент с кассы: что кассир уже набрал в поиске — подставляем
// в номер (цифры) или в имя (буквы)
const newNameEl = ref(null);
const creating = ref(false);
const savingCustomer = ref(false);
const createError = ref("");
const newCustomer = ref({ name: "", phone: "" });

const startCreate = () => {
  const typed = query.value.trim();
  const digits = typed.replace(/\D+/g, "").replace(/^(996|0)/, "");
  newCustomer.value = /\d{3,}/.test(typed)
    ? { name: "", phone: digits }
    : { name: typed, phone: "" };
  createError.value = "";
  creating.value = true;
  results.value = [];
  nextTick(() => newNameEl.value?.focus());
};

const saveCustomer = async () => {
  if (!newCustomer.value.name.trim()) {
    createError.value = "Введите имя клиента.";
    return;
  }
  savingCustomer.value = true;
  createError.value = "";
  try {
    const res = await createCustomer({
      name: newCustomer.value.name.trim(),
      phone: `+996${newCustomer.value.phone}`,
    });
    creating.value = false;
    pickCustomer(res.customer);
  } catch (e) {
    createError.value =
      e?.data?.errors?.phone?.[0] ||
      e?.data?.message ||
      "Не удалось добавить клиента.";
  } finally {
    savingCustomer.value = false;
  }
};

const close = () => {
  if (!props.submitting) emit("close");
};

const confirm = () => {
  if (error.value || props.submitting) return;
  emit("confirm", {
    customer: customer.value,
    cash: cashPart.value,
    qr: qrPart.value,
    dueDate: dueDate.value || null,
  });
};

const onKeydown = (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    close();
    return;
  }
  if (e.key !== "Enter") return;
  e.preventDefault();
  // Enter в поиске выбирает клиента, в форме нового клиента — сохраняет
  // его, в остальных полях — оформляет долг
  if (creating.value) {
    saveCustomer();
    return;
  }
  if (e.target === searchEl.value) {
    const u = results.value[resultIndex.value];
    if (u) pickCustomer(u);
    return;
  }
  confirm();
};

watch(
  () => props.show,
  (open) => {
    if (!open) return;
    customer.value = props.initialCustomer;
    creating.value = false;
    query.value = "";
    results.value = [];
    cash.value = 0;
    qr.value = 0;
    dueDate.value = termDate(14);
    nextTick(() => (customer.value ? cashEl.value : searchEl.value)?.focus());
  },
);

onUnmounted(() => clearTimeout(searchTimer));
</script>

<style scoped>
.debt-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2040;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(4px);
}
.debt-dialog {
  width: 100%;
  max-width: 520px;
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.debt-body {
  overflow-y: auto;
}
.debt-header-icon {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  font-size: 1.25rem;
  color: var(--bs-primary);
  background: var(--bs-primary-bg-subtle);
}
.debt-section {
  margin-bottom: 1.25rem;
}
.debt-step-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--bs-secondary-color);
}
.debt-step {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-size: 0.7rem;
  color: #fff;
  background: var(--bs-primary);
}
.debt-customer {
  background: var(--bs-primary-bg-subtle);
}
.debt-avatar {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-weight: 700;
  color: #fff;
  background: var(--bs-primary);
}
.debt-input-group {
  border: 1px solid var(--bs-border-color);
  border-radius: 1rem;
  overflow: hidden;
}
.debt-input-group:focus-within {
  border-color: var(--bs-primary);
  box-shadow: 0 0 0 0.2rem rgba(var(--bs-primary-rgb), 0.15);
}
.debt-results {
  position: absolute;
  z-index: 5;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  max-height: 240px;
  overflow-y: auto;
}
.debt-result {
  border: 0;
  background: transparent;
}
.debt-result.active {
  background: var(--bs-primary-bg-subtle);
}
.debt-new-customer {
  background: var(--bs-tertiary-bg);
}
.debt-field {
  display: block;
  width: 100%;
}
.debt-field-label {
  display: block;
  margin-bottom: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--bs-secondary-color);
}
.debt-field .form-control {
  border-radius: 0.85rem;
}
.debt-chip {
  border: 1px solid var(--bs-border-color);
  background: var(--bs-body-bg);
  color: var(--bs-body-color);
}
.debt-chip.active {
  border-color: var(--bs-primary);
  background: var(--bs-primary);
  color: #fff;
}
.debt-date {
  width: auto;
  min-width: 150px;
}
.debt-hint {
  font-size: 0.75rem;
  color: var(--bs-primary-text-emphasis);
}
.debt-summary {
  background: var(--bs-tertiary-bg);
}
.debt-remainder {
  font-size: 1.6rem;
  color: var(--bs-primary);
}
.debt-error {
  padding: 0.5rem 0.75rem;
  border-radius: 0.75rem;
  color: var(--bs-danger-text-emphasis);
  background: var(--bs-danger-bg-subtle);
}
.debt-modal-enter-active,
.debt-modal-leave-active {
  transition: opacity 0.18s ease;
}
.debt-modal-enter-active .debt-dialog,
.debt-modal-leave-active .debt-dialog {
  transition: transform 0.18s ease;
}
.debt-modal-enter-from,
.debt-modal-leave-to {
  opacity: 0;
}
.debt-modal-enter-from .debt-dialog,
.debt-modal-leave-to .debt-dialog {
  transform: translateY(12px) scale(0.98);
}
@media (prefers-reduced-motion: reduce) {
  .debt-modal-enter-active,
  .debt-modal-leave-active,
  .debt-modal-enter-active .debt-dialog,
  .debt-modal-leave-active .debt-dialog {
    transition: none;
  }
}
</style>
