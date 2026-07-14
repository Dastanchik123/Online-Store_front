<script setup>
const props = defineProps({
  show: { type: Boolean, default: false },
  items: { type: Array, default: () => [] },
});
const emit = defineEmits(["update:show"]);

const { printers, activePrinter, fetchPrinters, printLabelBatch } = usePrinter();
const uiStore = useUiStore();

const isElectron = computed(
  () => typeof window !== "undefined" && !!window.electronAPI,
);

const localItems = ref([]);
const templateType = ref("price_tag");
const selectedPrinter = ref("");
const isPrinting = ref(false);

const totalLabels = computed(() =>
  localItems.value.reduce((sum, item) => sum + (Number(item.qty) || 0), 0),
);

const removeItem = (index) => {
  localItems.value.splice(index, 1);
};

// При открытии копируем переданные позиции в локальный список — правки
// внутри модалки (название/цена/кол-во) не должны влиять на исходную форму
// приёма/страницу, откуда её открыли.
watch(
  () => props.show,
  async (val) => {
    if (!val) return;
    localItems.value = props.items.map((i) => ({ ...i }));
    templateType.value = "price_tag";
    selectedPrinter.value = activePrinter.value;
    if (isElectron.value) await fetchPrinters();
  },
);

const close = () => emit("update:show", false);

const print = async () => {
  if (localItems.value.length === 0) return;
  isPrinting.value = true;
  try {
    await printLabelBatch(
      localItems.value.map((item) => ({
        product: {
          name: item.name,
          sku: item.sku,
          price: item.price,
          sale_price: item.sale_price || 0,
        },
        qty: Math.max(1, Number(item.qty) || 1),
      })),
      {
        type: templateType.value,
        printerName: selectedPrinter.value,
      },
    );
    uiStore.addToast(`Отправлено на печать: ${totalLabels.value} этикеток`, "success");
    close();
  } finally {
    isPrinting.value = false;
  }
};
</script>

<template>
  <UiBaseModal :show="show" title="Печать этикеток" size="xl" @close="close">
    <div v-if="localItems.length === 0" class="text-center text-muted py-4">
      Нет товаров для печати
    </div>

    <template v-else>
      <table class="table align-middle mb-4">
        <thead class="bg-light">
          <tr style="font-size: 0.7rem; color: #64748b; text-transform: uppercase;">
            <th class="ps-3">Название</th>
            <th width="120">Артикул</th>
            <th width="130">Цена</th>
            <th width="100" class="text-center">Копий</th>
            <th width="50"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, index) in localItems" :key="item.id + '-' + index">
            <td class="ps-3">
              <input
                v-model="item.name"
                type="text"
                class="form-control form-control-sm border-0 bg-light rounded-3"
              />
            </td>
            <td>
              <span class="small font-monospace text-muted">{{ item.sku }}</span>
            </td>
            <td>
              <div class="input-group input-group-sm">
                <input
                  v-model.number="item.price"
                  type="number"
                  step="0.01"
                  class="form-control border-0 bg-light"
                />
                <span class="input-group-text border-0 bg-light" style="font-size: 0.65rem;">сом</span>
              </div>
            </td>
            <td>
              <input
                v-model.number="item.qty"
                type="number"
                min="1"
                class="form-control form-control-sm border-0 bg-light rounded-pill text-center font-monospace"
              />
            </td>
            <td class="text-center">
              <button class="btn btn-sm btn-link text-danger p-1" @click="removeItem(index)">
                <i class="bi bi-x-circle"></i>
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="row g-3">
        <div class="col-md-6">
          <label class="form-label small fw-bold">Шаблон</label>
          <select v-model="templateType" class="form-select rounded-3">
            <option value="price_tag">Ценник</option>
            <option value="barcode">Этикетка со штрихкодом</option>
          </select>
        </div>

        <div class="col-md-6">
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
      </div>
    </template>

    <template #footer>
      <button class="btn btn-light rounded-pill px-4" @click="close">Отмена</button>
      <button
        class="btn btn-primary rounded-pill px-4 fw-bold"
        :disabled="isPrinting || localItems.length === 0"
        @click="print"
      >
        <span v-if="isPrinting" class="spinner-border spinner-border-sm me-2"></span>
        <i v-else class="bi bi-printer-fill me-2"></i>
        Печать ({{ totalLabels }})
      </button>
    </template>
  </UiBaseModal>
</template>
