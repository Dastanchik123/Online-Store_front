<script setup>
definePageMeta({
  layout: "auth",
  middleware: "guest",
});

const route = useRoute();
const router = useRouter();
const uiStore = useUiStore();
const api = useApi();

const form = ref({
  token: route.query.token || "",
  email: route.query.email || "",
  password: "",
  password_confirmation: "",
});

const isLoading = ref(false);

const resetPassword = async () => {
  if (
    !form.value.password ||
    form.value.password !== form.value.password_confirmation
  ) {
    uiStore.error("Пароли не совпадают");
    return;
  }

  isLoading.value = true;
  try {
    await api.apiFetch("/reset-password", {
      method: "POST",
      body: form.value,
    });
    uiStore.success("Пароль успешно изменен");
    router.push("/auth/login");
  } catch (e) {
    uiStore.error(e.data?.message || "Ошибка сброса пароля");
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
        <h4 class="fw-bold">Новый пароль</h4>
        <p class="text-muted small">Придумайте надежный пароль</p>
      </div>

      <form @submit.prevent="resetPassword">
        <input type="hidden" v-model="form.token" />

        <div class="mb-3">
          <label class="form-label small text-muted text-uppercase fw-bold"
            >Email</label
          >
          <input
            v-model="form.email"
            type="email"
            class="form-control"
            readonly
          />
        </div>

        <div class="mb-3">
          <label class="form-label small text-muted text-uppercase fw-bold"
            >Новый пароль</label
          >
          <input
            v-model="form.password"
            type="password"
            class="form-control"
            placeholder="Минимум 8 символов"
            required
          />
        </div>

        <div class="mb-4">
          <label class="form-label small text-muted text-uppercase fw-bold"
            >Подтвердите пароль</label
          >
          <input
            v-model="form.password_confirmation"
            type="password"
            class="form-control"
            placeholder="Повторите пароль"
            required
          />
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
          {{ isLoading ? "Сохранение..." : "Сохранить новый пароль" }}
        </button>
      </form>
    </div>
  </div>
</template>
