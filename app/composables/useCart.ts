import { useApi } from "./useApi";

export const useCart = () => {
  const api = useApi();
  const cartStore = useCartStore();

  const getCart = async () => {
    try {
      const response = await api.apiFetch("/cart");
      cartStore.setCart(response.cart);
      cartStore.setTotal(response.total);
      cartStore.setItemsCount(response.items_count);
      return response;
    } catch (error) {
      if (error.status === 401) {
        cartStore.clearCart();
      }
      throw error;
    }
  };

  const addToCart = async (productId: number, quantity: number = 1) => {
    try {
      const response = await api.apiFetch("/cart/items", {
        method: "POST",
        body: JSON.stringify({
          product_id: productId,
          quantity,
        }),
      });

      if (response.cart) {
        cartStore.setCart(response.cart);
        cartStore.setTotal(response.total);
        cartStore.setItemsCount(response.items_count);
      }

      return response;
    } catch (error) {
      throw error;
    }
  };

  const updateCartItem = async (itemId: number, quantity: number) => {
    try {
      const response = await api.apiFetch(`/cart/items/${itemId}`, {
        method: "PUT",
        body: JSON.stringify({ quantity }),
      });

      if (response.cart) {
        cartStore.setCart(response.cart);
        cartStore.setTotal(response.total);
        cartStore.setItemsCount(response.items_count);
      }

      return response;
    } catch (error) {
      throw error;
    }
  };

  const removeCartItem = async (itemId: number) => {
    try {
      const response = await api.apiFetch(`/cart/items/${itemId}`, {
        method: "DELETE",
      });

      if (response.cart) {
        cartStore.setCart(response.cart);
        cartStore.setTotal(response.total);
        cartStore.setItemsCount(response.items_count);
      }

      return response;
    } catch (error) {
      throw error;
    }
  };

  const clearCart = async () => {
    try {
      await api.apiFetch("/cart", {
        method: "DELETE",
      });
      cartStore.clearCart();
    } catch (error) {
      throw error;
    }
  };

  const getCheckoutQr = async () => {
    return await api.apiFetch("/cart/checkout-qr", {
      method: "POST",
    });
  };

  return {
    getCart,
    addToCart,
    updateCartItem,
    removeCartItem,
    clearCart,
    getCheckoutQr,
  };
};

