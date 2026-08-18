// Тонкая обёртка над /api/self-service/* — гостевой (без логина) API кассы
// самообслуживания. Никакой бизнес-логики здесь: цену/остаток/статус оплаты
// всегда решает Laravel, фронт только показывает то, что он вернул.
//
// Заказы (create/show/status/cancel) обслуживает сама касса и требуют
// device-токен киоска (см. EnsureSelfServiceDevice на бэкенде и экран
// пейринга в self-service/index.vue) — токен передаётся Bearer-заголовком,
// как обычный auth_token, но для устройства, а не пользователя.
// /pay/{token}* открывается на ТЕЛЕФОНЕ покупателя по ссылке из QR — там
// device-токена киоска нет и не должно быть, эти два метода без заголовка.
export const useSelfService = () => {
  const { apiFetch } = useApi();

  // Как и terminalId (см. self-service/index.vue): в Electron-киоске токен
  // живёт в SQLite через IPC, в обычном браузере (self-service без выделенного
  // Electron-приложения) — fallback на localStorage этого устройства.
  const getDeviceToken = async (): Promise<string | null> => {
    if (!import.meta.client) return null;
    const electron = (window as any).electronAPI;
    if (electron?.getSelfServiceDeviceToken) {
      return (await electron.getSelfServiceDeviceToken()) || null;
    }
    return localStorage.getItem("self_service_device_token") || null;
  };

  const setDeviceToken = async (token: string): Promise<void> => {
    if (!import.meta.client) return;
    const electron = (window as any).electronAPI;
    if (electron?.setSelfServiceDeviceToken) {
      await electron.setSelfServiceDeviceToken(token);
    } else {
      localStorage.setItem("self_service_device_token", token);
    }
  };

  const clearDeviceToken = async (): Promise<void> => {
    if (!import.meta.client) return;
    const electron = (window as any).electronAPI;
    if (electron?.setSelfServiceDeviceToken) {
      await electron.setSelfServiceDeviceToken("");
    } else {
      localStorage.removeItem("self_service_device_token");
    }
  };

  const deviceHeaders = async () => {
    const token = await getDeviceToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const createOrder = async (
    items: { product_id: number; quantity: number }[],
    terminalId: string,
    clientUuid: string,
  ) =>
    apiFetch("/self-service/orders", {
      method: "POST",
      headers: await deviceHeaders(),
      body: { items, terminal_id: terminalId, client_uuid: clientUuid },
    });

  const getOrder = async (orderUuid: string) =>
    apiFetch(`/self-service/orders/${orderUuid}`, { noCache: true, headers: await deviceHeaders() });

  const getPaymentStatus = async (orderUuid: string) =>
    apiFetch(`/self-service/orders/${orderUuid}/payment-status`, {
      noCache: true,
      headers: await deviceHeaders(),
    });

  const cancelOrder = async (orderUuid: string) =>
    apiFetch(`/self-service/orders/${orderUuid}/cancel`, {
      method: "POST",
      headers: await deviceHeaders(),
    });

  const getPayInfo = (token: string) =>
    apiFetch(`/self-service/pay/${token}`, { noCache: true });

  const confirmPayment = (token: string) =>
    apiFetch(`/self-service/pay/${token}/confirm`, { method: "POST" });

  const pairDevice = async (pairingCode: string) => {
    const res: any = await apiFetch("/self-service/pair", {
      method: "POST",
      body: { pairing_code: pairingCode },
    });
    await setDeviceToken(res.device_token);
    return res;
  };

  return {
    getDeviceToken,
    clearDeviceToken,
    createOrder,
    getOrder,
    getPaymentStatus,
    cancelOrder,
    getPayInfo,
    confirmPayment,
    pairDevice,
  };
};
