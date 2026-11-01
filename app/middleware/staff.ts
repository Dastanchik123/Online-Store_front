export default defineNuxtRouteMiddleware(async (to, from) => {
  const authStore = useAuthStore();

  if (import.meta.client && !authStore.isAuthenticated) {
    await authStore.initAuth();
  }

  if (import.meta.client) {
    if (!authStore.isAuth) {
      return navigateTo("/auth/staff");
    }

    
    if (!authStore.hasPermission("orders.view")) {
      return navigateTo("/");
    }
  }
});
