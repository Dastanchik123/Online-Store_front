<script setup lang="ts">
import { useUiStore } from "../../stores/ui";
const uiStore = useUiStore();

const iconFor = (type: string) => {
  switch (type) {
    case "success":
      return "bi-check-circle-fill";
    case "error":
    case "danger":
      return "bi-x-circle-fill";
    case "warning":
      return "bi-exclamation-triangle-fill";
    default:
      return "bi-info-circle-fill";
  }
};
</script>

<template>
  <div class="mini-toast-stack">
    <TransitionGroup name="mini-toast">
      <div
        v-for="toast in uiStore.toasts"
        :key="toast.id"
        class="mini-toast"
        :class="`mini-toast--${toast.type}`"
        role="status"
      >
        <i class="bi mini-toast-icon" :class="iconFor(toast.type)"></i>
        <span v-if="toast.html" class="mini-toast-text" v-html="toast.message"></span>
        <span v-else class="mini-toast-text">{{ toast.message }}</span>
        <button
          type="button"
          class="mini-toast-close"
          @click="uiStore.removeToast(toast.id)"
        >
          <i class="bi bi-x"></i>
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.mini-toast-stack {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(320px, calc(100vw - 32px));
  pointer-events: none;
}

.mini-toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fff;
  border-radius: 10px;
  padding: 9px 8px 9px 12px;
  box-shadow: 0 4px 18px rgba(15, 23, 42, 0.14);
  border-left: 3px solid #38bdf8;
  font-size: 0.82rem;
  color: #1e293b;
  line-height: 1.35;
}

.mini-toast--success {
  border-left-color: #22c55e;
}
.mini-toast--error,
.mini-toast--danger {
  border-left-color: #ef4444;
}
.mini-toast--warning {
  border-left-color: #f59e0b;
}
.mini-toast--info {
  border-left-color: #38bdf8;
}

.mini-toast-icon {
  flex-shrink: 0;
  font-size: 0.95rem;
}
.mini-toast--success .mini-toast-icon {
  color: #22c55e;
}
.mini-toast--error .mini-toast-icon,
.mini-toast--danger .mini-toast-icon {
  color: #ef4444;
}
.mini-toast--warning .mini-toast-icon {
  color: #f59e0b;
}
.mini-toast--info .mini-toast-icon {
  color: #38bdf8;
}

.mini-toast-text {
  flex: 1;
  min-width: 0;
  word-break: break-word;
}
.mini-toast-text :deep(a) {
  color: #0ea5e9;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}

.mini-toast-close {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  border-radius: 50%;
  font-size: 0.85rem;
  transition: background 0.15s, color 0.15s;
}
.mini-toast-close:hover {
  background: #f1f5f9;
  color: #64748b;
}

.mini-toast-enter-active,
.mini-toast-leave-active,
.mini-toast-move {
  transition: all 0.22s ease;
}
.mini-toast-enter-from,
.mini-toast-leave-to {
  opacity: 0;
  transform: translateX(24px);
}
</style>
