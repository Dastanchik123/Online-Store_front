// Дефолтный формат этикетки + привязка форматов/ширины ленты к принтерам —
// локальная настройка терминала (Electron: SQLite settings через IPC;
// браузер/self-service без Electron: localStorage — тот же паттерн, что
// setPrinter()/activePrinter в usePrinter.ts).
export interface LabelPrinterConfigEntry {
  templateId?: string;
  ribbonWidthMm?: number;
}
export type LabelPrinterConfig = Record<string, LabelPrinterConfigEntry>;

const DEFAULT_TEMPLATE_ID_KEY = "label_default_template_id";
const PRINTER_CONFIG_KEY = "label_printer_config";

const isElectron = () => typeof window !== "undefined" && !!window.electronAPI;

// Сериализует все read-modify-write обновления printer-config в одной цепочке —
// без этого параллельные setPrinterTemplateId()/setPrinterRibbonWidth() для
// одного принтера (например, пользователь быстро таб-нул из селекта формата
// в поле ширины ленты) читают конфиг до того, как успеет записаться соседнее
// поле, и один вызов затирает изменение другого.
let printerConfigWriteQueue: Promise<unknown> = Promise.resolve();

export const useLabelTemplateDefaults = () => {
  const getDefaultTemplateId = async (): Promise<string> => {
    if (isElectron()) return (await window.electronAPI!.getLabelDefaultTemplateId?.()) || "";
    if (typeof window === "undefined") return "";
    return localStorage.getItem(DEFAULT_TEMPLATE_ID_KEY) || "";
  };

  const setDefaultTemplateId = async (id: string): Promise<void> => {
    if (isElectron()) {
      await window.electronAPI!.setLabelDefaultTemplateId?.(id);
      return;
    }
    if (typeof window !== "undefined") localStorage.setItem(DEFAULT_TEMPLATE_ID_KEY, id);
  };

  const getPrinterConfig = async (): Promise<LabelPrinterConfig> => {
    if (isElectron()) return (await window.electronAPI!.getLabelPrinterConfig?.()) || {};
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem(PRINTER_CONFIG_KEY) || "{}");
    } catch (e) {
      return {};
    }
  };

  const setPrinterConfig = async (config: LabelPrinterConfig): Promise<void> => {
    if (isElectron()) {
      await window.electronAPI!.setLabelPrinterConfig?.(config);
      return;
    }
    if (typeof window !== "undefined") localStorage.setItem(PRINTER_CONFIG_KEY, JSON.stringify(config));
  };

  const mutatePrinterConfig = (printerName: string, patch: Partial<LabelPrinterConfigEntry>): Promise<void> => {
    printerConfigWriteQueue = printerConfigWriteQueue.then(async () => {
      const config = await getPrinterConfig();
      config[printerName] = { ...config[printerName], ...patch };
      await setPrinterConfig(config);
    });
    return printerConfigWriteQueue as Promise<void>;
  };

  const setPrinterTemplateId = (printerName: string, templateId: string): Promise<void> => {
    if (!printerName) return Promise.resolve();
    return mutatePrinterConfig(printerName, { templateId });
  };

  const setPrinterRibbonWidth = (printerName: string, ribbonWidthMm: number | null): Promise<void> => {
    if (!printerName) return Promise.resolve();
    return mutatePrinterConfig(printerName, { ribbonWidthMm: ribbonWidthMm || undefined });
  };

  const getRibbonWidthMm = async (printerName: string): Promise<number | null> => {
    if (!printerName) return null;
    const config = await getPrinterConfig();
    return config[printerName]?.ribbonWidthMm || null;
  };

  // Приоритет: формат, привязанный к конкретному принтеру → общий дефолт по
  // терминалу. Если ни один не задан/не существует больше в списке — пусто,
  // вызывающая сторона сама падает на свою текущую ролевую эвристику.
  const resolveDefaultTemplateId = async (
    printerName: string,
    availableTemplates: Array<{ id: string }>,
  ): Promise<string> => {
    const exists = (id: string | undefined) => !!id && availableTemplates.some((t) => t.id === id);

    const config = await getPrinterConfig();
    const perPrinter = printerName ? config[printerName]?.templateId : undefined;
    if (exists(perPrinter)) return perPrinter as string;

    const global = await getDefaultTemplateId();
    if (exists(global)) return global;

    return "";
  };

  return {
    getDefaultTemplateId,
    setDefaultTemplateId,
    getPrinterConfig,
    setPrinterConfig,
    setPrinterTemplateId,
    setPrinterRibbonWidth,
    getRibbonWidthMm,
    resolveDefaultTemplateId,
  };
};
