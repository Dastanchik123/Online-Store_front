const SETTINGS_CACHE_KEY = "site_settings_cache_v1";
const SETTINGS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 часа — настройки магазина меняются редко

const readSettingsCache = (): Record<string, any> | null => {
  if (!import.meta.client) return null;
  try {
    const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
    if (!raw) return null;
    const { data, savedAt } = JSON.parse(raw);
    if (!data || Date.now() - savedAt > SETTINGS_CACHE_TTL) return null;
    return data;
  } catch (e) {
    return null;
  }
};

const writeSettingsCache = (data: Record<string, any>) => {
  if (!import.meta.client) return;
  try {
    localStorage.setItem(
      SETTINGS_CACHE_KEY,
      JSON.stringify({ data, savedAt: Date.now() }),
    );
  } catch (e) {
    // localStorage недоступен (приватный режим и т.п.) — просто без кеша
  }
};

export const useSettings = () => {
  const api = useApi();
  const settings = useState<Record<string, any>>("site_settings", () => ({}));

  // Пока не пришёл ответ от API — подставляем закешированные данные (название
  // магазина, лого и т.д.), чтобы не ждать сеть. Делаем это в onMounted (после
  // гидратации), а не синхронно в setup — иначе клиентский рендер разойдётся
  // с серверным HTML и Vue залогирует hydration mismatch.
  if (import.meta.client) {
    onMounted(() => {
      if (Object.keys(settings.value).length === 0) {
        const cached = readSettingsCache();
        if (cached) settings.value = cached;
      }
    });
  }

  const fetchPublicSettings = async () => {
    try {
      const data = (await api.apiFetch("/settings/public")) as Record<
        string,
        any
      >;
      settings.value = data;
      writeSettingsCache(data);
    } catch (e) {
      console.error(e);
    }
  };

  const getAllSettings = async (params = {}) => {
    return await api.apiFetch("/settings", { query: params });
  };

  const updateSettings = async (newSettings: any) => {
    const result = await api.apiFetch("/settings", {
      method: "POST",
      body: { settings: newSettings },
    });
    // Настройки изменили из админки — сбрасываем кеш, чтобы везде подхватилось свежее
    writeSettingsCache({ ...settings.value, ...newSettings });
    return result;
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
