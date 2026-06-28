import { useApi } from "./useApi";

export const useAddresses = () => {
  const api = useApi();

  const getAddresses = async (params: { type?: string } = {}) => {
    try {
      const queryParams = new URLSearchParams();
      if (params.type) {
        queryParams.append("type", params.type);
      }

      const queryString = queryParams.toString();
      const endpoint = `/addresses${queryString ? `?${queryString}` : ""}`;

      return await api.apiFetch(endpoint);
    } catch (error) {
      throw error;
    }
  };

  const getAddress = async (id: number | string) => {
    try {
      return await api.apiFetch(`/addresses/${id}`);
    } catch (error) {
      throw error;
    }
  };

  const createAddress = async (data: {
    type: string;
    first_name: string;
    last_name: string;
    phone: string;
    email?: string;
    country: string;
    city: string;
    state?: string;
    postal_code: string;
    address_line_1: string;
    address_line_2?: string;
    is_default?: boolean;
  }) => {
    try {
      return await api.apiFetch("/addresses", {
        method: "POST",
        body: JSON.stringify(data),
      });
    } catch (error) {
      throw error;
    }
  };

  const updateAddress = async (id: number | string, data: any) => {
    try {
      return await api.apiFetch(`/addresses/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    } catch (error) {
      throw error;
    }
  };

  const deleteAddress = async (id: number | string) => {
    try {
      return await api.apiFetch(`/addresses/${id}`, {
        method: "DELETE",
      });
    } catch (error) {
      throw error;
    }
  };

  return {
    getAddresses,
    getAddress,
    createAddress,
    updateAddress,
    deleteAddress,
  };
};

