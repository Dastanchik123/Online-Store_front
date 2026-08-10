// https://nuxt.com/docs/api/configuration/nuxt-config

// NUXT_TARGET=laravel — SPA-сборка для раздачи прямо из public/ Laravel
// (same-origin с API: нет CORS-preflight и лишнего домена). Запуск: npm run build:laravel
// NUXT_TARGET=capacitor — та же статическая SPA-сборка, но с абсолютным apiBase
// (грузится из file:// / android_asset, same-origin не работает). Запуск: npm run build:capacitor
const isLaravelTarget = process.env.NUXT_TARGET === "laravel";
const isCapacitorTarget = process.env.NUXT_TARGET === "capacitor";
const isStaticTarget = isLaravelTarget || isCapacitorTarget;

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  ssr: !isStaticTarget,
  modules: ["@pinia/nuxt"],

  // Личный кабинет/касса/закупщик/админка целиком завязаны на auth-состояние
  // из localStorage (Bearer-токен), которого на сервере при SSR просто нет.
  // Раньше это приводило к гонке: Pinia на клиенте гидратировалась пустым
  // серверным состоянием поверх уже восстановленной из localStorage сессии,
  // и middleware успевал проверить права до того, как они реально
  // подгружались — при F5 на защищённой странице человека с правильными
  // правами иногда кидало на главную. Эти разделы и так рендерятся только
  // на клиенте (обёрнуты в <ClientOnly> в admin.vue), поэтому SSR для них
  // просто отключаем — так state гидратируется один раз, сразу правильным.
  routeRules: {
    "/admin/**": { ssr: false },
    "/cashier/**": { ssr: false },
    "/purchaser/**": { ssr: false },
    "/profile/**": { ssr: false },
  },

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
    preset: isStaticTarget ? "static" : "vercel",
    devProxy: {
      "/api": {
        target: "https://online-store-back.fly.dev/api",
        changeOrigin: true,
      },
    },
  },
});
