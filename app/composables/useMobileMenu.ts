// Общее состояние офф-канвас sidebar витрины — открывается либо из
// гамбургера в Header.vue, либо из вкладки "Ещё" в BottomNav.vue.
// useState (не Pinia) — тот же паттерн, что и в useWishlist.ts.
export const useMobileMenu = () => {
  const isOpen = useState<boolean>("mobile_menu_open", () => false);

  return {
    isOpen,
    open: () => (isOpen.value = true),
    close: () => (isOpen.value = false),
    toggle: () => (isOpen.value = !isOpen.value),
  };
};
