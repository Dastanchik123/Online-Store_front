const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Local API: apiFetch → SQLite (роутер в main-процессе)
  localApi: (request) => ipcRenderer.invoke('local-api', request),

  // Событие «данные обновились после синхронизации» — для обновления UI
  onDataChanged: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('data-changed', listener);
    return () => ipcRenderer.removeListener('data-changed', listener);
  },

  // Printers
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printHTML: (data) => ipcRenderer.send('print-html', data),

  // Offline DB: Products
  dbGetProducts: () => ipcRenderer.invoke('db-get-products'),
  dbGetProductByBarcode: (barcode) => ipcRenderer.invoke('db-get-products-by-barcode', barcode),

  // Offline DB: Orders
  dbSaveOrder: (orderData) => ipcRenderer.invoke('db-save-order', orderData),

  // Auth
  dbLogin: (credentials) => ipcRenderer.invoke('db-login', credentials),
  authSaveSession: (data) => ipcRenderer.invoke('auth-save-session', data),
  authClearSession: () => ipcRenderer.invoke('auth-clear-session'),

  // Sync
  syncNow: () => ipcRenderer.invoke('sync-now'),
  getSyncStatus: () => ipcRenderer.invoke('sync-get-status'),
  saveWsConfig: (config) => ipcRenderer.invoke('ws-config-save', config),

  // Settings
  getTerminalId: () => ipcRenderer.invoke('get-terminal-id'),
  setTerminalId: (id) => ipcRenderer.invoke('set-terminal-id', id),
});
