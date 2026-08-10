export default defineNuxtRouteMiddleware(async (to) => {
  const authStore = useAuthStore();

  if (import.meta.client && !authStore.isAuthenticated) {
    await authStore.initAuth();
  }

  if (import.meta.client) {
    if (!authStore.isAuth) {
      return navigateTo("/auth/login");
    }

    const required = to.meta.permission as string | string[] | undefined;
    const permissions = Array.isArray(required)
      ? required
      : required
        ? [required]
        : [];

    const allowed =
      permissions.length === 0 ||
      permissions.some((p) => authStore.hasPermission(p));

    if (!allowed) {
      return navigateTo("/");
    }
  }
});
