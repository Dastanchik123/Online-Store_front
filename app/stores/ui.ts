import { defineStore } from "pinia";

export interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info" | "warning";
  duration?: number;
}

export const useUiStore = defineStore("ui", {
  state: () => ({
    toasts: [] as Toast[],
    confirm: {
      isOpen: false,
      title: "",
      message: "",
      resolve: null as ((value: boolean) => void) | null,
    },
  }),

  actions: {
    addToast(message: string, type: Toast["type"] = "info", duration = 3000) {
      const id = Date.now();
      this.toasts.push({ id, message, type, duration });

      setTimeout(() => {
        this.removeToast(id);
      }, duration);
    },

    removeToast(id: number) {
      this.toasts = this.toasts.filter((t) => t.id !== id);
    },

    showConfirm(title: string, message: string): Promise<boolean> {
      this.confirm.title = title;
      this.confirm.message = message;
      this.confirm.isOpen = true;

      return new Promise((resolve) => {
        this.confirm.resolve = resolve;
      });
    },

    handleConfirm(result: boolean) {
      if (this.confirm.resolve) {
        this.confirm.resolve(result);
      }
      this.confirm.isOpen = false;
      this.confirm.title = "";
      this.confirm.message = "";
      this.confirm.resolve = null;
    },

    
    success(msg: string) {
      this.addToast(msg, "success");
    },
    error(msg: string) {
      this.addToast(msg, "error", 5000);
    },
    warning(msg: string) {
      this.addToast(msg, "warning");
    },
    info(msg: string) {
      this.addToast(msg, "info");
    },
  },
});
