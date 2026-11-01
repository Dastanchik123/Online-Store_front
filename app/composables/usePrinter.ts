import { useUiStore } from "~/stores/ui";
import { useSettings } from "./useSettings";
import { isThermalPrinterSupported, useThermalPrinter } from "./useThermalPrinter";
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
      printReceipt?: (data: { html: string; printerName?: string }) => Promise<ReceiptPrintResult>;
      getReceiptPrintConfig?: () => Promise<ReceiptPrintConfig>;
      setReceiptPrintConfig?: (config: Partial<ReceiptPrintConfig>) => Promise<ReceiptPrintConfig>;
      getLabelDefaultTemplateId?: () => Promise<string>;
      setLabelDefaultTemplateId?: (id: string) => Promise<void>;
      getLabelPrinterConfig?: () => Promise<Record<string, { templateId?: string; ribbonWidthMm?: number }>>;
      setLabelPrinterConfig?: (config: Record<string, { templateId?: string; ribbonWidthMm?: number }>) => Promise<void>;
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
// Для весового товара override.barcodeValue/weightKg подменяют штрихкод и
// цену на конкретную упаковку (динамический код, а не статичный sku).
const adaptProductForRichLabel = (
  product: any,
  override: { barcodeValue?: string; weightKg?: number } = {}
) => {
  const regularPrice = Number(product?.price || 0);
  const salePrice = Number(product?.sale_price || 0);
  const hasSale = salePrice > 0 && salePrice < regularPrice;
  const unitPrice = hasSale ? salePrice : regularPrice;
  const weightKg = override.weightKg || 0;
  const price = weightKg ? Math.round(weightKg * unitPrice * 100) / 100 : unitPrice;
  return {
    name: product?.name || "",
    price,
    oldPrice: weightKg ? 0 : hasSale ? regularPrice : 0,
    barcode: override.barcodeValue || product?.sku || "",
    article: product?.sku || "",
    unit: product?.unit || "",
    unitPrice: weightKg ? unitPrice : 0,
    weight: weightKg,
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
    case "weight": {
      const w = Number(product.weight) || 0;
      if (!w) return "";
      return escapeHtml((el.props?.prefix || "") + formatRichNumber(w) + " " + (product.unit || "кг"));
    }
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
  items: Array<{ product: any; qty: number; override?: { barcodeValue?: string; weightKg?: number } }>,
  settings: any,
  paperMode: "a4" | "roll80" = "a4"
) => {
  const instances: string[] = [];
  items.forEach(({ product, qty, override }) => {
    const body = renderRichLabelBody(richTpl, adaptProductForRichLabel(product, override), settings);
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

// Общая база чека для термоленты 80мм (203 dpi, 8 точек/мм).
// - Ширина ровно 72мм (область печати) по центру ленты, border-box: раньше
//   72мм + поля = 82мм, и драйвер ужимал весь чек — текст мельчал и плыл.
// - Только чистый #000: серый драйвер/порог превращают в рваный растр.
// - Tahoma: хинтованный под низкое разрешение шрифт с узкими цифрами и
//   полной кириллицей (включая ң/ө/ү). У него есть только 400 и 700, поэтому
//   жирность задаём ровно этими значениями — 500/600 выглядели бы как 700.
// - Минимум 11–12px (≈23–25 точек по высоте): мельче тонкие штрихи на
//   термоголовке пропадают. Обычный текст 400, всё, что ищут глазами
//   (суммы, итог, номер чека), — 700.
// - Без курсива: наклонные штрихи на 203 dpi рассыпаются «лесенкой».
// - @page задаёт только поля; высоту ленты под фактический чек проставляет
//   код печати (Electron — main-процесс, браузер — printViaBrowser).
const RECEIPT_BASE_CSS = `
  @page { margin: 0; }
  :root { color-scheme: light only; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    /* Не margin: 0 auto: если браузер/драйвер дал лист A4, чек уезжал к его
       центру, а термоголовка печатает только левые 72мм. Отступ 4мм (центр
       ленты 80мм) — только когда лист ровно 80мм (Electron); на окне растра
       72мм и на широком листе браузера — 0, иначе обрезался правый край. */
    width: 72mm;
    margin: 0 0 0 max(0mm, min(calc((100% - 72mm) / 2), calc(4mm - (100% - 80mm))));
    padding: 0 0 2mm;
    font-family: Tahoma, Verdana, "DejaVu Sans", Arial, sans-serif;
    font-size: 13px; font-weight: 400; line-height: 1.3; color: #000;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .center { text-align: center; }
  .bold { font-weight: 700; }
  table { width: 100%; border-collapse: collapse; }
`;

// Сетка точек принтера: 576 точек на 72мм → 1 точка = 0.125мм.
// QR и штрихкод строим в этих единицах, чтобы модуль был целым числом точек
// (дробный модуль после растеризации даёт полосы разной ширины — сканер
// такие коды не читает).
const DOT_MM = 0.125;

// Суммы в чеке: 1,034.00 — запятая между тысячами, две цифры копеек
const formatReceiptMoney = (n: unknown): string =>
  (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const buildQrSvg = async (text: string, moduleDots = 6) => {
  const QRCode = (await import("qrcode")).default;
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const quiet = 4;
  const total = size + quiet * 2;
  let rects = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (qr.modules.get(x, y)) rects += `<rect x="${x + quiet}" y="${y + quiet}" width="1" height="1"/>`;
    }
  }
  const mm = total * moduleDots * DOT_MM;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" style="width:${mm}mm;height:${mm}mm;display:block;margin:0 auto;" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
};

const buildBarcodeSvg = (value: string, moduleDots = 3, heightMm = 12) => {
  if (typeof document === "undefined") return "";
  const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  // Поля по 10 модулей только слева/справа (тихая зона CODE128); сверху и
  // снизу полей нет, чтобы штрихи растягивались на всю высоту heightMm.
  // margin: 0 обязателен — marginTop: 0 сам по себе JsBarcode заменяет на margin.
  JsBarcode(svgEl, value, {
    format: "CODE128", displayValue: false, width: 1, height: 10,
    margin: 0, marginLeft: 10, marginRight: 10,
    background: "#ffffff", lineColor: "#000000",
  });
  const modules = parseFloat(svgEl.getAttribute("width") || "0");
  const units = parseFloat(svgEl.getAttribute("height") || "10");
  svgEl.setAttribute("viewBox", `0 0 ${modules} ${units}`);
  svgEl.setAttribute("preserveAspectRatio", "none");
  svgEl.setAttribute("shape-rendering", "crispEdges");
  svgEl.removeAttribute("width");
  svgEl.removeAttribute("height");
  svgEl.setAttribute("style", `width:${modules * moduleDots * DOT_MM}mm;height:${heightMm}mm;display:block;margin:0 auto;`);
  return new XMLSerializer().serializeToString(svgEl);
};

// QR электронной копии чека: {receipt_public_url из настроек}/receipt/{uuid}.
// В шаблоне чека (и в серверном thermal_receipt.blade.php) стоит только
// метка с адресом, а сам QR подставляет injectReceiptQr перед печатью —
// через buildQrSvg, с модулем ровно в точки термоголовки.
const receiptQrPlaceholder = (order: any, settings: any): string => {
  const base = String(settings?.receipt_public_url || "").trim().replace(/\/+$/, "");
  if (!base || !/^https?:\/\//i.test(base) || !order?.uuid) return "";
  return `<div class="receipt-qr" data-url="${escapeHtml(`${base}/receipt/${order.uuid}`)}"></div>`;
};

const injectReceiptQr = async (html: string): Promise<string> => {
  const match = /<div class="receipt-qr" data-url="([^"]+)"><\/div>/.exec(html);
  if (!match) return html;
  const url = match[1].replace(/&amp;/g, "&");
  // 5 точек на модуль: ссылка ~70 символов даёт QR около 27мм — читается
  // камерой телефона и не растягивает ленту
  const svg = await buildQrSvg(url, 5);
  return html.replace(
    match[0],
    `<div style="margin-top: 4mm;">${svg}<div class="center" style="font-size: 12px; margin-top: 1.5mm;"><b>Электронная копия чека</b><br>наведите камеру телефона на QR</div></div>`,
  );
};

// В браузере (окно печати Chrome/WebView) высоту листа тоже подгоняем под
// чек: без @page size Chrome берёт A4 и ужимает ленту под «размер страницы».
const fitRollPageSize = (doc: Document) => {
  const meta = doc.querySelector('meta[name="print-roll-width-mm"]');
  if (!meta) return;
  const widthMm = Number(meta.getAttribute("content")) || 80;
  const heightPx = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight || 0);
  const heightMm = Math.ceil((heightPx * 25.4) / 96) + 2;
  const style = doc.createElement("style");
  style.textContent = `@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }`;
  doc.head.appendChild(style);
};

// Высота чека в мм при заданной ширине листа — для старых exe без канала
// print-receipt: их print-html без pageSize печатал на листе драйвера по
// умолчанию, и низ чека (ИТОГО, оплата) обрезался.
const measureRollHeightMm = (html: string, widthMm = 80): Promise<number> =>
  new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${widthMm}mm;height:10px;border:0;visibility:hidden;`;
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) {
      frame.remove();
      resolve(0);
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
      const heightPx = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight || 0);
      frame.remove();
      resolve(Math.ceil((heightPx * 25.4) / 96) + 2);
    }, 300);
  });

type ReceiptPrintMode = "driver" | "raster";
type ReceiptPrintDensity = "light" | "normal" | "dark";
interface ReceiptPrintConfig {
  mode: ReceiptPrintMode;
  density: ReceiptPrintDensity;
  cut?: boolean;
}
interface ReceiptPrintResult {
  ok: boolean;
  mode?: ReceiptPrintMode;
  fallback?: boolean;
  fallbackReason?: string;
  code?: string;
  error?: string;
}

// Режим печати чеков хранится в main-процессе (SQLite терминала), здесь —
// только зеркало для UI настроек. receiptModeSupported = false, если
// установлен старый exe без канала print-receipt (фронт обновляется с сайта
// независимо от exe) — тогда печать идёт по-старому через printHTML.
const receiptPrintConfig = ref<ReceiptPrintConfig>({ mode: "driver", density: "normal" });
const receiptModeSupported = ref(false);

export const usePrinter = () => {
  const uiStore = useUiStore();
  const { settings, fetchPublicSettings } = useSettings();
  const thermalPrinter = useThermalPrinter();

  const initPrinter = async () => {
    if (typeof window !== "undefined" && window.electronAPI) {
      isConnected.value = true;
      await fetchPrinters();
      await loadReceiptPrintConfig();
    } else {
      console.warn("Electron API not found. Printing will use browser default.");
      isConnected.value = false;
    }
  };

  // Единая точка отправки готового HTML на печать: Electron (десктоп-касса) —
  // прямая печать без диалога; Android с настроенным Bluetooth/USB
  // термопринтером (см. useThermalPrinter) — печать растром через нативный
  // плагин; иначе — обычный window.print() в браузере/WebView.
  //
  // kind: "receipt" — чек на термоленту: в Electron идёт через канал
  // print-receipt (драйвер или растр ESC/POS, с ответом об ошибке).
  const printHtmlUniversal = async (
    html: string,
    opts: { printerName?: string; pageWidthMm?: number; pageHeightMm?: number; kind?: "receipt" } = {}
  ) => {
    if (typeof window === "undefined") return;
    if (isThermalPrinterSupported() && thermalPrinter.config.value) {
      await thermalPrinter.printHtml(html);
      return;
    }
    if (opts.kind === "receipt" && window.electronAPI?.printReceipt) {
      const res = await window.electronAPI.printReceipt({
        html,
        printerName: opts.printerName || activePrinter.value,
      });
      if (!res?.ok) throw new Error(res?.error || "Не удалось напечатать чек");
      if (res.fallback) {
        uiStore.addToast("Растровая печать не удалась — чек напечатан через драйвер. Подробности в журнале печати.", "warning", 6000);
      }
      return;
    }
    if (window.electronAPI) {
      let { pageWidthMm, pageHeightMm } = opts;
      if (opts.kind === "receipt" && !pageHeightMm) {
        // 72мм — ширина области печати: форматы драйвера XP-80C «80(72.1) x …»
        // шириной 72мм, лист 80мм обрезался справа (см. receiptPrinter.cjs)
        pageWidthMm = 72;
        pageHeightMm = (await measureRollHeightMm(html, pageWidthMm)) || undefined;
      }
      window.electronAPI.printHTML({
        html,
        printerName: opts.printerName || activePrinter.value,
        pageWidthMm,
        pageHeightMm,
      });
      return;
    }
    printViaBrowser(html);
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

  const loadReceiptPrintConfig = async () => {
    if (typeof window === "undefined" || !window.electronAPI?.getReceiptPrintConfig) return;
    try {
      receiptPrintConfig.value = { ...receiptPrintConfig.value, ...(await window.electronAPI.getReceiptPrintConfig()) };
      receiptModeSupported.value = true;
    } catch (e) {
      console.warn("Receipt print config unavailable:", e);
    }
  };

  const setReceiptPrintConfig = async (patch: Partial<ReceiptPrintConfig>) => {
    if (!window.electronAPI?.setReceiptPrintConfig) return;
    try {
      receiptPrintConfig.value = await window.electronAPI.setReceiptPrintConfig(patch);
    } catch (e: any) {
      uiStore.addToast("Не удалось сохранить настройку печати: " + e.message, "error");
    }
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
        <td style="padding: 10px 8px; text-align: right; color: #64748b; font-size: 12px;">${formatRichNumber(item.price)}</td>
        <td style="padding: 10px 8px; text-align: right; font-weight: 600; color: #0f172a; font-size: 12px;">${formatRichNumber(item.price * item.quantity)}</td>
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
              <span>${formatRichNumber(subtotal)}</span>
            </div>
            ${discount > 0 ? `<div class="total-row" style="color: #ef4444;"><span>Скидка:</span><span>-${formatRichNumber(discount)}</span></div>` : ''}
            <div class="total-row grand-total">
              <span>ИТОГО:</span>
              <span>${formatRichNumber(total)} сом</span>
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

  // PHP number_format($x, 2, '.', ' ') — точка как разделитель дробной части,
  // пробел как разделитель тысяч (так же, как раньше форматировал dompdf-отчёт).
  const formatReportMoney = (n: unknown): string => {
    const num = Number(n) || 0;
    const [int, frac] = num.toFixed(2).split(".");
    return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}.${frac}`;
  };

  // Отчёт по остаткам товаров — рендерится и печатается прямо в браузере
  // (Ctrl+P → "Сохранить как PDF"), без похода на бэкенд: тот же dompdf на
  // 1000+ товарах упирался в memory_limit и падал (см. laravel.log). Вёрстка
  // намеренно повторяет старый resources/views/pdf/products.blade.php.
  const generateProductsReportHtml = (products: any[], reportSettings: any = {}) => {
    const rows = products
      .map((p, i) => {
        const purchase = Number(p.purchase_price || 0);
        const price = Number(p.price || 0);
        const salePrice = Number(p.sale_price || 0);
        const stock = Number(p.stock_quantity || 0);
        const inStock = stock > 0;
        return `
          <tr>
            <td class="text-center">${i + 1}</td>
            <td style="font-weight: bold;">${escapeHtml(p.name)}</td>
            <td style="white-space: nowrap;"><code>${escapeHtml(p.sku || "")}</code></td>
            <td>${escapeHtml(p.category?.name || "-")}</td>
            <td class="text-right">${formatReportMoney(purchase)} с</td>
            <td class="text-right">
              ${formatReportMoney(price)} с
              ${salePrice ? `<br><small style="color: #e74c3c;">Акция: ${formatReportMoney(salePrice)} с</small>` : ""}
            </td>
            <td class="text-center" style="font-weight: bold;">${stock}</td>
            <td class="text-center">
              ${inStock ? '<span class="badge badge-success">В наличии</span>' : '<span class="badge badge-danger">Нет</span>'}
            </td>
          </tr>
        `;
      })
      .join("");

    const totalPurchase = products.reduce((s, p) => s + Number(p.purchase_price || 0) * Number(p.stock_quantity || 0), 0);
    const totalSale = products.reduce((s, p) => s + Number(p.price || 0) * Number(p.stock_quantity || 0), 0);
    const totalStock = products.reduce((s, p) => s + Number(p.stock_quantity || 0), 0);

    const dateStr = new Date().toLocaleString("ru-RU", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
    const shopName = escapeHtml(reportSettings?.site_name || "Мой Магазин");

    return `
      <!DOCTYPE html>
      <html lang="ru">
      <head>
        <meta charset="utf-8">
        <meta name="color-scheme" content="light only">
        <title>Отчет по остаткам товаров</title>
        <style>
          /* Без этого Chrome может применить авто-тёмную тему к голому HTML
             без своих стилей (в отличие от dompdf, который её не знает) —
             и отчёт напечатается/сохранится с перевёрнутыми цветами. */
          :root { color-scheme: light only; }
          @page { size: A4; margin: 1cm; }
          * { box-sizing: border-box; }
          html, body { background: #fff; }
          body { font-family: Arial, 'Helvetica Neue', sans-serif; font-size: 10px; color: #333; margin: 0; }
          .report-header { border-bottom: 2px solid #3498db; padding-bottom: 10px; margin-bottom: 20px; overflow: hidden; }
          .report-title { font-size: 18px; font-weight: bold; color: #2c3e50; }
          .report-meta { float: right; text-align: right; color: #7f8c8d; }
          table.products-table { width: 100%; border-collapse: collapse; }
          table.products-table th {
            background: #2c3e50; color: #fff; padding: 8px 4px; text-align: left; border: 1px solid #34495e;
          }
          table.products-table td { padding: 6px 4px; border: 1px solid #ecf0f1; }
          table.products-table tr:nth-child(even) { background: #f9f9f9; }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; }
          .badge { padding: 2px 5px; border-radius: 3px; font-size: 8px; text-transform: uppercase; font-weight: bold; }
          .badge-success { background: #27ae60; color: #fff; }
          .badge-danger { background: #e74c3c; color: #fff; }
          .summary { margin-top: 20px; font-size: 11px; font-weight: bold; text-align: right; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
        </style>
      </head>
      <body>
        <div class="report-header">
          <div class="report-meta">
            Дата отчета: ${dateStr}<br>
            Всего позиций: ${products.length}
          </div>
          <div class="report-title">ОТЧЕТ ПО СКЛАДСКИМ ОСТАТКАМ</div>
        </div>

        <table class="products-table">
          <thead>
            <tr>
              <th width="30">ID</th>
              <th>Наименование товара</th>
              <th style="white-space: nowrap;" width="1%">Артикул</th>
              <th width="100">Категория</th>
              <th class="text-right">Закуп</th>
              <th class="text-right">Продажа</th>
              <th class="text-right">Остаток</th>
              <th class="text-center">Статус</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr>
              <td colspan="4" class="text-right" style="font-weight: bold;">Итого:</td>
              <td class="text-right" style="font-weight: bold;">${formatReportMoney(totalPurchase)} с</td>
              <td class="text-right" style="font-weight: bold;">${formatReportMoney(totalSale)} с</td>
              <td class="text-center" style="font-weight: bold;">${totalStock}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>

        <div class="summary">
          Общая стоимость закупа: ${formatReportMoney(totalPurchase)} с
          <br>
          Ожидаемая выручка: ${formatReportMoney(totalSale)} с
        </div>

        <div style="margin-top: 50px; font-size: 8px; color: #bdc3c7; text-align: center;">
          Документ сформирован автоматически в системе учета "${shopName}"
        </div>
      </body>
      </html>
    `;
  };

  // Отчёт по товарам — сразу PDF-файлом (pdfmake), без диалога печати: в
  // «Сохранить как PDF» браузер дописывал на каждую страницу дату, заголовок
  // и адрес сайта, а <tfoot> с «Итого» повторялся внизу каждой страницы.
  // Данные уже загружены на странице (с учётом фильтров), бэкенд не нужен.
  // Закупочная цена в отчёт не выводится.
  const downloadProductsReportPdf = async (products: any[]) => {
    // Динамический импорт: ~2 МБ библиотеки и шрифтов грузятся только по клику
    const [pdfMakeModule, fontsModule]: any[] = await Promise.all([
      import("pdfmake/build/pdfmake"),
      import("pdfmake/build/vfs_fonts"),
    ]);
    const pdfMake = pdfMakeModule.default || pdfMakeModule;
    const fonts = fontsModule.default || fontsModule;
    // vfs_fonts 0.2.x экспортирует сам vfs, старые сборки — { pdfMake: { vfs } }
    pdfMake.vfs = fonts.pdfMake?.vfs || fonts.vfs || fonts;

    const totalSale = products.reduce((s, p) => s + Number(p.price || 0) * Number(p.stock_quantity || 0), 0);
    const totalStock = products.reduce((s, p) => s + Number(p.stock_quantity || 0), 0);
    const now = new Date();
    const dateStr = now.toLocaleString("ru-RU", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
    const shopName = settings.value?.site_name || "Мой Магазин";

    const head = (text: string, alignment = "left") => ({ text, style: "th", alignment });
    const body: any[] = [[
      head("№", "center"), head("Наименование товара"), head("Артикул"),
      head("Категория"), head("Цена", "right"), head("Остаток", "center"), head("Статус", "center"),
    ]];

    products.forEach((p, i) => {
      const price = Number(p.price || 0);
      const salePrice = Number(p.sale_price || 0);
      const stock = Number(p.stock_quantity || 0);
      body.push([
        { text: String(i + 1), alignment: "center" },
        { text: p.name || "", bold: true },
        { text: p.sku || "", noWrap: true },
        p.category?.name || "-",
        {
          alignment: "right",
          stack: [
            `${formatReportMoney(price)} с`,
            ...(salePrice ? [{ text: `Акция: ${formatReportMoney(salePrice)} с`, color: "#e74c3c", fontSize: 7 }] : []),
          ],
        },
        { text: String(stock), alignment: "center", bold: true },
        stock > 0
          ? { text: "В наличии", alignment: "center", color: "#27ae60", bold: true, fontSize: 7 }
          : { text: "Нет", alignment: "center", color: "#e74c3c", bold: true, fontSize: 7 },
      ]);
    });

    // «Итого» — обычная последняя строка таблицы: печатается один раз в конце
    body.push([
      { text: "Итого:", colSpan: 4, alignment: "right", bold: true }, {}, {}, {},
      { text: `${formatReportMoney(totalSale)} с`, alignment: "right", bold: true },
      { text: String(totalStock), alignment: "center", bold: true },
      "",
    ]);

    const docDefinition = {
      pageSize: "A4",
      // Поля по краям: ~2 см слева/справа, 1,5 см сверху/снизу
      pageMargins: [56, 42, 56, 42],
      info: { title: "Отчёт по складским остаткам" },
      defaultStyle: { font: "Roboto", fontSize: 8, color: "#333333" },
      styles: {
        title: { fontSize: 15, bold: true, color: "#2c3e50" },
        meta: { fontSize: 8, color: "#7f8c8d", alignment: "right" },
        th: { bold: true, color: "#ffffff", fillColor: "#2c3e50" },
      },
      content: [
        {
          columns: [
            { text: "ОТЧЁТ ПО СКЛАДСКИМ ОСТАТКАМ", style: "title", width: "*" },
            { text: `Дата отчёта: ${dateStr}\nВсего позиций: ${products.length}`, style: "meta", width: "auto" },
          ],
        },
        {
          canvas: [{ type: "line", x1: 0, y1: 4, x2: 483, y2: 4, lineWidth: 1.5, lineColor: "#3498db" }],
          margin: [0, 0, 0, 12],
        },
        {
          table: {
            headerRows: 1,
            dontBreakRows: true,
            widths: [22, "*", "auto", 70, 62, 38, 44],
            body,
          },
          layout: {
            hLineColor: () => "#dfe4e8",
            vLineColor: () => "#dfe4e8",
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            fillColor: (row: number) => (row > 0 && row % 2 === 0 ? "#f7f9fa" : null),
            paddingTop: () => 3,
            paddingBottom: () => 3,
          },
        },
        {
          text: `Ожидаемая выручка: ${formatReportMoney(totalSale)} с`,
          alignment: "right", bold: true, fontSize: 10, margin: [0, 12, 0, 0],
        },
        {
          text: `Документ сформирован автоматически в системе учёта «${shopName}»`,
          alignment: "center", fontSize: 7, color: "#bdc3c7", margin: [0, 30, 0, 0],
        },
      ],
      // Свой нумератор страниц вместо браузерных колонтитулов
      footer: (page: number, pages: number) => ({
        text: `${page} / ${pages}`, alignment: "center", fontSize: 7, color: "#95a5a6", margin: [0, 12, 0, 0],
      }),
    };

    const stamp = now.toISOString().slice(0, 10);
    await new Promise<void>((resolve) => {
      pdfMake.createPdf(docDefinition).download(`Остатки_товаров_${stamp}.pdf`, () => resolve());
    });
  };

  const generateReceiptHtml = (order: any, settings: any = {}) => {
    const itemsHtml = order.items.map((item: any) => {
      const itemUnit = item.is_package
        ? (item.product?.package_unit || item.product?.unit || item.unit || "шт")
        : (item.product?.unit || item.unit || "шт");
      return `
      <tr>
        <td class="item-name">${escapeHtml(item.product_name || item.name)}</td>
        <td class="num" style="text-align: center;">${parseFloat(item.quantity) || 0}</td>
        <td class="num" style="padding-left: 2mm; width: 1%;">${escapeHtml(itemUnit)}</td>
        <td class="num" style="text-align: right; padding-left: 1.5mm;">${Math.round(item.price)}</td>
        <td class="num sum">${Math.round(item.price * item.quantity)}</td>
      </tr>
    `;
    }).join('');

    const shopName = escapeHtml(settings.receipt_title || settings.site_name || 'МОЙ МАГАЗИН');
    // Дата заказа, а не печати: при повторной печати чек не «молодеет»
    const createdAt = order.created_at ? new Date(order.created_at) : new Date();
    const dateStr = (isNaN(createdAt.getTime()) ? new Date() : createdAt).toLocaleString('ru-RU');
    const orderNum = escapeHtml(order.order_number || 'OFF-LINE');

    // cash_received — наличная часть без сдачи, transfer_received — QR/безнал,
    // change_amount — сдача (хранится в заказе на сервере). «Наличные» в чеке — сколько покупатель
    // внёс: часть оплаты + сдача. Нет полей оплаты — вся сумма наличными.
    const total = Number(order.total || order.total_amount || 0);
    const hasPayment = order.cash_received !== undefined || order.transfer_received !== undefined;
    const cashless = Number(order.transfer_received || 0);
    const change = Number(order.change_amount || 0);
    const cash = (hasPayment ? Number(order.cash_received || 0) : total) + change;

    // Онлайн-заказ печатается тем же чеком, что и касса, но вместо
    // «наличные/сдача» (их у заказа с сайта нет) — кому и куда отдать и как
    // он платит: этот чек кладут в пакет при сборке и выдаче
    const isOnline = order.channel === 'online';
    const addr = order.shipping_address || order.shippingAddress || null;
    const customerName = [addr?.first_name, addr?.last_name].filter(Boolean).join(' ') || order.user?.name || '';
    // Номер в адресе бывает без кода страны («555123456») — дописываем +996
    const rawPhone = String(addr?.phone || order.user?.phone || '').trim();
    const customerPhone = /^\d{9}$/.test(rawPhone) ? `+996 ${rawPhone}` : rawPhone;
    const address = [addr?.address_line_1, addr?.address_line_2, addr?.city].filter(Boolean).join(', ');
    const shipping = Number(order.shipping_cost || 0);
    const paymentLabels: Record<string, string> = {
      cash: 'При получении',
      mbank: 'QR (MBank)',
      qr: 'QR (MBank)',
      transfer: 'Перевод',
      card: 'Картой',
    };
    const paymentText = paymentLabels[order.payment_method] || order.payment_method || 'Не указан';
    const paidText = order.payment_status === 'paid' ? 'Оплачен' : 'Не оплачен';
    const infoRow = (label: string, value: string) =>
      value ? `<div class="info-row"><span>${label}</span><span>${escapeHtml(value)}</span></div>` : '';

    const customerHtml = isOnline && (customerName || customerPhone || address)
      ? `${infoRow('Покупатель', customerName)}${infoRow('Телефон', customerPhone)}${infoRow('Адрес', address)}<div class="divider"></div>`
      : '';
    // Самообслуживание принимает только QR (GoPay): полей наличных у заказа нет,
    // и без этой ветки вся сумма печаталась как «Наличные» со сдачей 0
    const isSelfService = order.channel === 'self_service';
    const paymentHtml = isOnline
      ? `${infoRow('Оплата', paymentText)}${infoRow('Статус', paidText)}`
      : isSelfService
      ? `<div class="pay-row"><span>Безналичные (QR)</span><span>${formatReceiptMoney(total)}</span></div>`
      : `<div class="pay-row"><span>Наличные</span><span>${formatReceiptMoney(cash)}</span></div>
        <div class="pay-row"><span>Безналичные</span><span>${formatReceiptMoney(cashless)}</span></div>
        <div class="pay-row"><span>Сдача</span><span>${formatReceiptMoney(change)}</span></div>`;
    const notesHtml = isOnline && order.notes
      ? `<div class="divider"></div><div class="note">Комментарий: ${escapeHtml(order.notes)}</div>`
      : '';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="print-roll-width-mm" content="80">
        <style>${RECEIPT_BASE_CSS}
          .divider { border-top: 1px dashed #000; margin: 2mm 0; }
          th { text-align: left; border-bottom: 1px solid #000; font-size: 11px; font-weight: 700; padding-bottom: 0.5mm; }
          td { padding: 1mm 0; vertical-align: top; }
          .item-name { font-size: 13px; font-weight: 400; overflow-wrap: anywhere; padding-right: 1mm; }
          .num { font-size: 13px; white-space: nowrap; }
          .sum { text-align: right; font-weight: 700; padding-left: 1.5mm; }
          .total-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 26px; font-weight: 700; line-height: 1.2; margin-bottom: 1mm; }
          .pay-row { display: flex; justify-content: space-between; font-size: 13px; }
          .info-row { display: flex; justify-content: space-between; gap: 2mm; font-size: 13px; }
          .info-row span:last-child { text-align: right; overflow-wrap: anywhere; font-weight: 700; }
          .note { font-size: 12px; overflow-wrap: anywhere; }
        </style>
      </head>
      <body>
        <div class="center">
          <div style="font-size: 20px; font-weight: 700; line-height: 1.15;">${shopName}</div>
          <div style="font-size: 12px; margin-top: 1mm;">${dateStr}</div>
          <div style="font-size: 13px; font-weight: 700;">ЧЕК №: ${orderNum}</div>
        </div>
        <div class="divider"></div>
        ${customerHtml}
        <table>
          <thead>
            <tr><th>Товар</th><th>Кол</th><th style="white-space: nowrap; width: 1%; padding-left: 2mm;">Ед.</th><th style="text-align: right; padding-left: 1.5mm;">Цена</th><th style="text-align: right; padding-left: 1.5mm;">Сумма</th></tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <div class="divider"></div>
        ${order.discount > 0 ? `<div class="pay-row"><span>Скидка</span><span>-${formatReceiptMoney(order.discount)}</span></div>` : ''}
        ${isOnline && shipping > 0 ? `<div class="pay-row"><span>Доставка</span><span>${formatReceiptMoney(shipping)}</span></div>` : ''}
        <div class="total-row">
          <span>ИТОГО:</span>
          <span>${formatReceiptMoney(total)}</span>
        </div>
        ${paymentHtml}
        ${notesHtml}
        <div class="divider"></div>
        <div class="center" style="font-size: 12px; margin-top: 4mm;">
          СПАСИБО ЗА ПОКУПКУ!<br>Товар обмену и возврату подлежит<br>в течение 14 дней при наличии чека
        </div>
        <div style="margin-top: 4mm; border-bottom: 2px solid #000;"></div>
        ${receiptQrPlaceholder(order, settings)}
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
  // override — для весового товара: явный динамический код (не sku) и вес,
  // от которого пересчитывается итоговая цена этикетки.
  const generateBarcodeLabelBody = (
    product: any,
    tpl: typeof DEFAULT_BARCODE_TEMPLATE,
    settings: any = {},
    override: { barcodeValue?: string; weightKg?: number } = {}
  ) => {
    const name = escapeHtml(product?.name || "Товар");
    const barcodeValue = override.barcodeValue || product?.sku || "";
    const code = escapeHtml(barcodeValue);
    const currency = escapeHtml(settings?.currency_symbol !== undefined ? settings.currency_symbol : "сом");

    const regularPrice = Number(product?.price || 0);
    const salePrice = Number(product?.sale_price || 0);
    const unitPrice = salePrice > 0 && salePrice < regularPrice ? salePrice : regularPrice;
    const weightKg = override.weightKg || 0;
    const price = weightKg ? Math.round(weightKg * unitPrice * 100) / 100 : unitPrice;
    const barcodeSvg = makeBarcodeSvg(barcodeValue, 22);
    const weightLine = weightKg
      ? `<div class="lbl-weight">${formatRichNumber(weightKg)} ${escapeHtml(product?.unit || "кг")} × ${formatRichNumber(unitPrice)} ${currency}</div>`
      : "";

    return `
      <div class="lbl-page">
        <div class="lbl-name">${name}</div>
        ${weightLine}
        <div class="lbl-barcode">${barcodeSvg}</div>
        <div class="lbl-bottom">
          <span class="lbl-sku">${code}</span>
          <span class="lbl-price">${weightKg ? price.toFixed(2) : formatRichNumber(price)} ${currency}</span>
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
        .lbl-weight { font-size: 8px; font-weight: 600; margin: 0.5mm 0; }
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
    template: typeof DEFAULT_BARCODE_TEMPLATE | null = null,
    override: { barcodeValue?: string; weightKg?: number } = {}
  ) => {
    if (!template) {
      const richTpl = parseRichTemplate(settings.value?.label_active_template_barcode);
      if (richTpl) {
        return buildRichLabelHtml(richTpl, [{ product, qty, override }], settings.value).html;
      }
    }
    const tpl = template ? { ...DEFAULT_BARCODE_TEMPLATE, ...template } : parseTemplate(settings.value?.label_template_barcode, DEFAULT_BARCODE_TEMPLATE);
    const body = generateBarcodeLabelBody(product, tpl, settings.value, override);
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

      await printHtmlUniversal(htmlContent, { printerName, pageWidthMm, pageHeightMm });
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
      fitRollPageSize(doc);
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

      // Термочек по номеру заказа (заказы с сайта, история продаж) печатаем
      // тем же шаблоном, что и касса: берём заказ с сервера и рисуем чек
      // здесь. Серверный «ТОВАРНЫЙ ЧЕК» с узкими колонками рвал названия
      // товаров — он остаётся только запасным вариантом, если заказ не загрузился
      if (type === "thermal" && orderData !== null && typeof orderData !== "object") {
        try {
          const order: any = await useApi().apiFetch(`/orders/${orderData}`, { noCache: true });
          if (order && Array.isArray(order.items)) {
            orderData = order;
          }
        } catch (loadError) {
          console.warn("Order load for receipt failed, using server receipt:", loadError);
        }
      }

      // Если передали объект (офлайн/быстрый режим)
      if (typeof orderData === 'object' && orderData !== null) {
        // Не все страницы кассы грузят настройки магазина — без этого чек
        // печатался по суточному кэшу (старый заголовок, без адреса для QR)
        if (settings.value?.receipt_public_url === undefined) {
          await fetchPublicSettings({ fresh: true });
        }
        htmlContent = generateReceiptHtml(orderData, settings.value || {});
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

      // Накладная A4 — обычный документ, термочек — через канал чеков
      // (локальный чек из объекта заказа — всегда термочек)
      const isRollReceipt = typeof orderData === "object" || type === "thermal";
      if (isRollReceipt) {
        try {
          htmlContent = await injectReceiptQr(htmlContent);
        } catch (qrError) {
          // Без QR чек всё равно должен напечататься
          console.warn("Receipt QR skipped:", qrError);
        }
      }
      await printHtmlUniversal(htmlContent, isRollReceipt ? { kind: "receipt" } : {});
    } catch (e: any) {
      console.error("Printing failing:", e);
      uiStore.addToast("Ошибка печати: " + e.message, "error", 6000);
    }
  };

  // Единая точка печати этикетки/ценника. Количество копий имеет смысл
  // только при печати из Electron (прямая печать без диалога) — в браузере
  // window.print() всё равно даёт напечатать только один документ за раз.
  const printLabel = async (
    product: any,
    opts: {
      type?: "price_tag" | "barcode";
      qty?: number;
      printerName?: string;
      override?: { barcodeValue?: string; weightKg?: number };
    } = {}
  ) => {
    const { type = "price_tag", qty = 1, printerName, override } = opts;
    try {
      const htmlContent =
        type === "barcode"
          ? generateBarcodeLabelHtml(product, qty, null, override)
          : generatePriceTagHtml(product, settings.value, qty);

      const richKey = type === "barcode" ? "label_active_template_barcode" : "label_active_template_price_tag";
      const richTpl = parseRichTemplate(settings.value?.[richKey]);
      const tplForSize = richTpl
        ? { width_mm: richTpl.width, height_mm: richTpl.height }
        : type === "barcode"
          ? parseTemplate(settings.value?.label_template_barcode, DEFAULT_BARCODE_TEMPLATE)
          : parseTemplate(settings.value?.label_template_price_tag, DEFAULT_PRICE_TAG_TEMPLATE);

      await printHtmlUniversal(htmlContent, {
        printerName,
        pageWidthMm: tplForSize.width_mm,
        pageHeightMm: tplForSize.height_mm,
      });
    } catch (e: any) {
      console.error("Printing failing:", e);
      uiStore.addToast("Ошибка печати этикетки: " + e.message, "error");
    }
  };

  // Тестовый чек для сравнения качества «до/после» и между режимами:
  // настоящий шаблон чека с демо-товарами + диагностические блоки (шкала
  // размеров/жирности, кириллица с ң/ө/ү, QR и штрихкод с целым модулем,
  // 1-бит логотип, линейка ширины 72мм и линии толщиной 1–4 точки).
  const generateTestReceiptHtml = async () => {
    const demoOrder = {
      order_number: "TEST-0001",
      total: 1785,
      discount: 15,
      items: [
        { product_name: "Нан тандыр (күнүмдүк)", quantity: 2, price: 35, unit: "шт" },
        { product_name: "Сүт 3,2% 1 л", quantity: 1, price: 95, unit: "шт" },
        { product_name: "Өрүк кургатылган, сорттолгон, 1-сорт, Баткен", quantity: 0.75, price: 680, unit: "кг" },
        { product_name: "Шоколад молочный «Алёнка» 100 г", quantity: 3, price: 120, unit: "шт" },
        { product_name: "Ңңөүү ӨҮҢ тест узкой колонки", quantity: 12, price: 25, unit: "уп" },
      ],
    };
    const base = generateReceiptHtml(demoOrder, settings.value || {});

    const sizes = [10, 11, 12, 13, 14, 16, 20, 24];
    const sizeRows = sizes
      .map((s) => `<div style="font-size:${s}px;line-height:1.25;white-space:nowrap;overflow:hidden;">${s}px Текст <b>Жирный</b> ңөү</div>`)
      .join("");

    // Линейка: 1 штрих = 1мм (8 точек), длинные — каждые 5 и 10мм
    let ticks = "";
    for (let mm = 0; mm <= 72; mm++) {
      const h = mm % 10 === 0 ? 40 : mm % 5 === 0 ? 26 : 14;
      const x = Math.min(mm * 8, 574);
      ticks += `<rect x="${x}" y="0" width="2" height="${h}"/>`;
    }
    const ruler = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 48" style="width:72mm;height:6mm;display:block;" shape-rendering="crispEdges">
        <g fill="#000">${ticks}<rect x="0" y="44" width="576" height="4"/></g>
      </svg>
      <div style="display:flex;justify-content:space-between;font-size:11px;">${[0, 10, 20, 30, 40, 50, 60, 70].map((n) => `<span>${n}</span>`).join("")}</div>`;

    const lineWeights = [1, 2, 3, 4]
      .map((d) => `<div style="display:flex;align-items:center;gap:2mm;font-size:11px;margin:1mm 0;"><span style="width:14mm;">${d} точ.</span><div style="flex:1;height:${d * DOT_MM}mm;background:#000;"></div></div>`)
      .join("");

    const logo = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 96" style="width:48mm;height:12mm;display:block;margin:0 auto;" shape-rendering="crispEdges">
        <rect width="384" height="96" fill="#000"/>
        <rect x="8" y="8" width="368" height="80" fill="#fff"/>
        <rect x="16" y="16" width="352" height="64" fill="#000"/>
        <text x="192" y="62" text-anchor="middle" font-family="Tahoma, Arial, sans-serif" font-weight="700" font-size="40" fill="#fff">KURULUSH</text>
      </svg>`;

    const qr = await buildQrSvg("https://kurulush.store/r/TEST-0001?s=1785");
    const barcode = buildBarcodeSvg("4607001234567");
    const modeLabel = receiptModeSupported.value
      ? receiptPrintConfig.value.mode === "raster" ? "растр ESC/POS" : "драйвер Windows"
      : window.electronAPI ? "драйвер (старая версия приложения)" : "окно печати браузера";

    const diagnostics = `
      <div style="margin-top:3mm;">
        <div class="center bold" style="font-size:16px;">ТЕСТ ПЕЧАТИ</div>
        <div class="center" style="font-size:12px;">Принтер: ${escapeHtml(activePrinter.value || "по умолчанию")}<br>Режим: ${modeLabel}<br>${new Date().toLocaleString("ru-RU")}</div>
        <div class="divider"></div>
        ${logo}
        <div class="divider"></div>
        <div class="bold" style="font-size:12px;">Размеры и жирность</div>
        ${sizeRows}
        <div class="divider"></div>
        <div class="bold" style="font-size:12px;">Кириллица</div>
        <div style="font-size:13px;">Кыргызча: Ң ң Ө ө Ү ү — Саламатсызбы! Рахмат, кайра келиңиз!</div>
        <div style="font-size:13px;">Съешь же ещё этих мягких французских булок, да выпей же чаю.</div>
        <div class="bold" style="font-size:13px;">АБВГДЕЁЖЗИЙКЛМНОПРСТУ<br>ФХЦЧШЩЪЫЬЭЮЯ 0123456789</div>
        <div class="divider"></div>
        <div class="bold" style="font-size:12px;">QR (модуль 6 точек) — должен сканироваться телефоном</div>
        <div style="margin:2mm 0;">${qr}</div>
        <div class="bold" style="font-size:12px;">Штрихкод CODE128 (модуль 3 точки)</div>
        <div style="margin:2mm 0 1mm;">${barcode}</div>
        <div class="center" style="font-size:13px;letter-spacing:1px;">4607001234567</div>
        <div class="divider"></div>
        <div class="bold" style="font-size:12px;">Толщина линий</div>
        ${lineWeights}
        <div class="divider"></div>
        <div class="bold" style="font-size:12px;">Линейка 72мм: штрихи 0 и 72 должны быть видны</div>
        ${ruler}
      </div>`;

    return base.replace("</body>", `${diagnostics}</body>`);
  };

  const testPrint = async () => {
    try {
      const testHtml = await generateTestReceiptHtml();
      await printHtmlUniversal(testHtml, { kind: "receipt" });
      uiStore.addToast("Тестовая страница отправлена", "success");
    } catch (e: any) {
      console.error("Test print failed:", e);
      uiStore.addToast("Ошибка печати: " + e.message, "error", 6000);
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
    receiptPrintConfig,
    receiptModeSupported,
    setReceiptPrintConfig,
    generateTestReceiptHtml,
    generateReceiptHtml,
    generateInvoiceHtml,
    generatePriceTagHtml,
    generateBarcodeLabelHtml,
    makeBarcodeSvg,
    generateProductsReportHtml,
    downloadProductsReportPdf,
  };
};
