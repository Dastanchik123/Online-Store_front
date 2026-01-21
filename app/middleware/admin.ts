export default defineNuxtRouteMiddleware((to, from) => {
  const authStore = useAuthStore();

  
  if (import.meta.client && !authStore.isAuthenticated) {
    authStore.initAuth();
  }

  
  
  
  if (import.meta.client) {
    if (!authStore.isAuth) {
      return navigateTo("/auth/login");
    }

    if (!authStore.isAdmin) {
      return navigateTo("/");
    }
  }
});
