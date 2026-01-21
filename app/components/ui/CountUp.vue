<script setup>
const props = defineProps({
  value: {
    type: [Number, String],
    required: true,
  },
  duration: {
    type: Number,
    default: 800,
  },
  prefix: {
    type: String,
    default: "",
  },
  suffix: {
    type: String,
    default: "",
  },
});

const displayValue = ref(0);
const targetValue = computed(() => parseFloat(props.value) || 0);

let startTime = null;
let animationFrame = null;

const animate = (timestamp) => {
  if (!startTime) startTime = timestamp;
  const progress = Math.min((timestamp - startTime) / props.duration, 1);

  
  const ease = progress * (2 - progress);

  displayValue.value = ease * targetValue.value;

  if (progress < 1) {
    animationFrame = requestAnimationFrame(animate);
  } else {
    displayValue.value = targetValue.value;
  }
};

watch(
  () => props.value,
  () => {
    const startVal = displayValue.value;
    const endVal = targetValue.value;
    startTime = null;

    const step = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / props.duration, 1);
      const ease = progress * (2 - progress);

      displayValue.value = startVal + (endVal - startVal) * ease;

      if (progress < 1) {
        animationFrame = requestAnimationFrame(step);
      } else {
        displayValue.value = endVal;
      }
    };

    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = requestAnimationFrame(step);
  },
  { immediate: true }
);

const formatted = computed(() => {
  return (
    props.prefix +
    displayValue.value.toLocaleString("ru-RU", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }) +
    props.suffix
  );
});
</script>

<template>
  <span>{{ formatted }}</span>
</template>
