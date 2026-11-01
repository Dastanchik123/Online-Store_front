<script setup>
// Вход покупателя по номеру телефона и коду из SMS. Регистрации отдельно нет:
// новый номер сам создаёт аккаунт, имя спрашиваем один раз после кода.
// Сотрудники входят по паролю на /auth/staff.
const { sendPhoneCode, verifyPhoneCode, saveName } = useAuth();
const uiStore = useUiStore();
const route = useRoute();

definePageMeta({
  layout: "auth",
  middleware: "guest",
});

const CODE_LENGTH = 4;

const step = ref("phone"); // phone → code → name
const phoneDigits = ref(""); // 9 цифр после +996
const code = ref("");
const name = ref("");
const error = ref("");
const loading = ref(false);
const resendIn = ref(0);
let resendTimer = null;

const phoneEl = ref(null);
const codeEl = ref(null);
const nameEl = ref(null);

const fullPhone = computed(() => `+996${phoneDigits.value}`);
const phoneReady = computed(() => phoneDigits.value.length === 9);
// «555 123 456» — так номер легче проверить глазами
const phonePretty = computed(() =>
  phoneDigits.value.replace(/(\d{3})(?=\d)/g, "$1 ").trim(),
);

// Только внутренний адрес: ссылка «?redirect=https://…» не должна уводить
// с сайта после входа
const redirectTo = computed(() => {
  const target = String(route.query.redirect || "");
  return target.startsWith("/") && !target.startsWith("//") ? target : "/";
});

const onPhoneInput = (e) => {
  // Вставили номер целиком (+996…, 0555…) — оставляем 9 цифр абонента
  let digits = e.target.value.replace(/\D+/g, "");
  if (digits.startsWith("996") && digits.length > 9) digits = digits.slice(3);
  if (digits.startsWith("0") && digits.length > 9) digits = digits.slice(1);
  phoneDigits.value = digits.slice(0, 9);
  e.target.value = phonePretty.value;
  error.value = "";
};

const startResendTimer = (seconds) => {
  clearInterval(resendTimer);
  resendIn.value = seconds;
  resendTimer = setInterval(() => {
    resendIn.value -= 1;
    if (resendIn.value <= 0) clearInterval(resendTimer);
  }, 1000);
};

const messageOf = (e, fallback) =>
  e?.data?.errors?.phone?.[0] ||
  e?.data?.errors?.code?.[0] ||
  e?.data?.errors?.name?.[0] ||
  e?.data?.message ||
  fallback;

const requestCode = async () => {
  if (!phoneReady.value || loading.value) return;
  loading.value = true;
  error.value = "";
  try {
    const res = await sendPhoneCode(fullPhone.value);
    step.value = "code";
    code.value = "";
    startResendTimer(res?.resend_in || 60);
    nextTick(() => codeEl.value?.focus());
  } catch (e) {
    error.value = messageOf(e, "Не удалось отправить SMS. Попробуйте ещё раз.");
  } finally {
    loading.value = false;
  }
};

const finish = async () => {
  await navigateTo(redirectTo.value);
};

const submitCode = async () => {
  if (code.value.length !== CODE_LENGTH || loading.value) return;
  loading.value = true;
  error.value = "";
  try {
    const res = await verifyPhoneCode(fullPhone.value, code.value);
    clearInterval(resendTimer);
    if (res.needs_name) {
      step.value = "name";
      nextTick(() => nameEl.value?.focus());
    } else {
      uiStore.success(`Здравствуйте, ${res.user?.name || ""}!`);
      await finish();
    }
  } catch (e) {
    error.value = messageOf(e, "Неверный код. Попробуйте ещё раз.");
    code.value = "";
    nextTick(() => codeEl.value?.focus());
  } finally {
    loading.value = false;
  }
};

// Код проверяется сам, как только введена последняя цифра
const onCodeInput = (e) => {
  code.value = e.target.value.replace(/\D+/g, "").slice(0, CODE_LENGTH);
  e.target.value = code.value;
  error.value = "";
  if (code.value.length === CODE_LENGTH) submitCode();
};

const changePhone = () => {
  clearInterval(resendTimer);
  step.value = "phone";
  code.value = "";
  error.value = "";
  nextTick(() => phoneEl.value?.focus());
};

const submitName = async () => {
  if (!name.value.trim() || loading.value) return;
  loading.value = true;
  error.value = "";
  try {
    await saveName(name.value.trim());
    uiStore.success(`Добро пожаловать, ${name.value.trim()}!`);
    await finish();
  } catch (e) {
    error.value = messageOf(e, "Не удалось сохранить имя.");
  } finally {
    loading.value = false;
  }
};

onMounted(() => nextTick(() => phoneEl.value?.focus()));
onUnmounted(() => clearInterval(resendTimer));
</script>

