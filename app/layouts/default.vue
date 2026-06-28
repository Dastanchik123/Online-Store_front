<script setup lang="ts">
import Header from "../components/loyaut/Header.vue";
import Footer from "../components/loyaut/Footer.vue";
</script>
<template>
  <div class="pt-5 ">
    <Header />
    <div class="container main-content-wrapper mt-5 py-4 mx-auto">
      <slot />
    </div>
    <Footer />
    <UiToastContainer />
    <UiConfirmModal />
  </div>
</template>
