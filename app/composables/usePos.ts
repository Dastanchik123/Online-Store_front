export const usePos = () => {
  const { apiFetch } = useApi();

  const getStaff = async () => {
    return await apiFetch("/pos/staff");
  };

  const getPosSummary = async (staffId: string | number = "") => {
    return await apiFetch(`/pos/summary?staff_id=${staffId}`);
  };

  // idempotencyKey — один на один и тот же чек: повтор после обрыва связи с
  // тем же ключом вернёт уже проведённую продажу, а не создаст вторую
  // (см. middleware Idempotency на бэкенде).
  // Номер чека (P-…) выдаёт сервер — номер терминала больше не передаётся.
  const createPosSale = async (data: any, options: { idempotencyKey?: string } = {}) => {
    // Касса работает только онлайн: без сервера продажа не проводится,
    // ошибка уходит кассиру (pos.vue показывает её тостом).
    return await apiFetch("/pos/sales", {
      method: "POST",
      body: data,
      headers: options.idempotencyKey
        ? { "Idempotency-Key": options.idempotencyKey }
        : {},
    });
  };

  // Продажа со смешанной оплатой ждёт подтверждения QR банком.
  // check=true — сервер дополнительно спросит GoPay (если уведомление задерживается)
  const getSaleStatus = async (orderId: number | string, check = false) => {
    return await apiFetch(`/pos/sales/${orderId}/status${check ? "?check=1" : ""}`);
  };

  const cancelSale = async (orderId: number | string) => {
    return await apiFetch(`/pos/sales/${orderId}/cancel`, { method: "POST" });
  };

  const regenerateSaleQr = async (orderId: number | string) => {
    return await apiFetch(`/pos/sales/${orderId}/qr`, { method: "POST" });
  };

  const getProducts = async (query: string) => {
    return await apiFetch(`/pos/products/search?q=${encodeURIComponent(query)}`);
  };

  const getAllProducts = async () => {
    return await apiFetch("/pos/products");
  };

  const searchUsers = async (query: string) => {
    try {
      return await apiFetch(`/pos/customers?search=${encodeURIComponent(query)}`);
    } catch (e) {
      return [];
    }
  };

  // Новый покупатель с кассы (имя + номер). Номер уже есть — вернётся
  // существующий клиент (existing: true)
  const createCustomer = async (data: { name: string; phone: string }) => {
    return await apiFetch("/pos/customers", { method: "POST", body: data });
  };

  // Покупатель собрал корзину на /tsd и показывает QR с кассы — касса
  // забирает содержимое этой онлайн-корзины по токену.
  const redeemCheckoutQr = async (token: string) => {
    return await apiFetch("/pos/scan-checkout", {
      method: "POST",
      body: { token },
    });
  };

  return {
    getStaff,
    getPosSummary,
    createPosSale,
    getSaleStatus,
    cancelSale,
    regenerateSaleQr,
    getProducts,
    getAllProducts,
    searchUsers,
    createCustomer,
    redeemCheckoutQr,
  };
};
