export const useFinance = () => {
  const { apiFetch } = useApi();

  const getTransactions = async (params: any = {}) => {
    return await apiFetch("/finances", { params });
  };

  const createTransaction = async (data: any) => {
    return await apiFetch("/finances", {
      method: "POST",
      body: data,
    });
  };

  const updateTransaction = async (id: number | string, data: any) => {
    return await apiFetch(`/finances/${id}`, {
      method: "PUT",
      body: data,
    });
  };

  const deleteTransaction = async (id: number | string) => {
    return await apiFetch(`/finances/${id}`, {
      method: "DELETE",
    });
  };

  const expenseCategories = [
    { value: "tax", label: "Налоги" },
    { value: "internet", label: "Интернет" },
    { value: "utility", label: "Коммунальные услуги" },
    { value: "rent", label: "Аренда" },
    { value: "salary", label: "Зарплата" },
    { value: "marketing", label: "Маркетинг" },
    { value: "stock", label: "Закупка товара" },
    { value: "refund", label: "Возврат клиенту" },
    { value: "other", label: "Прочее" },
  ];

  const getCategoryLabel = (category: string) => {
    return (
      expenseCategories.find((c) => c.value === category)?.label || category
    );
  };

  return {
    getTransactions,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    expenseCategories,
    getCategoryLabel,
  };
};
