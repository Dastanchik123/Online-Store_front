<script setup lang="ts">
import { useUiStore } from "../../stores/ui";
const uiStore = useUiStore();
</script>

<template>
  <template v-if="uiStore.confirm.isOpen">
    <div class="modal-overlay d-flex align-items-center justify-content-center">
      <div class="modal-content-custom shadow shadow-lg border">
        <div
          class="modal-header p-4 border-bottom d-flex align-items-center gap-3 bg-white rounded-top"
        >
          <h5 class="m-0 fw-bold">
            {{ uiStore.confirm.title || "Подтверждение" }}
          </h5>
        </div>
        <div class="modal-body p-4 bg-white">
          <p class="m-0 fs-5">{{ uiStore.confirm.message }}</p>
        </div>
        <div
          class="modal-footer p-4 bg-light d-flex justify-content-end gap-3 rounded-bottom"
        >
          <button
            class="btn btn-outline-secondary"
            @click="uiStore.handleConfirm(false)"
          >
            Отмена
          </button>
          <button class="btn btn-danger" @click="uiStore.handleConfirm(true)">
            Подтвердить
          </button>
        </div>
      </div>
    </div>
  </template>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.5);
  z-index: 10000;
}
.modal-content-custom {
  background: white;
  width: 100%;
  max-width: 450px;
  border-radius: 12px;
}
</style>
