// Сканер штрихкода работает как быстрый ввод с клавиатуры — тот же принцип
// уже используется в cashier/pos.vue (буфер сбрасывается, если пауза между
// символами больше 150мс, Enter завершает скан). Вынесено в отдельный
// composable, чтобы self-service не копипастил кассирскую логику.
export function useBarcodeScanner(
  onScan: (code: string) => void,
  opts: { minLength?: number } = {},
) {
  const minLength = opts.minLength ?? 3;
  const buffer = ref("");
  const lastKeyTime = ref(0);

  const handleKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    // Пока фокус в поле поиска/инпуте — это обычный ввод текста, не скан
    if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;

    const key = e.key;
    const now = Date.now();
    if (now - lastKeyTime.value > 150) {
      buffer.value = "";
    }
    lastKeyTime.value = now;

    if (key === "Enter") {
      if (buffer.value.length >= minLength) {
        e.preventDefault();
        const code = buffer.value;
        buffer.value = "";
        onScan(code);
      } else {
        buffer.value = "";
      }
    } else if (key.length === 1) {
      buffer.value += key;
    }
  };

  onMounted(() => window.addEventListener("keydown", handleKeyDown));
  onUnmounted(() => window.removeEventListener("keydown", handleKeyDown));

  return { buffer };
}
