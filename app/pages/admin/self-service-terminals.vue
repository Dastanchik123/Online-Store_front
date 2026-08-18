<script setup>
// Управление кассами самообслуживания: устройство паспортизируется здесь
// (terminal_id + метка), после чего сотрудник вводит на кассе одноразовый
// код пейринга — Electron/браузер киоска обменивает его на device-токен
// (см. useSelfServiceDevices, SelfServiceDeviceController на бэкенде).
definePageMeta({
  layout: "admin",
  middleware: "admin",
});

const { getDevices, createDevice, issuePairingCode, revokeDevice } = useSelfServiceDevices();
const ui = useUiStore();

const loading = ref(true);
const devices = ref([]);
const showAddModal = ref(false);
const form = ref({ terminal_id: "", label: "" });

// Свежевыданный код показываем прямо в списке, пока модалка открыта —
// сотруднику на кассе нужно успеть ввести его за 10 минут.
const activeCode = ref(null); // { deviceId, code, expiresAt }

const fetchDevices = async () => {
  loading.value = true;
  try {
    devices.value = await getDevices();
  } catch (e) {
    ui.addToast("Ошибка загрузки касс самообслуживания", "error");
  } finally {
    loading.value = false;
  }
};

const openAddModal = () => {
  form.value = { terminal_id: "", label: "" };
  showAddModal.value = true;
};

const save = async () => {
  if (!form.value.terminal_id.trim()) {
    ui.addToast("Укажите идентификатор терминала (например SS2)", "warning");
    return;
  }
  try {
    await createDevice(form.value);
    ui.addToast("Касса добавлена", "success");
    showAddModal.value = false;
    fetchDevices();
  } catch (e) {
    ui.addToast(e?.data?.message || "Ошибка сохранения", "error");
  }
};

const generateCode = async (device) => {
  try {
    const res = await issuePairingCode(device.id);
    activeCode.value = {
      deviceId: device.id,
      code: res.pairing_code,
      expiresAt: res.expires_at,
    };
    fetchDevices();
  } catch (e) {
    ui.addToast("Не удалось выпустить код", "error");
  }
};

const revoke = async (device) => {
  const confirmed = await ui.showConfirm(
    "Отозвать кассу",
    `Терминал «${device.terminal_id}» потеряет доступ к API немедленно. Продолжить?`,
  );
  if (!confirmed) return;
  try {
    await revokeDevice(device.id);
    ui.addToast("Касса отозвана", "success");
    if (activeCode.value?.deviceId === device.id) activeCode.value = null;
    fetchDevices();
  } catch (e) {
    ui.addToast("Ошибка отзыва", "error");
  }
};

const statusOf = (device) => {
  if (device.revoked_at) return { text: "Отозвана", cls: "bg-secondary" };
  if (!device.paired_at) return { text: "Ожидает привязки", cls: "bg-warning-subtle text-warning" };
  return { text: "Привязана", cls: "bg-success" };
};

const formatDate = (v) => (v ? new Date(v).toLocaleString("ru-RU") : "—");

onMounted(fetchDevices);
</script>

<template>
  <div class="p-4 animate-fade-in">
    <div class="d-flex justify-content-between align-items-center mb-4">
      <div>
        <h1 class="h3 fw-bold mb-1">Кассы самообслуживания</h1>
        <p class="text-muted small">
          Device-токен привязывает конкретный киоск к terminal_id — без него
          API self-service отклоняет запросы (401).
        </p>
      </div>
      <button class="btn btn-primary rounded-pill px-4" @click="openAddModal">
        <i class="bi bi-plus-lg me-2"></i> Добавить кассу
      </button>
    </div>

    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border text-primary" role="status"></div>
    </div>

    <div v-else class="card border-0 shadow-sm rounded-4 overflow-hidden">
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead class="bg-light">
            <tr>
              <th class="ps-4">Терминал</th>
              <th>Метка</th>
              <th>Статус</th>
              <th>Последняя активность</th>
              <th class="text-end pe-4">Действия</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="device in devices" :key="device.id">
              <tr>
                <td class="ps-4"><span class="fw-bold">{{ device.terminal_id }}</span></td>
                <td>{{ device.label || "—" }}</td>
                <td>
                  <span class="badge" :class="statusOf(device).cls">{{ statusOf(device).text }}</span>
                </td>
                <td>{{ formatDate(device.last_seen_at) }}</td>
                <td class="text-end pe-4">
                  <button
                    class="btn btn-sm btn-outline-primary rounded-pill me-2"
                    :disabled="!!device.revoked_at"
                    @click="generateCode(device)"
                  >
                    Код пейринга
                  </button>
                  <button
                    class="btn btn-sm btn-outline-danger rounded-pill"
                    :disabled="!!device.revoked_at"
                    @click="revoke(device)"
                  >
                    Отозвать
                  </button>
                </td>
              </tr>
              <tr v-if="activeCode?.deviceId === device.id">
                <td colspan="5" class="pb-3">
                  <div class="alert alert-info d-flex align-items-center justify-content-between mb-0 mx-4">
                    <div>
                      Код для ввода на кассе: <span class="fs-4 fw-bold font-monospace">{{ activeCode.code }}</span>
                    </div>
                    <div class="small text-muted">Истекает: {{ formatDate(activeCode.expiresAt) }}</div>
                  </div>
                </td>
              </tr>
            </template>
            <tr v-if="devices.length === 0">
              <td colspan="5" class="text-center py-5 text-muted">Касс пока нет</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="showAddModal" class="modal-backdrop fade show"></div>
    <div v-if="showAddModal" class="modal fade show d-block" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 shadow-lg rounded-4">
          <div class="modal-header border-0 pb-0">
            <h5 class="fw-bold">Новая касса самообслуживания</h5>
            <button type="button" class="btn-close" @click="showAddModal = false"></button>
          </div>
          <div class="modal-body p-4">
            <div class="mb-3">
              <label class="form-label small fw-bold">Идентификатор терминала</label>
              <input
                v-model="form.terminal_id"
                type="text"
                class="form-control rounded-3"
                placeholder="SS2"
              />
            </div>
            <div class="mb-3">
              <label class="form-label small fw-bold">Метка (необязательно)</label>
              <input
                v-model="form.label"
                type="text"
                class="form-control rounded-3"
                placeholder="Касса у входа"
              />
            </div>
          </div>
          <div class="modal-footer border-0 pt-0">
            <button class="btn btn-light rounded-pill px-4" @click="showAddModal = false">Отмена</button>
            <button class="btn btn-primary rounded-pill px-4" @click="save">Добавить</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
