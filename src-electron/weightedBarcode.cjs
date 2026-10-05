// Штрихкод весового товара: [prefix][product_id(5)][вес в граммах(weightDigits)][check digit(1)].
// Зеркало app/utils/weightedBarcode.ts (Nuxt) и WeightedBarcodeService.php (Laravel) —
// один и тот же алгоритм реализован трижды намеренно (проект уже дублирует
// бизнес-логику POS между PHP и JS для офлайн-кассы), т.к. Nuxt-бандл (браузер)
// и Electron main-процесс (CommonJS require) не могут надёжно делить один файл
// без риска esm/cjs-несовместимости в сборке.

const PRODUCT_ID_DIGITS = 5;

function eanCheckDigit(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    const d = Number(digits[i]);
    sum += i % 2 === 0 ? d : d * 3;
  }
  return (10 - (sum % 10)) % 10;
}

function totalLength(prefix, weightDigits) {
  return prefix.length + PRODUCT_ID_DIGITS + weightDigits + 1;
}

function isWeightedBarcode(code, prefix = '21', weightDigits = 5) {
  if (typeof code !== 'string') return false;
  return code.length === totalLength(prefix, weightDigits) && /^\d+$/.test(code) && code.startsWith(prefix);
}

function validateWeightedBarcode(code, prefix = '21', weightDigits = 5) {
  if (!isWeightedBarcode(code, prefix, weightDigits)) return false;
  const data = code.slice(0, -1);
  const check = Number(code.slice(-1));
  return check === eanCheckDigit(data);
}

function parseWeightedBarcode(code, prefix = '21', weightDigits = 5) {
  if (!validateWeightedBarcode(code, prefix, weightDigits)) return null;
  const prefixLen = prefix.length;
  const productId = parseInt(code.slice(prefixLen, prefixLen + PRODUCT_ID_DIGITS), 10);
  const grams = parseInt(code.slice(prefixLen + PRODUCT_ID_DIGITS, prefixLen + PRODUCT_ID_DIGITS + weightDigits), 10);
  return { productId, weightKg: grams / 1000 };
}

function generateWeightedBarcode(productId, weightKg, prefix = '21', weightDigits = 5) {
  const maxProductId = 10 ** PRODUCT_ID_DIGITS - 1;
  const maxGrams = 10 ** weightDigits - 1;

  if (productId > maxProductId) {
    throw new Error(`Товар не поддерживает весовой штрихкод — ID ${productId} превышает лимит формата (${maxProductId})`);
  }

  const grams = Math.round(weightKg * 1000);
  if (grams < 1 || grams > maxGrams) {
    throw new Error(`Вес вне допустимого диапазона формата штрихкода (0 - ${maxGrams} г)`);
  }

  const data = prefix + String(productId).padStart(PRODUCT_ID_DIGITS, '0') + String(grams).padStart(weightDigits, '0');
  return data + String(eanCheckDigit(data));
}

module.exports = {
  eanCheckDigit,
  isWeightedBarcode,
  validateWeightedBarcode,
  parseWeightedBarcode,
  generateWeightedBarcode,
};
