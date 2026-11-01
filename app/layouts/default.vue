<script setup lang="ts">
import Header from "../components/loyaut/Header.vue";
import Footer from "../components/loyaut/Footer.vue";
import BottomNav from "../components/loyaut/BottomNav.vue";
</script>
<template>
  <div class="app-shell">
    <Header />
    <div class="container main-content-wrapper mt-5 py-4 mx-auto">
      <slot />
    </div>
    <Footer />
    <BottomNav />
    <UiToastContainer />
    <UiConfirmModal />
    <ClientOnly>
      <PwaInstallPrompt />
    </ClientOnly>
  </div>
</template>

<style scoped>
/* Бывший pt-5 (3rem) + высота статус-бара: в установленном на iOS приложении
   (status-bar-style black-translucent) шапка опускается под чёлку/Dynamic
   Island на env(safe-area-inset-top) — контент сдвигается вместе с ней.
   В обычной вкладке браузера inset = 0, всё как раньше. */
.app-shell {
  padding-top: calc(3rem + env(safe-area-inset-top, 0px));
}

/* Место под фиксированную мобильную bottom-навигацию, чтобы футер и низ
   контента не скрывались под ней (см. BottomNav.vue). На ≥992px панель
   скрыта (d-lg-none), поэтому паддинг там не нужен. */
@media (max-width: 991.98px) {
  :deep(.footer-section) {
    padding-bottom: calc(64px + env(safe-area-inset-bottom, 0));
  }
}
</style>
