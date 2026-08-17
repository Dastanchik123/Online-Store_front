// Тонкая обёртка над /api/self-service/* — гостевой (без логина) API кассы
// самообслуживания. Никакой бизнес-логики здесь: цену/остаток/статус оплаты
// всегда решает Laravel, фронт только показывает то, что он вернул.
export const useSelfService = () => {
  const { apiFetch } = useApi();

  const createOrder = (
    items: { product_id: number; quantity: number }[],
    terminalId: string,
    clientUuid: string,
  ) =>
    apiFetch("/self-service/orders", {
      method: "POST",
      body: { items, terminal_id: terminalId, client_uuid: clientUuid },
    });

  const getOrder = (orderUuid: string) =>
    apiFetch(`/self-service/orders/${orderUuid}`, { noCache: true });

  const getPaymentStatus = (orderUuid: string) =>
    apiFetch(`/self-service/orders/${orderUuid}/payment-status`, { noCache: true });

  const cancelOrder = (orderUuid: string) =>
    apiFetch(`/self-service/orders/${orderUuid}/cancel`, { method: "POST" });

  const getPayInfo = (token: string) =>
    apiFetch(`/self-service/pay/${token}`, { noCache: true });

  const confirmPayment = (token: string) =>
    apiFetch(`/self-service/pay/${token}/confirm`, { method: "POST" });

  return {
    createOrder,
    getOrder,
    getPaymentStatus,
    cancelOrder,
    getPayInfo,
    confirmPayment,
  };
};
