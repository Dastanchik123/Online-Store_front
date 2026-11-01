export default defineNuxtRouteMiddleware(async (to, from) => {
  const authStore = useAuthStore();

  if (import.meta.client && !authStore.isAuthenticated) {
    await authStore.initAuth();
  }

  if (import.meta.client) {
    if (!authStore.isAuth) {
      return navigateTo("/auth/staff");
    }

    
    // По праву, а не по имени роли: роль, созданная в админке с
    // purchaser.access, иначе видела пункт меню, но получала редирект
    if (!authStore.hasPermission("purchaser.access")) {
      return navigateTo("/");
    }
  }
});
