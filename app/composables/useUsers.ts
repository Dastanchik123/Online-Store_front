export const useUsers = () => {
  const api = useApi();

  const getUsers = async (params: any = {}) => {
    
    const query = Object.fromEntries(
      Object.entries(params).filter(([_, v]) => v !== null && v !== "")
    );

    try {
      return await api.apiFetch("/users", {
        method: "GET",
        query,
      });
    } catch (error) {
      throw error;
    }
  };

  const getUser = async (id: number | string) => {
    try {
      return await api.apiFetch(`/users/${id}`);
    } catch (error) {
      throw error;
    }
  };

  const updateUser = async (id: number | string, data: any) => {
    try {
      const isFormData = data instanceof FormData;

      
      
      

      if (isFormData) {
        if (!data.has("_method")) {
          data.append("_method", "PUT");
        }
        return await api.apiFetch(`/users/${id}`, {
          method: "POST",
          body: data,
        });
      } else {
        return await api.apiFetch(`/users/${id}`, {
          method: "PUT",
          body: data,
        });
      }
    } catch (error) {
      throw error;
    }
  };

  const deleteUser = async (id: number | string) => {
    try {
      return await api.apiFetch(`/users/${id}`, {
        method: "DELETE",
      });
    } catch (error) {
      throw error;
    }
  };

  const createUser = async (data: any) => {
    try {
      return await api.apiFetch("/users", {
        method: "POST",
        body: data,
      });
    } catch (error) {
      throw error;
    }
  };

  const getUserHistory = async (id: number | string, params: any = {}) => {
    try {
      return await api.apiFetch(`/users/${id}/history`, { params });
    } catch (error) {
      throw error;
    }
  };

  return {
    getUsers,
    getUser,
    createUser,
    updateUser,
    deleteUser,
    getUserHistory,
  };
};