<template>
  <div class="auth-viewport">
    <div class="auth-bubble bubble-1"></div>
    <div class="auth-bubble bubble-2"></div>

    <div class="auth-card-container animate-fade-in">
      <div class="auth-glass-card shadow-2xl">
        <!-- Шаг 1: номер -->
        <form v-if="step === 'phone'" class="auth-form" @submit.prevent="requestCode">
          <div class="auth-header text-center mb-4">
            <div class="auth-logo mb-3"><i class="bi bi-phone-fill"></i></div>
            <h2 class="auth-title fw-bold">Вход</h2>
            <p class="auth-subtitle">Введите номер телефона — пришлём код в SMS</p>
          </div>

          <label class="form-label-premium" for="login-phone">Номер телефона</label>
          <div class="input-premium-group phone-group" :class="{ 'has-error': error }">
            <span class="phone-prefix">+996</span>
            <input
              id="login-phone"
              ref="phoneEl"
              :value="phonePretty"
              type="tel"
              inputmode="numeric"
              autocomplete="tel-national"
              placeholder="555 123 456"
              class="phone-input"
              @input="onPhoneInput"
            />
          </div>

          <div v-if="error" class="error-text mt-2" role="alert">{{ error }}</div>

          <button
            type="submit"
            class="btn-auth-primary w-100 mt-4"
            :disabled="!phoneReady || loading"
          >
            <span v-if="loading" class="spinner-border spinner-border-sm me-2"></span>
            Получить код
          </button>

          <p class="consent-text mt-3 mb-0">
            Нажимая «Получить код», вы соглашаетесь на обработку номера
            телефона и имени для входа и оформления заказов.
          </p>
        </form>

        <!-- Шаг 2: код из SMS -->
        <form v-else-if="step === 'code'" class="auth-form" @submit.prevent="submitCode">
          <div class="auth-header text-center mb-4">
            <div class="auth-logo mb-3"><i class="bi bi-chat-dots-fill"></i></div>
            <h2 class="auth-title fw-bold">Код из SMS</h2>
            <p class="auth-subtitle">
              Отправили на <span class="text-white fw-semibold">+996 {{ phonePretty }}</span>
            </p>
          </div>

          <label class="visually-hidden" for="login-code">Код из SMS</label>
          <div class="code-cells" @click="codeEl?.focus()">
            <!-- Одно настоящее поле поверх клеток: телефон подставляет код
                 из SMS (autocomplete="one-time-code"), вставка тоже работает -->
            <input
              id="login-code"
              ref="codeEl"
              :value="code"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              :maxlength="CODE_LENGTH"
              class="code-input"
              :disabled="loading"
              @input="onCodeInput"
            />
            <div
              v-for="i in CODE_LENGTH"
              :key="i"
              class="code-cell"
              :class="{
                filled: code.length >= i,
                active: code.length === i - 1 && !loading,
                'has-error': error,
              }"
              aria-hidden="true"
            >
              {{ code[i - 1] || "" }}
            </div>
          </div>

          <div v-if="loading" class="text-center mt-3 small auth-subtitle">
            <span class="spinner-border spinner-border-sm me-2"></span>Проверяем…
          </div>
          <div v-if="error" class="error-text text-center mt-3" role="alert">{{ error }}</div>

          <div class="d-flex justify-content-between align-items-center mt-4 small">
            <button type="button" class="link-btn" @click="changePhone">
              <i class="bi bi-arrow-left me-1"></i>Изменить номер
            </button>
            <button
              v-if="resendIn <= 0"
              type="button"
              class="link-btn"
              :disabled="loading"
              @click="requestCode"
            >
              Отправить ещё раз
            </button>
            <span v-else class="auth-subtitle">
              Ещё раз через {{ resendIn }} сек.
            </span>
          </div>
        </form>

        <!-- Шаг 3: имя (только при первом входе) -->
        <form v-else class="auth-form" @submit.prevent="submitName">
          <div class="auth-header text-center mb-4">
            <div class="auth-logo mb-3"><i class="bi bi-person-fill"></i></div>
            <h2 class="auth-title fw-bold">Как вас зовут?</h2>
            <p class="auth-subtitle">Чтобы мы знали, как к вам обращаться</p>
          </div>

          <label class="form-label-premium" for="login-name">Ваше имя</label>
          <div class="input-premium-group" :class="{ 'has-error': error }">
            <i class="bi bi-person icon-prefix"></i>
            <input
              id="login-name"
              ref="nameEl"
              v-model="name"
              type="text"
              autocomplete="given-name"
              maxlength="255"
            />
          </div>
          <div v-if="error" class="error-text mt-2" role="alert">{{ error }}</div>

          <button
            type="submit"
            class="btn-auth-primary w-100 mt-4"
            :disabled="!name.trim() || loading"
          >
            <span v-if="loading" class="spinner-border spinner-border-sm me-2"></span>
            Готово
          </button>
        </form>

        <div v-if="step === 'phone'" class="auth-footer text-center mt-4">
          <NuxtLink to="/auth/staff" class="staff-link">Вход для сотрудников</NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap");

