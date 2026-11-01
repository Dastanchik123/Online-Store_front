<script setup lang="ts">
const { isOnline } = usePwa();
</script>

<template>
  <Transition name="pwa-fade">
    <div v-if="!isOnline" class="pwa-offline" role="alert">
      <i class="bi bi-wifi-off" aria-hidden="true"></i>
      Нет подключения к интернету
    </div>
  </Transition>
</template>
