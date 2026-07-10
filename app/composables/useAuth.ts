import { useApi } from "./useApi";

export const useAuth = () => {
  const api = useApi();
  const authStore = useAuthStore();

  const register = async (data: {
    name: string;
    email: string;
    password: string;
    password_confirmation: string;
  }) => {
    try {
      const response: any = await api.apiFetch("/register", {
        method: "POST",
        body: JSON.stringify(data),
      });

      if (import.meta.client && response.token) {
        localStorage.setItem("auth_token", response.token);
        localStorage.setItem("user", JSON.stringify(response.user));
        authStore.setUser(response.user);
        authStore.setToken(response.token);
      }

      return response;
    } catch (error) {
      throw error;
    }
  };

  const login = async (data: { email: string; password: string }) => {
    try {
      const response: any = await api.apiFetch("/login", {
        method: "POST",
        body: JSON.stringify(data),
      });

      if (import.meta.client && response.token) {
        localStorage.setItem("auth_token", response.token);
        localStorage.setItem("user", JSON.stringify(response.user));
        authStore.setUser(response.user);
        authStore.setToken(response.token);

        // Save session to Electron SQLite for offline access & background sync
        if ((window as any).electronAPI?.authSaveSession) {
          const pub = useRuntimeConfig().public;
          (window as any).electronAPI.authSaveSession({
            token: response.token,
            user: response.user,
            apiBase: pub.apiBase,
            wsHost: pub.wsHost,
            wsPort: pub.wsPort,
            wsKey: pub.wsKey,
            wsTLS: !!pub.wsTLS,
          }).catch(console.error);
        }
      }

      return response;
    } catch (error) {
      throw error;
    }
  };

  const logout = async () => {
    try {
      await api.apiFetch("/logout", {
        method: "POST",
      });
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      if (import.meta.client) {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("user");
        if ((window as any).electronAPI?.authClearSession) {
          (window as any).electronAPI.authClearSession().catch(console.error);
        }
      }
      authStore.clearAuth();
      navigateTo("/auth/login");
    }
  };

  const getUser = async () => {
    try {
      const response = await api.apiFetch("/user");
      if (import.meta.client) {
        localStorage.setItem("user", JSON.stringify(response));
      }
      authStore.setUser(response);
      return response;
    } catch (error: any) {
      if (error.status === 401) {
        authStore.clearAuth();
      }
      throw error;
    }
  };

  const isAuthenticated = computed(() => {
    return !!authStore.token && !!authStore.user;
  });

  return {
    register,
    login,
    logout,
    getUser,
    isAuthenticated,
  };
};

