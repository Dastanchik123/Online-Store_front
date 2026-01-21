export default defineNuxtRouteMiddleware((to, from) => {
  const authStore = useAuthStore();

  
  if (process.client && !authStore.isAuthenticated) {
    authStore.initAuth();
  }

  if (authStore.isAuthenticated) {
    return navigateTo("/");
  }
});

