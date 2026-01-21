<script setup lang="ts">
import { useUiStore } from "../../stores/ui";
const uiStore = useUiStore();
</script>

<template>
  <div
    class="toast-wrapper position-fixed bottom-0 end-0 p-3"
    style="z-index: 9999"
  >
    <div
      v-for="toast in uiStore.toasts"
      :key="toast.id"
      class="alert alert-dismissible fade show mb-2 shadow-sm border-start border-4"
      :class="
        toast.type === 'success'
          ? 'alert-success'
          : toast.type === 'error'
          ? 'alert-danger'
          : toast.type === 'warning'
          ? 'alert-warning'
          : 'alert-info'
      "
      role="alert"
    >
      <span v-html="toast.message"></span>
      <button
        type="button"
        class="btn-close"
        @click="uiStore.removeToast(toast.id)"
      ></button>
    </div>
  </div>
</template>
