<script setup lang="ts">
// Режим печати чеков (локальная настройка терминала, хранится в SQLite
// Electron). Показывается только в новой версии приложения, где есть канал
// print-receipt; в браузере и старом exe блок скрыт.
const { receiptPrintConfig, receiptModeSupported, setReceiptPrintConfig } = usePrinter();
</script>

<template>
  <div v-if="receiptModeSupported" class="mt-4">
    <label class="form-label fw-bold">Режим печати чеков</label>
    <select
      :value="receiptPrintConfig.mode"
      @change="(e) => setReceiptPrintConfig({ mode: (e.target as HTMLSelectElement).value as any })"
      class="form-select rounded-3"
    >
      <option value="raster">Растр ESC/POS — максимальная чёткость (рекомендуется)</option>
      <option value="driver">Через драйвер Windows</option>
    </select>
    <small class="text-muted mt-1 d-block">
      Растр печатает чек точка в точку в обход драйвера. Если он не сработает,
      чек автоматически напечатается через драйвер.
    </small>

    <template v-if="receiptPrintConfig.mode === 'raster'">
      <label class="form-label fw-bold mt-3">Насыщенность текста</label>
      <div class="btn-group w-100" role="group">
        <button
          v-for="opt in [
            { value: 'light', label: 'Тоньше' },
            { value: 'normal', label: 'Обычно' },
            { value: 'dark', label: 'Жирнее' },
          ]"
          :key="opt.value"
          type="button"
          class="btn"
          :class="receiptPrintConfig.density === opt.value ? 'btn-primary' : 'btn-outline-primary'"
          @click="setReceiptPrintConfig({ density: opt.value as any })"
        >
          {{ opt.label }}
        </button>
      </div>
      <small class="text-muted mt-1 d-block">
        Если буквы бледные или «рваные» — выберите «Жирнее»; если слипаются — «Тоньше».
        Сравните результат кнопкой «Тест печати».
      </small>
    </template>
  </div>
</template>
