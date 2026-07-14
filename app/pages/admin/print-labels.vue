<script setup>
definePageMeta({
  layout: "admin",
  middleware: "purchaser",
});

const { queue, clearQueue } = usePrintQueue();
const { printers, activePrinter, fetchPrinters, printLabelBatch } = usePrinter();
const uiStore = useUiStore();

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

const templateType = ref("price_tag");
const selectedPrinter = ref("");
const isPrinting = ref(false);

const totalLabels = computed(() =>
  queue.value.reduce((sum, item) => sum + (Number(item.qty) || 0), 0),
);

const removeItem = (index) => {
  queue.value.splice(index, 1);
};

onMounted(async () => {
  selectedPrinter.value = activePrinter.value;
  if (isElectron.value) await fetchPrinters();
});

const print = async () => {
  if (queue.value.length === 0) return;
  isPrinting.value = true;
  try {
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
        type: templateType.value,
        printerName: selectedPrinter.value,
      },
    );
    uiStore.addToast(`Отправлено на печать: ${totalLabels.value} этикеток`, "success");
  } finally {
    isPrinting.value = false;
  }
};
</script>

<template>
  <div class="p-4 animate-fade-in">
    <div class="d-flex justify-content-between align-items-center mb-4">
      <div>
        <h1 class="h3 fw-bold mb-1">Печать этикеток</h1>
        <p class="text-muted small">
          Товаров в очереди: {{ queue.length }} · этикеток всего:
          {{ totalLabels }}
        </p>
      </div>
      <div class="d-flex gap-2">
        <button
          class="btn btn-primary rounded-pill px-4"
          @click="showProductPicker = true"
        >
          <i class="bi bi-plus-lg me-1"></i>Добавить товар
        </button>
        <button
          class="btn btn-outline-danger rounded-pill px-3"
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

    <div v-else class="row g-4">
      <div class="col-lg-8">
        <div class="card border-0 shadow-sm rounded-4 p-0">
          <table class="table mb-0 align-middle">
            <thead class="bg-light">
              <tr style="font-size: 0.7rem; color: #64748b; text-transform: uppercase;">
                <th class="ps-4">Название</th>
                <th width="120">Артикул</th>
                <th width="130">Цена</th>
                <th width="100" class="text-center">Копий</th>
                <th width="50"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in queue" :key="item.id + '-' + index">
                <td class="ps-4">
                  <input v-model="item.name" type="text" class="form-control form-control-sm border-0 bg-light rounded-3" />
                </td>
                <td>
                  <span class="small font-monospace text-muted">{{ item.sku }}</span>
                </td>
                <td>
                  <div class="input-group input-group-sm">
                    <input v-model.number="item.price" type="number" step="0.01" class="form-control border-0 bg-light" />
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
        </div>
      </div>

      <div class="col-lg-4">
        <div class="card border-0 shadow-sm rounded-4 p-4">
          <h6 class="fw-bold mb-3 border-bottom pb-2">Параметры печати</h6>

          <div class="mb-3">
            <label class="form-label small fw-bold">Шаблон</label>
            <select v-model="templateType" class="form-select rounded-3">
              <option value="price_tag">Ценник</option>
              <option value="barcode">Этикетка со штрихкодом</option>
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
      @close="showProductPicker = false"
      @select="addProduct"
    />
  </div>
</template>
