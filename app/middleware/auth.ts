export default defineNuxtRouteMiddleware(async (to, from) => {
  const authStore = useAuthStore();

  if (import.meta.server) return;


  if (!authStore.isAuthenticated) {
    await authStore.initAuth();
  }

  if (!authStore.isAuthenticated) {
    return navigateTo("/auth/login");
  }
});
