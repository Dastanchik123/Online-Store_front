export interface PrintQueueItem {
  id: number | string;
  name: string;
  sku: string;
  price: number;
  sale_price?: number;
  qty: number;
}

const QUEUE_CACHE_KEY = "print_label_queue_cache_v1";

const readQueueCache = (): PrintQueueItem[] => {
  if (!import.meta.client) return [];
  try {
    const raw = localStorage.getItem(QUEUE_CACHE_KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
};

const writeQueueCache = (items: PrintQueueItem[]) => {
  if (!import.meta.client) return;
  try {
    localStorage.setItem(QUEUE_CACHE_KEY, JSON.stringify(items));
  } catch (e) {
    /* localStorage недоступен (приватный режим и т.п.) — просто без кеша */
  }
};

let cacheHydrated = false;
let dbHydrated = false;
let watcherAttached = false;
let syncTimer: ReturnType<typeof setTimeout> | null = null;

// Очередь товаров для страницы пакетной печати этикеток/ценников
// (/admin/print-labels). Раньше жила только в useState и пропадала при
// перезагрузке — теперь любое изменение (добавили товар, поправили кол-во,
// очистили) сразу пишется в localStorage (мгновенно, работает офлайн) и с
// debounce уходит в БД (общий ключ настроек print_label_queue), поэтому
// очередь переживает перезагрузку и доступна с других устройств/касс.
export const usePrintQueue = () => {
  const queue = useState<PrintQueueItem[]>("print_label_queue", () => []);
  const { settings, updateSettings } = useSettings();

  if (import.meta.client && !cacheHydrated) {
    cacheHydrated = true;
    const cached = readQueueCache();
    if (cached.length) queue.value = cached;
  }

  if (import.meta.client && !watcherAttached) {
    watcherAttached = true;

    watch(
      queue,
      () => {
        writeQueueCache(queue.value);
        if (syncTimer) clearTimeout(syncTimer);
        syncTimer = setTimeout(() => {
          updateSettings({ ...settings.value, print_label_queue: JSON.stringify(queue.value) }).catch(() => {
            /* нет сети — очередь уже в локальном кеше, синхронизируется позже */
          });
        }, 800);
      },
      { deep: true },
    );

    // Первая реальная выгрузка настроек из БД считается авторитетной —
    // подхватываем общую очередь (например, при заходе с другого устройства
    // или после очистки localStorage).
    watch(
      () => settings.value?.print_label_queue,
      (val) => {
        if (dbHydrated || val === undefined) return;
        dbHydrated = true;
        try {
          const fromDb = JSON.parse(val || "[]");
          if (Array.isArray(fromDb)) queue.value = fromDb;
        } catch (e) {
          /* битый JSON в БД — оставляем локальное значение как есть */
        }
      },
      { immediate: true },
    );
  }

  const setQueue = (items: PrintQueueItem[]) => {
    queue.value = items.map((i) => ({ ...i }));
  };

  const clearQueue = () => {
    queue.value = [];
  };

  return { queue, setQueue, clearQueue };
};
