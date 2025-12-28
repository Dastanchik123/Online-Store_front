export default defineNuxtRouteMiddleware(() => {
  const isAdmin = true // здесь проверка токена / роли

  if (!isAdmin) { 
    return navigateTo('/login')
  }
})