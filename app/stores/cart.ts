import { defineStore } from "pinia";

export const useCartStore = defineStore("cart", {
  state: () => ({
    cart: null as any,
    total: "0.00",
    itemsCount: 0,
    discount: 0,
    appliedCoupon: null as string | null,
  }),

  getters: {
    getCart: (state) => state.cart,
    getTotal: (state) => state.total,
    getItemsCount: (state) => state.itemsCount,
    getItems: (state) => state.cart?.items || [],
    isEmpty: (state) => state.itemsCount === 0,
    getDiscount: (state) => state.discount,
    getAppliedCoupon: (state) => state.appliedCoupon,
    getFinalTotal(state): string {
      const total = parseFloat(state.total);
      if (state.discount > 0) {
        const final = total - state.discount;
        return final > 0 ? final.toFixed(2) : "0.00";
      }
      return state.total;
    },
  },

  actions: {
    setCart(cart: any) {
      this.cart = cart;
    },

    setTotal(total: string | number) {
      this.total = typeof total === "number" ? total.toFixed(2) : total;
    },

    setItemsCount(count: number) {
      this.itemsCount = count;
    },

    setDiscount(discount: number, code: string | null = null) {
      this.discount = discount;
      this.appliedCoupon = code;
    },

    clearCart() {
      this.cart = null;
      this.total = "0.00";
      this.itemsCount = 0;
      this.discount = 0;
      this.appliedCoupon = null;
    },
  },
});
