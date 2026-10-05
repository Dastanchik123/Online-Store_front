// Форматирует количество товара: убирает незначащие нули (1.000 -> "1"),
// но сохраняет значимую дробную часть (1.005 -> "1.005").
export const formatQty = (value: number | string | null | undefined) => {
  return String(Number(value || 0));
};
