export default defineNuxtRouteMiddleware((to, from) => {
  const authStore = useAuthStore();

  // Инициализируем auth из localStorage
  if (process.client && !authStore.isAuthenticated) {
    authStore.initAuth();
  }

  if (!authStore.isAuthenticated) {
    return navigateTo("/auth/login");
  }
});


