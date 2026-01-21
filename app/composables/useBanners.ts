export const useBanners = () => {
  const api = useApi();

  const getBanners = async () => {
    return await api.apiFetch("/banners");
  };

  const createBanner = async (formData: FormData) => {
    return await api.apiFetch("/banners-admin", {
      method: "POST",
      body: formData,
    });
  };

  const updateBanner = async (id: number, formData: FormData) => {
    if (!formData.has("_method")) formData.append("_method", "PUT");
    return await api.apiFetch(`/banners-admin/${id}`, {
      method: "POST",
      body: formData,
    });
  };

  const deleteBanner = async (id: number) => {
    return await api.apiFetch(`/banners-admin/${id}`, {
      method: "DELETE",
    });
  };

  const reorderBanners = async (orders: { id: number; order: number }[]) => {
    return await api.apiFetch("/banners/reorder", {
      method: "POST",
      body: { orders },
    });
  };

  return {
    getBanners,
    createBanner,
    updateBanner,
    deleteBanner,
    reorderBanners,
  };
};
