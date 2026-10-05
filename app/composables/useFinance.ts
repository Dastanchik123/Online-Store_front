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
    try {
      return await apiFetch(`/finances/${id}`, {
        method: "DELETE",
      });
    } catch (error) {
      throw error;
    }
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

  // Системные категории (создаются автоматически, не выбираются вручную в форме)
  const systemCategoryLabels: Record<string, string> = {
    purchase: "Закупка товара",
    purchase_payment: "Доплата по закупке",
    sale: "Продажа товаров",
    debt_payment: "Погашение долга",
  };

  const getCategoryLabel = (category: string) => {
    return (
      expenseCategories.find((c) => c.value === category)?.label ||
      systemCategoryLabels[category] ||
      category
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
