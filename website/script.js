const header = document.querySelector(".site-header");
const menuButton = document.querySelector(".menu-button");
const mobileNav = document.querySelector(".mobile-nav");
const revealItems = document.querySelectorAll(".reveal");

function syncHeader() {
  header?.setAttribute("data-elevated", window.scrollY > 32 ? "true" : "false");
}

syncHeader();
window.addEventListener("scroll", syncHeader, { passive: true });

menuButton?.addEventListener("click", () => {
  const isOpen = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!isOpen));
  if (mobileNav) mobileNav.hidden = isOpen;
});

mobileNav?.addEventListener("click", (event) => {
  if (event.target instanceof HTMLAnchorElement) {
    mobileNav.hidden = true;
    menuButton?.setAttribute("aria-expanded", "false");
  }
});

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }
    },
    { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
  );
  revealItems.forEach((item) => observer.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

const showcaseRoot = document.querySelector("[data-showcase]");
if (showcaseRoot) {
  const tabs = showcaseRoot.querySelectorAll("[data-showcase-tab]");
  const panels = showcaseRoot.querySelectorAll("[data-showcase-panel]");
  const preview = showcaseRoot.querySelector("[data-showcase-preview]");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const key = tab.getAttribute("data-showcase-tab");
      if (!key) return;
      tabs.forEach((item) => item.classList.toggle("is-active", item === tab));
      panels.forEach((panel) => {
        panel.classList.toggle("is-active", panel.getAttribute("data-showcase-panel") === key);
      });
      const img = tab.getAttribute("data-image");
      const alt = tab.getAttribute("data-alt");
      if (preview instanceof HTMLImageElement && img) {
        preview.src = img;
        if (alt) preview.alt = alt;
      }
    });
  });
}

const carouselRoot = document.querySelector("[data-carousel]");
if (carouselRoot) {
  const track = carouselRoot.querySelector("[data-carousel-track]");
  const slides = carouselRoot.querySelectorAll("[data-carousel-slide]");
  const dots = carouselRoot.querySelectorAll("[data-carousel-dot]");
  let index = 0;
  let timer = 0;

  const goTo = (next) => {
    index = (next + slides.length) % slides.length;
    track?.style.setProperty("--carousel-index", String(index));
    dots.forEach((dot, i) => dot.classList.toggle("is-active", i === index));
    slides.forEach((slide, i) => slide.classList.toggle("is-active", i === index));
  };

  dots.forEach((dot, i) => {
    dot.addEventListener("click", () => {
      goTo(i);
      window.clearInterval(timer);
      timer = window.setInterval(() => goTo(index + 1), 6000);
    });
  });

  if (slides.length > 1) {
    goTo(0);
    timer = window.setInterval(() => goTo(index + 1), 6000);
  }
}
