import { useUiStore } from "~/stores/ui";

interface ElectronPrinter {
  name: string;
  displayName: string;
  description: string;
  status: number;
  isDefault: boolean;
  options: any;
}

declare global {
  interface Window {
    electronAPI?: {
      getPrinters: () => Promise<ElectronPrinter[]>;
      printHTML: (data: { html: string; printerName?: string }) => void;
    };
  }
}

const isConnected = ref(false);
const printers = ref<string[]>([]);
const activePrinter = ref("");

if (typeof window !== "undefined") {
  activePrinter.value = localStorage.getItem("selected_printer") || "";
}

export const usePrinter = () => {
  const uiStore = useUiStore();

  const initPrinter = async () => {
    if (typeof window !== "undefined" && window.electronAPI) {
      isConnected.value = true;
      await fetchPrinters();
    } else {
      console.warn("Electron API not found. Printing will use browser default.");
      isConnected.value = false;
    }
  };

  const fetchPrinters = async () => {
    if (typeof window !== "undefined" && window.electronAPI) {
      try {
        const list = await window.electronAPI.getPrinters();
        printers.value = list.map(p => p.name);
        
        // If no printer selected but we have a default one, use it
        if (!activePrinter.value) {
          const defaultPrinter = list.find(p => p.isDefault);
          if (defaultPrinter) {
            setPrinter(defaultPrinter.name);
          }
        }
      } catch (e) {
        console.error("Failed to fetch printers:", e);
      }
    }
  };

  const setPrinter = (name: string) => {
    activePrinter.value = name;
    localStorage.setItem("selected_printer", name);
  };

  const generateInvoiceHtml = (order: any, settings: any = {}) => {
    const itemsHtml = order?.items?.map((item: any, index: number) => `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 10px 8px; color: #64748b; font-size: 11px;">${index + 1}</td>
        <td style="padding: 10px 8px; font-weight: 500; color: #1e293b; font-size: 12px;">${item.product_name || item.name}</td>
        <td style="padding: 10px 8px; text-align: center; color: #64748b; font-size: 12px;">${item.quantity} шт.</td>
        <td style="padding: 10px 8px; text-align: right; color: #64748b; font-size: 12px;">${Math.round(item.price).toLocaleString()}</td>
        <td style="padding: 10px 8px; text-align: right; font-weight: 600; color: #0f172a; font-size: 12px;">${Math.round(item.price * item.quantity).toLocaleString()}</td>
      </tr>
    `).join('') || '<tr><td colspan="5" style="text-align:center; padding: 20px;">Нет данных</td></tr>';

    const shopName = settings.receipt_title || settings.site_name || 'BRAND STORE';
    const dateStr = new Date(order?.created_at || new Date()).toLocaleString('ru-RU', { 
      day: '2-digit', 
      month: 'long', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    const orderNum = order?.order_number || order?.id || '_______';
    
    const subtotal = Number(order?.total_amount || order?.total || 0);
    const discount = Number(order?.discount || 0);
    const total = Number(order?.total || subtotal);

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
          body { font-family: 'Inter', sans-serif; color: #1e293b; margin: 0; padding: 30px; background: white; line-height: 1.5; }
          .invoice-box { max-width: 800px; margin: auto; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #f1f5f9; padding-bottom: 20px; margin-bottom: 30px; }
          .brand { color: #0ea5e9; font-size: 22px; font-weight: 800; }
          .meta { text-align: right; font-size: 11px; color: #64748b; }
          .meta strong { color: #1e293b; }
          .doc-title { font-size: 22px; font-weight: 800; margin: 20px 0; color: #0f172a; }
          .badges { display: flex; gap: 8px; margin-bottom: 30px; }
          .badge { padding: 4px 10px; border-radius: 6px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
          .badge-blue { background: #f0f9ff; color: #0369a1; border: 1px solid #e0f2fe; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 30px; font-size: 12px; }
          .info-label { color: #94a3b8; text-transform: uppercase; font-size: 9px; font-weight: 700; margin-bottom: 6px; letter-spacing: 1px; }
          table { width: 100%; border-collapse: collapse; }
          th { text-align: left; background: #f8fafc; padding: 10px 8px; color: #64748b; font-size: 9px; text-transform: uppercase; font-weight: 700; letter-spacing: 1px; }
          .total-box { margin-top: 30px; margin-left: auto; width: 220px; border-top: 1.5px solid #f1f5f9; padding-top: 15px; }
          .total-row { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 11px; color: #64748b; }
          .grand-total { margin-top: 10px; padding-top: 10px; font-size: 15px; font-weight: 800; color: #0ea5e9; }
          .signatures { margin-top: 60px; display: flex; justify-content: space-between; font-size: 11px; color: #64748b; }
          .sig-line { width: 120px; border-bottom: 1px solid #e2e8f0; display: inline-block; margin: 0 8px; }
        </style>
      </head>
      <body>
        <div class="invoice-box">
          <div class="header">
            <div class="brand">${shopName}</div>
            <div class="meta">
              <div>Электронный документ: <strong>#${orderNum}</strong></div>
              <div>Дата: <strong>${dateStr}</strong></div>
            </div>
          </div>

          <div class="doc-title">Расходная накладная</div>
          
          <div class="badges">
            <div class="badge badge-blue">Оплачено</div>
            <div class="badge badge-blue">Электронная копия</div>
          </div>

          <div class="info-grid">
            <div>
              <div class="info-label">Поставщик</div>
              <div style="font-weight: 600;">${shopName}</div>
              <div style="color: #64748b;">Розничная торговля</div>
            </div>
            <div>
              <div class="info-label">Покупатель</div>
              <div style="font-weight: 600;">${order?.user?.name || 'Розничный покупатель'}</div>
              ${order?.user?.id && !String(order.user.id).includes('retail') ? `<div style="color: #64748b;">ID: ${order.user.id}</div>` : ''}
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 40px;">№</th>
                <th>Товар</th>
                <th style="text-align: center; width: 80px;">Кол-во</th>
                <th style="text-align: right; width: 100px;">Цена</th>
                <th style="text-align: right; width: 120px;">Сумма</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>

          <div class="total-box">
            <div class="total-row">
              <span>Подытог:</span>
              <span>${Math.round(subtotal).toLocaleString()}</span>
            </div>
            ${discount > 0 ? `<div class="total-row" style="color: #ef4444;"><span>Скидка:</span><span>-${discount.toLocaleString()}</span></div>` : ''}
            <div class="total-row grand-total">
              <span>ИТОГО:</span>
              <span>${Math.round(total).toLocaleString()} сом</span>
            </div>
          </div>

          <div class="signatures">
            <div>Отпустил (подпись): <span class="sig-line"></span></div>
            <div>Получил (подпись): <span class="sig-line"></span></div>
          </div>
        </div>
      </body>
      </html>
    `;
  };

  const generateReceiptHtml = (order: any, settings: any = {}) => {
    const itemsHtml = order.items.map((item: any) => `
      <tr>
        <td style="padding: 1mm 0; font-size: 10px;">${item.product_name || item.name}</td>
        <td style="padding: 1mm 0; font-size: 10px; text-align: center;">${item.quantity}</td>
        <td style="padding: 1mm 0; font-size: 10px; text-align: right;">${Math.round(item.price)}</td>
        <td style="padding: 1mm 0; font-size: 10px; text-align: right;">${Math.round(item.price * item.quantity)}</td>
      </tr>
    `).join('');

    const shopName = settings.receipt_title || settings.site_name || 'МОЙ МАГАЗИН';
    const dateStr = new Date().toLocaleString('ru-RU');
    const orderNum = order.order_number || 'OFF-LINE';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          @page { size: 80mm auto; margin: 0; }
          body { font-family: sans-serif; width: 72mm; padding: 5mm; font-size: 12px; line-height: 1.2; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed black; margin: 2mm 0; }
          table { width: 100%; border-collapse: collapse; }
          th { text-align: left; border-bottom: 1px solid black; font-size: 10px; }
        </style>
      </head>
      <body>
        <div class="center">
          <div style="font-size: 16px; font-weight: bold;">${shopName}</div>
          <div style="font-size: 10px; margin-top: 1mm;">${dateStr}</div>
          <div style="font-size: 10px;">ЧЕК №: ${orderNum}</div>
        </div>
        <div class="divider"></div>
        <table>
          <thead>
            <tr><th>Товар</th><th>Кол</th><th>Цена</th><th style="text-align: right;">Сумма</th></tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <div class="divider"></div>
        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 14px;">
          <span>ИТОГО:</span>
          <span>${Math.round(order.total || order.total_amount || 0)} сом</span>
        </div>
        ${order.discount > 0 ? `<div style="text-align: right; font-size: 10px;">Скидка: -${order.discount}</div>` : ''}
        <div class="divider"></div>
        <div class="center" style="font-size: 10px; font-style: italic; margin-top: 5mm;">
          СПАСИБО ЗА ПОКУПКУ!<br>Товар обмену и возврату подлежит<br>в течение 14 дней при наличии чека
        </div>
        <div style="margin-top: 5mm; border-bottom: 2px solid black;"></div>
      </body>
      </html>
    `;
  };

  const printViaBrowser = (html: string) => {
    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    frame.style.visibility = 'hidden';
    document.body.appendChild(frame);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (frame.parentNode) document.body.removeChild(frame);
    };

    const win = frame.contentWindow;
    const doc = win?.document;
    if (!win || !doc) {
      cleanup();
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    // Дать браузеру время отрисовать документ перед печатью,
    // и не удалять iframe до завершения/отмены печати (иначе окно
    // печати может остаться пустым или не открыться вовсе).
    setTimeout(() => {
      win.onafterprint = cleanup;
      win.focus();
      win.print();
      setTimeout(cleanup, 10000);
    }, 300);
  };

  const printReceipt = async (
    orderData: any, // Теперь можно передавать либо ID (для API), либо весь объект заказа (для локальной печати)
    type: "thermal" | "full" = "thermal"
  ) => {
    try {
      let htmlContent = "";
      // Если передали объект, НО в нем нет товаров — переключаемся на загрузку по ID (Fallback)
      if (typeof orderData === 'object' && orderData !== null && (!orderData.items || !Array.isArray(orderData.items))) {
        console.warn("Order data has no items, falling back to server-side printing");
        const fallbackId = orderData.uuid || orderData.id;
        if (fallbackId) {
          orderData = fallbackId;
        }
      }

      // Если передали объект (офлайн/быстрый режим)
      if (typeof orderData === 'object' && orderData !== null) {
        htmlContent = generateReceiptHtml(orderData);
      } else {
        // Иначе запрашиваем с сервера (для истории или если нужно специфическое оформление)
        const { getAuthToken, baseURL } = useApi();
        const token = getAuthToken();

        const endpoint = type === "thermal"
          ? `/reports/order/${orderData}/thermal/html`
          : `/reports/order/${orderData}/html`;

        const response = await fetch(`${baseURL}${endpoint}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) throw new Error("Ошибка сервера при получении чека");
        htmlContent = await response.text();
      }

      if (typeof window !== "undefined" && window.electronAPI) {
        window.electronAPI.printHTML({
          html: htmlContent,
          printerName: activePrinter.value
        });
      } else {
        printViaBrowser(htmlContent);
      }
    } catch (e: any) {
      console.error("Printing failing:", e);
      uiStore.addToast("Ошибка печати: " + e.message, "error");
    }
  };

  const testPrint = async () => {
    const testHtml = `
      <div style="font-family: sans-serif; padding: 20px; border: 2px solid black; text-align: center;">
        <h2 style="margin: 0;">ТЕСТ ПЕЧАТИ</h2>
        <p>Магазин: ${typeof window !== "undefined" ? window.location.hostname : 'Local'}</p>
        <p>Принтер: ${activePrinter.value || 'По умолчанию'}</p>
        <hr>
        <p>Если вы видите этот текст, значит система настроена верно!</p>
        <p style="font-size: 12px; color: gray;">Дата: ${new Date().toLocaleString()}</p>
      </div>
    `;

    if (typeof window !== "undefined" && window.electronAPI) {
      window.electronAPI.printHTML({
        html: testHtml,
        printerName: activePrinter.value
      });
      uiStore.addToast("Тестовая страница отправлена", "success");
    } else {
      printViaBrowser(testHtml);
    }
  };

  return {
    isConnected,
    printers,
    activePrinter,
    initPrinter,
    fetchPrinters,
    setPrinter,
    printReceipt,
    testPrint,
    generateReceiptHtml,
    generateInvoiceHtml,
  };
};
