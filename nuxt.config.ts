// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  ssr: true,
  modules: ["@pinia/nuxt"],

  runtimeConfig: {
    // Дефолты — ГЛОБАЛЬНЫЙ прод (Vercel/fly без env-переменных работают из коробки).
    // Для локальной разработки с LAN-сервером переопределяйте через .env:
    //   NUXT_PUBLIC_API_BASE=http://192.168.2.176:8000/api
    //   NUXT_PUBLIC_WS_HOST=192.168.2.176
    //   NUXT_PUBLIC_WS_PORT=6001
    //   NUXT_PUBLIC_WS_KEY=local-app-key
    //   NUXT_PUBLIC_WS_TLS=false
    public: {
      apiBase: "https://online-store-back.fly.dev/api",
      wsHost: "online-store-soketi.fly.dev",
      wsPort: 443,
      wsKey: "05ae0397a6d6ec07bcd3919d",
      wsTLS: true,
    },
  },

  css: [
    "bootstrap/dist/css/bootstrap.min.css",
    "bootstrap-icons/font/bootstrap-icons.css",
    "~/assets/css/main.css",
    "~/assets/css/admin.css",
  ],

  vite: {
    optimizeDeps: {
      include: ["bootstrap/dist/js/bootstrap.bundle.min.js"],
    },
  },

  app: {
    head: {
      link: [
        {
          rel: "stylesheet",
          href: "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css",
        },
      ],
      script: [
        {
          src: "https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js",
          defer: true,
        },
        {
          src: "https://cdn.jsdelivr.net/npm/rsvp@4.8.5/dist/rsvp.min.js",
        },
        {
          src: "https://cdn.jsdelivr.net/npm/qz-tray@2.1.2/qz-tray.min.js",
        },
      ],
    },
  },

  nitro: {
    preset: "vercel",
    devProxy: {
      "/api": {
        target: "https://online-store-back.fly.dev/api",
        changeOrigin: true,
      },
    },
  },
});
