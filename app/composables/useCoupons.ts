export const useCoupons = () => {
  const api = useApi();

  const getCoupons = async () => {
    return await api.apiFetch("/coupons");
  };

  const validateCoupon = async (code: string, amount: number) => {
    return await api.apiFetch("/coupons/validate", {
      method: "POST",
      body: { code, amount },
    });
  };

  const createCoupon = async (data: any) => {
    return await api.apiFetch("/coupons", {
      method: "POST",
      body: data,
    });
  };

  const updateCoupon = async (id: number, data: any) => {
    return await api.apiFetch(`/coupons/${id}`, {
      method: "PUT",
      body: data,
    });
  };

  const deleteCoupon = async (id: number) => {
    return await api.apiFetch(`/coupons/${id}`, {
      method: "DELETE",
    });
  };

  return {
    getCoupons,
    validateCoupon,
    createCoupon,
    updateCoupon,
    deleteCoupon,
  };
};
