export default defineNuxtPlugin((nuxtApp) => {
  const authStore = useAuthStore();

  if (import.meta.client) {
    
    authStore.initAuth();
  }
});
