<template>
  <div class="cart-item-card" :class="{ 'is-removing': isRemoving }">
    <div class="cart-item-body">
      <div class="item-image-wrapper">
        <img
          :src="getProductImage(item.product)"
          :alt="item.product?.name"
          class="item-image"
        />
        <div class="item-badge" v-if="item.product?.sale_price">Sale</div>
      </div>

      <div class="item-content">
        <div class="item-info">
          <NuxtLink :to="`/product/${item.product_id}`" class="item-title">
            {{ item.product?.name }}
          </NuxtLink>
          <div class="item-meta">
            <span class="item-sku" v-if="item.product?.sku"
              >SKU: {{ item.product.sku }}</span
            >
            <span class="item-price-each"
              >{{ formatPrice(item.price) }} сом / шт.</span
            >
          </div>
        </div>

        <div class="item-controls" v-if="!readonly">
          <div class="quantity-selector">
            <button
              class="qty-btn"
              @click="handleQuantityChange(item.quantity - 1)"
              :disabled="isUpdating || item.quantity <= 1"
            >
              <i class="bi bi-dash"></i>
            </button>
            <div class="qty-display">
              <span v-if="!isUpdating">{{ item.quantity }}</span>
              <div
                v-else
                class="spinner-border spinner-border-sm text-primary"
                role="status"
              ></div>
            </div>
            <button
              class="qty-btn"
              @click="handleQuantityChange(item.quantity + 1)"
              :disabled="isUpdating"
            >
              <i class="bi bi-plus"></i>
            </button>
          </div>

          <div class="item-actions">
            <div class="item-total">
              {{ formatPrice(item.price * item.quantity) }} <span>сом</span>
            </div>
            <button
              class="remove-btn"
              @click="handleRemove"
              :disabled="isUpdating"
              title="Удалить"
            >
              <i class="bi bi-trash3"></i>
            </button>
          </div>
        </div>

        <div class="item-summary-readonly" v-else>
          <div class="readonly-qty">x{{ item.quantity }}</div>
          <div class="item-total">
            {{ formatPrice(item.price * item.quantity) }} <span>сом</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  item: {
    type: Object,
    required: true,
  },
  readonly: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["update-quantity", "remove"]);

const isUpdating = ref(false);
const isRemoving = ref(false);
const { getImageUrl } = useImageUrl();

const formatPrice = (price) => {
  return parseFloat(price).toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const getProductImage = (product) => {
  if (product?.image) {
    return getImageUrl(product.image);
  }
  return (
    product?.image_url ||
    `https://dummyimage.com/300x300/0f172a/fff&text=${product?.name || "Товар"}`
  );
};

const handleQuantityChange = async (newQty) => {
  if (newQty < 1) return;
  isUpdating.value = true;
  try {
    await emit("update-quantity", props.item.id, newQty);
  } finally {
    isUpdating.value = false;
  }
};

const handleRemove = async () => {
  isRemoving.value = true;
  try {
    await emit("remove", props.item.id);
  } catch (e) {
    isRemoving.value = false;
  }
};
</script>

<style scoped>
.cart-item-card {
  background: white;
  border-radius: 16px;
  padding: 1.25rem;
  margin-bottom: 1rem;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid rgba(0, 0, 0, 0.05);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
  animation: slideInUp 0.4s ease-out backwards;
}

@keyframes slideInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.cart-item-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.05);
  border-color: rgba(56, 189, 248, 0.3);
}

.cart-item-body {
  display: flex;
  gap: 1.5rem;
  align-items: center;
}

@media (max-width: 768px) {
  .cart-item-body {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }

  .item-image-wrapper {
    width: 100% !important;
    height: 150px !important;
  }
}

.item-image-wrapper {
  position: relative;
  width: 100px;
  height: 100px;
  flex-shrink: 0;
  border-radius: 12px;
  overflow: hidden;
  background: #f8fafc;
}

.item-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s ease;
}

.cart-item-card:hover .item-image {
  transform: scale(1.1);
}

.item-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  background: #ef4444;
  color: white;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
  text-transform: uppercase;
}

.item-content {
  flex-grow: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  width: 100%;
}

@media (max-width: 576px) {
  .item-content {
    flex-direction: column;
    align-items: flex-start;
  }
}

.item-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
  min-width: 0;
}

.item-title {
  font-size: 1.05rem;
  font-weight: 600;
  color: #1e293b;
  text-decoration: none;
  transition: color 0.2s;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.item-title:hover {
  color: #38bdf8;
}

.item-meta {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.item-sku {
  font-size: 0.75rem;
  color: #94a3b8;
  letter-spacing: 0.05em;
}

.item-price-each {
  font-size: 0.85rem;
  color: #64748b;
}

.item-controls {
  display: flex;
  align-items: center;
  gap: 2rem;
}

@media (max-width: 992px) {
  .item-controls {
    gap: 1rem;
  }
}

.quantity-selector {
  display: flex;
  align-items: center;
  background: #f1f5f9;
  padding: 4px;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.qty-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: white;
  border-radius: 8px;
  color: #1e293b;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.qty-btn:hover:not(:disabled) {
  background: #38bdf8;
  color: white;
  transform: translateY(-1px);
}

.qty-btn:active:not(:disabled) {
  transform: translateY(0);
}

.qty-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.qty-display {
  min-width: 40px;
  text-align: center;
  font-weight: 700;
  color: #1e293b;
  font-size: 1rem;
}

.item-actions {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.item-total {
  font-size: 1.15rem;
  font-weight: 800;
  color: #0f172a;
  white-space: nowrap;
}

.item-total span {
  font-size: 0.85rem;
  font-weight: 500;
  color: #64748b;
  margin-left: 2px;
}

.remove-btn {
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: #fef2f2;
  color: #ef4444;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.remove-btn:hover:not(:disabled) {
  background: #ef4444;
  color: white;
  transform: rotate(8deg) scale(1.1);
}

.is-removing {
  opacity: 0.5;
  transform: scale(0.95);
  filter: grayscale(1);
  pointer-events: none;
}

.item-summary-readonly {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-shrink: 0;
}

.readonly-qty {
  font-weight: 600;
  color: #64748b;
  background: #f1f5f9;
  padding: 4px 12px;
  border-radius: 8px;
  font-size: 0.9rem;
}

.remove-btn:active {
  transform: scale(0.9);
}
</style>
