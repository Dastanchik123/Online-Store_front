export const usePos = () => {
  const { apiFetch } = useApi();
  const { isOnline } = useSync();

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
    // Получаем ID кассы (k1, k2...)
    let terminalId = 'k1';
    if ((window as any).electronAPI) {
      terminalId = await (window as any).electronAPI.getTerminalId();
    }

    const saveLocally = async () => {
      if (!(window as any).electronAPI) throw new Error("Локальная база данных недоступна");
      
      const res = await (window as any).electronAPI.dbSaveOrder({
        ...data,
        items: data.items.map((i: any) => ({
          uuid: i.uuid,
          product_uuid: i.uuid,
          product_name: i.name,
          name: i.name,
          quantity: i.quantity,
          price: i.price,
          total: i.price * i.quantity
        })),
        user_uuid: data.user_uuid || data.user_id,
        total_amount: data.items.reduce((acc: number, cur: any) => acc + (cur.price * cur.quantity), 0),
        discount: data.discount || 0,
        payment_method: data.cash_amount > 0 ? (data.transfer_amount > 0 ? 'mixed' : 'cash') : 'transfer',
      });

      return { 
        ...res, 
        items: data.items.map((i: any) => ({ ...i, product_name: i.name })),
        total: data.items.reduce((acc: number, cur: any) => acc + (cur.price * cur.quantity), 0) - (data.discount || 0),
        discount: data.discount || 0,
        offline: true 
      };
    };

    // Если мы точно знаем, что офлайн — сразу в базу
    if (import.meta.client && !isOnline.value && (window as any).electronAPI) {
      return await saveLocally();
    }

    try {
      return await apiFetch("/pos/sales", {
        method: "POST",
        body: { ...data, terminal_id: terminalId },
      });
    } catch (e) {
      // Если сервер выключен или ошибка сети — уходим в офлайн
      if (import.meta.client && (window as any).electronAPI) {
        console.warn('[usePos] Server unreachable, switching to offline save');
        return await saveLocally();
      }
      throw e;
    }
  };

  const getProducts = async (query: string) => {
    try {
      const res = await apiFetch(`/pos/products/search?q=${query}`);
      return res;
    } catch (e) {
      if ((window as any).electronAPI) {
        // Fallback to searching all products locally if search API fails
        const all = await (window as any).electronAPI.dbGetProducts();
        return all.filter((p: any) => p.name.toLowerCase().includes(query.toLowerCase()));
      }
      throw e;
    }
  };

  const getAllProducts = async () => {
    try {
      const res = await apiFetch("/pos/products");
      // Cache products locally if in electron
      if ((window as any).electronAPI && res) {
        // We could call a sync method here if needed
      }
      return res;
    } catch (e) {
      if ((window as any).electronAPI) {
        return await (window as any).electronAPI.dbGetProducts();
      }
      throw e;
    }
  };

  const searchUsers = async (query: string) => {
    try {
      return await apiFetch(`/users?search=${query}&role=user`);
    } catch (e) {
      // In a real app we'd have a local users cache too
      return [];
    }
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
