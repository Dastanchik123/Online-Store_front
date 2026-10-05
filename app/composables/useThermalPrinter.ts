import { Capacitor, registerPlugin } from "@capacitor/core";

export interface ThermalBtDevice {
  name: string;
  address: string;
}

export interface ThermalUsbDevice {
  name: string;
  deviceId: number;
  vendorId: number;
  productId: number;
  isPrinterClass: boolean;
}

interface ThermalPrinterPluginIface {
  listDevices(): Promise<{ bluetooth: ThermalBtDevice[]; usb: ThermalUsbDevice[] }>;
  requestBluetoothPermission(): Promise<{ granted: boolean }>;
  connect(opts: { type: "bluetooth"; address: string } | { type: "usb"; deviceId: number }): Promise<{ connected: boolean; name: string }>;
  disconnect(): Promise<void>;
  getStatus(): Promise<{ connected: boolean; type?: string; name?: string }>;
  printImage(opts: { base64: string }): Promise<void>;
  printText(opts: { text: string }): Promise<void>;
}

// Нативный плагин зарегистрирован в android/app/.../ThermalPrinterPlugin.java —
// registerPlugin() тут просто создаёт JS-обвязку, на web-платформе (браузер,
// тот же build обслуживает и обычный сайт) вызовы методов никогда не
// произойдут, т.к. все места использования проверяют isThermalPrinterSupported().
const ThermalPrinterNative = registerPlugin<ThermalPrinterPluginIface>("ThermalPrinter");

const STORAGE_KEY = "thermal_printer_config";

export interface ThermalPrinterConfig {
  type: "bluetooth" | "usb";
  name: string;
  address?: string;
  deviceId?: number;
  widthDots: number; // 384 ~ 58мм, 576 ~ 80мм при 8 точек/мм
}

const config = ref<ThermalPrinterConfig | null>(null);
const status = ref<{ connected: boolean; type?: string; name?: string }>({ connected: false });
const bluetoothDevices = ref<ThermalBtDevice[]>([]);
const usbDevices = ref<ThermalUsbDevice[]>([]);
const scanning = ref(false);

if (typeof window !== "undefined") {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) config.value = JSON.parse(raw);
  } catch (e) {
    /* битый JSON в localStorage — просто игнорируем, принтер не настроен */
  }
}

const persist = () => {
  if (typeof window === "undefined") return;
  if (config.value) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config.value));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
};

export const isThermalPrinterSupported = () => Capacitor.isNativePlatform();

export const useThermalPrinter = () => {
  const scanDevices = async () => {
    if (!isThermalPrinterSupported()) return;
    scanning.value = true;
    try {
      await ThermalPrinterNative.requestBluetoothPermission();
      const result = await ThermalPrinterNative.listDevices();
      bluetoothDevices.value = result.bluetooth;
      usbDevices.value = result.usb;
    } catch (e) {
      // Сканирование — не критичная операция (нет разрешения, Bluetooth
      // выключен и т.п.): просто оставляем списки как есть, ошибку покажет
      // вызывающий код через uiStore при необходимости.
      console.warn("ThermalPrinter scanDevices failed:", e);
      throw e;
    } finally {
      scanning.value = false;
    }
  };

  const selectBluetoothDevice = async (device: ThermalBtDevice, widthDots = 384) => {
    const res = await ThermalPrinterNative.connect({ type: "bluetooth", address: device.address });
    config.value = { type: "bluetooth", address: device.address, name: res.name || device.name, widthDots };
    persist();
    status.value = { connected: true, type: "bluetooth", name: config.value.name };
  };

  const selectUsbDevice = async (device: ThermalUsbDevice, widthDots = 384) => {
    const res = await ThermalPrinterNative.connect({ type: "usb", deviceId: device.deviceId });
    config.value = { type: "usb", deviceId: device.deviceId, name: res.name || device.name, widthDots };
    persist();
    status.value = { connected: true, type: "usb", name: config.value.name };
  };

  const forget = async () => {
    try {
      await ThermalPrinterNative.disconnect();
    } catch (e) {
      /* принтер мог быть уже отключен физически — не мешаем сбросу настроек */
    }
    config.value = null;
    persist();
    status.value = { connected: false };
  };

  const ensureConnected = async () => {
    if (!config.value) throw new Error("Термопринтер не настроен");
    const st = await ThermalPrinterNative.getStatus();
    if (st.connected) {
      status.value = st;
      return;
    }
    const res =
      config.value.type === "bluetooth"
        ? await ThermalPrinterNative.connect({ type: "bluetooth", address: config.value.address! })
        : await ThermalPrinterNative.connect({ type: "usb", deviceId: config.value.deviceId! });
    status.value = { connected: true, type: config.value.type, name: res.name };
  };

  // Печатаем не текстовыми ESC/POS-командами, а растром готовой HTML-вёрстки
  // чека/этикетки — так на термопринтере сохраняются реальные шрифты,
  // выравнивание и SVG-штрихкоды из usePrinter.ts, без дублирования разметки
  // на ESC/POS-языке.
  const rasterizeHtml = async (html: string, widthDots: number): Promise<string> => {
    const { default: html2canvas } = await import("html2canvas");
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.left = "-10000px";
    iframe.style.top = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);
    try {
      const doc = iframe.contentDocument;
      if (!doc) throw new Error("Не удалось подготовить документ для печати");
      doc.open();
      doc.write(html);
      doc.close();
      // Даём странице время отрисовать шрифты/SVG-штрихкоды перед захватом.
      await new Promise((resolve) => setTimeout(resolve, 200));
      const body = doc.body;
      const scrollWidth = body.scrollWidth || widthDots;
      const canvas = await html2canvas(body, {
        backgroundColor: "#ffffff",
        scale: widthDots / scrollWidth,
        useCORS: true,
      });
      return canvas.toDataURL("image/png").split(",")[1] || "";
    } finally {
      document.body.removeChild(iframe);
    }
  };

  const printHtml = async (html: string) => {
    if (!config.value) throw new Error("Термопринтер не настроен");
    await ensureConnected();
    const base64 = await rasterizeHtml(html, config.value.widthDots);
    await ThermalPrinterNative.printImage({ base64 });
  };

  const testPrint = async () => {
    await ensureConnected();
    await ThermalPrinterNative.printText({ text: "ТЕСТ ПЕЧАТИ\nПринтер подключен верно" });
  };

  return {
    config,
    status,
    bluetoothDevices,
    usbDevices,
    scanning,
    isSupported: isThermalPrinterSupported,
    scanDevices,
    selectBluetoothDevice,
    selectUsbDevice,
    forget,
    printHtml,
    testPrint,
  };
};
