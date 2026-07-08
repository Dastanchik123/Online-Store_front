<script setup>
const emit = defineEmits(["char", "backspace", "space", "enter", "close"]);

const isShift = ref(false);
const lang = ref("ru");

const layouts = {
  ru: {
    lower: [
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
      ["й", "ц", "у", "к", "е", "н", "г", "ш", "щ", "з", "х"],
      ["ф", "ы", "в", "а", "п", "р", "о", "л", "д", "ж", "э"],
      ["я", "ч", "с", "м", "и", "т", "ь", "б", "ю", "."],
    ],
    upper: [
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
      ["Й", "Ц", "У", "К", "Е", "Н", "Г", "Ш", "Щ", "З", "Х"],
      ["Ф", "Ы", "В", "А", "П", "Р", "О", "Л", "Д", "Ж", "Э"],
      ["Я", "Ч", "С", "М", "И", "Т", "Ь", "Б", "Ю", "."],
    ],
  },
  en: {
    lower: [
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
      ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
      ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
      ["z", "x", "c", "v", "b", "n", "m", "."],
    ],
    upper: [
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
      ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
      ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
      ["Z", "X", "C", "V", "B", "N", "M", "."],
    ],
  },
};

const rows = computed(() =>
  isShift.value ? layouts[lang.value].upper : layouts[lang.value].lower,
);

const pressChar = (ch) => {
  emit("char", ch);
  if (isShift.value) isShift.value = false;
};

const toggleLang = () => {
  lang.value = lang.value === "ru" ? "en" : "ru";
  isShift.value = false;
};
</script>

<template>
  <div class="onscreen-keyboard shadow-2xl" @mousedown.prevent>
    <div class="d-flex justify-content-between align-items-center mb-2 px-1">
      <span class="x-small fw-bold text-muted text-uppercase">Экранная клавиатура</span>
      <div class="d-flex align-items-center gap-2">
        <button
          class="btn btn-sm btn-light rounded-pill px-3 fw-bold"
          style="min-width: 56px"
          @click="toggleLang"
        >
          {{ lang === "ru" ? "РУС" : "ENG" }}
        </button>
        <button class="btn btn-close-kbd" @click="emit('close')">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>
    </div>

    <div class="kbd-row" v-for="(row, rIdx) in rows" :key="rIdx">
      <button
        v-for="key in row"
        :key="key"
        class="btn btn-kbd-key"
        @click="pressChar(key)"
      >
        {{ key }}
      </button>
    </div>

    <div class="kbd-row">
      <button
        class="btn btn-kbd-key kbd-wide"
        :class="{ active: isShift }"
        @click="isShift = !isShift"
      >
        <i class="bi bi-shift-fill"></i> Shift
      </button>
      <button class="btn btn-kbd-key kbd-space" @click="emit('space')">
        Пробел
      </button>
      <button class="btn btn-kbd-key kbd-wide" @click="emit('backspace')">
        <i class="bi bi-backspace"></i>
      </button>
      <button class="btn btn-kbd-key kbd-wide btn-primary text-white" @click="emit('enter')">
        Enter
      </button>
    </div>
  </div>
</template>

<style scoped>
.onscreen-keyboard {
  position: fixed;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  z-index: 1200;
  background: #fff;
  border-radius: 24px;
  padding: 12px;
  width: min(720px, 96vw);
  border: 1px solid #e2e8f0;
}

.kbd-row {
  display: flex;
  gap: 6px;
  justify-content: center;
  margin-bottom: 6px;
}

.btn-kbd-key {
  flex: 1;
  min-width: 0;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 0;
  font-weight: 700;
  color: #1e293b;
}

.btn-kbd-key:active {
  background: #e2e8f0;
  transform: scale(0.96);
}

.btn-kbd-key.active {
  background: #3b82f6;
  color: #fff;
  border-color: #3b82f6;
}

.kbd-wide {
  flex: 1.6;
}

.kbd-space {
  flex: 4;
}

.btn-close-kbd {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  color: #1e293b;
}

.btn-close-kbd:active {
  background: #e2e8f0;
  transform: scale(0.95);
}
</style>
