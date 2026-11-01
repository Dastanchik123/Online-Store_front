<script setup>
// Отдельной регистрации больше нет: покупатель входит по номеру телефона,
// и первый вход с новым номером сам создаёт аккаунт (pages/auth/login.vue)
definePageMeta({
  middleware: [() => navigateTo("/auth/login", { redirectCode: 301 })],
});
</script>

<template>
  <div></div>
</template>
