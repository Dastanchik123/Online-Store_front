import { useApi } from "./useApi";

export const useOrders = () => {
  const api = useApi();

  const getOrders = async (
    params: {
      status?: string;
      per_page?: number;
      page?: number;
    } = {}
  ) => {
    try {
      const queryParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString());
        }
      });

      const queryString = queryParams.toString();
      const endpoint = `/orders${queryString ? `?${queryString}` : ""}`;

      return await api.apiFetch(endpoint);
    } catch (error) {
      throw error;
    }
  };

  const getOrder = async (id: number | string) => {
    try {
      return await api.apiFetch(`/orders/${id}`);
    } catch (error) {
      throw error;
    }
  };

  const createOrder = async (data: {
    shipping_address_id?: number;
    billing_address_id?: number;
    shipping_address?: any;
    billing_address?: any;
    notes?: string;
  }) => {
    try {
      return await api.apiFetch("/orders", {
        method: "POST",
        body: JSON.stringify(data),
      });
    } catch (error) {
      throw error;
    }
  };

  const cancelOrder = async (id: number | string) => {
    try {
      return await api.apiFetch(`/orders/${id}/cancel`, {
        method: "POST",
      });
    } catch (error) {
      throw error;
    }
  };

  const updateOrder = async (id: number | string, data: any) => {
    try {
      return await api.apiFetch(`/orders/${id}`, {
        method: "PUT",
        body: data,
      });
    } catch (error) {
      throw error;
    }
  };

  const downloadOrderInvoice = async (id: number | string) => {
    return await api.downloadFile(
      `/reports/order/${id}`,
      `Order_Invoice_${id}.pdf`
    );
  };

  const trackOrder = async (orderNumber: string) => {
    try {
      return await api.apiFetch(`/orders/track/${orderNumber}`);
    } catch (error) {
      throw error;
    }
  };

  return {
    getOrders,
    getOrder,
    createOrder,
    cancelOrder,
    updateOrder,
    downloadOrderInvoice,
    trackOrder,
    downloadOrderThermalReceipt: async (id: number | string) => {
      return await api.downloadFile(
        `/reports/order/${id}/thermal`,
        `Thermal_Receipt_${id}.pdf`
      );
    },
    returnOrderItems: async (id: number | string, items: any[]) => {
      return await api.apiFetch(`/orders/${id}/return-items`, {
        method: "POST",
        body: JSON.stringify({ items }),
      });
    },
  };
};
