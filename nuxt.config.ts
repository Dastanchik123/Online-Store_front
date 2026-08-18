// https://nuxt.com/docs/api/configuration/nuxt-config

// NUXT_TARGET=laravel — SPA-сборка для раздачи прямо из public/ Laravel
// (same-origin с API: нет CORS-preflight и лишнего домена). Запуск: npm run build:laravel
// NUXT_TARGET=capacitor — та же статическая SPA-сборка, но с абсолютным apiBase
// (грузится из file:// / android_asset, same-origin не работает). Запуск: npm run build:capacitor
const isLaravelTarget = process.env.NUXT_TARGET === "laravel";
const isCapacitorTarget = process.env.NUXT_TARGET === "capacitor";
const isStaticTarget = isLaravelTarget || isCapacitorTarget;

// TODO: реальный публичный домен витрины интернет-магазина. В проекте сейчас
// встречаются два разных значения (public/robots.txt указывал на
// kurulus-store.vercel.app, useSeo.ts — на онлайн-домен fly/onrender) —
// поставь сюда фактический прод-домен и переопредели через .env при
// необходимости (NUXT_PUBLIC_SITE_URL). SEO-модули (sitemap/robots) и
// useSeo.ts используют это значение как единый источник истины.
const SITE_URL = process.env.NUXT_PUBLIC_SITE_URL || "https://kurulus-store.vercel.app";

// SEO (sitemap/robots) нужен только для публичной SSR/статической витрины
// на Vercel/fly, а не для Electron POS-кассы и Capacitor-приложения —
// эти таргеты не индексируются и разделы cashier/admin/self-service им и
// так недоступны публично.
const isSeoTarget = !isStaticTarget;

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  ssr: !isStaticTarget,
  modules: [
    "@pinia/nuxt",
    ...(isSeoTarget ? ["@nuxtjs/sitemap", "@nuxtjs/robots"] : []),
  ],

  site: {
    url: SITE_URL,
    name: "KurulushStore",
  },

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
      // Домен самой витрины (для canonical/og:url в useSeo.ts) — НЕ домен
      // API. См. TODO у SITE_URL выше.
      siteUrl: SITE_URL,
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

  // ─── SEO: sitemap.xml + robots.txt (только публичная витрина, см. isSeoTarget) ───
  ...(isSeoTarget
    ? {
        sitemap: {
          exclude: [
            "/admin/**",
            "/cashier/**",
            "/purchaser/**",
            "/profile/**",
            "/self-service/**",
            "/tsd/**",
            "/auth/**",
            "/cart/**",
            "/checkout/**",
            "/wishlist/**",
            "/order-tracking",
            "/catalog/*", // catalog/[slug].vue — служебная заглушка, не реальный маршрут категорий
          ],
          urls: async () => {
            // Товары и категории приходят из Laravel API, а не из файловой
            // структуры страниц — статичного сканера роутов недостаточно,
            // поэтому дергаем тот же API, что и остальной фронт (см. useApi.ts),
            // и генерируем sitemap-записи из реальных данных.
            const apiBase =
              process.env.NUXT_PUBLIC_API_BASE ||
              "https://online-store-back.fly.dev/api";

            const urls: Array<{
              loc: string;
              lastmod?: string;
              _sitemap?: string;
            }> = [];

            // nuxt.config исполняется в чистом Node-контексте (build/nitro
            // init), там нет глобального Nuxt-$fetch — используем нативный
            // fetch (Node >=18) вместо composable-обёртки useApi.ts.
            const fetchJson = async (endpoint: string) => {
              const res = await fetch(`${apiBase}${endpoint}`, {
                headers: { Accept: "application/json" },
              });
              if (!res.ok) throw new Error(`HTTP ${res.status} for ${endpoint}`);
              return res.json();
            };

            try {
              const products: any = await fetchJson(
                "/products?is_active=true&per_page=200&fields=list",
              );
              const productList = Array.isArray(products)
                ? products
                : products?.data || [];
              for (const product of productList) {
                urls.push({
                  loc: `/product/${product.slug || product.id}`,
                  lastmod: product.updated_at,
                });
              }
            } catch (e) {
              console.warn(
                "[sitemap] Не удалось загрузить товары из API — раздел sitemap для /product/* будет пуст:",
                e,
              );
            }

            try {
              const categories: any = await fetchJson(
                "/categories?is_active=true",
              );
              const categoryList = Array.isArray(categories)
                ? categories
                : categories?.data || [];
              for (const category of categoryList) {
                urls.push({
                  loc: `/catalog?category_id=${category.id}`,
                  lastmod: category.updated_at,
                });
              }
            } catch (e) {
              console.warn(
                "[sitemap] Не удалось загрузить категории из API — раздел sitemap для /catalog будет пуст:",
                e,
              );
            }

            try {
              const posts: any = await fetchJson("/blog?per_page=200");
              const postList = Array.isArray(posts) ? posts : posts?.data || [];
              for (const post of postList) {
                urls.push({
                  loc: `/blog/${post.slug || post.id}`,
                  lastmod: post.updated_at,
                });
              }
            } catch (e) {
              console.warn(
                "[sitemap] Не удалось загрузить статьи блога из API — раздел sitemap для /blog/* будет пуст:",
                e,
              );
            }

            return urls;
          },
        },
        robots: {
          disallow: [
            "/admin",
            "/cashier",
            "/purchaser",
            "/profile",
            "/self-service",
            "/tsd",
            "/auth",
            "/cart",
            "/checkout",
            "/wishlist",
            "/order-tracking",
          ],
        },
      }
    : {}),
});
