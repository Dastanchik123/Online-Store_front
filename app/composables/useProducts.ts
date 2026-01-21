import { useApi } from "./useApi";

export const useProducts = () => {
  const api = useApi();

  const getProducts = async (
    params: {
      category_id?: number;
      is_active?: boolean;
      in_stock?: boolean;
      search?: string;
      min_price?: number;
      max_price?: number;
      per_page?: number;
      page?: number;
    } = {}
  ) => {
    try {
      const queryParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          queryParams.append(key, value.toString());
        }
      });

      const queryString = queryParams.toString();
      const endpoint = `/products${queryString ? `?${queryString}` : ""}`;

      return await api.apiFetch(endpoint);
    } catch (error) {
      throw error;
    }
  };

  const getProduct = async (id: number | string) => {
    try {
      return await api.apiFetch(`/products/${id}`);
    } catch (error) {
      throw error;
    }
  };

  const createProduct = async (data: any) => {
    try {
      
      const isFormData = data instanceof FormData;
      const headers = isFormData ? { "Content-Type": undefined } : {};

      return await api.apiFetch("/products", {
        method: "POST",
        body: data,
        headers: headers as any,
      });
    } catch (error) {
      throw error;
    }
  };

  const updateProduct = async (id: number | string, data: any) => {
    try {
      const isFormData = data instanceof FormData;

      if (isFormData) {
        
        data.append("_method", "PUT");
        return await api.apiFetch(`/products/${id}`, {
          method: "POST",
          body: data,
          headers: { "Content-Type": undefined } as any,
        });
      }

      return await api.apiFetch(`/products/${id}`, {
        method: "PUT",
        body: data,
      });
    } catch (error) {
      throw error;
    }
  };

  const deleteProduct = async (id: number | string) => {
    try {
      return await api.apiFetch(`/products/${id}`, {
        method: "DELETE",
      });
    } catch (error) {
      throw error;
    }
  };

  const getCategories = async (
    params: {
      parent_id?: number;
      is_active?: boolean;
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
      const endpoint = `/categories${queryString ? `?${queryString}` : ""}`;

      return await api.apiFetch(endpoint);
    } catch (error) {
      throw error;
    }
  };

  const getCategory = async (id: number | string) => {
    try {
      return await api.apiFetch(`/categories/${id}`);
    } catch (error) {
      throw error;
    }
  };

  const createCategory = async (data: any) => {
    try {
      const isFormData = data instanceof FormData;
      const headers = isFormData ? { "Content-Type": undefined } : {};

      return await api.apiFetch("/categories", {
        method: "POST",
        body: data,
        headers: headers as any,
      });
    } catch (error) {
      throw error;
    }
  };

  const updateCategory = async (id: number | string, data: any) => {
    try {
      const isFormData = data instanceof FormData;

      if (isFormData) {
        
        data.append("_method", "PUT");
        return await api.apiFetch(`/categories/${id}`, {
          method: "POST",
          body: data,
          headers: { "Content-Type": undefined } as any,
        });
      }

      return await api.apiFetch(`/categories/${id}`, {
        method: "PUT",
        body: data,
      });
    } catch (error) {
      throw error;
    }
  };

  const deleteCategory = async (id: number | string) => {
    try {
      return await api.apiFetch(`/categories/${id}`, {
        method: "DELETE",
      });
    } catch (error) {
      throw error;
    }
  };

  const downloadProductsExport = async (
    params: {
      category_id?: number;
      in_stock?: boolean;
      search?: string;
    } = {}
  ) => {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        queryParams.append(key, value.toString());
      }
    });
    const queryString = queryParams.toString();
    const endpoint = `/reports/products${queryString ? `?${queryString}` : ""}`;
    return await api.downloadFile(
      endpoint,
      `Products_Report_${new Date().toISOString().split("T")[0]}.pdf`
    );
  };

  const downloadProductsExcel = async (
    params: {
      category_id?: number;
      in_stock?: boolean;
      search?: string;
    } = {}
  ) => {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        queryParams.append(key, value.toString());
      }
    });
    const queryString = queryParams.toString();
    const endpoint = `/reports/products-excel${
      queryString ? `?${queryString}` : ""
    }`;
    return await api.downloadFile(
      endpoint,
      `Products_Export_${new Date().toISOString().split("T")[0]}.xls`
    );
  };

  const generateSku = async () => {
    try {
      return await api.apiFetch("/products/generate-sku");
    } catch (error) {
      throw error;
    }
  };

  return {
    getProducts,
    getProduct,
    createProduct,
    updateProduct,
    deleteProduct,
    getCategories,
    getCategory,
    createCategory,
    updateCategory,
    deleteCategory,
    downloadProductsExport,
    downloadProductsExcel,
    generateSku,
    downloadProductBarcode: async (id: number | string) => {
      return await api.printFile(`/reports/products/${id}/barcode`);
    },
  };
};
