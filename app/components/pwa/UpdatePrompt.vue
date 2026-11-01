<script setup lang="ts">
// «Доступно обновление»: новая версия SW ждёт в waiting и активируется только
// по кнопке (pwa/sw.ts → SKIP_WAITING), чтобы не перезагружать страницу
// посреди оформления заказа. «Позже» — до следующего открытия приложения.
const { needRefresh, applyUpdate } = usePwa();
const route = useRoute();

// Экраны киоска самообслуживания и кассы: покупатель/кассир не должен видеть
// баннер посреди продажи — обновятся при следующей перезагрузке
const hiddenHere = computed(() => /^\/(self-service|cashier)(\/|$)/.test(route.path));
const updating = ref(false);

const update = async () => {
  updating.value = true;
  await applyUpdate();
};
</script>

<template>
  <Transition name="pwa-slide">
    <div
      v-if="needRefresh && !hiddenHere"
      class="pwa-toast pwa-update"
      role="status"
      aria-live="polite"
    >
      <i class="bi bi-arrow-repeat pwa-toast-icon" aria-hidden="true"></i>
      <div class="pwa-toast-text">
        <strong>Доступно обновление</strong>
        <span>Новая версия приложения готова</span>
      </div>
      <button type="button" class="pwa-btn-primary" :disabled="updating" @click="update">
        Обновить
      </button>
      <button
        type="button"
        class="pwa-btn-close"
        aria-label="Позже"
        @click="needRefresh = false"
      >
        <i class="bi bi-x-lg" aria-hidden="true"></i>
      </button>
    </div>
  </Transition>
</template>
