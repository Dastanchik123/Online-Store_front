<script setup>
const { getAllSettings, updateSettings, uploadFile } = useSettings();
const { generatePriceTagHtml, generateBarcodeLabelHtml } = usePrinter();
const ui = useUiStore();

definePageMeta({
  layout: "admin",
  middleware: "admin",
});

const loading = ref(true);
const saving = ref(false);
const sett = ref({});
const logoFile = ref(null);

const tabs = [
  { key: "general", label: "Общее", icon: "bi-gear" },
  { key: "contacts", label: "Контакты", icon: "bi-telephone" },
  { key: "social", label: "Соцсети", icon: "bi-share" },
  { key: "payment", label: "Оплата", icon: "bi-credit-card" },
  { key: "pos", label: "Касса и чек", icon: "bi-display" },
  { key: "labels", label: "Этикетки", icon: "bi-tag" },
];
const activeTab = ref("general");

const defaultPriceTagTemplate = () => ({
  width_mm: 58,
  height_mm: 40,
  show_description: true,
  show_date: true,
  show_barcode: true,
  show_old_price: true,
  show_company: true,
  mirrored: false,
});
const defaultBarcodeTemplate = () => ({
  width_mm: 40,
  height_mm: 30,
});

const priceTagTemplate = ref(defaultPriceTagTemplate());
const barcodeTemplate = ref(defaultBarcodeTemplate());
const previewScale = 3;

const previewProduct = {
  name: "Название товара",
  short_description: "Краткое описание товара",
  sku: "1234567890",
  price: 299.95,
  sale_price: 249,
};

const priceTagPreviewHtml = computed(() =>
  generatePriceTagHtml(previewProduct, sett.value, 1, priceTagTemplate.value),
);
const barcodePreviewHtml = computed(() =>
  generateBarcodeLabelHtml(previewProduct, 1, barcodeTemplate.value),
);

// Шаблоны — это самостоятельные HTML-документы (свой <style>, @page и т.д.),
// поэтому их нельзя вставлять через v-html в div — теги body/style утекут
// в стили всей страницы админки. Рендерим в изолированный iframe.
const priceTagPreviewFrame = ref(null);
const barcodePreviewFrame = ref(null);

const writeFrame = (frameEl, html) => {
  const doc = frameEl?.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
};

watch(priceTagPreviewHtml, (html) => writeFrame(priceTagPreviewFrame.value, html), {
  immediate: true,
  flush: "post",
});
watch(barcodePreviewHtml, (html) => writeFrame(barcodePreviewFrame.value, html), {
  immediate: true,
  flush: "post",
});

const fetchSettings = async () => {
  loading.value = true;
  try {
    const data = await getAllSettings();

    const obj = {};
    data.forEach((s) => {
      obj[s.key] = s.value;
    });
    sett.value = obj;

    if (obj.label_template_price_tag) {
      try {
        priceTagTemplate.value = {
          ...defaultPriceTagTemplate(),
          ...JSON.parse(obj.label_template_price_tag),
        };
      } catch (e) {
        /* используем дефолт при битом JSON */
      }
    }
    if (obj.label_template_barcode) {
      try {
        barcodeTemplate.value = {
          ...defaultBarcodeTemplate(),
          ...JSON.parse(obj.label_template_barcode),
        };
      } catch (e) {
        /* используем дефолт при битом JSON */
      }
    }
  } catch (e) {
    ui.addToast("Ошибка при загрузке настроек", "error");
  } finally {
    loading.value = false;
  }
};

const save = async () => {
  if (!sett.value.site_name) {
    ui.addToast("Название магазина не может быть пустым", "warning");
    return;
  }

  saving.value = true;
  try {
    await updateSettings({
      ...sett.value,
      label_template_price_tag: JSON.stringify(priceTagTemplate.value),
      label_template_barcode: JSON.stringify(barcodeTemplate.value),
    });
    ui.addToast("Настройки успешно сохранены", "success");
  } catch (e) {
    ui.addToast("Ошибка при сохранении", "error");
  } finally {
    saving.value = false;
  }
};

