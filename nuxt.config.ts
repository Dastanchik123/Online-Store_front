// https://nuxt.com/docs/api/configuration/nuxt-config
import { fileURLToPath } from "node:url";
import { appleSplashScreens } from "./pwa/apple-splash.mjs";

// NUXT_TARGET=laravel — SPA-сборка для раздачи прямо из public/ Laravel
// (same-origin с API: нет CORS-preflight и лишнего домена). Запуск: npm run build:laravel
// NUXT_TARGET=capacitor — та же статическая SPA-сборка, но с абсолютным apiBase
// (грузится из file:// / android_asset, same-origin не работает). Запуск: npm run build:capacitor
const isLaravelTarget = process.env.NUXT_TARGET === "laravel";
const isCapacitorTarget = process.env.NUXT_TARGET === "capacitor";
const isStaticTarget = isLaravelTarget || isCapacitorTarget;

// Фактический прод-домен витрины: build:laravel копируется в
// Online-Store_back/public и деплоится как kurulush-store.fly.dev
// (кастомного домена нет — см. `flyctl certs list`). Переопредели через
// .env при смене домена (NUXT_PUBLIC_SITE_URL). SEO-модули (sitemap/robots)
// и useSeo.ts используют это значение как единый источник истины.
const SITE_URL = process.env.NUXT_PUBLIC_SITE_URL || "https://kurulush-store.fly.dev";

// build:laravel намеренно ставит NUXT_PUBLIC_API_BASE=/api — относительный
// путь для same-origin браузерных запросов в рантайме (см. комментарий выше
// про isLaravelTarget). Но на этапе генерации (sitemap urls(), prerender
// routes) код выполняется в чистом Node без browser origin — относительный
// путь для fetch() там не резолвится (и раньше это тихо роняло сборочные
// запросы в try/catch, sitemap собирался пустым). Для сборочных запросов
// всегда нужен абсолютный адрес API.
const BUILD_API_BASE = process.env.NUXT_PUBLIC_API_BASE?.startsWith("http")
  ? process.env.NUXT_PUBLIC_API_BASE
  : "https://kurulush-store.fly.dev/api";

// SEO (sitemap/robots) нужен для публичной витрины — и SSR/vercel-таргета,
// и статической laravel-сборки (это и есть реальный прод, см. SITE_URL
// выше). Не нужен только Capacitor-приложению: это packaged APK кассы
// самообслуживания, никогда не индексируется и разделы cashier/admin ему
// и так недоступны публично.
const isSeoTarget = !isCapacitorTarget;

// PWA (service worker + manifest) — только у витрины в build:laravel: она
// раздаётся с того же домена из корня Online-Store_back/public, поэтому sw.js
// ложится в корень и сразу получает scope "/". В Capacitor (file://) SW не
// нужен, в `nuxt dev` мешал бы HMR. Модуль подключён всегда: при disable его
// virtual:pwa-register превращается в заглушку, и pwa.client.ts не ломается.
const isPwaTarget = isLaravelTarget;
const PWA_THEME_COLOR = "#0f172a"; // цвет шапки (Header.vue)
const PWA_BACKGROUND_COLOR = "#ffffff"; // фон splash-экранов (scripts/generate-pwa-icons.mjs)

