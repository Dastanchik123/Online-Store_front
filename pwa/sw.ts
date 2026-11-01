/// <reference lib="webworker" />
// Service worker витрины (только build:laravel, см. pwa в nuxt.config.ts).
// injectManifest, а не generateSW: нужны офлайн-фолбэк через setCatchHandler,
// сообщения от страницы (SKIP_WAITING по кнопке «Обновить», очистка кэша при
// выходе) и сброс кэша страниц при смене версии — в generateSW это не описать.
//
// Что НЕ кэшируется вообще: /api/*, /broadcasting/*, /sanctum/* и любые
// не-GET запросы — на них маршрутов нет, они идут мимо SW прямо в сеть.
// Авторизация — Bearer-токен из localStorage, а не cookie-сессия, поэтому
// HTML-страницы одинаковы для всех пользователей и CSRF-токенов не содержат.
import { clientsClaim } from "workbox-core";
import {
  cleanupOutdatedCaches,
  matchPrecache,
  precacheAndRoute,
} from "workbox-precaching";
import { registerRoute, setCatchHandler } from "workbox-routing";
import {
  CacheFirst,
  NetworkFirst,
  NetworkOnly,
  StaleWhileRevalidate,
} from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

declare const self: ServiceWorkerGlobalScope;

const PAGES_CACHE = "pages";
const IMAGES_CACHE = "images";
const ASSETS_CACHE = "nuxt-assets";
const OFFLINE_URL = "/offline.html";

// Бандлы _nuxt/* (хэш в имени), иконки и offline.html. Новая сборка меняет
// этот список → меняется sw.js → браузер ставит новую версию в waiting, и
// страница показывает «Доступно обновление» (app/plugins/pwa.client.ts).
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
clientsClaim();

// Разделы персонала, оплаты и входа — только сеть: в кассе, админке и на
// оплате устаревшая страница хуже, чем честное «нет подключения».
const NETWORK_ONLY_PAGES =
  /^\/(admin|cashier|purchaser|self-service|tsd|auth|checkout|receipt|order-tracking)(\/|$)/;
// Служебное, что не является страницами приложения
const NOT_APP_PAGES =
  /^\/(api|broadcasting|sanctum|storage|__sitemap__)(\/|$)|^\/(sitemap\.xml|robots\.txt|label-editor\.html)$/;

const sameOrigin = (url: URL) => url.origin === self.location.origin;

registerRoute(
  ({ request, url }) =>
    request.mode === "navigate" &&
    sameOrigin(url) &&
    (NETWORK_ONLY_PAGES.test(url.pathname) || NOT_APP_PAGES.test(url.pathname)),
  new NetworkOnly(),
);

// Публичные страницы витрины (статический prerender, одинаковый для всех):
// свежая версия из сети, а без сети или если сеть думает дольше 4 с — из кэша.
// Туда же _payload.json, которые Nuxt догружает при переходах между ними.
const pagesStrategy = new NetworkFirst({
  cacheName: PAGES_CACHE,
  networkTimeoutSeconds: 4,
  plugins: [
    new CacheableResponsePlugin({ statuses: [200] }),
    new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 7 * 24 * 60 * 60 }),
  ],
});
registerRoute(
  ({ request, url }) => request.mode === "navigate" && sameOrigin(url),
  pagesStrategy,
);
registerRoute(
  ({ url }) => sameOrigin(url) && url.pathname.endsWith("/_payload.json"),
  pagesStrategy,
);

// Чанки _nuxt/*, не попавшие в precache (например, .woff) — имя с хэшем,
// содержимое по нему никогда не меняется. Кроме _nuxt/builds/*.json: по
// latest.json Nuxt узнаёт о новом деплое, ему нужна сеть.
registerRoute(
  ({ url }) =>
    sameOrigin(url) &&
    url.pathname.startsWith("/_nuxt/") &&
    !url.pathname.startsWith("/_nuxt/builds/"),
  new CacheFirst({
    cacheName: ASSETS_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 24 * 60 * 60 }),
    ],
  }),
);

// Фото товаров/баннеров (/storage/...): сразу из кэша, фоном обновляем
registerRoute(
  ({ request, url }) => request.destination === "image" && sameOrigin(url),
  new StaleWhileRevalidate({
    cacheName: IMAGES_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 30 * 24 * 60 * 60,
        purgeOnQuotaError: true,
      }),
    ],
  }),
);

// Нет сети и нет копии в кэше: для страниц — offline.html
setCatchHandler(async ({ request }) => {
  if (request.destination === "document") {
    return (await matchPrecache(OFFLINE_URL)) ?? Response.error();
  }
  return Response.error();
});

self.addEventListener("message", (event) => {
  const type = event.data?.type;
  // Кнопка «Обновить» — новая версия активируется только по решению
  // пользователя, не посреди оформления заказа
  if (type === "SKIP_WAITING") self.skipWaiting();
  // Выход из аккаунта (stores/auth.ts → clearAuth)
  if (type === "CLEAR_USER_CACHES") event.waitUntil(caches.delete(PAGES_CACHE));
});

// Сохранённые страницы ссылаются на чанки прошлой сборки, которые
// cleanupOutdatedCaches только что удалил — офлайн они бы не открылись
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.delete(PAGES_CACHE));
});
