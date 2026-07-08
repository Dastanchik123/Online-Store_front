// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  ssr: true,
  modules: ["@pinia/nuxt"],

  runtimeConfig: {
    public: {
      apiBase: "http://192.168.2.176:8000/api", //"https://online-store-back.fly.dev/api",
      wsHost: "192.168.2.176",
      wsPort: 6001,
      wsKey: "local-app-key",
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
        target: "http://192.168.2.176:8000/api",
        changeOrigin: true,
      },
    },
  },
});
