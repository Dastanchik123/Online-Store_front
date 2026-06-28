import { useApi } from "./useApi";

export const useReviews = () => {
  const api = useApi();

  const getReviews = async (params: {
    product_id?: number;
    user_id?: number;
    is_approved?: boolean;
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
      const endpoint = `/reviews${queryString ? `?${queryString}` : ""}`;

      return await api.apiFetch(endpoint);
    } catch (error) {
      throw error;
    }
  };

  const getReview = async (id: number | string) => {
    try {
      return await api.apiFetch(`/reviews/${id}`);
    } catch (error) {
      throw error;
    }
  };

  const createReview = async (data: {
    product_id: number;
    order_id?: number;
    rating: number;
    title: string;
    comment: string;
  }) => {
    try {
      return await api.apiFetch("/reviews", {
        method: "POST",
        body: JSON.stringify(data),
      });
    } catch (error) {
      throw error;
    }
  };

  const updateReview = async (id: number | string, data: {
    rating?: number;
    title?: string;
    comment?: string;
  }) => {
    try {
      return await api.apiFetch(`/reviews/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    } catch (error) {
      throw error;
    }
  };

  const deleteReview = async (id: number | string) => {
    try {
      return await api.apiFetch(`/reviews/${id}`, {
        method: "DELETE",
      });
    } catch (error) {
      throw error;
    }
  };

  return {
    getReviews,
    getReview,
    createReview,
    updateReview,
    deleteReview,
  };
};

