import { defineStore } from "pinia";

export interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info" | "warning";
  duration?: number;
  // true только для доверенных статических строк (без интерполяции
  // пользовательских данных) — иначе message рендерится как текст, не HTML
  html?: boolean;
}

// Сколько уведомлений можно показывать одновременно — чтобы при массовом
// добавлении товаров в корзину экран не покрывался стопкой алертов.
const MAX_VISIBLE_TOASTS = 3;
let toastIdCounter = 0;

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
    addToast(
      message: string,
      type: Toast["type"] = "info",
      duration = 2500,
      html = false,
    ) {
      // Не дублируем подряд одно и то же сообщение одного типа (например,
      // если пользователь быстро тыкает "+" в нескольких карточках подряд)
      const duplicate = this.toasts.find(
        (t) => t.message === message && t.type === type,
      );
      if (duplicate) {
        this.removeToast(duplicate.id);
      }

      const id = ++toastIdCounter;
      this.toasts.push({ id, message, type, duration, html });

      if (this.toasts.length > MAX_VISIBLE_TOASTS) {
        this.toasts.splice(0, this.toasts.length - MAX_VISIBLE_TOASTS);
      }

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

    
    success(msg: string, opts: { html?: boolean } = {}) {
      this.addToast(msg, "success", 2500, opts.html);
    },
    error(msg: string, opts: { html?: boolean } = {}) {
      this.addToast(msg, "error", 5000, opts.html);
    },
    warning(msg: string, opts: { html?: boolean } = {}) {
      this.addToast(msg, "warning", 2500, opts.html);
    },
    info(msg: string, opts: { html?: boolean } = {}) {
      this.addToast(msg, "info", 2500, opts.html);
    },
  },
});
