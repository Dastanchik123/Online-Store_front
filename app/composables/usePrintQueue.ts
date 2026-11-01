export interface PrintQueueItem {
  id: number | string;
  name: string;
  sku: string;
  price: number;
  sale_price?: number;
  qty: number;
}

let dbHydrated = false;
let watcherAttached = false;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
// Есть локальные изменения, ещё не ушедшие в БД (debounce). Пока они есть,
// очередь из БД старее локальной и подставлять её нельзя: кнопка «Печать
// этикетки» на /admin/products кладёт товар в очередь и сразу открывает
// страницу печати, а та за эти 800мс загружала из БД прежнюю очередь и
// затирала только что выбранный товар — выглядело как «залипший кэш».
let dirty = false;
// Присвоение очереди из БД — не локальное изменение, обратно не отправляем
let applyingRemote = false;

// Очередь товаров для страницы пакетной печати этикеток/ценников
// (/admin/print-labels). Хранится только в БД (общий ключ настроек
// print_label_queue): изменения уходят туда с debounce, поэтому очередь
// переживает перезагрузку и видна с других устройств/касс. Локального кеша
// в localStorage больше нет — он показывал устаревшую очередь поверх БД.
export const usePrintQueue = () => {
  const queue = useState<PrintQueueItem[]>("print_label_queue", () => []);
  const { settings } = useSettings();
  const api = useApi();

  const applyRemote = (raw: string | undefined) => {
    try {
      const fromDb = JSON.parse(raw || "[]");
      if (!Array.isArray(fromDb)) return;
      applyingRemote = true;
      queue.value = fromDb;
    } catch (e) {
      /* битый JSON в БД — оставляем текущую очередь */
    } finally {
      // deep-watch очереди срабатывает асинхронно (flush: 'pre') — флаг
      // снимаем после него, иначе присвоение из БД ушло бы обратно в БД
      nextTick(() => {
        applyingRemote = false;
      });
    }
  };

  // Немедленно отправить локальные изменения (без ожидания debounce)
  const flushQueue = async () => {
    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }
    if (!dirty) return;
    const snapshot = JSON.parse(JSON.stringify(queue.value));
    try {
      await api.apiFetch("/print-label-queue", { method: "POST", body: { queue: snapshot } });
      // Пока шёл запрос, очередь могли снова поменять — тогда dirty остаётся
      if (JSON.stringify(queue.value) === JSON.stringify(snapshot)) dirty = false;
      if (settings.value) settings.value = { ...settings.value, print_label_queue: JSON.stringify(snapshot) };
    } catch {
      useUiStore().addToast("Не удалось сохранить очередь этикеток — нет связи с сервером", "error");
    }
  };

  if (import.meta.client && !watcherAttached) {
    watcherAttached = true;

    // Остаток старого кеша — чтобы не лежал в браузере
    try {
      localStorage.removeItem("print_label_queue_cache_v1");
    } catch (e) {
      /* localStorage недоступен — нечего чистить */
    }

    // Отдельный (detached) scope: наблюдатели живут всё время работы
    // приложения. Раньше они создавались в setup первой открывшей очередь
    // страницы (обычно /admin/products) и останавливались вместе с ней, а
    // флаг watcherAttached оставался — после перехода на страницу печати
    // правки количества/удаления там больше не сохранялись в БД.
    effectScope(true).run(() => {
      // Свой эндпоинт с правом products.view и только этим ключом. Раньше шёл
      // POST /settings (только админ — у менеджера каждое изменение падало
      // с ошибкой) со всем снимком публичных настроек, который затирал
      // устаревшими значениями то, что успел поменять другой админ.
      watch(
        queue,
        () => {
          if (applyingRemote) return;
          dirty = true;
          if (syncTimer) clearTimeout(syncTimer);
          syncTimer = setTimeout(flushQueue, 800);
        },
        { deep: true },
      );

      // Первая выгрузка настроек из БД — источник очереди
      watch(
        () => settings.value?.print_label_queue,
        (val) => {
          if (dbHydrated || val === undefined) return;
          dbHydrated = true;
          if (dirty) return; // локальная очередь новее БД
          applyRemote(val);
        },
        { immediate: true },
      );
    });
  }

  const setQueue = (items: PrintQueueItem[]) => {
    queue.value = items.map((i) => ({ ...i }));
  };

  const clearQueue = () => {
    queue.value = [];
  };

  // Свежая очередь из БД — при каждом открытии страницы печати, а не та,
  // что осталась в памяти с прошлого захода (могли поменять с другой кассы).
  // Если локально есть неотправленные изменения (только что нажали «Печать
  // этикетки» у товара) — они новее БД: отправляем их, а не затираем.
  const reloadQueue = async () => {
    if (dirty) {
      await flushQueue();
      return;
    }
    applyRemote(settings.value?.print_label_queue);
  };

  return { queue, setQueue, clearQueue, reloadQueue, flushQueue };
};
