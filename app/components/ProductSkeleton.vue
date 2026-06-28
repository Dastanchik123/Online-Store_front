<template>
  <div class="product-skeleton">
    <div class="skeleton-breadcrumbs mb-4"></div>
    
    <div class="product-content-skeleton">
      <!-- Gallery Skeleton -->
      <div class="gallery-skeleton">
        <div class="main-image-skeleton skeleton-box"></div>
        <div class="thumbnails-skeleton mt-3 d-flex gap-2">
          <div class="thumb-skeleton skeleton-box"></div>
          <div class="thumb-skeleton skeleton-box"></div>
          <div class="thumb-skeleton skeleton-box"></div>
        </div>
      </div>
      
      <!-- Info Skeleton -->
      <div class="info-skeleton">
        <div class="badge-skeleton skeleton-box mb-3"></div>
        <div class="title-skeleton skeleton-box mb-3"></div>
        <div class="price-skeleton skeleton-box mb-4"></div>
        
        <div class="controls-skeleton py-4 border-top border-bottom mb-4">
          <div class="quantity-label-skeleton skeleton-box mb-2"></div>
          <div class="quantity-input-skeleton skeleton-box mb-4"></div>
          <div class="button-group-skeleton d-flex gap-3">
            <div class="button-main-skeleton skeleton-box"></div>
            <div class="button-sec-skeleton skeleton-box"></div>
          </div>
        </div>
        
        <div class="meta-skeleton">
          <div class="meta-item-skeleton skeleton-box mb-2"></div>
          <div class="meta-item-skeleton skeleton-box"></div>
        </div>
      </div>
    </div>
    
    <!-- Description Skeleton -->
    <div class="description-section-skeleton mt-5 p-4 rounded-4 bg-light">
      <div class="desc-title-skeleton skeleton-box mb-3"></div>
      <div class="desc-line-skeleton skeleton-box mb-2"></div>
      <div class="desc-line-skeleton skeleton-box mb-2 w-75"></div>
      <div class="desc-line-skeleton skeleton-box mb-2"></div>
      <div class="desc-line-skeleton skeleton-box w-50"></div>
    </div>
  </div>
</template>

<style scoped>
.product-skeleton {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.product-content-skeleton {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 60px;
}

@media (max-width: 968px) {
  .product-content-skeleton {
    grid-template-columns: 1fr;
    gap: 40px;
  }
}

.skeleton-box {
  background: linear-gradient(
    90deg,
    #f1f5f9 25%,
    #e2e8f0 50%,
    #f1f5f9 75%
  );
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s infinite;
  border-radius: 8px;
}

@keyframes skeleton-loading {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.skeleton-breadcrumbs {
  width: 300px;
  height: 20px;
  border-radius: 4px;
}

.main-image-skeleton {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 16px;
}

.thumb-skeleton {
  width: 80px;
  height: 80px;
}

.badge-skeleton {
  width: 100px;
  height: 24px;
  border-radius: 20px;
}

.title-skeleton {
  width: 90%;
  height: 48px;
}

.price-skeleton {
  width: 200px;
  height: 60px;
}

.quantity-label-skeleton {
  width: 120px;
  height: 16px;
}

.quantity-input-skeleton {
  width: 140px;
  height: 40px;
}

.button-main-skeleton {
  flex-grow: 1;
  height: 56px;
  border-radius: 12px;
}

.button-sec-skeleton {
  width: 160px;
  height: 56px;
  border-radius: 12px;
}

.meta-item-skeleton {
  width: 180px;
  height: 16px;
}

.desc-title-skeleton {
  width: 200px;
  height: 28px;
}

.desc-line-skeleton {
  height: 18px;
}
</style>
