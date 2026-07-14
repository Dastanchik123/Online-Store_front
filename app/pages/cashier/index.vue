<script setup>
definePageMeta({
  layout: false,
  middleware: "cashier",
});

const authStore = useAuthStore();
const { getOrders, getOrder, trackOrder, returnOrderItems } = useOrders();
const { getDebts } = useAccounting();
const {
  printers,
  activePrinter,
  initPrinter,
  setPrinter,
  isConnected,
  testPrint,
  printReceipt,
  generateReceiptHtml,
  generateInvoiceHtml,
} = usePrinter();
const ui = useUiStore();

const printTemplate = ref("thermal");

const setTemplate = (val) => {
  printTemplate.value = val;
  if (process.client) {
    localStorage.setItem("print_template", val);
  }
};

const summary = ref({
  todaySales: 0,
  activeDebtsCount: 0,
});

const loadSummary = async () => {
  try {
    const todayStr = todayDate();
    const orders = await getOrders({
      date_from: toUtcDayBoundary(todayStr, false),
      date_to: toUtcDayBoundary(todayStr, true),
      source: "pos",
    });
    summary.value.todaySales = (orders.data || []).reduce(
      (acc, curr) => acc + parseFloat(curr.total || 0),
      0,
    );

    const debts = await getDebts({ status: "active" });
    summary.value.activeDebtsCount = debts.total || debts.data?.length || 0;
  } catch (e) {
    console.error(e);
  }
};

const formatPrice = (price) =>
  parseFloat(price || 0).toLocaleString("ru-RU") + " сом";

const showPrinterModal = ref(false);
const showHistoryModal = ref(false);
const showReturnModal = ref(false);

const historyOrders = ref([]);
const isHistoryLoading = ref(false);
const todayDate = () => new Date().toLocaleDateString("en-CA");
const historyDateFrom = ref(todayDate());
const historyDateTo = ref(todayDate());
const historyShowAll = ref(false);

// Границы дня переводим в UTC по часовому поясу браузера — бэкенд
// сравнивает created_at с этой меткой как есть (без whereDate), поэтому
// без 23:59:59.999 на конце дня date_to отсекает почти все чеки за день
const toUtcDayBoundary = (dateStr, endOfDay) => {
  if (!dateStr) return undefined;
  const time = endOfDay ? "23:59:59.999" : "00:00:00.000";
  return new Date(`${dateStr}T${time}`).toISOString();
};

const loadHistory = async () => {
  isHistoryLoading.value = true;
  showHistoryModal.value = true;
  try {
    const res = await getOrders({
      ...(historyShowAll.value
        ? {}
        : {
            date_from: toUtcDayBoundary(historyDateFrom.value, false),
            date_to: toUtcDayBoundary(historyDateTo.value, true),
          }),
      per_page: historyShowAll.value ? 200 : 50,
      source: "pos",
    });
    historyOrders.value = res.data || [];
  } catch (e) {
    ui.addToast("Ошибка загрузки истории", "error");
  } finally {
    isHistoryLoading.value = false;
  }
};

const showAllHistory = () => {
  historyShowAll.value = true;
  loadHistory();
};

const resetHistoryToToday = () => {
  historyShowAll.value = false;
  historyDateFrom.value = todayDate();
  historyDateTo.value = todayDate();
  loadHistory();
};

const reprintOrder = async (order) => {
  await printReceipt(order, printTemplate.value);
};

const showPreviewModal = ref(false);
const selectedOrder = ref(null);

const openPreview = (order) => {
  selectedOrder.value = order;
  showPreviewModal.value = true;
};

const returnSearchQuery = ref("");
const returnOrderData = ref(null);
const isReturnCheckLoading = ref(false);
const returnItems = ref({});

const searchOrderForReturn = async () => {
  const query = returnSearchQuery.value?.trim();
  if (!query) return;
  
  isReturnCheckLoading.value = true;
  returnOrderData.value = null;
  returnItems.value = {};

  try {
    const order = await trackOrder(query);
    if (order && (order.id || order.uuid)) {
      returnOrderData.value = order;
      // Initialize return quantities
      if (order.items) {
        order.items.forEach(item => {
          returnItems.value[item.id] = 0;
        });
      }
    } else {
      ui.addToast("Заказ не найден. Проверьте номер чека.", "warning");
    }
  } catch (e) {
    console.error("Return search error:", e);
    const msg = e.data?.message || "Заказ не найден или ошибка сервера";
    ui.addToast(msg, "error");
  } finally {
    isReturnCheckLoading.value = false;
  }
};

