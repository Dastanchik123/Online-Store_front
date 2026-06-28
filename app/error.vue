<script setup>
const props = defineProps({
  error: Object,
});

const handleError = () => {
  clearError({ redirect: "/" });
};
</script>

<template>
  <div
    class="d-flex align-items-center justify-content-center min-vh-100 bg-light"
  >
    <div class="text-center">
      <h1 class="display-1 fw-bold text-primary">{{ error.statusCode }}</h1>
      <p class="fs-3">
        <span class="text-danger">Opps!</span>
        <span v-if="error.statusCode === 404"> Страница не найдена.</span>
        <span v-else> Произошла ошибка.</span>
      </p>
      <p class="lead">
        {{
          error.statusCode === 404
            ? "То, что вы ищете, не существует."
            : error.message
        }}
      </p>
      <button @click="handleError" class="btn btn-primary mt-3">
        Вернуться на главную
      </button>
    </div>
  </div>
</template>
