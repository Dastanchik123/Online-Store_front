export default defineNuxtRouteMiddleware(async (to, from) => {
  const authStore = useAuthStore();

  if (import.meta.server) return;


  if (!authStore.isAuthenticated) {
    await authStore.initAuth();
  }

  // После входа по SMS — обратно туда, куда шёл (например, к оформлению заказа)
  if (!authStore.isAuthenticated) {
    return navigateTo({ path: "/auth/login", query: { redirect: to.fullPath } });
  }
});
