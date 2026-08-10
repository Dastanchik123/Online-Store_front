import { defineStore } from "pinia";

// Читаем последнюю известную сессию синхронно при создании store — до того,
// как успеет отработать любой async-код. Раньше permissions восстанавливались
// только через initAuth() -> await fetchPermissions(), а на холодной
// загрузке (F5 на защищённой странице) middleware иногда успевало проверить
// hasPermission() до того, как этот await завершался (гонка состояний из-за
// повторных монтирований при SSR-гидратации), и пользователя с реальными
// правами ошибочно редиректило на главную. Теперь permissions — часть
// начального состояния store, и до сети вообще не нужно достучаться, чтобы
// первая проверка прав была верной; fetchPermissions() потом просто обновит
// их в фоне.
function readCached<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export const useAuthStore = defineStore("auth", {
  state: () => ({
    user: readCached<any>("user"),
    token:
      typeof window !== "undefined" ? localStorage.getItem("auth_token") : null,
    isAuthenticated:
      typeof window !== "undefined" && !!localStorage.getItem("auth_token"),
    permissions: readCached<string[]>("permissions") || [],
  }),

  getters: {
    getUser: (state) => state.user,
    getToken: (state) => state.token,
    isAuth: (state) => !!state.token && !!state.user,
    isAdmin: (state) => state.user?.role === "admin",
    isPurchaser: (state) => state.user?.role === "purchaser",
    isCashier: (state) => state.user?.role === "cashier",
    isManager: (state) => state.user?.role === "manager",
    // Раньше здесь были захардкожены права purchaser/cashier — теперь у всех
    // ролей (включая purchaser/cashier) есть реальные записи в role_permissions
    // (см. StoreSeeder), поэтому единственный источник правды — то, что пришло
    // с /my-permissions. Хардкод убран: иначе админ не смог бы реально урезать
    // права этим ролям через страницу /admin/permissions — бэкенд бы уже
    // отказывал, а фронт всё равно показывал бы кнопки.
    hasPermission: (state) => (permission: string) => {
      if (state.user?.role === "admin") return true;

      return state.permissions.includes(permission);
    },
  },

  actions: {
    setUser(user: any) {
      this.user = user;
      this.isAuthenticated = !!user;
      if (user) {
        this.fetchPermissions();
        // Автоматически настраиваем кассу (terminal_id) для сотрудника
        if (import.meta.client && user.terminal_id && (window as any).electronAPI) {
          (window as any).electronAPI.setTerminalId(user.terminal_id);
        }
      }
    },

    setToken(token: string) {
      this.token = token;
      if (import.meta.client) {
        localStorage.setItem("auth_token", token);
      }
    },

    clearAuth() {
      this.user = null;
      this.token = null;
      this.isAuthenticated = false;
      this.permissions = [];
      if (import.meta.client) {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("user");
        localStorage.removeItem("permissions");
      }
    },

    async fetchPermissions() {
      try {
        const token =
          this.token ||
          (import.meta.client ? localStorage.getItem("auth_token") : null);
        if (!token) return;

        const config = useRuntimeConfig();
        const perms: any = await $fetch("/my-permissions", {
          baseURL: config.public.apiBase,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });
        this.permissions = perms;
        if (import.meta.client) {
          localStorage.setItem("permissions", JSON.stringify(perms));
        }
      } catch (error) {
        console.error("Failed to fetch permissions:", error);
      }
    },

    async fetchUser() {
      try {
        const token =
          this.token ||
          (import.meta.client ? localStorage.getItem("auth_token") : null);
        if (!token) return;

        const config = useRuntimeConfig();
        const user: any = await $fetch("/user", {
          baseURL: config.public.apiBase,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });

        if (user) {
          this.setUser(user);
          if (import.meta.client) {
            localStorage.setItem("user", JSON.stringify(user));
          }
        }
      } catch (error: any) {
        console.error("Failed to verify user status:", error);

        if (error.status === 401 || error.statusCode === 401) {
          this.clearAuth();
        }
      }
    },

    // Middleware (permission.ts, staff.ts и т.п.) вызывают это перед проверкой
    // hasPermission() и должны дождаться его — иначе на холодной загрузке
    // (F5 на защищённой странице) permissions ещё пустой массив, и middleware
    // ошибочно решает, что прав нет, редиректя мимо реальных прав пользователя.
    async initAuth() {
      if (import.meta.client) {
        const token = localStorage.getItem("auth_token");
        const userStr = localStorage.getItem("user");

        if (token && userStr) {
          try {
            this.token = token;
            this.user = JSON.parse(userStr);
            this.isAuthenticated = true;
            await this.fetchPermissions();

            // Ревалидация профиля не блокирует проверку прав — идёт в фоне
            this.fetchUser();
          } catch (error) {
            console.error("Failed to parse user from localStorage", error);
            this.clearAuth();
          }
        }
      }
    },
  },
});
