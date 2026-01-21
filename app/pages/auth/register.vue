<script setup>
const { register } = useAuth();
const uiStore = useUiStore();

definePageMeta({
  layout: "auth",
  middleware: "guest",
});

const form = ref({
  name: "",
  email: "",
  password: "",
  password_confirmation: "",
});

const errors = ref({});
const loading = ref(false);
const showPassword = ref(false);
const showConfirmPassword = ref(false);

const handleSubmit = async () => {
  errors.value = {};
  loading.value = true;

  try {
    await register(form.value);
    uiStore.success("Аккаунт успешно создан!");
    await navigateTo("/");
  } catch (error) {
    if (error.data?.errors) {
      errors.value = error.data.errors;
    } else if (error.data?.message) {
      errors.value = { general: [error.data.message] };
    } else {
      errors.value = {
        general: ["Ошибка при регистрации. Проверьте данные."],
      };
    }
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="auth-viewport">
    <div class="auth-bubble bubble-1"></div>
    <div class="auth-bubble bubble-2"></div>

    <div class="auth-card-container animate-fade-in">
      <div class="auth-glass-card shadow-2xl">
        <div class="auth-header text-center mb-5">
          <div class="auth-logo mb-3">
            <i class="bi bi-person-plus-fill"></i>
          </div>
          <h2 class="auth-title fw-bold">Создать аккаунт</h2>
          <p class="auth-subtitle">Начните свой путь с нами сегодня</p>
        </div>

        <form @submit.prevent="handleSubmit" class="auth-form">
          <div
            v-if="errors.general"
            class="alert alert-glass-danger mb-4 animate-shake"
          >
            <div
              v-for="error in errors.general"
              :key="error"
              class="d-flex align-items-center"
            >
              <i class="bi bi-exclamation-triangle-fill me-2"></i>
              <span>{{ error }}</span>
            </div>
          </div>

          <div class="form-group mb-4">
            <label class="form-label-premium">Полное имя</label>
            <div
              class="input-premium-group"
              :class="{ 'has-error': errors.name }"
            >
              <i class="bi bi-person icon-prefix"></i>
              <input
                v-model="form.name"
                type="text"
                placeholder="Иван Иванов"
                required
              />
            </div>
            <div v-if="errors.name" class="error-text mt-1">
              {{ errors.name[0] }}
            </div>
          </div>

          <div class="form-group mb-4">
            <label class="form-label-premium">Email адрес</label>
            <div
              class="input-premium-group"
              :class="{ 'has-error': errors.email }"
            >
              <i class="bi bi-envelope icon-prefix"></i>
              <input
                v-model="form.email"
                type="email"
                placeholder="your@example.com"
                required
              />
            </div>
            <div v-if="errors.email" class="error-text mt-1">
              {{ errors.email[0] }}
            </div>
          </div>

          <div class="row g-3 mb-4">
            <div class="col-md-6 text-start">
              <label class="form-label-premium">Пароль</label>
              <div
                class="input-premium-group"
                :class="{ 'has-error': errors.password }"
              >
                <i class="bi bi-lock icon-prefix"></i>
                <input
                  v-model="form.password"
                  :type="showPassword ? 'text' : 'password'"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  @click="showPassword = !showPassword"
                  class="btn-toggle-password p-0 pe-3"
                  tabindex="-1"
                >
                  <i
                    :class="
                      showPassword ? 'bi bi-eye-slash-fill' : 'bi bi-eye-fill'
                    "
                  ></i>
                </button>
              </div>
              <div v-if="errors.password" class="error-text mt-1">
                {{ errors.password[0] }}
              </div>
            </div>
            <div class="col-md-6 text-start">
              <label class="form-label-premium">Контроль</label>
              <div
                class="input-premium-group"
                :class="{ 'has-error': errors.password_confirmation }"
              >
                <i class="bi bi-shield-check icon-prefix"></i>
                <input
                  v-model="form.password_confirmation"
                  :type="showConfirmPassword ? 'text' : 'password'"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  @click="showConfirmPassword = !showConfirmPassword"
                  class="btn-toggle-password p-0 pe-3"
                  tabindex="-1"
                >
                  <i
                    :class="
                      showConfirmPassword
                        ? 'bi bi-eye-slash-fill'
                        : 'bi bi-eye-fill'
                    "
                  ></i>
                </button>
              </div>
              <div v-if="errors.password_confirmation" class="error-text mt-1">
                {{ errors.password_confirmation[0] }}
              </div>
            </div>
          </div>

          <button
            type="submit"
            class="btn-auth-primary w-100 mb-4"
            :disabled="loading"
          >
            <span
              v-if="loading"
              class="spinner-border spinner-border-sm me-2"
            ></span>
            {{ loading ? "Создаем аккаунт..." : "Зарегистрироваться" }}
          </button>
        </form>

        <div class="auth-footer text-center">
          <p class="mb-0 text-muted">
            Уже есть аккаунт?
            <NuxtLink to="/auth/login" class="auth-link"
              >Вход в систему</NuxtLink
            >
          </p>
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
  background: #10b981;
  bottom: -50px;
  left: -50px;
}

.auth-card-container {
  width: 100%;
  max-width: 520px;
  position: relative;
  z-index: 10;
}

.auth-glass-card {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 32px;
  padding: 3.5rem 3rem;
  color: #f8fafc;
}

.auth-logo {
  font-size: 2.5rem;
  background: linear-gradient(135deg, #3b82f6 0%, #10b981 100%);
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
  font-size: 0.95rem;
}

.form-label-premium {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  color: #cbd5e1;
  margin-bottom: 0.75rem;
  padding-left: 0.25rem;
}

.input-premium-group {
  position: relative;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  transition: all 0.3s;
  display: flex;
  align-items: center;
}

.input-premium-group:focus-within {
  background: rgba(255, 255, 255, 0.08);
  border-color: #3b82f6;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
}

.input-premium-group.has-error {
  border-color: #ef4444;
}

.icon-prefix {
  padding: 0 1.25rem;
  color: #64748b;
  font-size: 1.1rem;
}

.input-premium-group input {
  background: transparent;
  border: none;
  width: 100%;
  padding: 1rem 1rem 1rem 0;
  color: white;
  outline: none;
  font-size: 0.95rem;
}

.input-premium-group input::placeholder {
  color: #475569;
}

.btn-toggle-password {
  background: transparent;
  border: none;
  color: #64748b;
  cursor: pointer;
  transition: color 0.2s;
}

.btn-toggle-password:hover {
  color: #3b82f6;
}

.error-text {
  color: #ef4444;
  font-size: 0.75rem;
  font-weight: 500;
  padding-left: 0.5rem;
}

.btn-auth-primary {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  border: none;
  border-radius: 16px;
  padding: 1.1rem;
  font-weight: 700;
  font-size: 1rem;
  transition: all 0.3s;
  box-shadow: 0 10px 25px -5px rgba(37, 99, 235, 0.4);
}

.btn-auth-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 20px 35px -10px rgba(37, 99, 235, 0.5);
  background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%);
}

