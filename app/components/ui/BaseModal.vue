<template>
  <div
    v-if="show"
    ref="modalRef"
    class="modal-backdrop"
    @click.self="emit('close')"
  >
    <form
      class="modal-container border shadow"
      :class="`modal-${size || 'md'}`"
      @submit.prevent="emit('submit')"
    >
      <div
        class="modal-header d-flex align-items-center justify-content-between p-4 border-bottom bg-white rounded-top"
      >
        <h4 class="m-0 fw-bold">{{ title }}</h4>
        <button type="button" class="btn-close" @click="emit('close')"></button>
      </div>
      <div class="modal-body p-4 bg-white">
        <slot />
      </div>
      <div
        v-if="$slots.footer"
        class="modal-footer p-4 border-top bg-light rounded-bottom"
      >
        <slot name="footer" />
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  show: boolean;
  title: string;
  size?: "sm" | "md" | "lg" | "xl";
}>();
const emit = defineEmits(["close", "submit"]);

const modalRef = ref<HTMLElement | null>(null);

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === "Escape" && props.show) {
    emit("close");
  }
};

watch(
  () => props.show,
  (newVal) => {
    if (newVal) {
      window.addEventListener("keydown", handleKeyDown);
      nextTick(() => {
        if (modalRef.value) {
          const firstInput = modalRef.value.querySelector(
            "input, select, textarea",
          ) as HTMLElement;
          if (firstInput) {
            firstInput.focus();
          }
        }
      });
    } else {
      window.removeEventListener("keydown", handleKeyDown);
    }
  },
);

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeyDown);
});
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9990;
}
.modal-container {
  background: white;
  border-radius: 12px;
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}
.modal-body {
  padding: 1.5rem;
  overflow-y: auto;
  flex: 1;
}
.modal-sm {
  max-width: 400px;
}
.modal-md {
  max-width: 600px;
}
.modal-lg {
  max-width: 800px;
}
.modal-xl {
  max-width: 1100px;
}
</style>
