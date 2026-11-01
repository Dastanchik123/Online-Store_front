const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Printers
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printHTML: (data) => ipcRenderer.send('print-html', data),
  // Чек: ответ { ok, mode, fallback?, error? } — ошибки показываются кассиру
  printReceipt: (data) => ipcRenderer.invoke('print-receipt', data),
  getReceiptPrintConfig: () => ipcRenderer.invoke('get-receipt-print-config'),
  setReceiptPrintConfig: (config) => ipcRenderer.invoke('set-receipt-print-config', config),

  // Встроенные форматы этикеток → settings.label_templates_all (только admin)
  syncLabelTemplates: (data) => ipcRenderer.invoke('label-templates-sync', data),

  // Формат этикетки по умолчанию + привязка форматов/ширины ленты к принтерам
  // (локально на терминале, см. src-electron/labelTemplateSync.cjs)
  getLabelDefaultTemplateId: () => ipcRenderer.invoke('get-label-default-template-id'),
  setLabelDefaultTemplateId: (id) => ipcRenderer.invoke('set-label-default-template-id', id),
  getLabelPrinterConfig: () => ipcRenderer.invoke('get-label-printer-config'),
  setLabelPrinterConfig: (config) => ipcRenderer.invoke('set-label-printer-config', config),

  // Self-service terminal id — отдельный ключ настроек от кассы кассира
  // (terminal_id выше), чтобы не пересекались, если один и тот же Electron
  // когда-нибудь используют и для кассира, и для self-service
  getSelfServiceTerminalId: () => ipcRenderer.invoke('get-self-service-terminal-id'),
  setSelfServiceTerminalId: (id) => ipcRenderer.invoke('set-self-service-terminal-id', id),

  // Device-токен киоска (пейринг с бэкендом) — см. self-service/index.vue
  getSelfServiceDeviceToken: () => ipcRenderer.invoke('get-self-service-device-token'),
  setSelfServiceDeviceToken: (token) => ipcRenderer.invoke('set-self-service-device-token', token),
});
