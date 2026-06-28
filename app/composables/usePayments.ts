import { useApi } from "./useApi";

export const usePayments = () => {
  const api = useApi();

  const getPayments = async (params: {
    order_id?: number;
    status?: string;
    per_page?: number;
    page?: number;
  } = {}) => {
    try {
      const queryParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString());
        }
      });

      const queryString = queryParams.toString();
      const endpoint = `/payments${queryString ? `?${queryString}` : ""}`;

      return await api.apiFetch(endpoint);
    } catch (error) {
      throw error;
    }
  };

  const getPayment = async (id: number | string) => {
    try {
      return await api.apiFetch(`/payments/${id}`);
    } catch (error) {
      throw error;
    }
  };

  const createPayment = async (data: {
    order_id: number;
    payment_method: string;
    amount: number | string;
    currency?: string;
    transaction_id?: string;
    payment_details?: string;
  }) => {
    try {
      return await api.apiFetch("/payments", {
        method: "POST",
        body: JSON.stringify(data),
      });
    } catch (error) {
      throw error;
    }
  };

  const updatePayment = async (
    id: number | string,
    data: {
      status?: string;
      transaction_id?: string;
      payment_details?: string;
    }
  ) => {
    try {
      return await api.apiFetch(`/payments/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    } catch (error) {
      throw error;
    }
  };

  return {
    getPayments,
    getPayment,
    createPayment,
    updatePayment,
  };
};

