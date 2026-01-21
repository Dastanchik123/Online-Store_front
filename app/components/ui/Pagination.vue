<template>
  <nav v-if="totalPages > 1" class="d-flex justify-content-center mt-4">
    <ul class="pagination pagination-md shadow-sm">
      <li class="page-item" :class="{ disabled: currentPage <= 1 }">
        <button
          class="page-link"
          @click="$emit('page-change', currentPage - 1)"
        >
          <i class="bi bi-chevron-left"></i>
        </button>
      </li>
      <li
        v-for="page in totalPages"
        :key="page"
        class="page-item"
        :class="{ active: page === currentPage }"
      >
        <button class="page-link" @click="$emit('page-change', page)">
          {{ page }}
        </button>
      </li>
      <li class="page-item" :class="{ disabled: currentPage >= totalPages }">
        <button
          class="page-link"
          @click="$emit('page-change', currentPage + 1)"
        >
          <i class="bi bi-chevron-right"></i>
        </button>
      </li>
    </ul>
  </nav>
</template>

<script setup>
defineProps({
  currentPage: Number,
  totalPages: Number,
});
defineEmits(["page-change"]);
</script>
