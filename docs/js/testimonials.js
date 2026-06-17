/**
 * Testimonials slider. One quote at a time on a stable-height stage, with
 * arrows, dots, autoplay (pauses on hover/focus), swipe, and keyboard support.
 * Autoplay is disabled when the user prefers reduced motion. Dependency-free.
 *
 * The pure index math (wrapIndex) is unit-tested in tests/testimonials.test.js.
 */

export function wrapIndex(i, n) {
  if (!n || n <= 0) return 0;
  return ((i % n) + n) % n;
}

export function init() {
  const slider = document.querySelector("[data-testimonial-slider]");
  if (!slider) return;
  const track = slider.querySelector(".test-track");
  const slides = Array.from(slider.querySelectorAll(".test-card"));
  const prevBtn = slider.querySelector(".test-arrow--prev");
  const nextBtn = slider.querySelector(".test-arrow--next");
  const dotsWrap = slider.querySelector(".test-dots");
  if (!track || slides.length === 0) return;

  const reduceMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let index = 0;
  let timer = null;

  const dots = slides.map((_, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "test-dot";
    b.setAttribute("aria-label", `Show testimonial ${i + 1} of ${slides.length}`);
    b.addEventListener("click", () => {
      go(i);
      restart();
    });
    dotsWrap && dotsWrap.appendChild(b);
    return b;
  });

  function render() {
    track.style.transform = `translateX(-${index * 100}%)`;
    slides.forEach((s, i) => s.setAttribute("aria-hidden", i === index ? "false" : "true"));
    dots.forEach((d, i) => d.classList.toggle("is-active", i === index));
  }

  function go(i) {
    index = wrapIndex(i, slides.length);
    render();
  }

  function start() {
    if (reduceMotion) return;
    stop();
    timer = window.setInterval(() => go(index + 1), 7000);
  }
  function stop() {
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
  }
  function restart() {
    stop();
    start();
  }

  prevBtn && prevBtn.addEventListener("click", () => { go(index - 1); restart(); });
  nextBtn && nextBtn.addEventListener("click", () => { go(index + 1); restart(); });

  slider.addEventListener("mouseenter", stop);
  slider.addEventListener("mouseleave", start);
  slider.addEventListener("focusin", stop);
  slider.addEventListener("focusout", start);

  slider.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { go(index - 1); restart(); }
    else if (e.key === "ArrowRight") { go(index + 1); restart(); }
  });

  // Touch swipe
  let startX = 0, dx = 0, swiping = false;
  track.addEventListener("touchstart", (e) => { startX = e.touches[0].clientX; dx = 0; swiping = true; stop(); }, { passive: true });
  track.addEventListener("touchmove", (e) => { if (swiping) dx = e.touches[0].clientX - startX; }, { passive: true });
  track.addEventListener("touchend", () => {
    if (swiping && Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
    swiping = false;
    start();
  });

  render();
  start();
}
