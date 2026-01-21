export const useApi = () => {
  const config = useRuntimeConfig();
  const baseURL = config.public.apiBase;

  const getAuthToken = () => {
    if (import.meta.client) {
      return localStorage.getItem("auth_token");
    }
    return null;
  };

  const apiFetch = async (endpoint: string, options: any = {}) => {
    const token = getAuthToken();
    const headers: any = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers || {}),
    };

    
    if (options.body instanceof FormData) {
      delete headers["Content-Type"];
    }

    
    if (
      headers["Content-Type"] === undefined ||
      headers["Content-Type"] === null
    ) {
      delete headers["Content-Type"];
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const response = await $fetch(`${baseURL}${endpoint}`, {
        ...options,
        headers,
        method: options.method || "GET",
      });

      return response;
    } catch (error: any) {
      
      if (error.status === 401) {
        
        if (import.meta.client) {
          localStorage.removeItem("auth_token");
          localStorage.removeItem("user");
          navigateTo("/auth/login");
        }
      } else if (error.status === 404) {
        
        console.error("Resource not found:", endpoint);
      } else if (error.status === 422) {
        
        console.error("Validation error:", error.data?.errors);
      } else if (error.status === 429) {
        
        const retryAfter = error.response?.headers?.get("Retry-After");
        console.error(`Rate limited. Try again after ${retryAfter || 60}s`);
      } else if (error.status === 403) {
        
        console.error("Access forbidden");
      } else if (error.status >= 500) {
        
        console.error("Server error:", error.data?.message);
      }

      
      throw error;
    }
  };

  const downloadFile = async (endpoint: string, fileName: string) => {
    const token = getAuthToken();
    const headers: any = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${baseURL}${endpoint}`, {
        headers,
      });

      if (!response.ok) {
        
        const errorData = await response.json().catch(() => null);
        const errorMessage =
          errorData?.message || `Server error: ${response.status}`;
        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download error:", error);
      throw error;
    }
  };

  const printFile = async (endpoint: string) => {
    const token = getAuthToken();
    const headers: any = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${baseURL}${endpoint}`, {
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errorMessage =
          errorData?.message || `Server error: ${response.status}`;
        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.src = url;
      document.body.appendChild(iframe);

      iframe.onload = () => {
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (e) {
            console.error("Print error:", e);
            window.open(url, "_blank");
          }
        }, 500);
      };

      
      setTimeout(() => {
        try {
          document.body.removeChild(iframe);
          window.URL.revokeObjectURL(url);
        } catch (e) {}
      }, 60000);
    } catch (error) {
      console.error("Print error:", error);
      throw error;
    }
  };

  return {
    apiFetch,
    downloadFile,
    printFile,
    baseURL,
    getAuthToken,
  };
};