const processReturn = async () => {
  if (!returnOrderData.value) return;

  const itemsToReturn = Object.entries(returnItems.value)
    .filter(([_, qty]) => qty > 0)
    .map(([id, qty]) => ({ id: Number(id), quantity: Number(qty) }));

  if (itemsToReturn.length === 0) {
    ui.addToast("Выберите товары для возврата (количество > 0)", "warning");
    return;
  }

  try {
    await returnOrderItems(returnOrderData.value.uuid || returnOrderData.value.id, itemsToReturn);
    // Возврат оформлен
    showReturnModal.value = false;
    returnSearchQuery.value = "";
    returnOrderData.value = null;
    loadSummary();
  } catch (e) {
    console.error(e);
    ui.addToast(e.data?.message || "Ошибка при оформлении возврата", "error");
  }
};

const savePrinter = () => {
  showPrinterModal.value = false;
};

onMounted(async () => {
  if (process.client) {
    const saved = localStorage.getItem("print_template");
    if (saved) printTemplate.value = saved;
  }
  loadSummary();
  await initPrinter();
});
</script>

<template>
  <div class="cashier-dashboard p-4 animate-fade-in">
    <div
      class="header-card mb-4 p-4 rounded-4 shadow-sm text-white glass-header"
    >
      <div class="row align-items-center">
        <div class="col">
          <h1 class="h3 mb-1 fw-bold">Рабочее место Кассира</h1>
          <p class="mb-0 opacity-75">
            Оперативный учет оплат и задолженностей.
          </p>
        </div>
        <div class="col-auto d-flex gap-2">
          <NuxtLink
            v-if="authStore.isAdmin"
            to="/admin"
            class="btn btn-warning rounded-pill px-3 fw-bold small"
          >
            <i class="bi bi-shield-lock me-1"></i> Админ панель
          </NuxtLink>
          <button
            @click="showPrinterModal = true"
            class="btn btn-outline-light rounded-pill px-3 fw-bold small"
          >
            <i class="bi bi-printer me-1"></i> Принтер
          </button>
          <NuxtLink
            to="/"
            class="btn btn-light rounded-pill px-3 fw-bold small"
          >
            <i class="bi bi-arrow-left me-1"></i> На сайт
          </NuxtLink>
          <div class="d-flex flex-column align-items-end">
            <div
              class="role-badge bg-white text-info px-3 py-1 rounded-pill fw-bold small mb-1"
            >
              {{
                authStore.user?.role === "admin" ? "Администратор" : "Кассир"
              }}
            </div>
            <div
              class="small text-white fw-bold pe-2"
              style="font-size: 0.8rem"
            >
              {{ authStore.user?.name }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="row g-4 mb-4">
      <div class="col-md-6">
        <div class="stat-card p-4 rounded-4 shadow-sm border-0 bg-white">
          <div class="d-flex align-items-center mb-3">
            <div class="icon-box bg-info-subtle text-info rounded-3 me-3">
              <i class="bi bi-cash-stack fs-4"></i>
            </div>
            <h6 class="text-muted mb-0 fw-bold">Продажи за сегодня</h6>
          </div>
          <h2 class="fw-bold mb-0">{{ formatPrice(summary.todaySales) }}</h2>
        </div>
      </div>
      <div class="col-md-6">
        <div class="stat-card p-4 rounded-4 shadow-sm border-0 bg-white">
          <div class="d-flex align-items-center mb-3">
            <div class="icon-box bg-danger-subtle text-danger rounded-3 me-3">
              <i class="bi bi-person-exclamation fs-4"></i>
            </div>
            <h6 class="text-muted mb-0 fw-bold">Активные должники</h6>
          </div>
          <h2 class="fw-bold mb-0">{{ summary.activeDebtsCount }} чел.</h2>
        </div>
      </div>
    </div>

    <div class="card border-0 shadow-sm rounded-4 overflow-hidden mb-4">
      <div class="card-header bg-white border-0 p-4">
        <h5 class="fw-bold mb-0">Кассовые операции</h5>
      </div>
      <div class="card-body p-4 pt-0">
        <div class="row g-3">
          <div class="col-md-4">
            <NuxtLink
              to="/cashier/pos"
              class="action-btn p-4 rounded-4 d-flex align-items-center text-decoration-none border h-100"
            >
              <div class="icon-box bg-dark text-white rounded-3 me-3">
                <i class="bi bi-calculator fs-4"></i>
              </div>
              <div>
                <div class="fw-bold text-dark">POS Терминал</div>
                <small class="text-muted">Прямая продажа</small>
              </div>
            </NuxtLink>
          </div>
          <div class="col-md-4">
            <button
              @click="loadHistory"
              class="action-btn w-100 p-4 rounded-4 d-flex align-items-center text-decoration-none border h-100 bg-white"
            >
              <div class="icon-box bg-primary text-white rounded-3 me-3">
                <i class="bi bi-receipt-cutoff fs-4"></i>
              </div>
              <div class="text-start">
                <div class="fw-bold text-dark">История чеков</div>
                <small class="text-muted">Проверка продаж</small>
              </div>
            </button>
          </div>
          <div class="col-md-4">
            <button
              @click="showReturnModal = true"
              class="action-btn w-100 p-4 rounded-4 d-flex align-items-center text-decoration-none border h-100 bg-white"
            >
              <div class="icon-box bg-danger text-white rounded-3 me-3">
                <i class="bi bi-arrow-counterclockwise fs-4"></i>
              </div>
              <div class="text-start">
                <div class="fw-bold text-dark">Возврат товара</div>
                <small class="text-muted">Оформление возврата</small>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showPrinterModal" class="modal-backdrop fade show"></div>
    <div
      v-if="showPrinterModal"
      class="modal fade show d-block"
      tabindex="-1"
      @click.self="showPrinterModal = false"
    >
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 rounded-4 shadow-lg">
          <div class="modal-header border-0 p-4">
            <h5 class="modal-title fw-bold">Настройка принтера</h5>
            <button
              type="button"
              class="btn-close"
              @click="showPrinterModal = false"
            ></button>
          </div>
          <div class="modal-body p-4 pt-0">
            <div class="mb-3">
              <div
                class="d-flex justify-content-between align-items-center mb-2"
              >
                <label class="form-label fw-bold mb-0">Выберите принтер</label>
                <span :class="isConnected ? 'text-success' : 'text-info'" class="small fw-bold">
                  {{ isConnected ? "Принтер: Подключен (Electron)" : "Принтер: Обычный режим" }}
                </span>
              </div>

              <select
                :value="activePrinter"
                @change="(e) => setPrinter(e.target.value)"
                class="form-select rounded-3"
              >
                <option value="">-- По умолчанию --</option>
                <option v-for="p in printers" :key="p" :value="p">
                  {{ p }}
                </option>
              </select>

              <div
                v-if="!isConnected"
                class="alert alert-info mt-2 py-2 small"
              >
                Запустите приложение через <strong>Electron</strong> для выбора принтера и прямой печати.
              </div>

              <div class="mt-4">
                <label class="form-label fw-bold">Шаблон печати</label>
                <div class="d-flex gap-3">
                  <div class="form-check">
                    <input
                      class="form-check-input"
                      type="radio"
                      name="tpl"
                      id="tpl1"
                      value="thermal"
                      :checked="printTemplate === 'thermal'"
                      @change="setTemplate('thermal')"
                    />
                    <label class="form-check-label" for="tpl1"
                      >Чек (80мм)</label
                    >
                  </div>
                  <div class="form-check">
                    <input
                      class="form-check-input"
                      type="radio"
                      name="tpl"
                      id="tpl2"
                      value="full"
                      :checked="printTemplate === 'full'"
                      @change="setTemplate('full')"
                    />
                    <label class="form-check-label" for="tpl2"
                      >Накладная (A4)</label
                    >
                  </div>
                </div>
                <small class="text-muted mt-1 d-block"
                  >Для обычных принтеров (как MF3010) выбирайте
                  <strong>Накладную (A4)</strong>.</small
                >
              </div>

              <small class="text-muted mt-3 d-block"
                >Выбранный принтер будет использоваться для печати чеков БЕЗ
                открытия окна браузера.</small
              >
            </div>
          </div>
          <div
            class="modal-footer border-0 p-4 pt-0 d-flex justify-content-between"
          >
            <button
              type="button"
              class="btn btn-outline-info rounded-pill px-3 fw-bold"
              @click="testPrint"
              :disabled="!isConnected || !activePrinter"
            >
              <i class="bi bi-play-circle me-1"></i> Тест печати
            </button>
            <div class="d-flex gap-2">
              <button
                type="button"
                class="btn btn-light rounded-pill px-4"
                @click="showPrinterModal = false"
              >
                Отмена
              </button>
              <button
                type="button"
                class="btn btn-primary rounded-pill px-4"
                @click="savePrinter"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showHistoryModal" class="modal-backdrop fade show"></div>
    <div
      v-if="showHistoryModal"
      class="modal fade show d-block"
      tabindex="-1"
      @click.self="showHistoryModal = false"
    >
      <div class="modal-dialog modal-dialog-centered modal-xl">
        <div class="modal-content border-0 rounded-4 shadow-lg">
          <div class="modal-header border-0 p-4 flex-wrap gap-2">
            <h5 class="modal-title fw-bold">
              История чеков
              {{ historyShowAll ? "(Все)" : "" }}
            </h5>
            <button
              type="button"
              class="btn-close"
              @click="showHistoryModal = false"
            ></button>
          </div>
          <div class="px-4 pb-2 d-flex flex-wrap align-items-center gap-2">
            <input
              type="date"
              class="form-control form-control-sm w-auto"
              v-model="historyDateFrom"
              :disabled="historyShowAll"
              @change="
                historyShowAll = false;
                loadHistory();
              "
            />
            <span class="text-muted">—</span>
            <input
              type="date"
              class="form-control form-control-sm w-auto"
              v-model="historyDateTo"
              :disabled="historyShowAll"
              @change="
                historyShowAll = false;
                loadHistory();
              "
            />
            <button
              class="btn btn-sm rounded-pill"
              :class="historyShowAll ? 'btn-secondary' : 'btn-outline-secondary'"
              @click="historyShowAll ? resetHistoryToToday() : showAllHistory()"
            >
              {{ historyShowAll ? "Сегодня" : "Показать всё" }}
            </button>
          </div>
          <div
            class="modal-body p-4 pt-0 overflow-auto"
            style="max-height: 75vh"
          >
            <div v-if="isHistoryLoading" class="text-center py-5">
              <div class="spinner-border text-primary" role="status"></div>
            </div>
            <table
              v-else-if="historyOrders.length > 0"
              class="table table-hover align-middle"
            >
              <thead class="bg-light">
                <tr>
                  <th class="ps-3 border-0 rounded-start">#</th>
                  <th class="border-0">Дата / время</th>
                  <th class="border-0">Сумма</th>
                  <th class="border-0">Оплата</th>
                  <th class="border-0 rounded-end text-end pe-3">Действия</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="order in historyOrders" :key="order.id">
                  <td class="ps-3 fw-bold">#{{ order.order_number }}</td>
                  <td>
                    {{
                      new Date(order.created_at).toLocaleString("ru-RU", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    }}
                  </td>
                  <td class="fw-bold">{{ formatPrice(order.total) }}</td>
                  <td>
                    <span class="badge bg-light text-dark border">
                      {{
                        order.payment_method === "cash"
                          ? "Наличные"
                          : "Перевод/Карта"
                      }}
                    </span>
                  </td>
                  <td class="text-end pe-3">
                    <button
                      @click="openPreview(order)"
                      class="btn btn-sm btn-outline-info rounded-pill"
                    >
                      <i class="bi bi-eye me-1"></i> Просмотр
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
            <div v-else class="text-center py-5 text-muted">
              <i class="bi bi-journal-x fs-1 opacity-25 d-block mb-2"></i>
              {{
                historyShowAll
                  ? "Транзакций еще не было"
                  : "Транзакций за выбранный период не было"
              }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showReturnModal" class="modal-backdrop fade show"></div>
    <div
      v-if="showReturnModal"
      class="modal fade show d-block"
      tabindex="-1"
      @click.self="showReturnModal = false"
    >
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div
          class="modal-content border-0 rounded-4 shadow-lg"
          style="min-height: 400px"
        >
          <div class="modal-header border-0 p-4">
            <h5 class="modal-title fw-bold text-danger">Возврат товара</h5>
            <button
              type="button"
              class="btn-close"
              @click="showReturnModal = false"
            ></button>
          </div>
          <div class="modal-body p-4 pt-0">
            <div
              class="input-group mb-4 shadow-sm rounded-4 overflow-hidden border"
            >
              <input
                type="text"
                class="form-control form-control-lg border-0 ps-4"
                placeholder="Введите номер чека (например: 1250)"
                v-model="returnSearchQuery"
                @keyup.enter="searchOrderForReturn"
              />
              <button
                class="btn btn-dark px-4"
                @click="searchOrderForReturn"
                :disabled="isReturnCheckLoading"
              >
                <span
                  v-if="isReturnCheckLoading"
                  class="spinner-border spinner-border-sm me-2"
                ></span>
                Найти чек
              </button>
            </div>

            <div v-if="returnOrderData" class="animate-fade-in">
              <div
                class="d-flex justify-content-between align-items-center mb-3 p-3 bg-light rounded-3"
              >
                <div>
                  <span class="text-muted small d-block"
                    >Заказ #{{ returnOrderData.order_number }}</span
                  >
                  <span class="fw-bold">{{
                    new Date(returnOrderData.created_at).toLocaleString()
                  }}</span>
                </div>
                <div>
                  <span class="text-muted small d-block">Клиент</span>
                  <span class="fw-bold">{{
                    returnOrderData.user?.name || "Гость"
                  }}</span>
                </div>
                <span class="badge bg-success-subtle text-success fs-6">{{
                  returnOrderData.status
                }}</span>
              </div>

              <div
                class="table-responsive mb-4"
                style="max-height: 300px; overflow-y: auto"
              >
                <table class="table align-middle">
                  <thead>
                    <tr>
                      <th>Товар</th>
                      <th class="text-center">Цена</th>
                      <th class="text-center">Куплено</th>
                      <th class="text-center" style="width: 120px">
                        Возврат (шт)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="item in returnOrderData.items" :key="item.id">
                      <td>
                        <div class="fw-bold">
                          {{ item.product?.name || item.name }}
                        </div>
                        <small class="text-muted">{{ item.sku }}</small>
                      </td>
                      <td class="text-center">{{ formatPrice(item.price) }}</td>
                      <td class="text-center fw-bold">{{ item.quantity }}</td>
                      <td>
                        <input
                          type="number"
                          class="form-control text-center fw-bold text-danger"
                          min="0"
                          :max="item.quantity"
                          v-model="returnItems[item.id]"
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="d-flex justify-content-end gap-3 pt-3 border-top">
                <button
                  class="btn btn-light rounded-pill px-4"
                  @click="showReturnModal = false"
                >
                  Отмена
                </button>
                <button
                  class="btn btn-danger rounded-pill px-4 fw-bold"
                  @click="processReturn"
                >
                  <i class="bi bi-arrow-counterclockwise me-2"></i> Оформить
                  возврат
                </button>
              </div>
            </div>

            <div
              v-else-if="
                !isReturnCheckLoading && !returnOrderData && returnSearchQuery
              "
              class="text-center py-5 opacity-50"
            >
              Введите корректный ID заказа для поиска
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showPreviewModal" class="modal-backdrop fade show"></div>
    <div
      v-if="showPreviewModal"
      class="modal fade show d-block"
      tabindex="-1"
      @click.self="showPreviewModal = false"
    >
      <div class="modal-dialog modal-dialog-centered" style="max-width: 950px;">
        <div class="modal-content border-0 rounded-4 shadow-2xl overflow-hidden" style="box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);">
          <div class="modal-header bg-dark text-white border-0 p-4 d-flex justify-content-between align-items-center">
            <div>
              <h5 class="modal-title fw-bold m-0 text-white">Просмотр документа</h5>
              <div class="small text-white-50">Вы можете распечатать накладную или закрыть просмотр</div>
            </div>
            <button type="button" class="btn-primary rounded-circle p-2 border-0 d-flex align-items-center justify-content-center" style="width: 32px; height: 32px; opacity: 0.8;" @click="showPreviewModal = false">
              <i class="bi bi-x-lg text-white" style="font-size: 14px;"></i>
            </button>
          </div>
          <div class="modal-body p-0 bg-secondary-subtle" style="max-height: 60vh; overflow-y: auto;">
             <div class="p-4 d-flex justify-content-center">
               <div 
                 class="bg-white shadow-lg rounded-1 p-5" 
                 style="width: 100%; min-height: 600px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);"
                 v-html="generateInvoiceHtml(selectedOrder)"
               ></div>
             </div>
          </div>
          <div class="modal-footer border-0 p-4 bg-white shadow-lg d-flex gap-3">
            <button
              type="button"
              class="btn btn-light rounded-pill px-5 py-2 fw-semibold grow"
              @click="showPreviewModal = false"
            >
              Закрыть
            </button>
            <button
              type="button"
              class="btn btn-primary rounded-pill px-5 py-2 grow fw-bold shadow-sm d-flex align-items-center justify-content-center gap-2"
              style="background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%); border: none;"
              @click="reprintOrder(selectedOrder); showPreviewModal = false;"
            >
              <i class="bi bi-printer-fill fs-5"></i> 
              <span>Распечатать чек</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>


.glass-header {
  background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%);
}
.icon-box {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.action-btn {
  transition: all 0.3s ease;
  background: #f8fafc;
}
.action-btn:hover {
  background: white;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
  border-color: #06b6d4 !important;
}
.animate-fade-in {
  animation: fadeIn 0.5s ease-out;
}
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
