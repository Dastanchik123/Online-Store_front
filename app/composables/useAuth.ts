import { useApi, resolveApiBase } from "./useApi";

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

        // Electron: встроенные форматы этикеток → settings.label_templates_all
        // (делает только admin, для остальных ролей main-процесс сам пропустит)
        if ((window as any).electronAPI?.syncLabelTemplates) {
          (window as any).electronAPI.syncLabelTemplates({
            token: response.token,
            apiBase: resolveApiBase(useRuntimeConfig().public.apiBase as string),
            role: response.user?.role,
          }).catch(console.error);
        }
      }

      return response;
    } catch (error) {
      throw error;
    }
  };

  // Вход покупателя по номеру: шаг 1 — SMS с кодом
  const sendPhoneCode = async (phone: string) => {
    return await api.apiFetch("/auth/phone/send-code", {
      method: "POST",
      body: { phone },
    });
  };

  // Шаг 2 — код из SMS. Новый номер сам создаёт покупателя (needs_name)
  const verifyPhoneCode = async (phone: string, code: string) => {
    const response: any = await api.apiFetch("/auth/phone/verify", {
      method: "POST",
      body: { phone, code },
    });

    if (import.meta.client && response.token) {
      localStorage.setItem("auth_token", response.token);
      localStorage.setItem("user", JSON.stringify(response.user));
      authStore.setToken(response.token);
      authStore.setUser(response.user);
    }

    return response;
  };

  // Шаг 3 (только новый покупатель) — имя
  const saveName = async (name: string) => {
    const response: any = await api.apiFetch("/user/profile", {
      method: "POST",
      body: { name },
    });

    if (import.meta.client && response.user) {
      localStorage.setItem("user", JSON.stringify(response.user));
      authStore.setUser(response.user);
    }

    return response;
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
    sendPhoneCode,
    verifyPhoneCode,
    saveName,
    logout,
    getUser,
    isAuthenticated,
  };
};

