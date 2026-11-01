// Порядок групп горячих товаров задаётся в админке (/admin/hot-products) и
// хранится в настройке pos_hot_groups (JSON-массив названий). Касса и киоск
// показывают группы в этом порядке; группы, которых нет в списке (старые
// данные), идут следом в порядке появления у товаров.
export const parseHotGroups = (raw: unknown): string[] => {
  try {
    const list = JSON.parse(typeof raw === "string" && raw ? raw : "[]");
    return Array.isArray(list) ? list.filter((g) => typeof g === "string" && g.trim()) : [];
  } catch {
    return [];
  }
};

export const orderHotGroups = (productGroups: string[], raw: unknown): string[] => {
  const present = [...new Set(productGroups.filter(Boolean))];
  const saved = parseHotGroups(raw);
  return [
    ...saved.filter((g) => present.includes(g)),
    ...present.filter((g) => !saved.includes(g)),
  ];
};
