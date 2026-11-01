<template>
  <NuxtLayout>
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </NuxtLayout>
  <!-- PWA: общие для всех layout'ов, включая страницы с layout: false -->
  <ClientOnly>
    <PwaOfflineIndicator />
    <PwaUpdatePrompt />
  </ClientOnly>
</template>
