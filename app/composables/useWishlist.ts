export const useWishlist = () => {
  const api = useApi();
  const items = useState<any[]>("wishlist_items", () => []);

  const fetchWishlist = async () => {
    try {
      items.value = (await api.apiFetch("/wishlist")) as any[];
    } catch (e) {
      console.error(e);
    }
  };

  const toggleWishlist = async (productId: number) => {
    try {
      const res = await api.apiFetch("/wishlist/toggle", {
        method: "POST",
        body: { product_id: productId },
      });
      await fetchWishlist();
      return res;
    } catch (e) {
      throw e;
    }
  };

  const isInWishlist = (productId: number) => {
    return items.value.some((item) => item.product_id === productId);
  };

  return { items, fetchWishlist, toggleWishlist, isInWishlist };
};