.btn-auth-primary:active {
  transform: translateY(0);
}

.btn-auth-primary:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.auth-link {
  color: #3b82f6;
  text-decoration: none;
  font-weight: 700;
  transition: color 0.2s;
}

.auth-link:hover {
  color: #60a5fa;
  text-decoration: underline;
}

.alert-glass-danger {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  color: #fca5a5;
  border-radius: 16px;
  font-size: 0.9rem;
  padding: 1rem;
}


.animate-fade-in {
  animation: fadeIn 0.6s ease-out forwards;
}

.animate-shake {
  animation: shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
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

@keyframes shake {
  10%,
  90% {
    transform: translate3d(-1px, 0, 0);
  }
  20%,
  80% {
    transform: translate3d(2px, 0, 0);
  }
  30%,
  50%,
  70% {
    transform: translate3d(-4px, 0, 0);
  }
  40%,
  60% {
    transform: translate3d(4px, 0, 0);
  }
}

@media (max-width: 576px) {
  .auth-viewport {
    padding: 1rem;
    align-items: flex-start;
    padding-top: 5vh;
    min-height: 100dvh;
  }
  .auth-glass-card {
    padding: 2rem 1.25rem;
    border-radius: 24px;
  }
  .auth-title {
    font-size: 1.5rem;
  }
  .auth-logo {
    font-size: 2rem;
  }
  .bubble-1 {
    width: 250px;
    height: 250px;
  }
  .bubble-2 {
    width: 200px;
    height: 200px;
  }
  .form-label-premium {
    font-size: 0.8rem;
  }
}
</style>
