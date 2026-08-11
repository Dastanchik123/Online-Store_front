import { useUiStore } from "~/stores/ui";
import { useSettings } from "./useSettings";
import JsBarcode from "jsbarcode";

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
      printHTML: (data: { html: string; printerName?: string; pageWidthMm?: number; pageHeightMm?: number }) => void;
    };
  }
}

const isConnected = ref(false);
const printers = ref<string[]>([]);
const activePrinter = ref("");

export const DEFAULT_PRICE_TAG_TEMPLATE = {
  width_mm: 58,
  height_mm: 40,
  show_description: true,
  show_date: true,
  show_barcode: true,
  show_old_price: true,
  show_company: true,
  mirrored: false,
};
export const DEFAULT_BARCODE_TEMPLATE = {
  width_mm: 40,
  height_mm: 30,
};

const parseTemplate = <T extends object>(json: string | undefined, fallback: T): T => {
  if (!json) return fallback;
  try {
    return { ...fallback, ...JSON.parse(json) };
  } catch (e) {
    return fallback;
  }
};

// ===== "Богатый" шаблон из редактора этикеток (public/label-editor.html) =====
// Формат отличается от DEFAULT_PRICE_TAG_TEMPLATE/DEFAULT_BARCODE_TEMPLATE:
// это свободные элементы (x/y/w/h/type/props в мм), а не набор чекбоксов.
// Если для типа печати назначен активный "богатый" шаблон (settings.label_active_template_*),
// он используется вместо старой генерации ниже.
interface RichLabelElement {
  type: string;
  x: number; y: number; w: number; h: number; rot?: number;
  fontSize: number; bold?: boolean; align?: string; color?: string;
  props: Record<string, any>;
}
interface RichLabelTemplate {
  id?: string;
  name?: string;
  role?: string; // "price_tag" | "barcode" | "none" — определяет раскладку при печати
  width: number;
  height: number;
  elements: RichLabelElement[];
}

const parseRichTemplate = (json: string | undefined | null): RichLabelTemplate | null => {
  if (!json) return null;
  try {
    const tpl = JSON.parse(json);
    if (tpl && Array.isArray(tpl.elements) && Number(tpl.width) > 0 && Number(tpl.height) > 0) {
      return tpl as RichLabelTemplate;
    }
  } catch (e) {
    /* некорректный JSON — просто игнорируем, сработает старый шаблон */
  }
  return null;
};

// Реальные товары не имеют полей oldPrice/barcode/article/country из
// редактора — приводим к его формату (sku служит и артикулом, и штрихкодом).
const adaptProductForRichLabel = (product: any) => {
  const regularPrice = Number(product?.price || 0);
  const salePrice = Number(product?.sale_price || 0);
  const hasSale = salePrice > 0 && salePrice < regularPrice;
  return {
    name: product?.name || "",
    price: hasSale ? salePrice : regularPrice,
    oldPrice: hasSale ? regularPrice : 0,
    barcode: product?.sku || "",
    article: product?.sku || "",
    unit: product?.unit || "",
    unitPrice: 0,
    country: "",
  };
};

const formatRichNumber = (n: number): string => {
  n = Number(n) || 0;
  return n.toLocaleString("ru-RU", { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 });
};

const computeRichDiscount = (product: any): number | null => {
  const p = Number(product.price) || 0;
  const op = Number(product.oldPrice) || 0;
  if (!op || op <= p) return null;
  return Math.round((1 - p / op) * 100);
};

