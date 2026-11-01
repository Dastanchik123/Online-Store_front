// Bootstrap JS (выпадающие меню, модалки по data-bs-*) — из npm-пакета, а не
// с CDN: сторонний скрипт без проверки целостности на странице кассы получил
// бы доступ к window.electronAPI. window.bootstrap — для мест, где компоненты
// управляются из кода (например, закрытие выпадающего меню в admin/orders).
import bootstrap from "bootstrap/dist/js/bootstrap.bundle.min.js";

export default defineNuxtPlugin(() => {
  (window as any).bootstrap = bootstrap;
});