// Пока API-хост не даёт единый список слагов на лету, конкретный список
// динамических маршрутов для prerender строим из тех же данных, что и
// sitemap (см. fetchDynamicRoutes ниже) — единый источник истины.
const fetchDynamicRoutes = async (apiBase: string): Promise<string[]> => {
  const routes: string[] = [];

  const fetchJson = async (endpoint: string) => {
    const res = await fetch(`${apiBase}${endpoint}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${endpoint}`);
    return res.json();
  };

  // PRERENDER_PRODUCTS=0 — быстрая сборка (~3-5 мин вместо ~25) для срочных
  // правок: /product/* не пререндерятся и рендерятся в браузере, как
  // товары за пределами лимита ниже. SEO карточек — до следующей полной сборки.
  if (process.env.PRERENDER_PRODUCTS === "0") {
    console.log("[prerender] PRERENDER_PRODUCTS=0 — товары пропущены");
  } else try {
    // В каталоге 1000+ активных товаров — prerender всех при throttle:api
    // 60 запросов/мин на бэкенде (см. Online-Store_back/routes/api.php)
    // растягивает сборку на 30-45+ минут и грузит прод-API на каждый деплой.
    // С 2026-10-28 — только 20 недавно обновлённых (было 300: сборка шла
    // ~25 мин). Остальные рендерятся в браузере, как и раньше. Sitemap
    // (см. ниже) по-прежнему перечисляет все товары.
    const PRERENDER_PRODUCTS_LIMIT = 20;
    const products: any = await fetchJson(
      `/products?is_active=true&per_page=${PRERENDER_PRODUCTS_LIMIT}&fields=list&sort_by=updated_at&sort_order=desc`,
    );
    const productList = Array.isArray(products) ? products : products?.data || [];
    for (const product of productList) {
      routes.push(`/product/${product.slug || product.id}`);
    }
  } catch (e) {
    console.warn("[prerender] Не удалось загрузить товары из API:", e);
  }

  try {
    const posts: any = await fetchJson("/blog?per_page=200");
    const postList = Array.isArray(posts) ? posts : posts?.data || [];
    for (const post of postList) {
      routes.push(`/blog/${post.slug || post.id}`);
    }
  } catch (e) {
    console.warn("[prerender] Не удалось загрузить статьи блога из API:", e);
  }

  return routes;
};

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  // Несколько `nuxt dev` в одной папке (разные чаты) делят .nuxt и ломают
  // друг друга при перезапуске — NUXT_BUILD_DIR=.nuxt-<имя> разводит их
  ...(process.env.NUXT_BUILD_DIR ? { buildDir: process.env.NUXT_BUILD_DIR } : {}),
  devtools: { enabled: true },
  // Полноценный SSR/SSG нужен и статической laravel-сборке (реальный прод) —
  // без него useSeo.ts/useHead вообще не попадают в отдаваемый HTML, страница
  // это пустой <div id="__nuxt">. Выключен только для Capacitor: там это
  // упакованное приложение, контент всегда подгружается по сети на устройстве,
  // а полный prerender каталога раздул бы APK на сотни статических страниц.
  ssr: !isCapacitorTarget,
  modules: [
    "@pinia/nuxt",
    "@vite-pwa/nuxt",
    ...(isSeoTarget ? ["@nuxtjs/sitemap", "@nuxtjs/robots"] : []),
  ],

  pwa: {
    disable: !isPwaTarget,
    strategies: "injectManifest",
    srcDir: fileURLToPath(new URL("./pwa", import.meta.url)),
    filename: "sw.ts", // → /sw.js в корне public
    // Новая версия не активируется сама: app/plugins/pwa.client.ts
    // показывает «Доступно обновление» и ждёт кнопку «Обновить»
    registerType: "prompt",
    injectRegister: false,
    // Регистрация своя (app/plugins/pwa.client.ts): штатный плагин модуля
    // регистрировал бы SW и в Electron-кассе, которая открывает этот же сайт
    client: { registerPlugin: false },
    // Заголовки sw.js/manifest отдаёт nginx (Online-Store_back/nginx.conf):
    // в статической сборке routeRules Nitro не действуют
    registerWebManifestInRouteRules: false,
    manifest: {
      id: "/",
      name: "KurulushStore — интернет-магазин",
      short_name: "Kurulush",
      description: "Интернет-магазин с широким ассортиментом товаров по выгодным ценам",
      lang: "ru",
      dir: "ltr",
      start_url: "/",
      scope: "/",
      display: "standalone",
      // Витрина — портрет на телефоне, админка — альбом на планшете
      orientation: "any",
      theme_color: PWA_THEME_COLOR,
      background_color: PWA_BACKGROUND_COLOR,
      categories: ["shopping"],
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    injectManifest: {
      // Предкэш — только оболочка приложения. Страницы (615 prerender-
      // маршрутов) и их _payload.json кэшируются по мере посещения
      // (NetworkFirst в pwa/sw.ts), а не все разом при установке.
      globPatterns: [
        "_nuxt/**/*.{js,css,woff2}",
        "offline.html",
        "favicon.png",
        "icons/icon-*.png",
        "icons/maskable-512.png",
        "icons/apple-touch-icon-180.png",
      ],
      // _nuxt/builds/*.json (latest.json) Nuxt сам опрашивает, чтобы узнать о
      // новом деплое — из precache он получал бы старый buildId
      globIgnores: ["**/_payload.json", "_nuxt/builds/**"],
      maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      // Свой transform вместо штатного модуля: тот переписывает *.html в
      // «чистые» URL prerender-страниц (offline.html → /offline), а такой
      // адрес nginx отдаёт как SPA-оболочку 200.html, не офлайн-страницу
      manifestTransforms: [async (entries) => ({ manifest: entries, warnings: [] })],
    },
  },

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
    // build:laravel рантайм-apiBase относительный ("/api", same-origin в
    // браузере после деплоя в Laravel/public) — но во время генерации
    // (SSR-фетчи страниц: product/[id].vue, catalog/index.vue и т.д.)
    // относительный путь резолвится в этот же локальный Nitro-процесс, где
    // /api ничем не обслуживается (пустые server/api/*.ts — see below),
    // и запрос тихо проваливался в 404 для КАЖДОГО товара при prerender.
    // Проксируем /api/** на реальный бэкенд только на время сборки —
    // в финальном статическом выводе Nitro не остаётся, это не влияет на
    // рантайм в браузере.
    ...(isLaravelTarget
      ? { "/api/**": { proxy: `${BUILD_API_BASE}/**` } }
      : {}),
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
      apiBase: "https://kurulush-store.fly.dev/api",
      // soketi-приложение kurulush-soketi (папка soketi/, тот же Fly-аккаунт,
      // что и kurulush-store)
      wsHost: "kurulush-soketi.fly.dev",
      wsPort: 443,
      wsKey: "kurulush-key",
      wsTLS: true,
      // Домен самой витрины (для canonical/og:url в useSeo.ts) — НЕ домен
      // API. См. комментарий у SITE_URL выше.
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
    // Только для `nuxt dev`: открыть фронт с телефона через cloudflared
    // quick tunnel (проверка QR на чеке). Без этого Vite отвечает 403 на
    // любой хост, кроме localhost. На сборку и прод не влияет.
    server: {
      allowedHosts: [".trycloudflare.com"],
    },
  },

  // Сторонних скриптов с CDN нет: bootstrap JS и иконки — из npm
  // (plugins/bootstrap.client.ts, css выше). Скрипт с CDN без проверки
  // целостности получил бы на кассе доступ к window.electronAPI.
  app: {
    head: {
      htmlAttrs: { lang: "ru" },
      // viewport-fit=cover — контент под чёлкой/Dynamic Island, отступы
      // через env(safe-area-inset-*) (Header.vue, BottomNav.vue, main.css)
      viewport: "width=device-width, initial-scale=1, viewport-fit=cover",
      meta: [
        { name: "theme-color", content: PWA_THEME_COLOR },
        { name: "mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-capable", content: "yes" },
        // Статус-бар прозрачный поверх тёмной шапки — шапка сама отступает
        // на env(safe-area-inset-top)
        { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
        { name: "apple-mobile-web-app-title", content: "Kurulush" },
      ],
      link: [
        ...(isPwaTarget ? [{ rel: "manifest", href: "/manifest.webmanifest" }] : []),
        { rel: "apple-touch-icon", sizes: "180x180", href: "/icons/apple-touch-icon-180.png" },
        ...appleSplashScreens().map((s) => ({
          rel: "apple-touch-startup-image",
          media: s.media,
          href: `/icons/splash/${s.file}`,
        })),
      ],
    },
  },

  nitro: {
    preset: isStaticTarget ? "static" : "vercel",
    devProxy: {
      "/api": {
        target: "https://kurulush-store.fly.dev/api",
        changeOrigin: true,
      },
    },
    // Laravel держит общий throttle:api — 60 запросов/мин с одного IP (см.
    // Online-Store_back/routes/api.php). Сотни товаров с параллельным
    // prerender быстро упираются в 429 и роняют сборку. Замедляем обход —
    // дольше, но надёжно, без изменения лимитов бэкенда.
    // crawlLinks:false — иначе Nitro сам обходит ссылки "Похожие товары"/
    // карточки каталога и незаметно расширяет ~300 отобранных товаров на
    // весь каталог (на 1001 товаре так и вышло — 761 вместо ~300, сборка
    // растянулась намного дольше расчётного). Список страниц — только
    // explicit routes ниже, детерминированно.
    ...(isLaravelTarget
      ? {
          prerender: {
            concurrency: 1,
            interval: 2000,
            crawlLinks: false,
            failOnError: false,
          },
        }
      : {}),
  },

  // `nuxt generate` для laravel-таргета обходит ссылки с "/", но crawlLinks
  // выключен (см. выше) — явно перечисляем всё, что должно попасть в
  // статическую сборку: статические страницы + реальные /product/* и
  // /blog/* маршруты, чтобы каждый получил свой SSR'нутый HTML с
  // title/meta/JSON-LD. Категории (/catalog?category_id=) сюда намеренно
  // не идут: статический хостинг не различает query-string при отдаче
  // файла, отдельная prerender-копия на каждую категорию физически
  // невозможна на этой раздаче — там SEO остаётся клиентским (useSeo.ts
  // после гидратации).
  ...(isLaravelTarget
    ? {
        hooks: {
          async "nitro:config"(nitroConfig: any) {
            const staticRoutes = ["/", "/catalog", "/about", "/contacts", "/blog"];
            const dynamicRoutes = await fetchDynamicRoutes(BUILD_API_BASE);
            nitroConfig.prerender ||= {};
            nitroConfig.prerender.routes ||= [];
            nitroConfig.prerender.routes.push(...staticRoutes, ...dynamicRoutes);
          },
        },
      }
    : {}),

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
            // BUILD_API_BASE (не NUXT_PUBLIC_API_BASE напрямую) — см.
            // комментарий у его объявления: в build:laravel рантайм-apiBase
            // относительный ("/api"), а здесь Node без browser origin.
            const apiBase = BUILD_API_BASE;

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

            // В отличие от prerender (см. fetchDynamicRoutes — намеренно
            // ограничен ~300 товарами ради времени сборки), sitemap.xml —
            // это просто список URL, без рендера каждой страницы, поэтому
            // здесь листаем через все страницы API, а не берём одну порцию
            // per_page=200 (в каталоге 1000+ активных товаров, часть
            // раньше не попадала в sitemap вообще).
            const fetchAllPages = async (
              endpointBase: string,
              extraParams: string,
            ) => {
              const items: any[] = [];
              let page = 1;
              // 20×1000 = 200k товаров с запасом — защита от бесконечного
              // цикла, если API вернёт некорректный last_page
              for (; page <= 20; page++) {
                const res: any = await fetchJson(
                  `${endpointBase}?${extraParams}&per_page=1000&page=${page}`,
                );
                const list = Array.isArray(res) ? res : res?.data || [];
                items.push(...list);
                const lastPage = res?.last_page || 1;
                if (page >= lastPage || list.length === 0) break;
              }
              return items;
            };

            try {
              const productList = await fetchAllPages(
                "/products",
                "is_active=true&fields=list",
              );
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
