/**
 * Testimonials slider — centered "peek" carousel: the active quote is full
 * size/opacity in the middle, with dimmed, scaled-down previews of the
 * previous and next quotes peeking on each side. Cross-fades + slides between
 * them, loops seamlessly (cloned end slides), and supports arrows, dots,
 * autoplay (pauses on hover/focus), swipe, and keyboard. Autoplay and the
 * animations back off when the user prefers reduced motion. Dependency-free.
 *
 * Pure index math (wrapIndex) is unit-tested in tests/testimonials.test.js.
 */

export function wrapIndex(i, n) {
  if (!n || n <= 0) return 0;
  return ((i % n) + n) % n;
}

export function init() {
  const slider = document.querySelector("[data-testimonial-slider]");
  if (!slider) return;
  const track = slider.querySelector(".test-track");
  const viewport = slider.querySelector(".test-viewport");
  const realSlides = Array.from(slider.querySelectorAll(".test-card"));
  const dotsWrap = slider.querySelector(".test-dots");
  const prevBtn = slider.querySelector(".test-arrow--prev");
  const nextBtn = slider.querySelector(".test-arrow--next");
  const n = realSlides.length;
  if (!track || !viewport || n === 0) return;

  const reduceMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Clone the first and last slides so the loop is seamless even with side peeks.
  const headClone = realSlides[n - 1].cloneNode(true);
  const tailClone = realSlides[0].cloneNode(true);
  [headClone, tailClone].forEach((c) => { c.dataset.clone = "1"; c.setAttribute("aria-hidden", "true"); });
  track.insertBefore(headClone, realSlides[0]);
  track.appendChild(tailClone);
  const slides = Array.from(track.querySelectorAll(".test-card")); // n + 2

  let pos = 1;            // index into `slides`; 1 == first real slide
  let animating = false;

  // Dots (one per real slide)
  const dots = realSlides.map((_, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "test-dot";
    b.setAttribute("aria-label", `Show testimonial ${i + 1} of ${n}`);
    b.addEventListener("click", () => { goTo(i); restart(); });
    dotsWrap && dotsWrap.appendChild(b);
    return b;
  });

  function center(animate) {
    const slide = slides[pos];
    const tx = viewport.clientWidth / 2 - (slide.offsetLeft + slide.offsetWidth / 2);
    if (!animate || reduceMotion) {
      track.style.transition = "none";
      track.style.transform = `translateX(${tx}px)`;
      void track.offsetWidth; // flush so the next change can animate
      track.style.transition = "";
    } else {
      track.style.transform = `translateX(${tx}px)`;
    }
    slides.forEach((s, i) => {
      const active = i === pos;
      s.classList.toggle("is-active", active);
      s.setAttribute("aria-hidden", active ? "false" : "true");
    });
    const real = wrapIndex(pos - 1, n);
    dots.forEach((d, i) => d.classList.toggle("is-active", i === real));
  }

  function step(delta) {
    if (animating) return;
    pos += delta;
    if (reduceMotion) { normalize(); center(false); return; }
    animating = true;
    center(true);
  }
  function goTo(real) {
    if (animating) return;
    pos = real + 1;
    if (reduceMotion) { center(false); return; }
    animating = true;
    center(true);
  }
  function normalize() {
    if (pos > n) pos = 1;
    else if (pos < 1) pos = n;
  }

  track.addEventListener("transitionend", (e) => {
    if (e.target !== track || e.propertyName !== "transform") return;
    animating = false;
    if (pos > n || pos < 1) { normalize(); center(false); }
  });

  // Autoplay
  let timer = null;
  function start() { if (reduceMotion) return; stop(); timer = window.setInterval(() => step(1), 7000); }
  function stop() { if (timer) { window.clearInterval(timer); timer = null; } }
  function restart() { stop(); start(); }

  prevBtn && prevBtn.addEventListener("click", () => { step(-1); restart(); });
  nextBtn && nextBtn.addEventListener("click", () => { step(1); restart(); });

  slider.addEventListener("mouseenter", stop);
  slider.addEventListener("mouseleave", start);
  slider.addEventListener("focusin", stop);
  slider.addEventListener("focusout", start);
  slider.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { step(-1); restart(); }
    else if (e.key === "ArrowRight") { step(1); restart(); }
  });

  // Touch swipe
  let startX = 0, dx = 0, swiping = false;
  track.addEventListener("touchstart", (e) => { startX = e.touches[0].clientX; dx = 0; swiping = true; stop(); }, { passive: true });
  track.addEventListener("touchmove", (e) => { if (swiping) dx = e.touches[0].clientX - startX; }, { passive: true });
  track.addEventListener("touchend", () => {
    if (swiping && Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
    swiping = false;
    start();
  });

  // Keep centered on resize
  let raf = null;
  window.addEventListener("resize", () => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => center(false));
  });

  center(false);
  start();
}
