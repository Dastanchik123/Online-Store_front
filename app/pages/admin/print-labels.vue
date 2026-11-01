<script setup>
definePageMeta({
  layout: "admin",
  middleware: "permission",
  permission: "products.view",
});

const { queue, clearQueue, reloadQueue } = usePrintQueue();
const { printers, activePrinter, fetchPrinters, printLabelBatch } = usePrinter();
const { settings, fetchPublicSettings } = useSettings();
const { resolveDefaultTemplateId, setDefaultTemplateId, setPrinterTemplateId, getRibbonWidthMm } =
  useLabelTemplateDefaults();
const uiStore = useUiStore();

// Список шаблонов приходит из редактора этикеток (вкладка "Редактор этикеток"
// в настройках) — каждый шаблон сам решает свою раскладку при печати через
// роль ("Ценник" — плотно на A4, "Штрихкод-этикетка" — по одному на лист).
const availableTemplates = computed(() => {
  try {
    const parsed = JSON.parse(settings.value?.label_templates_all || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
});
const roleLabel = (role) =>
  role === "price_tag" ? "Ценник" : role === "barcode" ? "Штрихкод-этикетка" : "без роли";

// Шаблон, помеченный активным для роли "штрихкод" в редакторе этикеток
// (settings.label_active_template_barcode) — именно его печатает
// одиночная кнопка "Штрих-код" на /admin/products. Очередь сюда чаще всего
// приходит с товарами для печати штрихкодов, поэтому по умолчанию
// подставляем тот же шаблон, а не первый попавшийся в общем списке.
const defaultTemplateId = computed(() => {
  try {
    const active = JSON.parse(settings.value?.label_active_template_barcode || "null");
    if (active?.id && availableTemplates.value.some((t) => t.id === active.id)) {
      return active.id;
    }
  } catch (e) {
    /* битый JSON — падаем на подбор ниже */
  }
  return availableTemplates.value.find((t) => t.role === "barcode")?.id || availableTemplates.value[0]?.id || "";
});
const selectedTemplateId = ref("");
const selectedPrinter = ref("");
// Приоритет подстановки: формат, привязанный к выбранному принтеру →
// общий дефолт по терминалу (настраиваются в Настройки → Принтеры) →
// старая ролевая эвристика выше (defaultTemplateId) как последний fallback.
const applyDefaultTemplate = async () => {
  if (!availableTemplates.value.length) return;
  const resolved = await resolveDefaultTemplateId(selectedPrinter.value, availableTemplates.value);
  selectedTemplateId.value = resolved || defaultTemplateId.value;
};
watch(
  availableTemplates,
  (list) => {
    if (list.length && !list.some((t) => t.id === selectedTemplateId.value)) {
      applyDefaultTemplate();
    }
  },
  { immediate: true },
);
// Смена принтера — подставляем формат, привязанный именно к нему (разные
// кассы могут стоять с разной шириной ленты), даже если до этого на экране
// был выбран другой формат вручную.
watch(selectedPrinter, applyDefaultTemplate);
const selectedTemplate = computed(
  () => availableTemplates.value.find((t) => t.id === selectedTemplateId.value) || null,
);
const rememberAsDefault = async () => {
  if (!selectedTemplateId.value) return;
  if (selectedPrinter.value) {
    await setPrinterTemplateId(selectedPrinter.value, selectedTemplateId.value);
    uiStore.addToast(`Формат по умолчанию для принтера «${selectedPrinter.value}» сохранён`, "success");
  } else {
    await setDefaultTemplateId(selectedTemplateId.value);
    uiStore.addToast("Формат по умолчанию сохранён", "success");
  }
};

const showProductPicker = ref(false);
const pickerItems = computed(() =>
  queue.value.map((item) => ({ product_id: item.id, quantity: item.qty })),
);
const addProduct = (product) => {
  const existing = queue.value.find((i) => i.id === product.id);
  if (existing) {
    existing.qty = Number(existing.qty || 0) + 1;
    return;
  }
  queue.value.push({
    id: product.id,
    name: product.name,
    sku: product.sku || "",
    price: Number(product.price || 0),
    sale_price: Number(product.sale_price || 0),
    qty: 1,
  });
};

const isElectron = computed(
  () => typeof window !== "undefined" && !!window.electronAPI,
);

// Только для ценников (role=price_tag) — они печатаются сеткой, и сетка
// по-разному укладывается на A4 (несколько столбцов, разрывы по 297мм) и
// на чековой ленте 80мм (один-два столбца, без разрывов, впритык).
// Штрихкод-этикетки печатаются по одной штуке размером с саму этикетку —
// для них выбор бумаги роли не играет.
const paperMode = ref("a4");
if (import.meta.client) {
  paperMode.value = localStorage.getItem("label_paper_mode") || "a4";
}
watch(paperMode, (val) => {
  if (import.meta.client) localStorage.setItem("label_paper_mode", val);
});

const isPrinting = ref(false);

const totalLabels = computed(() =>
  queue.value.reduce((sum, item) => sum + (Number(item.qty) || 0), 0),
);

const removeItem = (index) => {
  queue.value.splice(index, 1);
};

// Цена, которая попадёт на этикетку: со скидкой, если она есть и меньше
// обычной (так же решает usePrinter.ts при печати)
const formatLabelPrice = (item) => {
  const regular = Number(item.price || 0);
  const sale = Number(item.sale_price || 0);
  const price = sale > 0 && sale < regular ? sale : regular;
  return price.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " сом";
};

// В очереди лежит копия названия/артикула/цены на момент добавления — цену
// могли поменять после. Перед показом и перед печатью подтягиваем товары из
// БД (ids — мимо серверного кэша, noCache — мимо SWR-кэша useApi), чтобы на
// этикетку никогда не попала старая цена. false — связи нет, печатать нельзя.
const api = useApi();
const isRefreshing = ref(false);
const refreshQueueProducts = async () => {
  if (queue.value.length === 0) return true;
  isRefreshing.value = true;
  try {
    const ids = [...new Set(queue.value.map((i) => i.id))].join(",");
    const res = await api.apiFetch(`/products?ids=${ids}&per_page=-1&fields=list`, { noCache: true });
    const fresh = new Map((res?.data || []).map((p) => [String(p.id), p]));
    const missing = queue.value.filter((i) => !fresh.has(String(i.id)));
    queue.value = queue.value
      .filter((i) => fresh.has(String(i.id)))
      .map((i) => {
        const p = fresh.get(String(i.id));
        return {
          ...i,
          name: p.name,
          sku: p.sku || "",
          price: Number(p.price || 0),
          sale_price: Number(p.sale_price || 0),
        };
      });
    if (missing.length) {
      uiStore.addToast(
        `Убраны из очереди удалённые товары: ${missing.map((i) => i.name).join(", ")}`,
        "warning",
      );
    }
    return true;
  } catch (e) {
    console.error("Failed to refresh queue products", e);
    return false;
  } finally {
    isRefreshing.value = false;
  }
};

onMounted(async () => {
  selectedPrinter.value = activePrinter.value;
  if (isElectron.value) await fetchPrinters();
  // Всегда свежие настройки: шаблоны этикеток и очередь могли поменять
  // в редакторе или с другой кассы, пока страница была закрыта
  await fetchPublicSettings({ fresh: true });
  await reloadQueue();
  await refreshQueueProducts();
});

const print = async () => {
  if (queue.value.length === 0) return;
  if (!selectedTemplate.value) {
    uiStore.addToast("Выберите шаблон этикетки — создайте его в редакторе этикеток", "warning");
    return;
  }
  if (selectedPrinter.value) {
    const ribbonWidthMm = await getRibbonWidthMm(selectedPrinter.value);
    if (ribbonWidthMm && selectedTemplate.value.width > ribbonWidthMm + 0.5) {
      uiStore.addToast(
        `Шаблон шире ленты принтера (${selectedTemplate.value.width}мм > ${ribbonWidthMm}мм) — разметка может уехать. Ширину ленты можно поменять в Настройки → Принтеры.`,
        "warning",
      );
    }
  }
  isPrinting.value = true;
  try {
    if (!(await refreshQueueProducts())) {
      uiStore.addToast("Нет связи с сервером — не удалось проверить актуальные цены, печать отменена", "error");
      return;
    }
    if (queue.value.length === 0) return;
    await printLabelBatch(
      queue.value.map((item) => ({
        product: {
          name: item.name,
          sku: item.sku,
          price: item.price,
          sale_price: item.sale_price || 0,
        },
        qty: Math.max(1, Number(item.qty) || 1),
      })),
      {
        template: selectedTemplate.value,
        printerName: selectedPrinter.value,
        paperMode: paperMode.value,
      },
    );
    uiStore.addToast(`Отправлено на печать: ${totalLabels.value} этикеток`, "success");
  } finally {
    isPrinting.value = false;
  }
};
</script>

<template>
  <div class="p-3 p-md-4 animate-fade-in">
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3 mb-md-4">
      <div class="me-auto">
        <h1 class="h3 fw-bold mb-1">Печать этикеток</h1>
        <p class="text-muted small mb-0">
          Товаров в очереди: {{ queue.length }} · этикеток всего:
          {{ totalLabels }}
          <span v-if="isRefreshing" class="spinner-border spinner-border-sm ms-1 align-middle" role="status"></span>
        </p>
      </div>
      <div class="d-flex gap-2">
        <button
          class="btn btn-primary rounded-pill px-3 px-md-4 text-nowrap"
          @click="showProductPicker = true"
        >
          <i class="bi bi-plus-lg me-1"></i>Добавить<span class="d-none d-sm-inline"> товар</span>
        </button>
        <button
          class="btn btn-outline-danger rounded-pill px-3 text-nowrap"
          :disabled="queue.length === 0"
          @click="clearQueue"
        >
          <i class="bi bi-trash me-1"></i>Очистить
        </button>
      </div>
    </div>

    <div v-if="queue.length === 0" class="card border-0 shadow-sm rounded-4 p-5 text-center text-muted">
      <i class="bi bi-tags fs-1 mb-3 opacity-50"></i>
      <div class="fw-bold mb-1">Очередь печати пуста</div>
      <div class="small">
        Нажмите «Добавить товар», чтобы найти нужные позиции и напечатать
        для них ценники или этикетки со штрихкодом.
      </div>
    </div>

    <div v-else class="row g-3 g-md-4">
      <div class="col-lg-8">
        <div class="card border-0 shadow-sm rounded-4 p-0 overflow-hidden">
          <!-- Название и цена — только для показа: перед печатью они всё
               равно подтягиваются из базы (refreshQueueProducts), ручная
               правка молча терялась бы. На телефоне артикул и цена — под
               названием, колонки скрыты. -->
          <table class="table mb-0 align-middle queue-table">
            <thead class="bg-light">
              <tr style="font-size: 0.7rem; color: #64748b; text-transform: uppercase;">
                <th class="ps-3 ps-md-4">Название</th>
                <th class="d-none d-md-table-cell" width="140">Артикул</th>
                <th class="d-none d-md-table-cell text-end" width="120">Цена</th>
                <th width="90" class="text-center">Копий</th>
                <th width="44"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in queue" :key="item.id + '-' + index">
                <td class="ps-3 ps-md-4">
                  <div class="fw-semibold small queue-name">{{ item.name }}</div>
                  <div class="d-md-none text-muted" style="font-size: 0.72rem;">
                    <span class="font-monospace">{{ item.sku || "—" }}</span>
                    · <span class="fw-bold text-dark">{{ formatLabelPrice(item) }}</span>
                  </div>
                </td>
                <td class="d-none d-md-table-cell">
                  <span class="small font-monospace text-muted">{{ item.sku }}</span>
                </td>
                <td class="d-none d-md-table-cell text-end fw-bold small text-nowrap">
                  {{ formatLabelPrice(item) }}
                </td>
                <td>
                  <input
                    v-model.number="item.qty"
                    type="number"
                    min="1"
                    inputmode="numeric"
                    class="form-control form-control-sm border-0 bg-light rounded-pill text-center font-monospace"
                  />
                </td>
                <td class="text-center pe-2">
                  <button class="btn btn-sm btn-link text-danger p-1" title="Убрать из очереди" @click="removeItem(index)">
                    <i class="bi bi-x-circle"></i>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="col-lg-4">
        <div class="card border-0 shadow-sm rounded-4 p-3 p-md-4">
          <h6 class="fw-bold mb-3 border-bottom pb-2">Параметры печати</h6>

          <div class="mb-3">
            <label class="form-label small fw-bold d-flex flex-wrap justify-content-between align-items-center gap-1">
              <span>Шаблон</span>
              <button
                v-if="selectedTemplateId"
                type="button"
                class="btn btn-sm btn-link p-0"
                style="font-size: 0.75rem;"
                title="Запомнить этот формат как формат по умолчанию"
                @click="rememberAsDefault"
              >
                <i class="bi bi-pin-angle me-1"></i>Сделать форматом по умолчанию
              </button>
            </label>
            <select
              v-model="selectedTemplateId"
              class="form-select rounded-3"
              :disabled="availableTemplates.length === 0"
            >
              <option v-if="availableTemplates.length === 0" value="">
                Нет шаблонов — создайте в редакторе этикеток
              </option>
              <option v-for="t in availableTemplates" :key="t.id" :value="t.id">
                {{ t.name }} · {{ roleLabel(t.role) }} · {{ t.width }}×{{ t.height }} мм
              </option>
            </select>
            <small v-if="selectedTemplate" class="text-muted d-block mt-1">
              {{
                selectedTemplate.role === "price_tag"
                  ? "Печатается плотной сеткой — впритык по всей ширине выбранной бумаги."
                  : "Каждая этикетка — на отдельном листе размером " +
                    selectedTemplate.width + "×" + selectedTemplate.height + " мм."
              }}
            </small>
          </div>

          <div v-if="selectedTemplate && selectedTemplate.role === 'price_tag'" class="mb-3">
            <label class="form-label small fw-bold">Бумага</label>
            <select v-model="paperMode" class="form-select rounded-3">
              <option value="a4">А4 (несколько столбцов, листами)</option>
              <option value="roll80">Чековая лента 80мм (впритык, без разрывов)</option>
            </select>
          </div>

          <div class="mb-3">
            <label class="form-label small fw-bold d-flex justify-content-between">
              <span>Принтер</span>
              <span :class="isElectron ? 'text-success' : 'text-info'" style="font-size: 0.75rem;">
                {{ isElectron ? "Electron" : "Обычный режим (браузер)" }}
              </span>
            </label>
            <select v-model="selectedPrinter" class="form-select rounded-3" :disabled="!isElectron">
              <option value="">-- По умолчанию --</option>
              <option v-for="p in printers" :key="p" :value="p">{{ p }}</option>
            </select>
            <small v-if="!isElectron" class="text-muted d-block mt-1">
              В браузере печатается один документ через диалог печати. Для
              прямой печати без диалога запустите приложение через Electron.
            </small>
          </div>

          <button
            class="btn btn-primary rounded-pill w-100 py-2 fw-bold"
            :disabled="isPrinting"
            @click="print"
          >
            <span v-if="isPrinting" class="spinner-border spinner-border-sm me-2"></span>
            <i v-else class="bi bi-printer-fill me-2"></i>
            Печать ({{ totalLabels }})
          </button>
        </div>
      </div>
    </div>

    <AdminProductPickerModal
      :show="showProductPicker"
      :items="pickerItems"
      :multi-select="true"
      @close="showProductPicker = false"
      @select="addProduct"
    />
  </div>
</template>

<style scoped>
/* Длинное название — не больше двух строк, полное видно в редакторе товара */
.queue-name {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}
.queue-table td {
  padding-top: 0.6rem;
  padding-bottom: 0.6rem;
}
</style>