const buildRichElementContentHTML = (el: RichLabelElement, product: any, settings: any): string => {
  const defaultCurrency = settings?.currency_symbol !== undefined ? settings.currency_symbol : "сом";
  switch (el.type) {
    case "product_name":
      return escapeHtml(product.name || "");
    case "price": {
      const val = Number(product.price) || 0;
      const c = el.props?.currency !== undefined ? el.props.currency : defaultCurrency;
      if (el.props?.showKopecks) {
        const whole = Math.floor(val);
        const kop = Math.round((val - whole) * 100);
        return `${whole}<span style="font-size:0.5em;vertical-align:top;">.${String(kop).padStart(2, "0")}</span> ${c}`;
      }
      return `${formatRichNumber(val)} ${c}`;
    }
    case "old_price": {
      const val = Number(product.oldPrice) || 0;
      if (!val) return "";
      const c = el.props?.currency !== undefined ? el.props.currency : defaultCurrency;
      return `<span style="text-decoration:line-through;">${formatRichNumber(val)} ${c}</span>`;
    }
    case "discount": {
      const d = computeRichDiscount(product);
      if (d == null) return "";
      return escapeHtml((el.props?.format || "-{d}%").replace("{d}", String(d)));
    }
    case "barcode":
      return ""; // рисуется отдельно через SVG/JsBarcode
    case "store_name":
      return escapeHtml(
        el.props?.useGlobal ? (settings?.receipt_title || settings?.site_name || "") : (el.props?.text || "")
      );
    case "date": {
      if (el.props?.mode === "fixed" && el.props?.fixedDate) {
        const d = new Date(el.props.fixedDate);
        if (!isNaN(d.getTime())) {
          return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
        }
      }
      const now = new Date();
      return `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
    }
    case "article":
      return escapeHtml((el.props?.prefix || "") + (product.article || ""));
    case "unit": {
      const up = Number(product.unitPrice) || 0;
      const u = product.unit || "";
      return escapeHtml((el.props?.prefix || "") + (up ? formatRichNumber(up) + " " + defaultCurrency + " / " : "") + u);
    }
    case "country":
      return escapeHtml((el.props?.prefix || "") + (product.country || ""));
    case "custom_text":
      return escapeHtml(el.props?.text || "");
    default:
      return "";
  }
};

// Один экземпляр этикетки по "богатому" шаблону — единицы всегда мм (печать 1:1),
// логика позиционирования и подгонки штрихкода зеркалит label-editor.html.
const renderRichLabelBody = (template: RichLabelTemplate, product: any, settings: any): string => {
  if (typeof document === "undefined") return "";
  const wrap = document.createElement("div");
  wrap.className = "rich-label-instance";
  wrap.style.position = "relative";
  wrap.style.width = `${template.width}mm`;
  wrap.style.height = `${template.height}mm`;
  wrap.style.background = "#fff";
  wrap.style.overflow = "hidden";
  wrap.style.flexShrink = "0";

  (template.elements || []).forEach((el) => {
    const node = document.createElement("div");
    node.style.position = "absolute";
    node.style.left = `${el.x}mm`;
    node.style.top = `${el.y}mm`;
    node.style.width = `${el.w}mm`;
    node.style.height = `${el.h}mm`;
    node.style.fontSize = `${el.fontSize}mm`;
    node.style.fontWeight = el.bold ? "700" : "400";
    node.style.color = el.color || "#000";
    node.style.overflow = "hidden";
    node.style.display = "flex";
    node.style.lineHeight = "1.1";
    node.style.whiteSpace = "pre-wrap";
    node.style.wordBreak = "break-word";
    node.style.textAlign = (el.align as any) || "left";
    node.style.justifyContent = el.align === "center" ? "center" : el.align === "right" ? "flex-end" : "flex-start";
    node.style.alignItems = ["price", "old_price", "discount"].includes(el.type) ? "center" : "flex-start";
    if (el.rot) {
      node.style.transform = `rotate(${el.rot}deg)`;
      node.style.transformOrigin = "center center";
    }

    if (el.type === "line") {
      node.style.display = "block";
      if (el.props?.orientation === "vertical") {
        node.style.borderLeft = `${el.props.thickness}mm ${el.props.style} ${el.color}`;
      } else {
        node.style.borderTop = `${el.props.thickness}mm ${el.props.style} ${el.color}`;
      }
    } else if (el.type === "frame") {
      node.style.display = "block";
      node.style.border = `${el.props.thickness}mm ${el.props.style} ${el.color}`;
      node.style.borderRadius = `${el.props.radius || 0}mm`;
    } else if (el.type === "barcode") {
      const ns = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(ns, "svg") as unknown as SVGElement;
      (svg as any).style.width = "100%";
      (svg as any).style.height = "100%";
      (svg as any).style.display = "block";
      node.appendChild(svg as any);
      const value = String(product.barcode || "").trim();
      try {
        if (!value) throw new Error("нет кода");
        const UNITS_PER_MM = 12;
        const targetW = el.w * UNITS_PER_MM;
        const targetH = el.h * UNITS_PER_MM;
        const barHeight = el.props?.showDigits ? targetH * 0.6 : targetH * 0.86;
        const baseOpts: any = {
          format: el.props?.format || "EAN13",
          displayValue: !!el.props?.showDigits,
          margin: Math.max(2, targetH * 0.06),
          font: "monospace",
          fontSize: Math.max(8, targetH * 0.22),
          textMargin: 1,
          height: barHeight,
          width: 2,
        };
        JsBarcode(svg as any, value, baseOpts);
        const nativeW = parseFloat((svg as any).getAttribute("width") || "0");
        const fitWidth = Math.max(0.6, 2 * (targetW / nativeW));
        JsBarcode(svg as any, value, { ...baseOpts, width: fitWidth });
        const w = parseFloat((svg as any).getAttribute("width") || "0");
        const h = parseFloat((svg as any).getAttribute("height") || "0");
        if (w && h) {
          (svg as any).setAttribute("viewBox", `0 0 ${w} ${h}`);
          (svg as any).removeAttribute("width");
          (svg as any).removeAttribute("height");
          (svg as any).setAttribute("preserveAspectRatio", "xMidYMid meet");
        }
      } catch (err) {
        (svg as any).remove();
        node.style.alignItems = "center";
        node.style.justifyContent = "center";
        node.style.border = "1px dashed #c33";
        node.style.color = "#c33";
        node.style.fontSize = "9px";
        node.textContent = "Штрих-код: нет кода";
      }
    } else {
      const inner = document.createElement("div");
      inner.innerHTML = buildRichElementContentHTML(el, product, settings);
      node.appendChild(inner);
    }

    wrap.appendChild(node);
  });

  return wrap.outerHTML;
};

// Штрихкод-этикетки печатаются по одной на "страницу" размером точно с саму
// этикетку — это ожидаемо для рулонных этикеточных принтеров/наклеек.
const wrapRichLabelPages = (instances: string[], template: RichLabelTemplate) => {
  const pages = instances
    .map((html, i) => {
      const isLast = i === instances.length - 1;
      const pageBreak = isLast ? "" : "page-break-after:always;break-after:page;";
      return `<div style="width:${template.width}mm;height:${template.height}mm;${pageBreak}">${html}</div>`;
    })
    .join("");
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        @page { size: ${template.width}mm ${template.height}mm; margin: 0; }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: Arial, sans-serif; color: #000; }
      </style>
    </head>
    <body>${pages}</body>
    </html>
  `;
};

// Ценники печатаются плотной сеткой — на A4 (лист режется на страницы по
// 297мм) либо на чековой ленте 80мм (одна непрерывная "страница", высота
// растёт под фактическое количество этикеток). В обоих случаях лист
// обрезается по факту занятых рядов, а не тянется на всю бумагу пустым —
// экономия бумаги важнее, чем визуальная "стандартность" листа.
const wrapRichLabelPagesGrid = (
  instances: string[],
  template: RichLabelTemplate,
  opts: { paperWidthMm: number; paperHeightMm?: number; marginMm?: number; gapMm?: number }
): { html: string; pageHeightMm: number } => {
  const { paperWidthMm, paperHeightMm, marginMm = 8, gapMm = 3 } = opts;
  const usableW = paperWidthMm - marginMm * 2;
  const cols = Math.max(1, Math.floor((usableW + gapMm) / (template.width + gapMm)));
  const heightForRows = (rows: number) => rows * template.height + Math.max(0, rows - 1) * gapMm + marginMm * 2;
  const styleBlock = `
    @page { size: ${paperWidthMm}mm __PAGE_H__mm; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; color: #000; }
    .grid-page { width: ${paperWidthMm}mm; padding: ${marginMm}mm; overflow: hidden; }
    .grid-inner { display: flex; flex-wrap: wrap; gap: ${gapMm}mm; width: ${usableW}mm; }
  `;

  // Чековая лента: печать непрерывная, без разрывов — одна "страница"
  // высотой ровно под то, что реально уместилось.
  if (!paperHeightMm) {
    const rows = Math.max(1, Math.ceil(instances.length / cols));
    const pageH = heightForRows(rows);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${styleBlock.replace("__PAGE_H__", String(pageH))}</style></head>
      <body><div class="grid-page"><div class="grid-inner">${instances.join("")}</div></div></body></html>`;
    return { html, pageHeightMm: pageH };
  }

  const usableH = paperHeightMm - marginMm * 2;
  const rowsPerPage = Math.max(1, Math.floor((usableH + gapMm) / (template.height + gapMm)));
  const perPage = cols * rowsPerPage;
  const pageCount = Math.max(1, Math.ceil(instances.length / perPage));

  let pagesHtml = "";
  let maxPageHeight = 0;
  for (let p = 0; p < pageCount; p++) {
    const pageItems = instances.slice(p * perPage, (p + 1) * perPage);
    const isLast = p === pageCount - 1;
    const pageBreak = isLast ? "" : "page-break-after:always;break-after:page;";
    const rowsUsed = Math.min(rowsPerPage, Math.max(1, Math.ceil(pageItems.length / cols)));
    const pageH = heightForRows(rowsUsed);
    maxPageHeight = Math.max(maxPageHeight, pageH);
    pagesHtml += `<div class="grid-page" style="height:${pageH}mm;${pageBreak}"><div class="grid-inner">${pageItems.join("")}</div></div>`;
  }

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${styleBlock.replace("__PAGE_H__", String(maxPageHeight))}</style></head>
    <body>${pagesHtml}</body></html>`;
  return { html, pageHeightMm: maxPageHeight };
};

// Собирает готовые страницы под конкретный "богатый" шаблон, раскладка
// зависит от его роли: ценник — плотная сетка (на A4 или на чековой ленте
// 80мм, смотря что выбрал пользователь), штрихкод — по одному экземпляру
// на страницу (размер страницы = размер этикетки, уже само по себе подходит
// и под рулонный принтер).
const buildRichLabelHtml = (
  richTpl: RichLabelTemplate & { role?: string },
  items: Array<{ product: any; qty: number }>,
  settings: any,
  paperMode: "a4" | "roll80" = "a4"
) => {
  const instances: string[] = [];
  items.forEach(({ product, qty }) => {
    const body = renderRichLabelBody(richTpl, adaptProductForRichLabel(product), settings);
    for (let i = 0; i < Math.max(1, qty); i++) instances.push(body);
  });

  if (richTpl.role === "price_tag") {
    const opts = paperMode === "roll80"
      ? { paperWidthMm: 80, marginMm: 3, gapMm: 2 }
      : { paperWidthMm: 210, paperHeightMm: 297, marginMm: 8, gapMm: 3 };
    const { html, pageHeightMm } = wrapRichLabelPagesGrid(instances, richTpl, opts);
    return { html, pageWidthMm: opts.paperWidthMm, pageHeightMm };
  }
  return { html: wrapRichLabelPages(instances, richTpl), pageWidthMm: richTpl.width, pageHeightMm: richTpl.height };
};

if (typeof window !== "undefined") {
  activePrinter.value = localStorage.getItem("selected_printer") || "";
}

// Данные заказа (название товара, имя покупателя, название магазина) приходят
// из БД, куда их мог ввести кто угодно (создание товара, регистрация, настройки) —
// без экранирования это XSS при печати/просмотре чека через v-html.
const escapeHtml = (value: unknown): string =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c] as string);

export const usePrinter = () => {
  const uiStore = useUiStore();
  const { settings } = useSettings();

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
    const itemsHtml = order?.items?.map((item: any, index: number) => {
      const itemUnit = item.is_package
        ? (item.product?.package_unit || item.product?.unit || item.unit || "шт")
        : (item.product?.unit || item.unit || "шт");
      return `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 10px 8px; color: #64748b; font-size: 11px;">${index + 1}</td>
        <td style="padding: 10px 8px; font-weight: 500; color: #1e293b; font-size: 12px;">${escapeHtml(item.product_name || item.name)}</td>
        <td style="padding: 10px 8px; text-align: center; color: #64748b; font-size: 12px;">${item.quantity}</td>
        <td style="padding: 10px 4px; color: #64748b; font-size: 12px; white-space: nowrap; width: 1%;">${escapeHtml(itemUnit)}</td>
        <td style="padding: 10px 8px; text-align: right; color: #64748b; font-size: 12px;">${Math.round(item.price).toLocaleString()}</td>
        <td style="padding: 10px 8px; text-align: right; font-weight: 600; color: #0f172a; font-size: 12px;">${Math.round(item.price * item.quantity).toLocaleString()}</td>
      </tr>
    `;
    }).join('') || '<tr><td colspan="6" style="text-align:center; padding: 20px;">Нет данных</td></tr>';

    const shopName = escapeHtml(settings.receipt_title || settings.site_name || 'BRAND STORE');
    const dateStr = new Date(order?.created_at || new Date()).toLocaleString('ru-RU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    const orderNum = escapeHtml(order?.order_number || order?.id || '_______');
    
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
              <div style="font-weight: 600;">${escapeHtml(order?.user?.name || 'Розничный покупатель')}</div>
              ${order?.user?.id && !String(order.user.id).includes('retail') ? `<div style="color: #64748b;">ID: ${escapeHtml(order.user.id)}</div>` : ''}
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 40px;">№</th>
                <th>Товар</th>
                <th style="text-align: center; width: 80px;">Кол-во</th>
                <th style="white-space: nowrap; width: 1%; padding: 10px 4px;">Ед.</th>
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
    const itemsHtml = order.items.map((item: any) => {
      const itemUnit = item.is_package
        ? (item.product?.package_unit || item.product?.unit || item.unit || "шт")
        : (item.product?.unit || item.unit || "шт");
      return `
      <tr>
        <td style="padding: 1mm 0; font-size: 10px;">${escapeHtml(item.product_name || item.name)}</td>
        <td style="padding: 1mm 0; font-size: 10px; text-align: center;">${parseFloat(item.quantity) || 0}</td>
        <td style="padding: 1mm 0 1mm 2mm; font-size: 10px; white-space: nowrap; width: 1%;">${escapeHtml(itemUnit)}</td>
        <td style="padding: 1mm 0; font-size: 10px; text-align: right;">${Math.round(item.price)}</td>
        <td style="padding: 1mm 0; font-size: 10px; text-align: right;">${Math.round(item.price * item.quantity)}</td>
      </tr>
    `;
    }).join('');

    const shopName = escapeHtml(settings.receipt_title || settings.site_name || 'МОЙ МАГАЗИН');
    const dateStr = new Date().toLocaleString('ru-RU');
    const orderNum = escapeHtml(order.order_number || 'OFF-LINE');

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
            <tr><th>Товар</th><th>Кол</th><th style="white-space: nowrap; width: 1%; padding-left: 2mm;">Ед.</th><th>Цена</th><th style="text-align: right;">Сумма</th></tr>
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

  const makeBarcodeSvg = (sku: string, height: number) => {
    if (!sku || typeof document === "undefined") return "";
    try {
      const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      JsBarcode(svgEl, sku, {
        format: "CODE128",
        displayValue: false,
        height,
        margin: 0,
        background: "transparent",
      });
      return new XMLSerializer().serializeToString(svgEl);
    } catch (e) {
      console.error("Barcode generation failed:", e);
      return "";
    }
  };

  // Один "лист" ценника (без обёртки документа) — используется и для печати
  // одного товара N раз, и для пакетной печати вперемешку с другими товарами.
  const generatePriceTagBody = (product: any, settings: any, tpl: typeof DEFAULT_PRICE_TAG_TEMPLATE) => {
    const name = escapeHtml(product?.name || "Товар");
    const sku = escapeHtml(product?.sku || "");
    const description = tpl.show_description
      ? escapeHtml(product?.short_description || product?.description || "")
      : "";
    const companyName = tpl.show_company
      ? escapeHtml(settings?.receipt_title || settings?.site_name || "")
      : "";

    const regularPrice = Number(product?.price || 0);
    const salePrice = Number(product?.sale_price || 0);
    const hasSale = tpl.show_old_price && salePrice > 0 && salePrice < regularPrice;
    const effectivePrice = hasSale ? salePrice : regularPrice;
    const oldPrice = hasSale ? regularPrice : null;

    const priceInt = Math.floor(effectivePrice);
    const priceFrac = Math.round((effectivePrice - priceInt) * 100).toString().padStart(2, "0");
    const dateStr = tpl.show_date ? new Date().toLocaleDateString("ru-RU") : "";
    const barcodeSvg = tpl.show_barcode ? makeBarcodeSvg(sku, 28) : "";

    const codeBlock = tpl.show_barcode
      ? `
        <div class="tag-code">
          <div>Код: ${sku}</div>
          <div class="tag-barcode">${barcodeSvg}</div>
        </div>
      `
      : `<div class="tag-code"></div>`;

    const priceBlock = `
      <div class="tag-price">
        ${oldPrice ? `<div class="old">${oldPrice.toLocaleString("ru-RU")}</div>` : ""}
        <div class="price-row">
          <span class="price-int">${priceInt}</span>
          <span class="price-frac">${priceFrac}</span>
        </div>
        <div class="price-cur">${escapeHtml(settings?.currency_symbol !== undefined ? settings.currency_symbol : "сом")}</div>
        <div class="tag-meta">Цена за: 1 шт.${companyName ? `<br>${companyName}` : ""}</div>
      </div>
    `;
    const bottomBlocks = tpl.mirrored ? priceBlock + codeBlock : codeBlock + priceBlock;

    return `
      <div class="tag-page">
        <div class="tag-header">
          <div class="tag-name">${name}</div>
          ${dateStr ? `<div class="tag-date">${dateStr}</div>` : ""}
        </div>
        ${description ? `<div class="tag-desc">${description}</div>` : ""}
        <div class="tag-bottom">${bottomBlocks}</div>
      </div>
    `;
  };

  const wrapPriceTagPages = (pages: string, tpl: typeof DEFAULT_PRICE_TAG_TEMPLATE) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        @page { size: ${tpl.width_mm}mm ${tpl.height_mm}mm; margin: 0; }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: Arial, sans-serif; color: #000; }
        .tag-page {
          width: ${tpl.width_mm}mm; height: ${tpl.height_mm}mm;
          padding: 2mm;
          display: flex; flex-direction: column;
          overflow: hidden;
          page-break-after: always;
          break-after: page;
        }
        .tag-page:last-child { page-break-after: auto; break-after: auto; }
        .tag-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 2mm; }
        .tag-name { font-size: 12px; font-weight: 700; line-height: 1.15; }
        .tag-date { font-size: 8px; color: #333; white-space: nowrap; }
        .tag-desc { font-size: 8px; color: #333; margin-top: 0.5mm; }
        .tag-bottom { margin-top: auto; display: flex; justify-content: space-between; align-items: flex-end; gap: 2mm; }
        .tag-code { font-size: 7px; }
        .tag-barcode svg { display: block; width: 28mm; height: 8mm; }
        .tag-price { text-align: right; }
        .tag-price .old { font-size: 8px; color: #555; text-decoration: line-through; }
        .price-row { display: flex; align-items: baseline; justify-content: flex-end; gap: 1px; }
        .price-int { font-size: 26px; font-weight: 800; line-height: 1; }
        .price-frac { font-size: 12px; font-weight: 700; border-top: 1px solid #000; padding-top: 1px; }
        .price-cur { font-size: 8px; }
        .tag-meta { font-size: 6.5px; color: #333; text-align: right; }
      </style>
    </head>
    <body>${pages}</body>
    </html>
  `;

  // Ценник для покупателя (кладётся перед товаром на полке). Шаблон (какие
  // поля показывать, размер, расположение) берётся из настроек магазина,
  // если не передан явно (используется для живого предпросмотра в админке).
  const generatePriceTagHtml = (
    product: any,
    settings: any = {},
    qty = 1,
    template: typeof DEFAULT_PRICE_TAG_TEMPLATE | null = null
  ) => {
    // template передают явно только для предпросмотра старого шаблона во
    // вкладке "Этикетки" — в этом случае "богатый" шаблон не подключаем.
    if (!template) {
      const richTpl = parseRichTemplate(settings?.label_active_template_price_tag);
      if (richTpl) {
        return buildRichLabelHtml(richTpl, [{ product, qty }], settings).html;
      }
    }
    const tpl = template
      ? { ...DEFAULT_PRICE_TAG_TEMPLATE, ...template }
      : parseTemplate(settings?.label_template_price_tag, DEFAULT_PRICE_TAG_TEMPLATE);
    const body = generatePriceTagBody(product, settings, tpl);
    const pages = Array.from({ length: Math.max(1, qty) }, () => body).join("");
    return wrapPriceTagPages(pages, tpl);
  };

  // Один "лист" компактной этикетки со штрихкодом (без обёртки документа).
  const generateBarcodeLabelBody = (product: any, tpl: typeof DEFAULT_BARCODE_TEMPLATE, settings: any = {}) => {
    const name = escapeHtml(product?.name || "Товар");
    const sku = escapeHtml(product?.sku || "");

    const regularPrice = Number(product?.price || 0);
    const salePrice = Number(product?.sale_price || 0);
    const price = salePrice > 0 && salePrice < regularPrice ? salePrice : regularPrice;
    const barcodeSvg = makeBarcodeSvg(sku, 22);

    return `
      <div class="lbl-page">
        <div class="lbl-name">${name}</div>
        <div class="lbl-barcode">${barcodeSvg}</div>
        <div class="lbl-bottom">
          <span class="lbl-sku">${sku}</span>
          <span class="lbl-price">${Math.round(price).toLocaleString("ru-RU")} ${escapeHtml(settings?.currency_symbol !== undefined ? settings.currency_symbol : "сом")}</span>
        </div>
      </div>
    `;
  };

  const wrapBarcodeLabelPages = (pages: string, tpl: typeof DEFAULT_BARCODE_TEMPLATE) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        @page { size: ${tpl.width_mm}mm ${tpl.height_mm}mm; margin: 0; }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: Arial, sans-serif; color: #000; }
        .lbl-page {
          width: ${tpl.width_mm}mm; height: ${tpl.height_mm}mm;
          padding: 1.5mm;
          display: flex; flex-direction: column; justify-content: space-between;
          overflow: hidden;
          page-break-after: always;
          break-after: page;
        }
        .lbl-page:last-child { page-break-after: auto; break-after: auto; }
        .lbl-name {
          font-size: 9px; font-weight: 700; line-height: 1.1;
          max-height: 2.2em; overflow: hidden;
        }
        .lbl-barcode svg { display: block; width: 100%; height: 10mm; }
        .lbl-bottom { display: flex; justify-content: space-between; align-items: baseline; }
        .lbl-sku { font-size: 8px; }
        .lbl-price { font-weight: 800; font-size: 11px; }
      </style>
    </head>
    <body>${pages}</body>
    </html>
  `;

  // Компактная этикетка со штрихкодом (наклеивается на сам товар) — без даты,
  // описания и названия магазина, только то, что нужно для сканирования на кассе.
  const generateBarcodeLabelHtml = (
    product: any,
    qty = 1,
    template: typeof DEFAULT_BARCODE_TEMPLATE | null = null
  ) => {
    if (!template) {
      const richTpl = parseRichTemplate(settings.value?.label_active_template_barcode);
      if (richTpl) {
        return buildRichLabelHtml(richTpl, [{ product, qty }], settings.value).html;
      }
    }
    const tpl = template ? { ...DEFAULT_BARCODE_TEMPLATE, ...template } : parseTemplate(settings.value?.label_template_barcode, DEFAULT_BARCODE_TEMPLATE);
    const body = generateBarcodeLabelBody(product, tpl, settings.value);
    const pages = Array.from({ length: Math.max(1, qty) }, () => body).join("");
    return wrapBarcodeLabelPages(pages, tpl);
  };

  // Пакетная печать разных товаров одним заданием (например, из очереди на
  // отдельной странице печати ценников) — каждая позиция может иметь своё
  // количество копий, шаблон и размер общие для всей партии.
  const printLabelBatch = async (
    items: Array<{ product: any; qty: number }>,
    opts: { type?: "price_tag" | "barcode"; printerName?: string; template?: RichLabelTemplate; paperMode?: "a4" | "roll80" } = {}
  ) => {
    const { type = "price_tag", printerName, template: explicitTemplate, paperMode = "a4" } = opts;
    try {
      // Явно выбранный на странице печати шаблон имеет приоритет; если его нет —
      // берём тот, что помечен активной ролью в редакторе (обратная совместимость).
      const richKey = type === "barcode" ? "label_active_template_barcode" : "label_active_template_price_tag";
      const richTpl = explicitTemplate || parseRichTemplate(settings.value?.[richKey]);

      let htmlContent: string;
      let pageWidthMm: number;
      let pageHeightMm: number;

      if (richTpl) {
        const built = buildRichLabelHtml(richTpl, items, settings.value, paperMode);
        htmlContent = built.html;
        pageWidthMm = built.pageWidthMm;
        pageHeightMm = built.pageHeightMm;
      } else if (type === "barcode") {
        const tpl = parseTemplate(settings.value?.label_template_barcode, DEFAULT_BARCODE_TEMPLATE);
        const pages = items
          .flatMap(({ product, qty }) => Array.from({ length: Math.max(1, qty) }, () => generateBarcodeLabelBody(product, tpl, settings.value)))
          .join("");
        htmlContent = wrapBarcodeLabelPages(pages, tpl);
        pageWidthMm = tpl.width_mm;
        pageHeightMm = tpl.height_mm;
      } else {
        const tpl = parseTemplate(settings.value?.label_template_price_tag, DEFAULT_PRICE_TAG_TEMPLATE);
        const pages = items
          .flatMap(({ product, qty }) => Array.from({ length: Math.max(1, qty) }, () => generatePriceTagBody(product, settings.value, tpl)))
          .join("");
        htmlContent = wrapPriceTagPages(pages, tpl);
        pageWidthMm = tpl.width_mm;
        pageHeightMm = tpl.height_mm;
      }

      if (typeof window !== "undefined" && window.electronAPI) {
        window.electronAPI.printHTML({
          html: htmlContent,
          printerName: printerName || activePrinter.value,
          pageWidthMm,
          pageHeightMm,
        });
      } else {
        printViaBrowser(htmlContent);
      }
    } catch (e: any) {
      console.error("Printing failing:", e);
      uiStore.addToast("Ошибка печати этикеток: " + e.message, "error");
    }
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

  // Единая точка печати этикетки/ценника. Количество копий имеет смысл
  // только при печати из Electron (прямая печать без диалога) — в браузере
  // window.print() всё равно даёт напечатать только один документ за раз.
  const printLabel = async (
    product: any,
    opts: { type?: "price_tag" | "barcode"; qty?: number; printerName?: string } = {}
  ) => {
    const { type = "price_tag", qty = 1, printerName } = opts;
    try {
      const htmlContent =
        type === "barcode"
          ? generateBarcodeLabelHtml(product, qty)
          : generatePriceTagHtml(product, settings.value, qty);

      const richKey = type === "barcode" ? "label_active_template_barcode" : "label_active_template_price_tag";
      const richTpl = parseRichTemplate(settings.value?.[richKey]);
      const tplForSize = richTpl
        ? { width_mm: richTpl.width, height_mm: richTpl.height }
        : type === "barcode"
          ? parseTemplate(settings.value?.label_template_barcode, DEFAULT_BARCODE_TEMPLATE)
          : parseTemplate(settings.value?.label_template_price_tag, DEFAULT_PRICE_TAG_TEMPLATE);

      if (typeof window !== "undefined" && window.electronAPI) {
        window.electronAPI.printHTML({
          html: htmlContent,
          printerName: printerName || activePrinter.value,
          pageWidthMm: tplForSize.width_mm,
          pageHeightMm: tplForSize.height_mm,
        });
      } else {
        printViaBrowser(htmlContent);
      }
    } catch (e: any) {
      console.error("Printing failing:", e);
      uiStore.addToast("Ошибка печати этикетки: " + e.message, "error");
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
    printLabel,
    printLabelBatch,
    testPrint,
    generateReceiptHtml,
    generateInvoiceHtml,
    generatePriceTagHtml,
    generateBarcodeLabelHtml,
  };
};
