<template>
  <div class="card-skeleton h-100 border-0 shadow-sm rounded-4 overflow-hidden">
    <!-- Image placeholder -->
    <div class="image-skeleton skeleton-box"></div>
    
    <!-- Body placeholder -->
    <div class="card-body p-4">
      <div class="badge-skeleton skeleton-box mb-2"></div>
      <div class="title-skeleton skeleton-box mb-2"></div>
      <div class="title-skeleton skeleton-box w-75 mb-3"></div>
      
      <div class="price-skeleton skeleton-box mb-3"></div>
      
      <div class="button-skeleton skeleton-box"></div>
      <div class="button-skeleton-sec skeleton-box mt-2"></div>
    </div>
  </div>
</template>

<style scoped>
.skeleton-box {
  background: linear-gradient(
    90deg,
    #f8fafc 25%,
    #f1f5f9 50%,
    #f8fafc 75%
  );
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s infinite;
  border-radius: 8px;
}

@keyframes skeleton-loading {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.image-skeleton {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 0;
}

.badge-skeleton {
  width: 60px;
  height: 14px;
}

.title-skeleton {
  height: 20px;
}

.price-skeleton {
  width: 100px;
  height: 28px;
}

.button-skeleton {
  width: 100%;
  height: 40px;
  border-radius: 8px;
}

.button-skeleton-sec {
  width: 100%;
  height: 36px;
  border-radius: 8px;
}
</style>
