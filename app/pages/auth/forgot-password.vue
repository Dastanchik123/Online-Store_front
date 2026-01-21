<script setup>
definePageMeta({
  layout: "auth",
  middleware: "guest",
});

const email = ref("");
const isLoading = ref(false);
const isSent = ref(false);
const uiStore = useUiStore();
const api = useApi();

const sendLink = async () => {
  if (!email.value) return;
  isLoading.value = true;
  try {
    
    
    
    
    await api.apiFetch("/forgot-password", {
      method: "POST",
      body: { email: email.value },
    });
    isSent.value = true;
    uiStore.success("Ссылка для сброса отправлена на почту");
  } catch (e) {
    if (e.statusCode === 404) {
      uiStore.error(
        "Функция восстановления временно недоступна (SMTP не настроен)"
      );
    } else {
      uiStore.error(e.data?.message || "Ошибка отправки");
    }
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <div
    class="card border-0 shadow-lg rounded-4 overflow-hidden animate-fade-in"
    style="max-width: 400px; width: 100%"
  >
    <div class="card-body p-5">
      <div class="text-center mb-4">
        <div
          class="mx-auto mb-3 bg-primary bg-opacity-10 text-primary rounded-circle d-flex align-items-center justify-content-center"
          style="width: 60px; height: 60px"
        >
          <i class="bi bi-key fs-3"></i>
        </div>
        <h4 class="fw-bold">Забыли пароль?</h4>
        <p class="text-muted small mb-0" v-if="!isSent">
          Введите ваш email, и мы отправим вам инструкцию по сбросу пароля.
        </p>
        <p class="text-success small mb-0" v-else>
          Проверьте вашу почту. Мы отправили письмо с инструкцией.
        </p>
      </div>

      <form v-if="!isSent" @submit.prevent="sendLink">
        <div class="mb-4">
          <label class="form-label small text-muted text-uppercase fw-bold"
            >Email</label
          >
          <div class="input-group">
            <span class="input-group-text bg-white border-end-0 text-muted"
              ><i class="bi bi-envelope"></i
            ></span>
            <input
              v-model="email"
              type="email"
              class="form-control border-start-0 ps-0 py-2"
              placeholder="name@example.com"
              required
            />
          </div>
        </div>

        <button
          type="submit"
          class="btn btn-primary w-100 rounded-pill py-2 fw-bold mb-3 shadow-sm"
          :disabled="isLoading"
        >
          <span
            v-if="isLoading"
            class="spinner-border spinner-border-sm me-2"
          ></span>
          {{ isLoading ? "Отправка..." : "Отправить ссылку" }}
        </button>
      </form>

      <div v-else class="text-center mb-4">
        <button
          class="btn btn-outline-primary rounded-pill w-100"
          @click="isSent = false"
        >
          Отправить повторно
        </button>
      </div>

      <div class="text-center">
        <NuxtLink
          to="/auth/login"
          class="small text-decoration-none fw-bold text-muted transition-hover"
        >
          <i class="bi bi-arrow-left me-1"></i> Вернуться ко входу
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.transition-hover:hover {
  color: var(--bs-primary) !important;
}
</style>
