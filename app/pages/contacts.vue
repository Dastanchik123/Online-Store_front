<script setup>
const { settings, fetchPublicSettings } = useSettings();

onMounted(fetchPublicSettings);
</script>

<template>
  <div class="container py-5 min-vh-100 animate-fade-in">
    <div class="text-center mb-5 pb-3">
      <h1 class="fw-bold display-4 mb-2">Наши контакты 📞</h1>
      <p class="text-muted lead">
        Мы всегда рады помочь вам и ответить на любые вопросы
      </p>
    </div>

    <div class="row g-4">
      
      <div class="col-lg-4">
        <div
          class="card border-0 shadow-sm rounded-4 p-4 h-100 text-center hover-lift"
        >
          <div
            class="bg-primary bg-opacity-10 text-primary rounded-circle p-3 mx-auto mb-3"
            style="width: 70px; height: 70px"
          >
            <i class="bi bi-geo-alt fs-2"></i>
          </div>
          <h5 class="fw-bold mb-3">Наш адрес</h5>
          <p class="text-muted">
            {{ settings.contact_address || "г. Бишкек, ул. Чуй 114" }}
          </p>
        </div>
      </div>

      <div class="col-lg-4">
        <div
          class="card border-0 shadow-sm rounded-4 p-4 h-100 text-center hover-lift"
        >
          <div
            class="bg-success bg-opacity-10 text-success rounded-circle p-3 mx-auto mb-3"
            style="width: 70px; height: 70px"
          >
            <i class="bi bi-telephone fs-2"></i>
          </div>
          <h5 class="fw-bold mb-3">Телефоны</h5>
          <p class="text-muted mb-0">
            {{ settings.contact_phone || "+996 555 123 456" }}
          </p>
          <div class="mt-3">
            <a
              :href="settings.social_whatsapp"
              class="btn btn-sm btn-success rounded-pill px-3 me-2"
              ><i class="bi bi-whatsapp me-2"></i>WhatsApp</a
            >
            <a
              :href="settings.social_telegram"
              class="btn btn-sm btn-info text-white rounded-pill px-3"
              ><i class="bi bi-telegram me-2"></i>Telegram</a
            >
          </div>
        </div>
      </div>

      <div class="col-lg-4">
        <div
          class="card border-0 shadow-sm rounded-4 p-4 h-100 text-center hover-lift"
        >
          <div
            class="bg-info bg-opacity-10 text-info rounded-circle p-3 mx-auto mb-3"
            style="width: 70px; height: 70px"
          >
            <i class="bi bi-envelope fs-2"></i>
          </div>
          <h5 class="fw-bold mb-3">Электронная почта</h5>
          <p class="text-muted">
            {{ settings.contact_email || "info@myshop.kg" }}
          </p>
        </div>
      </div>

      
      <div class="col-lg-12 mt-4">
        <div class="card border-0 shadow-sm rounded-5 overflow-hidden">
          <div class="row g-0">
            <div class="col-lg-7">
              
              <div
                class="bg-light h-100 d-flex align-items-center justify-content-center"
                style="min-height: 400px"
              >
                <div class="text-center opacity-50">
                  <i class="bi bi-map display-1"></i>
                  <p class="fw-bold mt-2">
                    Карта (Здесь может быть Google Maps или 2GIS)
                  </p>
                </div>
              </div>
            </div>
            <div class="col-lg-5 p-5">
              <h3 class="fw-bold mb-4">Напишите нам</h3>
              <form>
                <div class="mb-3">
                  <label class="form-label small fw-bold">Ваше имя</label>
                  <input
                    type="text"
                    class="form-control rounded-3"
                    placeholder="Иван Иванов"
                  />
                </div>
                <div class="mb-3">
                  <label class="form-label small fw-bold"
                    >Ваш Email или Телефон</label
                  >
                  <input
                    type="text"
                    class="form-control rounded-3"
                    placeholder="+996 ..."
                  />
                </div>
                <div class="mb-4">
                  <label class="form-label small fw-bold">Сообщение</label>
                  <textarea
                    class="form-control rounded-3"
                    rows="4"
                    placeholder="Здравствуйте, я хотел бы уточнить..."
                  ></textarea>
                </div>
                <button
                  type="submit"
                  class="btn btn-primary w-100 rounded-pill py-3 fw-bold"
                >
                  Отправить сообщение
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hover-lift {
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}
.hover-lift:hover {
  transform: translateY(-8px);
  box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.1) !important;
}
</style>
