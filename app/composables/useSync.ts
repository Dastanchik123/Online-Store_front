// Global reactive state shared across all component instances
const isOnline = ref(true);
const isSyncing = ref(false);
const syncQueueSize = ref(0);
const lastSyncAt = ref<string | null>(null);
const lastSyncError = ref<string | null>(null);
const hasElectron = ref(false);

// Poll sync status every 15 seconds when in Electron
let statusInterval: ReturnType<typeof setInterval> | null = null;

async function refreshStatus() {
  if (!(window as any).electronAPI) return;
  try {
    const status = await (window as any).electronAPI.getSyncStatus();
    isSyncing.value = status.inProgress;
    syncQueueSize.value = status.queueSize;
    lastSyncAt.value = status.lastSyncAt;
    lastSyncError.value = status.lastSyncError;
  } catch (e) {
    console.error('[useSync] getSyncStatus error', e);
  }
}

if (import.meta.client) {
  hasElectron.value = !!(window as any).electronAPI;

  // Online / offline events
  const updateOnline = () => { isOnline.value = window.navigator.onLine; };
  window.addEventListener('online', updateOnline);
  window.addEventListener('offline', updateOnline);
  updateOnline();

  if (hasElectron.value) {
    refreshStatus();
    statusInterval = setInterval(refreshStatus, 15_000);
  }
}

export const useSync = () => {
  const triggerSync = async () => {
    if (!(window as any).electronAPI || isSyncing.value) return;
    isSyncing.value = true;
    try {
      await (window as any).electronAPI.syncNow();
      await refreshStatus();
    } catch (e: any) {
      lastSyncError.value = e.message;
    } finally {
      isSyncing.value = false;
    }
  };

  return {
    isOnline: readonly(isOnline),
    isSyncing: readonly(isSyncing),
    syncQueueSize: readonly(syncQueueSize),
    lastSyncAt: readonly(lastSyncAt),
    lastSyncError: readonly(lastSyncError),
    hasElectron: readonly(hasElectron),
    triggerSync,
    refreshStatus,
  };
};
