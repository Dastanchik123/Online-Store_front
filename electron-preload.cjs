const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
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

  // Settings
  getTerminalId: () => ipcRenderer.invoke('get-terminal-id'),
  setTerminalId: (id) => ipcRenderer.invoke('set-terminal-id', id),
});
