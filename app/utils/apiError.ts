// Текст ошибки API для тоста: у 422 Laravel кладёт суть в errors{поле: [...]},
// а message там общее «The given data was invalid.» — поэтому сначала берём
// первую ошибку поля, затем message, и только потом запасной текст страницы.
export const apiErrorMessage = (error: any, fallback: string): string => {
  const errors = error?.data?.errors;
  if (errors && typeof errors === "object") {
    const first = Object.values(errors).flat()[0];
    if (first) return String(first);
  }
  return error?.data?.message || fallback;
};
