<script setup lang="ts">
// Предложение установить приложение. Android/Chrome — своя кнопка вместо
// beforeinstallprompt-инфобара; iOS Safari такого события не даёт, поэтому
// там — подсказка про «Поделиться» → «На экран Домой». Не показываем, если
// уже открыто как приложение или человек однажды закрыл подсказку.
import { isIosSafari, isStandalone } from "~/composables/usePwa";

const { installEvent, promptInstall, installDismissed, dismissInstall } = usePwa();

const ready = ref(false);
const ios = ref(false);
const closed = ref(false);

onMounted(() => {
  if (isStandalone() || installDismissed()) {
    closed.value = true;
    return;
  }
  ios.value = isIosSafari();
  // Не перекрываем страницу в первые секунды — человек сначала смотрит товар
  setTimeout(() => (ready.value = true), 4000);
});

const visible = computed(
  () => ready.value && !closed.value && (ios.value || !!installEvent.value),
);

const close = () => {
  closed.value = true;
  dismissInstall();
};

const install = async () => {
  const accepted = await promptInstall();
  // Отказ в системном окне — тоже ответ, второй раз не навязываемся
  if (!accepted) dismissInstall();
  closed.value = true;
};
</script>

<template>
  <Transition name="pwa-slide">
    <div v-if="visible" class="pwa-toast pwa-install" role="dialog" aria-label="Установка приложения">
      <img src="/icons/icon-192.png" alt="" class="pwa-install-icon" width="44" height="44" />
      <div class="pwa-toast-text">
        <strong>Приложение KurulushStore</strong>
        <span v-if="ios">
          Нажмите
          <i class="bi bi-box-arrow-up" aria-label="«Поделиться»"></i>
          «Поделиться», затем «На экран „Домой“»
        </span>
        <span v-else>Быстрый вход с главного экрана телефона</span>
      </div>
      <button v-if="!ios" type="button" class="pwa-btn-primary" @click="install">
        Установить
      </button>
      <button type="button" class="pwa-btn-close" aria-label="Закрыть" @click="close">
        <i class="bi bi-x-lg" aria-hidden="true"></i>
      </button>
    </div>
  </Transition>
</template>
