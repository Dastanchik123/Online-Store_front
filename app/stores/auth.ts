import { defineStore } from "pinia";

export const useAuthStore = defineStore("auth", {
  state: () => ({
    user: null as any,
    token: null as string | null,
    isAuthenticated: false,
    permissions: [] as string[],
  }),

  getters: {
    getUser: (state) => state.user,
    getToken: (state) => state.token,
    isAuth: (state) => !!state.token && !!state.user,
    isAdmin: (state) => state.user?.role === "admin",
    isPurchaser: (state) => state.user?.role === "purchaser",
    isCashier: (state) => state.user?.role === "cashier",
    hasPermission: (state) => (permission: string) => {
      if (state.user?.role === "admin") return true;

      if (state.user?.role === "cashier" && permission === "cashier.access")
        return true;
      if (state.user?.role === "purchaser") {
        const purchaserPerms = [
          "purchaser.access",
          "products.view",
          "products.edit",
          "categories.manage",
          "suppliers.manage",
          "purchases.manage",
          "inventory.manage",
        ];
        if (purchaserPerms.includes(permission)) return true;
      }

      return state.permissions.includes(permission);
    },
  },

  actions: {
    setUser(user: any) {
      this.user = user;
      this.isAuthenticated = !!user;
      if (user) {
        this.fetchPermissions();
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

    initAuth() {
      if (import.meta.client) {
        const token = localStorage.getItem("auth_token");
        const userStr = localStorage.getItem("user");

        if (token && userStr) {
          try {
            this.token = token;
            this.user = JSON.parse(userStr);
            this.isAuthenticated = true;
            this.fetchPermissions();

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
