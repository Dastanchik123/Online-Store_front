import { useApi } from "./useApi";

export const useAccounting = () => {
  const api = useApi();

  
  const getPurchases = async (params = {}) => {
    return await api.apiFetch("/purchases", { params });
  };

  const createPurchase = async (data: any) => {
    return await api.apiFetch("/purchases", {
      method: "POST",
      body: data,
    });
  };

  const updatePurchase = async (id: number | string, data: any) => {
    return await api.apiFetch(`/purchases/${id}`, {
      method: "PUT",
      body: data,
    });
  };

  const registerSupplierPayment = async (
    purchaseId: number | string,
    data: { amount: number; payment_method?: string }
  ) => {
    return await api.apiFetch(`/purchases/${purchaseId}/pay`, {
      method: "POST",
      body: data,
    });
  };

  const deletePurchase = async (id: number | string) => {
    return await api.apiFetch(`/purchases/${id}`, {
      method: "DELETE",
    });
  };

  
  const getAdjustments = async (params = {}) => {
    return await api.apiFetch("/inventory/adjustments", { params });
  };

  const createAdjustment = async (data: {
    product_id: number;
    new_quantity: number;
    reason: string;
  }) => {
    return await api.apiFetch("/inventory/adjustments", {
      method: "POST",
      body: data,
    });
  };

  const updateAdjustment = async (id: number | string, data: any) => {
    return await api.apiFetch(`/inventory/adjustments/${id}`, {
      method: "POST",
      body: { ...data, _method: "PUT" },
    });
  };

  const deleteAdjustment = async (id: number | string) => {
    return await api.apiFetch(`/inventory/adjustments/${id}`, {
      method: "DELETE",
    });
  };

  
  const getDebts = async (params = {}) => {
    return await api.apiFetch("/accounting/debts", { params });
  };

  const payDebt = async (
    id: number | string,
    data: {
      amount: number;
      payment_method?: string;
    }
  ) => {
    return await api.apiFetch(`/accounting/debts/${id}/pay`, {
      method: "POST",
      body: data,
    });
  };

  const deleteDebtPayment = async (id: number | string) => {
    return await api.apiFetch(`/accounting/debts/payments/${id}`, {
      method: "DELETE",
    });
  };

  const deleteDebt = async (id: number | string) => {
    return await api.apiFetch(`/accounting/debts/${id}`, {
      method: "DELETE",
    });
  };

  
  const getAccountingReports = async (params = {}) => {
    return await api.apiFetch("/accounting/reports", { params });
  };

  const getDashboardStats = async (params = {}) => {
    return await api.apiFetch("/analytics/dashboard", { params });
  };

  
  const getReturns = async (params = {}) => {
    return await api.apiFetch("/returns", { params });
  };

  const getReturnsSummary = async (params = {}) => {
    return await api.apiFetch("/returns/summary", { params });
  };

  
  const getSuppliers = async (params = {}) => {
    return await api.apiFetch("/suppliers", { params });
  };

  const getSupplier = async (id: number | string) => {
    return await api.apiFetch(`/suppliers/${id}`);
  };

  const createSupplier = async (data: any) => {
    return await api.apiFetch("/suppliers", {
      method: "POST",
      body: data,
    });
  };

  const updateSupplier = async (id: number | string, data: any) => {
    return await api.apiFetch(`/suppliers/${id}`, {
      method: "POST",
      body: { ...data, _method: "PUT" },
    });
  };

  const deleteSupplier = async (id: number | string) => {
    return await api.apiFetch(`/suppliers/${id}`, {
      method: "DELETE",
    });
  };

  const downloadPurchaseInvoice = async (id: number | string) => {
    return await api.downloadFile(
      `/reports/purchase/${id}`,
      `Purchase_Invoice_${id}.pdf`
    );
  };

  const downloadReconciliationReport = async (
    supplierId: number | string,
    params: { date_from?: string; date_to?: string } = {}
  ) => {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) queryParams.append(key, value);
    });
    const queryString = queryParams.toString();
    const endpoint = `/reports/reconciliation/${supplierId}${
      queryString ? `?${queryString}` : ""
    }`;
    return await api.downloadFile(
      endpoint,
      `Reconciliation_Supplier_${supplierId}.pdf`
    );
  };

  const downloadDebtsReport = async (params: any = {}) => {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        if (Array.isArray(value)) {
          value.forEach((v) => queryParams.append(`${key}[]`, v));
        } else {
          queryParams.append(key, value as string);
        }
      }
    });
    return await api.downloadFile(
      `/reports/debts?${queryParams.toString()}`,
      `Debts_Report_${new Date().toISOString().split("T")[0]}.pdf`
    );
  };

  const downloadDebtsExcel = async (params: any = {}) => {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        if (Array.isArray(value)) {
          value.forEach((v) => queryParams.append(`${key}[]`, v));
        } else {
          queryParams.append(key, value as string);
        }
      }
    });
    return await api.downloadFile(
      `/reports/debts-excel?${queryParams.toString()}`,
      `Debts_Report_${new Date().toISOString().split("T")[0]}.xls`
    );
  };

  return {
    getPurchases,
    createPurchase,
    updatePurchase,
    deletePurchase,
    registerSupplierPayment,
    getAdjustments,
    createAdjustment,
    updateAdjustment,
    deleteAdjustment,
    getDebts,
    payDebt,
    deleteDebt,
    deleteDebtPayment,
    getAccountingReports,
    getDashboardStats,
    getSuppliers,
    getSupplier,
    createSupplier,
    updateSupplier,
    deleteSupplier,
    downloadPurchaseInvoice,
    downloadReconciliationReport,
    downloadDebtsReport,
    downloadDebtsExcel,
    getReturns,
    getReturnsSummary,
  };
};