.auth-viewport {
  font-family: "Plus Jakarta Sans", sans-serif;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0f172a;
  position: relative;
  overflow: hidden;
  padding: 2rem;
}

.auth-bubble {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  z-index: 0;
  opacity: 0.4;
}
.bubble-1 {
  width: 400px;
  height: 400px;
  background: #3b82f6;
  top: -100px;
  right: -50px;
}
.bubble-2 {
  width: 350px;
  height: 350px;
  background: #8b5cf6;
  bottom: -50px;
  left: -50px;
}

.auth-card-container {
  width: 100%;
  max-width: 440px;
  position: relative;
  z-index: 10;
}

.auth-glass-card {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 32px;
  padding: 3rem 2.5rem;
  color: #f8fafc;
}

.auth-logo {
  font-size: 2.5rem;
  background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  display: inline-block;
}

.auth-title {
  font-size: 1.85rem;
  letter-spacing: -0.02em;
  margin-bottom: 0.5rem;
}

.auth-subtitle {
  color: #94a3b8;
  font-size: 1rem;
}

.form-label-premium {
  display: block;
  font-size: 0.95rem;
  font-weight: 600;
  color: #cbd5e1;
  margin-bottom: 0.75rem;
  padding-left: 0.25rem;
}

.input-premium-group {
  position: relative;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  transition: all 0.3s;
  display: flex;
  align-items: center;
}
.input-premium-group:focus-within {
  background: rgba(255, 255, 255, 0.08);
  border-color: #3b82f6;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.15);
}
.input-premium-group.has-error {
  border-color: #ef4444;
}
.input-premium-group input {
  background: transparent;
  border: none;
  width: 100%;
  padding: 1rem 1rem 1rem 0;
  color: white;
  outline: none;
  font-size: 1.1rem;
}
.input-premium-group input::placeholder {
  color: #475569;
}

.icon-prefix {
  padding: 0 1.25rem;
  color: #64748b;
  font-size: 1.1rem;
}

/* Номер — крупно: его вводят люди, которым мелкий шрифт неудобен */
.phone-prefix {
  padding: 0 0.75rem 0 1.25rem;
  font-size: 1.35rem;
  font-weight: 700;
  color: #cbd5e1;
}
.input-premium-group .phone-input {
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.code-cells {
  position: relative;
  display: flex;
  justify-content: center;
  gap: 0.75rem;
}
.code-input {
  position: absolute;
  inset: 0;
  width: 100%;
  opacity: 0;
  font-size: 16px; /* иначе iOS увеличивает страницу при фокусе */
  caret-color: transparent;
}
.code-cell {
  width: 64px;
  height: 72px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  font-size: 2rem;
  font-weight: 800;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid rgba(255, 255, 255, 0.15);
  transition: border-color 0.2s, background 0.2s;
}
.code-cell.filled {
  background: rgba(59, 130, 246, 0.12);
  border-color: rgba(59, 130, 246, 0.5);
}
.code-cell.active {
  border-color: #3b82f6;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.15);
}
.code-cell.has-error {
  border-color: #ef4444;
}

.error-text {
  color: #fca5a5;
  font-size: 0.95rem;
  font-weight: 500;
  padding-left: 0.25rem;
}

.consent-text {
  color: #64748b;
  font-size: 0.75rem;
  text-align: center;
  line-height: 1.4;
}

.link-btn {
  background: none;
  border: 0;
  padding: 0;
  color: #60a5fa;
  font-weight: 600;
  font-size: 0.95rem;
}
.link-btn:disabled {
  opacity: 0.6;
}

.staff-link {
  color: #64748b;
  font-size: 0.85rem;
  text-decoration: none;
}
.staff-link:hover {
  color: #94a3b8;
  text-decoration: underline;
}

.btn-auth-primary {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  border: none;
  border-radius: 16px;
  padding: 1.1rem;
  font-weight: 700;
  font-size: 1.1rem;
  transition: all 0.3s;
  box-shadow: 0 10px 25px -5px rgba(37, 99, 235, 0.4);
}
.btn-auth-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%);
}
.btn-auth-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.animate-fade-in {
  animation: fadeIn 0.6s ease-out forwards;
}
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .animate-fade-in {
    animation: none;
  }
}

@media (max-width: 576px) {
  .auth-viewport {
    padding: 1rem;
    align-items: flex-start;
    padding-top: 8vh;
    min-height: 100dvh;
  }
  .auth-glass-card {
    padding: 2.25rem 1.25rem;
    border-radius: 24px;
  }
  .auth-title {
    font-size: 1.5rem;
  }
  .code-cell {
    width: 58px;
    height: 66px;
  }
  .bubble-1 {
    width: 250px;
    height: 250px;
  }
  .bubble-2 {
    width: 200px;
    height: 200px;
  }
}
</style>
