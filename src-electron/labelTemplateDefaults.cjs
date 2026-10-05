// Встроенные (builtin) форматы этикеток — эталон для syncLabelTemplates().
// Размеры и роли повторяют то, что уже было хардкодом в DEFAULT_PRICE_TAG_TEMPLATE /
// DEFAULT_BARCODE_TEMPLATE (app/composables/usePrinter.ts), но в формате
// RichLabelTemplate (elements[]), который понимает редактор этикеток.
//
// version — поднимать при правке layout'а конкретного builtin-шаблона, чтобы
// syncLabelTemplates() переписал его на терминалах, где он ещё не кастомный.

const BUILTIN_LABEL_TEMPLATES = [
  {
    slug: 'builtin_price_tag_58x40',
    id: 'builtin_price_tag_58x40',
    name: 'Ценник 58×40 (стандарт)',
    role: 'price_tag',
    width: 58,
    height: 40,
    is_builtin: true,
    version: 1,
    elements: [
      { id: 'builtin_price_tag_58x40_store_name', type: 'store_name', x: 2, y: 1, w: 30, h: 3.5, rot: 0, fontSize: 2.6, bold: false, align: 'left', color: '#000000', props: { useGlobal: true } },
      { id: 'builtin_price_tag_58x40_product_name', type: 'product_name', x: 2, y: 5, w: 54, h: 9, rot: 0, fontSize: 3.4, bold: true, align: 'left', color: '#000000', props: { field: 'name' } },
      { id: 'builtin_price_tag_58x40_price', type: 'price', x: 2, y: 15, w: 30, h: 11, rot: 0, fontSize: 7, bold: true, align: 'left', color: '#000000', props: { showKopecks: true } },
      { id: 'builtin_price_tag_58x40_old_price', type: 'old_price', x: 33, y: 17.5, w: 22, h: 6, rot: 0, fontSize: 3.6, bold: false, align: 'left', color: '#000000', props: {} },
      { id: 'builtin_price_tag_58x40_barcode', type: 'barcode', x: 2, y: 27, w: 54, h: 12, rot: 0, fontSize: 3.2, bold: false, align: 'left', color: '#000000', props: { format: 'EAN13', showDigits: true } },
    ],
  },
  {
    slug: 'builtin_barcode_40x30',
    id: 'builtin_barcode_40x30',
    name: 'Штрихкод-этикетка 40×30 (стандарт)',
    role: 'barcode',
    width: 40,
    height: 30,
    is_builtin: true,
    version: 1,
    elements: [
      { id: 'builtin_barcode_40x30_product_name', type: 'product_name', x: 2, y: 1, w: 36, h: 7, rot: 0, fontSize: 2.6, bold: true, align: 'center', color: '#000000', props: { field: 'name' } },
      { id: 'builtin_barcode_40x30_price', type: 'price', x: 2, y: 9, w: 36, h: 8, rot: 0, fontSize: 4.5, bold: true, align: 'center', color: '#000000', props: { showKopecks: true } },
      { id: 'builtin_barcode_40x30_barcode', type: 'barcode', x: 2, y: 18, w: 36, h: 11, rot: 0, fontSize: 3.2, bold: false, align: 'left', color: '#000000', props: { format: 'EAN13', showDigits: true } },
    ],
  },
];

module.exports = { BUILTIN_LABEL_TEMPLATES };
