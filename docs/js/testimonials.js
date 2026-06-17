/**
 * Testimonials slider — centered "peek" carousel: the active quote is full
 * size/opacity in the middle, with dimmed, scaled-down previews of the
 * previous and next quotes peeking on each side. Cross-fades + slides between
 * them, loops seamlessly (cloned end slides), and supports arrows, dots,
 * autoplay (pauses on hover/focus), swipe, and keyboard.
 *
 * Autoplay always runs (it's pausable); reduced-motion only makes the
 * transition instant instead of animated. The "animating" lock is cleared by a
 * timeout rather than transitionend so a missed/again-equal transition can
 * never stall the loop.
 *
 * Pure index math (wrapIndex) is unit-tested in tests/testimonials.test.js.
 */

export function wrapIndex(i, n) {
  if (!n || n <= 0) return 0;
  return ((i % n) + n) % n;
}

const AUTOPLAY_MS = 6000;
const ANIM_MS = 600; // keep in sync with the .test-track CSS transition

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

  // Clone first/last so the loop is seamless even with side peeks.
  const headClone = realSlides[n - 1].cloneNode(true);
  const tailClone = realSlides[0].cloneNode(true);
  [headClone, tailClone].forEach((c) => { c.dataset.clone = "1"; c.setAttribute("aria-hidden", "true"); });
  track.insertBefore(headClone, realSlides[0]);
  track.appendChild(tailClone);
  const slides = Array.from(track.querySelectorAll(".test-card")); // n + 2

  let pos = 1;            // index into `slides`; 1 == first real slide
  let animating = false;
  let settleTimer = null;

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
      void track.offsetWidth; // flush so a later change can animate
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

  function normalize() {
    if (pos > n) pos = 1;
    else if (pos < 1) pos = n;
  }

  function move() {
    animating = true;
    center(true);
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      animating = false;
      if (pos > n || pos < 1) { normalize(); center(false); }
    }, (reduceMotion ? 20 : ANIM_MS) + 40);
  }

  function step(delta) {
    if (animating) return;
    pos += delta;
    move();
  }
  function goTo(real) {
    if (animating) return;
    pos = real + 1;
    move();
  }

  // Autoplay (always on; pausable)
  let timer = null;
  function start() { stop(); timer = window.setInterval(() => step(1), AUTOPLAY_MS); }
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

  // Keep centered on resize / when fonts/layout settle
  let raf = null;
  window.addEventListener("resize", () => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => center(false));
  });
  window.addEventListener("load", () => center(false));

  center(false);
  start();
}
