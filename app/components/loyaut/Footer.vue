<script setup>
const currentYear = new Date().getFullYear();
const { settings } = useSettings();
</script>

<template>
  <footer class="footer-section">
    <div class="container overflow-hidden">
      
      <div class="footer-cta pt-5 pb-5">
        <div class="row g-4 justify-content-center">
          <div class="col-xl-4 col-md-6">
            <div class="single-cta d-flex align-items-center">
              <div class="cta-icon">
                <i class="bi bi-geo-alt-fill"></i>
              </div>
              <div class="cta-text ms-3">
                <h4>Наш адрес</h4>
                <span>{{
                  settings.contact_address || "Г. Бишкек, ул. Чуй 1"
                }}</span>
              </div>
            </div>
          </div>
          <div class="col-xl-4 col-md-6">
            <div class="single-cta d-flex align-items-center">
              <div class="cta-icon">
                <i class="bi bi-telephone-fill"></i>
              </div>
              <div class="cta-text ms-3">
                <h4>Наши контакты</h4>
                <span>{{ settings.contact_phone || "+996 555 123 456" }}</span>
              </div>
            </div>
          </div>
          <div class="col-xl-4 col-md-6">
            <div class="single-cta d-flex align-items-center">
              <div class="cta-icon">
                <i class="bi bi-envelope-open-fill"></i>
              </div>
              <div class="cta-text ms-3">
                <h4>Электронная почта</h4>
                <span>{{ settings.contact_email || "info@myshop.kg" }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      
      <div class="footer-content pt-5 pb-5">
        <div class="row g-5">
          <div class="col-xl-4 col-lg-4">
            <div class="footer-widget">
              <div class="footer-logo mb-4">
                <NuxtLink to="/" class="logo d-flex align-items-center gap-2">
                  
                  <span class="logo-text">{{
                    settings.site_name || "MyShop"
                  }}</span>
                </NuxtLink>
              </div>
              <div class="footer-text mb-4">
                <p>
                  Мы предлагаем качественные товары для дома, строительства и
                  ремонта. Быстрая доставка, гарантия качества и отличный сервис
                  — наши главные приоритеты.
                </p>
              </div>
              <div class="footer-social-icon">
                <h6 class="text-white fw-bold mb-3">Подписывайтесь</h6>
                <div class="social-links d-flex gap-2">
                  <a
                    v-if="settings.social_facebook"
                    :href="settings.social_facebook"
                    class="social-link facebook"
                    target="_blank"
                    ><i class="bi bi-facebook"></i
                  ></a>
                  <a
                    v-if="settings.social_instagram"
                    :href="settings.social_instagram"
                    class="social-link instagram"
                    target="_blank"
                    ><i class="bi bi-instagram"></i
                  ></a>
                  <a
                    v-if="settings.social_telegram"
                    :href="settings.social_telegram"
                    class="social-link telegram"
                    target="_blank"
                    ><i class="bi bi-telegram"></i
                  ></a>
                  <a
                    v-if="settings.social_whatsapp"
                    :href="settings.social_whatsapp"
                    class="social-link whatsapp"
                    target="_blank"
                    ><i class="bi bi-whatsapp"></i
                  ></a>
                </div>
              </div>
            </div>
          </div>
          <div class="col-xl-4 col-lg-4 col-md-6">
            <div class="footer-widget">
              <div class="footer-widget-heading">
                <h3>Преимущества</h3>
              </div>
              <ul class="footer-links-list">
                <li><NuxtLink to="/catalog">Огромный выбор</NuxtLink></li>
                <li><NuxtLink to="/">Быстрая доставка</NuxtLink></li>
                <li><NuxtLink to="/">Бонусная программа</NuxtLink></li>
                <li><NuxtLink to="/">Гарантия лучшей цены</NuxtLink></li>
                <li><NuxtLink to="/">Сервисный центр</NuxtLink></li>
                <li><NuxtLink to="/">Личный кабинет</NuxtLink></li>
              </ul>
            </div>
          </div>
          <div class="col-xl-4 col-lg-4 col-md-6">
            <div class="footer-widget">
              <div class="footer-widget-heading">
                <h3>Новости магазина</h3>
              </div>
              <div class="footer-text mb-4">
                <p>
                  Будьте в курсе всех новинок и закрытых распродаж. Обещаем
                  присылать только самое интересное!
                </p>
              </div>
              <div class="subscribe-form mt-4">
                <form @submit.prevent>
                  <div class="input-group">
                    <input
                      type="email"
                      class="form-control"
                      placeholder="Ваш Email"
                    />
                    <button class="btn btn-primary px-4">
                      <i class="bi bi-send"></i>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    
    <div class="copyright-area">
      <div class="container">
        <div class="row align-items-center">
          <div class="col-md-6 text-center text-md-start mb-3 mb-md-0">
            <div class="copyright-text">
              <p>
                © {{ currentYear }}
                <span class="text-primary fw-bold">MyShop</span>. Все права
                защищены.
              </p>
            </div>
          </div>
          <div class="col-md-6 text-center text-md-end">
            <div class="footer-menu">
              <ul
                class="d-flex justify-content-center justify-content-md-end gap-4 list-unstyled mb-0"
              >
                <li><NuxtLink to="/">О нас</NuxtLink></li>
                <li><NuxtLink to="/">Политика</NuxtLink></li>
                <li><NuxtLink to="/">Доставка</NuxtLink></li>
                <li><NuxtLink to="/">Контакты</NuxtLink></li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.logo {
  display: flex;
  align-items: center;
  gap: 10px;
}
.logo-accent {
  color: #38bdf8;
}
.footer-section {
  background: #0f172a;
  color: #94a3b8;
  position: relative;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.footer-cta {
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.cta-icon {
  width: 50px;
  height: 50px;
  background: rgba(56, 189, 248, 0.1);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.cta-icon i {
  color: #38bdf8;
  font-size: 1.5rem;
}

.cta-text h4 {
  color: #f8fafc;
  font-size: 1.1rem;
  font-weight: 700;
  margin-bottom: 0px;
}

.cta-text span {
  font-size: 0.9rem;
  color: #64748b;
}

.logo-text {
  color: #f8fafc;
  text-decoration: none;
  border-bottom: 0;
  font-size: 1.8rem;
  font-weight: 800;
  text-decoration: none;
  letter-spacing: -1px;
}

.footer-text p {
  font-size: 0.95rem;
  line-height: 1.7;
}

.footer-widget-heading h3 {
  color: #f8fafc;
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 30px;
  position: relative;
}

.footer-widget-heading h3::after {
  content: "";
  position: absolute;
  left: 0;
  bottom: -10px;
  height: 2px;
  width: 40px;
  background: #38bdf8;
}

.footer-links-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.footer-links-list a {
  color: #94a3b8;
  text-decoration: none;
  font-size: 0.9rem;
  transition: all 0.3s ease;
}

.footer-links-list a:hover {
  color: #38bdf8;
  padding-left: 5px;
}

.social-link {
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #f8fafc;
  text-decoration: none;
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.social-link:hover {
  background: #38bdf8;
  color: white;
  transform: translateY(-5px);
}

.subscribe-form input {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: white;
  padding: 12px 15px;
  border-radius: 10px 0 0 10px;
}

.subscribe-form input:focus {
  background: rgba(255, 255, 255, 0.08);
  box-shadow: none;
  border-color: #38bdf8;
}

.subscribe-form button {
  border-radius: 0 10px 10px 0;
  border: none;
}

.copyright-area {
  background: #020617;
  padding: 25px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.copyright-text p {
  font-size: 0.85rem;
  margin-bottom: 0;
}

.footer-menu a {
  font-size: 0.85rem;
  color: #64748b;
  text-decoration: none;
  transition: color 0.3s;
}

.footer-menu a:hover {
  color: #38bdf8;
}

@media (max-width: 767px) {
  .footer-links-list {
    grid-template-columns: 1fr;
  }

  .footer-widget-heading h3 {
    margin-bottom: 20px;
  }
}
.logo-img {
  height: 30px;
  width: auto;
  object-fit: contain;
}
</style>
