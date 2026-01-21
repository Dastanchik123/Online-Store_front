<script setup>
const { getAllSettings, updateSettings, uploadFile } = useSettings();
const ui = useUiStore();

definePageMeta({
  layout: "admin",
  middleware: "admin",
});

const loading = ref(true);
const saving = ref(false);
const sett = ref({});
const logoFile = ref(null);

const fetchSettings = async () => {
  loading.value = true;
  try {
    const data = await getAllSettings();

    const obj = {};
    data.forEach((s) => {
      obj[s.key] = s.value;
    });
    sett.value = obj;
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
    await updateSettings(sett.value);
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
    <div class="d-flex justify-content-between align-items-center mb-4">
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

    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border text-primary" role="status"></div>
    </div>

    <div v-else class="row g-4">
      <div class="col-lg-6">
        <div class="card border-0 shadow-sm rounded-4 p-4">
          <h5 class="fw-bold mb-4 border-bottom pb-2">
            <i class="bi bi-gear me-2 text-primary"></i>Общие настройки
          </h5>

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
      </div>

      <div class="col-lg-6">
        <div class="card border-0 shadow-sm rounded-4 p-4">
          <h5 class="fw-bold mb-4 border-bottom pb-2">
            <i class="bi bi-telephone me-2 text-primary"></i>Контактная
            информация
          </h5>

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

          <div class="mb-3">
            <label class="form-label small fw-bold">Адрес (физический)</label>
            <textarea
              v-model="sett.contact_address"
              class="form-control rounded-3"
              rows="2"
            ></textarea>
          </div>
        </div>
      </div>

      <div class="col-lg-6">
        <div class="card border-0 shadow-sm rounded-4 p-4">
          <h5 class="fw-bold mb-4 border-bottom pb-2">
            <i class="bi bi-share me-2 text-primary"></i>Социальные сети
          </h5>

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

          <div class="mb-3">
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
      </div>

      <div class="col-lg-6">
        <div
          class="card border-0 shadow-sm rounded-4 p-4 text-white"
          style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%)"
        >
          <h5 class="fw-bold mb-4 border-bottom pb-2 border-secondary">
            <i class="bi bi-credit-card me-2 text-primary"></i>Настройки оплаты
          </h5>

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

          <div class="mb-3">
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
      </div>

      <div class="col-lg-6">
        <div class="card border-0 shadow-sm rounded-4 p-4">
          <h5 class="fw-bold mb-4 border-bottom pb-2">
            <i class="bi bi-display me-2 text-primary"></i>Настройки кассы (POS)
          </h5>

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
      </div>
    </div>
  </div>
</template>
