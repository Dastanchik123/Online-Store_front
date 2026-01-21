export default defineNuxtRouteMiddleware((to, from) => {
  const authStore = useAuthStore();

  if (import.meta.server) return;

  
  if (!authStore.isAuthenticated) {
    authStore.initAuth();
  }

  if (!authStore.isAuthenticated) {
    return navigateTo("/auth/login");
  }
});
