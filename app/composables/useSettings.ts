export const useSettings = () => {
  const api = useApi();
  const settings = useState<Record<string, any>>("site_settings", () => ({}));

  const fetchPublicSettings = async () => {
    try {
      settings.value = (await api.apiFetch("/settings/public")) as Record<
        string,
        any
      >;
    } catch (e) {
      console.error(e);
    }
  };

  const getAllSettings = async (params = {}) => {
    return await api.apiFetch("/settings", { query: params });
  };

  const updateSettings = async (newSettings: any) => {
    return await api.apiFetch("/settings", {
      method: "POST",
      body: { settings: newSettings },
    });
  };

  const uploadFile = async (file: File, key: string) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("key", key);
    return await api.apiFetch("/settings/upload-file", {
      method: "POST",
      body: formData,
    });
  };

  return {
    settings,
    fetchPublicSettings,
    getAllSettings,
    updateSettings,
    uploadFile,
  };
};
