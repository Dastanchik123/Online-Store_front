export const usePos = () => {
  const { apiFetch } = useApi();

  const getStaff = async () => {
    return await apiFetch("/pos/staff");
  };

  const getPosSummary = async (staffId: string | number = "") => {
    return await apiFetch(`/pos/summary?staff_id=${staffId}`);
  };

  const confirmFinance = async (id: number | string) => {
    return await apiFetch(`/pos/sales/${id}/confirm`, {
      method: "POST",
    });
  };

  const createPosSale = async (data: any) => {
    return await apiFetch("/pos/sales", {
      method: "POST",
      body: data,
    });
  };

  const getProducts = async (query: string) => {
    return await apiFetch(`/pos/products/search?q=${query}`);
  };

  const getAllProducts = async () => {
    return await apiFetch("/pos/products");
  };

  const searchUsers = async (query: string) => {
    return await apiFetch(`/users?search=${query}&role=user`);
  };

  return {
    getStaff,
    getPosSummary,
    confirmFinance,
    createPosSale,
    getProducts,
    getAllProducts,
    searchUsers,
  };
};
