export interface PrintQueueItem {
  id: number | string;
  name: string;
  sku: string;
  price: number;
  sale_price?: number;
  qty: number;
}

// Очередь товаров для страницы пакетной печати этикеток/ценников
// (/admin/print-labels). useState переживает клиентскую навигацию между
// страницами (товары/закупки -> страница печати), но не переживает
// полную перезагрузку — это и не нужно, очередь одноразовая.
export const usePrintQueue = () => {
  const queue = useState<PrintQueueItem[]>("print_label_queue", () => []);

  const setQueue = (items: PrintQueueItem[]) => {
    queue.value = items.map((i) => ({ ...i }));
  };

  const clearQueue = () => {
    queue.value = [];
  };

  return { queue, setQueue, clearQueue };
};