const handleLogoUpload = async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const res = await uploadFile(file, "site_logo");
    sett.value.site_logo = res.path;
    ui.addToast("Логотип обновлен", "success");
  } catch (e) {
    ui.addToast("Ошибка при загрузке логотипа", "error");
  }
};

const handleQrUpload = async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const res = await uploadFile(file, "payment_mbank_qr_image");
    sett.value.payment_mbank_qr_image = res.path;
    ui.addToast("QR-код обновлен", "success");
  } catch (e) {
    ui.addToast("Ошибка при загрузке QR-кода", "error");
  }
};

const getImageUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  const config = useRuntimeConfig();
  const baseUrl = config.public.apiBase.replace(/\/api$/, "");

  let path = url;
  if (!path.startsWith("/storage") && !path.startsWith("storage")) {
    path = "storage/" + (path.startsWith("/") ? path.substring(1) : path);
  }

  return `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
};

onMounted(fetchSettings);
</script>

<template>
  <div class="p-4 animate-fade-in">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div>
        <h1 class="h3 fw-bold mb-1">Настройки магазина</h1>
        <p class="text-muted small">
          Управление общими данными, контактами и соцсетями
        </p>
      </div>
      <button
        class="btn btn-primary rounded-pill px-4"
        @click="save"
        :disabled="saving"
      >
        <span
          v-if="saving"
          class="spinner-border spinner-border-sm me-2"
        ></span>
        <i v-else class="bi bi-check2-circle me-2"></i> Сохранить изменения
      </button>
    </div>

    <div class="settings-tabs mb-4">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="settings-tab"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        <i :class="tab.icon" class="bi me-2"></i>{{ tab.label }}
      </button>
    </div>

    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border text-primary" role="status"></div>
    </div>

    <div v-else>
      <div v-show="activeTab === 'general'" class="card border-0 shadow-sm rounded-4 p-4" style="max-width: 640px;">
        <div class="mb-3">
          <label class="form-label small fw-bold">Название магазина</label>
          <input
            v-model="sett.site_name"
            type="text"
            class="form-control rounded-3"
            placeholder="MyShop"
          />
        </div>

        <div class="mb-3">
          <label class="form-label small fw-bold">ИНН организации</label>
          <input
            v-model="sett.site_inn"
            type="text"
            class="form-control rounded-3"
            placeholder="12345678901234"
          />
        </div>

        <div class="mb-3">
          <label class="form-label small fw-bold">Логотип сайта</label>
          <div class="d-flex align-items-center gap-3">
            <div
              v-if="sett.site_logo"
              class="bg-light rounded p-2 border"
              style="width: 100px; height: 60px"
            >
              <img
                :src="getImageUrl(sett.site_logo)"
                class="w-100 h-100 object-fit-contain"
              />
            </div>
            <input
              type="file"
              class="form-control form-control-sm rounded-3"
              @change="handleLogoUpload"
              accept="image/*"
            />
          </div>
        </div>

        <div class="row">
          <div class="col-md-6 mb-3">
            <label class="form-label small fw-bold">Символ валюты</label>
            <input
              v-model="sett.currency_symbol"
              type="text"
              class="form-control rounded-3"
              placeholder="сом"
            />
          </div>
          <div class="col-md-6 mb-3">
            <label class="form-label small fw-bold"
              >Порог бесплатной доставки</label
            >
            <input
              v-model="sett.free_shipping_threshold"
              type="number"
              class="form-control rounded-3"
              placeholder="5000"
            />
          </div>
        </div>
      </div>

      <div v-show="activeTab === 'contacts'" class="card border-0 shadow-sm rounded-4 p-4" style="max-width: 640px;">
        <div class="mb-3">
          <label class="form-label small fw-bold">Телефон</label>
          <input
            v-model="sett.contact_phone"
            type="text"
            class="form-control rounded-3"
            placeholder="+996 ..."
          />
        </div>

        <div class="mb-3">
          <label class="form-label small fw-bold">Email</label>
          <input
            v-model="sett.contact_email"
            type="email"
            class="form-control rounded-3"
            placeholder="info@..."
          />
        </div>

        <div class="mb-0">
          <label class="form-label small fw-bold">Адрес (физический)</label>
          <textarea
            v-model="sett.contact_address"
            class="form-control rounded-3"
            rows="2"
          ></textarea>
        </div>
      </div>

      <div v-show="activeTab === 'social'" class="card border-0 shadow-sm rounded-4 p-4" style="max-width: 640px;">
        <div class="mb-3">
          <label class="form-label small fw-bold">Instagram URL</label>
          <div class="input-group">
            <span class="input-group-text bg-light border-end-0"
              ><i class="bi bi-instagram"></i
            ></span>
            <input
              v-model="sett.social_instagram"
              type="text"
              class="form-control border-start-0 rounded-end-3"
              placeholder="https://instagram.com/..."
            />
          </div>
        </div>

        <div class="mb-3">
          <label class="form-label small fw-bold"
            >WhatsApp URL / Number</label
          >
          <div class="input-group">
            <span class="input-group-text bg-light border-end-0"
              ><i class="bi bi-whatsapp"></i
            ></span>
            <input
              v-model="sett.social_whatsapp"
              type="text"
              class="form-control border-start-0 rounded-end-3"
              placeholder="https://wa.me/..."
            />
          </div>
        </div>

        <div class="mb-0">
          <label class="form-label small fw-bold">Telegram URL</label>
          <div class="input-group">
            <span class="input-group-text bg-light border-end-0"
              ><i class="bi bi-telegram"></i
            ></span>
            <input
              v-model="sett.social_telegram"
              type="text"
              class="form-control border-start-0 rounded-end-3"
              placeholder="https://t.me/..."
            />
          </div>
        </div>
      </div>

      <div
        v-show="activeTab === 'payment'"
        class="card border-0 shadow-sm rounded-4 p-4 text-white"
        style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); max-width: 640px;"
      >
        <div class="mb-3">
          <label class="form-label small fw-bold"
            >Реквизиты для перевода (номер/счет)</label
          >
          <input
            v-model="sett.payment_contact"
            type="text"
            class="form-control bg-dark text-white border-secondary rounded-3"
            placeholder="+996 ..."
          />
        </div>

        <div class="mb-3">
          <label class="form-label small fw-bold">Имя получателя</label>
          <input
            v-model="sett.payment_recipient"
            type="text"
            class="form-control bg-dark text-white border-secondary rounded-3"
            placeholder="Иван И. (МБанк)"
          />
        </div>

        <div class="mb-0">
          <label class="form-label small fw-bold">Фото QR MBank</label>
          <div class="d-flex align-items-center gap-3">
            <div
              v-if="sett.payment_mbank_qr_image"
              class="bg-white rounded p-1 border shadow-sm"
              style="width: 100px; height: 100px"
            >
              <img
                :src="getImageUrl(sett.payment_mbank_qr_image)"
                class="w-100 h-100 object-fit-contain"
              />
            </div>
            <input
              type="file"
              class="form-control form-control-sm bg-dark text-white border-secondary rounded-3"
              @change="handleQrUpload"
              accept="image/*"
            />
          </div>
          <div class="form-text text-light opacity-50 small mt-2">
            Загрузите изображение QR-кода вашего банка. Оно будет отображаться
            клиентам при оформлении заказа.
          </div>
        </div>
      </div>

      <div v-show="activeTab === 'pos'" class="card border-0 shadow-sm rounded-4 p-4" style="max-width: 640px;">
        <div class="form-check form-switch mb-3">
          <input
            v-model="sett.pos_allow_debt"
            class="form-check-input"
            type="checkbox"
            role="switch"
            id="allowDebtSwitch"
            true-value="1"
            false-value="0"
          />
          <label class="form-check-label fw-bold small" for="allowDebtSwitch">
            Разрешить продажу в долг кассиру
          </label>
          <div class="form-text small">
            Если отключено, кнопка "Долг" в терминале кассира будет скрыта.
          </div>
        </div>

        <div class="form-check form-switch mb-4">
          <input
            v-model="sett.pos_allow_price_change"
            class="form-check-input"
            type="checkbox"
            role="switch"
            id="allowPriceChangeSwitch"
            true-value="1"
            false-value="0"
          />
          <label
            class="form-check-label fw-bold small"
            for="allowPriceChangeSwitch"
          >
            Разрешить изменение цены кассиру
          </label>
          <div class="form-text small">
            Если включено, кассир сможет менять цену товара прямо в корзине.
          </div>
        </div>

        <div class="mb-3">
          <label class="form-label small fw-bold"
            >Название группы горячих товаров</label
          >
          <input
            v-model="sett.pos_hot_products_title"
            type="text"
            class="form-control rounded-3"
            placeholder="Горячие товары"
          />
          <div class="form-text small">
            Это название будет отображаться в боковом меню и заголовках.
          </div>
        </div>

        <hr />
        <h6 class="fw-bold mb-3 small text-muted text-uppercase">
          Настройка печатного чека
        </h6>
        <div
          class="alert alert-info py-2 px-3 mb-3 border-0 rounded-3"
          style="font-size: 0.7rem; background: #f0f9ff; color: #0369a1"
        >
          <i class="bi bi-info-circle me-1"></i> Название магазина, ИНН и
          Адрес подставляются автоматически во все документы.
        </div>

        <div class="mb-3">
          <label class="form-label small fw-bold">Заголовок (Магазин)</label>
          <input
            v-model="sett.receipt_header"
            type="text"
            class="form-control form-control-sm"
            placeholder="Название магазина"
          />
        </div>

        <div class="mb-3">
          <label class="form-label small fw-bold">Подзаголовок</label>
          <input
            v-model="sett.receipt_title"
            type="text"
            class="form-control form-control-sm"
            placeholder="ИП / Адрес"
          />
        </div>

        <div class="mb-3">
          <label class="form-label small fw-bold">Телефон в чеке</label>
          <input
            v-model="sett.receipt_phone"
            type="text"
            class="form-control form-control-sm"
            placeholder="+996..."
          />
        </div>

        <div class="mb-0">
          <label class="form-label small fw-bold">Текст внизу (Подвал)</label>
          <textarea
            v-model="sett.receipt_footer"
            class="form-control form-control-sm"
            rows="3"
            placeholder="Спасибо за покупку!"
          ></textarea>
        </div>
      </div>

      <div v-show="activeTab === 'labels'" class="row g-4">
        <div class="col-lg-5">
          <div class="card border-0 shadow-sm rounded-4 p-4 mb-4">
            <h6 class="fw-bold mb-3 border-bottom pb-2">Ценник (58×40мм по умолчанию)</h6>

            <div class="row g-2 mb-3">
              <div class="col-6">
                <label class="form-label small fw-bold">Ширина, мм</label>
                <input v-model.number="priceTagTemplate.width_mm" type="number" class="form-control form-control-sm rounded-3" />
              </div>
              <div class="col-6">
                <label class="form-label small fw-bold">Высота, мм</label>
                <input v-model.number="priceTagTemplate.height_mm" type="number" class="form-control form-control-sm rounded-3" />
              </div>
            </div>

            <div class="form-check form-switch mb-2">
              <input v-model="priceTagTemplate.show_description" class="form-check-input" type="checkbox" role="switch" id="ptDesc" />
              <label class="form-check-label small" for="ptDesc">Показывать описание товара (под названием)</label>
            </div>
            <div class="form-check form-switch mb-2">
              <input v-model="priceTagTemplate.show_date" class="form-check-input" type="checkbox" role="switch" id="ptDate" />
              <label class="form-check-label small" for="ptDate">Показывать дату (сверху справа)</label>
            </div>
            <div class="form-check form-switch mb-2">
              <input v-model="priceTagTemplate.show_old_price" class="form-check-input" type="checkbox" role="switch" id="ptOldPrice" />
              <label class="form-check-label small" for="ptOldPrice">Показывать старую цену при скидке (зачёркнутая)</label>
            </div>
            <div class="form-check form-switch mb-2">
              <input v-model="priceTagTemplate.show_barcode" class="form-check-input" type="checkbox" role="switch" id="ptBarcode" />
              <label class="form-check-label small" for="ptBarcode">Показывать код и штрихкод (низ слева)</label>
            </div>
            <div class="form-check form-switch mb-3">
              <input v-model="priceTagTemplate.show_company" class="form-check-input" type="checkbox" role="switch" id="ptCompany" />
              <label class="form-check-label small" for="ptCompany">Показывать название магазина (низ справа, под ценой)</label>
            </div>

            <label class="form-label small fw-bold">Расположение блоков</label>
            <select v-model="priceTagTemplate.mirrored" class="form-select form-select-sm rounded-3">
              <option :value="false">Код/штрихкод — слева, цена — справа</option>
              <option :value="true">Код/штрихкод — справа, цена — слева</option>
            </select>
          </div>

          <div class="card border-0 shadow-sm rounded-4 p-4">
            <h6 class="fw-bold mb-3 border-bottom pb-2">Этикетка со штрихкодом (40×30мм по умолчанию)</h6>
            <div class="row g-2">
              <div class="col-6">
                <label class="form-label small fw-bold">Ширина, мм</label>
                <input v-model.number="barcodeTemplate.width_mm" type="number" class="form-control form-control-sm rounded-3" />
              </div>
              <div class="col-6">
                <label class="form-label small fw-bold">Высота, мм</label>
                <input v-model.number="barcodeTemplate.height_mm" type="number" class="form-control form-control-sm rounded-3" />
              </div>
            </div>
            <div class="form-text small mt-2">
              Компактная этикетка всегда показывает название, штрихкод, код и цену — без даты и названия магазина.
            </div>
          </div>
        </div>

        <div class="col-lg-7">
          <div class="card border-0 shadow-sm rounded-4 p-4 h-100">
            <h6 class="fw-bold mb-3 border-bottom pb-2">Предпросмотр</h6>
            <div class="d-flex flex-wrap gap-4">
              <div>
                <div class="small fw-bold text-muted mb-2">Ценник</div>
                <div
                  class="label-preview-frame"
                  :style="{
                    width: priceTagTemplate.width_mm * previewScale + 'mm',
                    height: priceTagTemplate.height_mm * previewScale + 'mm',
                  }"
                >
                  <iframe
                    ref="priceTagPreviewFrame"
                    scrolling="no"
                    :style="{
                      width: priceTagTemplate.width_mm + 'mm',
                      height: priceTagTemplate.height_mm + 'mm',
                      border: 0,
                      transform: `scale(${previewScale})`,
                      transformOrigin: 'top left',
                    }"
                  ></iframe>
                </div>
              </div>
              <div>
                <div class="small fw-bold text-muted mb-2">Этикетка со штрихкодом</div>
                <div
                  class="label-preview-frame"
                  :style="{
                    width: barcodeTemplate.width_mm * previewScale + 'mm',
                    height: barcodeTemplate.height_mm * previewScale + 'mm',
                  }"
                >
                  <iframe
                    ref="barcodePreviewFrame"
                    scrolling="no"
                    :style="{
                      width: barcodeTemplate.width_mm + 'mm',
                      height: barcodeTemplate.height_mm + 'mm',
                      border: 0,
                      transform: `scale(${previewScale})`,
                      transformOrigin: 'top left',
                    }"
                  ></iframe>
                </div>
              </div>
            </div>
            <div class="form-text small mt-3">
              Предпросмотр использует те же шаблоны, что и реальная печать — на примере тестового товара.
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-tabs {
  display: flex;
  gap: 0.25rem;
  border-bottom: 1px solid #e2e8f0;
  overflow-x: auto;
}
.settings-tab {
  background: none;
  border: none;
  padding: 0.65rem 1.1rem;
  font-weight: 600;
  font-size: 0.85rem;
  color: #64748b;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  white-space: nowrap;
  transition: color 0.15s, border-color 0.15s;
}
.settings-tab:hover {
  color: #0f172a;
}
.settings-tab.active {
  color: #0ea5e9;
  border-bottom-color: #0ea5e9;
}

.label-preview-frame {
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  overflow: hidden;
}
</style>
