<template>
  <div class="auth-layout">
    <slot />
  </div>
</template>

<style scoped>
.auth-layout {
  min-height: 100vh;
  min-height: 100dvh;
  background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
  /* Статус-бар и home indicator установленного PWA на iOS */
  padding-top: env(safe-area-inset-top, 0px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
</style>

