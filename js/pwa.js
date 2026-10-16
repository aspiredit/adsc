/* Progressive web app glue: registers the service worker and offers an
 * "add to home screen" prompt.
 *
 * Android/Chrome fire `beforeinstallprompt`, which we stash and replay from
 * our own button. iOS Safari fires nothing and has no install API at all, so
 * there we show the manual Share-sheet instructions instead. Either way the
 * banner appears once and stays dismissed.
 */
const DISMISS_KEY = "adsc:install-dismissed";
const DISMISS_DAYS = 60;

let deferredPrompt = null;

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function isIOS() {
  return (
    /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
    // iPadOS 13+ reports as a Mac, so fall back to a touch check.
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1)
  );
}

function recentlyDismissed() {
  try {
    const at = Number(window.localStorage.getItem(DISMISS_KEY));
    if (!at) return false;
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch (err) {
    return false;
  }
}

function rememberDismissal() {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch (err) {
    /* private mode — the banner simply returns next visit */
  }
}

function injectStyles() {
  if (document.getElementById("adsc-pwa-styles")) return;
  const style = document.createElement("style");
  style.id = "adsc-pwa-styles";
  style.textContent = `
    .adsc-install {
      position: fixed; left: 16px; right: 16px; bottom: 16px; z-index: 9000;
      max-width: 520px; margin: 0 auto;
      display: flex; align-items: center; gap: 14px;
      padding: 14px 16px;
      background: #FFFFFF; color: #1A2B30;
      border: 1px solid #D8E4ED; border-radius: 14px;
      box-shadow: 0 10px 30px rgba(26,43,48,.18);
      font-family: "Source Sans 3", system-ui, sans-serif;
      transform: translateY(140%); transition: transform .32s ease;
    }
    .adsc-install.is-visible { transform: translateY(0); }
    .adsc-install img { width: 40px; height: 40px; border-radius: 9px; flex: none; }
    .adsc-install-text { flex: 1; min-width: 0; }
    .adsc-install-text strong { display: block; font-size: .97rem; }
    .adsc-install-text span { display: block; font-size: .83rem; color: #4A5A60; line-height: 1.4; }
    .adsc-install button {
      font: inherit; font-weight: 600; cursor: pointer; border-radius: 999px;
      border: 0; padding: 9px 18px; background: #1F5E96; color: #fff; flex: none;
    }
    .adsc-install button:hover { background: #17486f; }
    .adsc-install .adsc-install-close {
      background: none; color: #7B8A8F; font-size: 1.4rem; line-height: 1;
      padding: 4px 8px; flex: none;
    }
    .adsc-install .adsc-install-close:hover { background: none; color: #1A2B30; }
    @media (max-width: 420px) {
      .adsc-install { flex-wrap: wrap; }
      .adsc-install-text { flex-basis: 100%; order: 2; }
      .adsc-install button:not(.adsc-install-close) { order: 3; flex: 1; }
    }
  `;
  document.head.appendChild(style);
}

function showBanner({ body, actionLabel, onAction }) {
  injectStyles();
  const bar = document.createElement("div");
  bar.className = "adsc-install";
  bar.setAttribute("role", "dialog");
  bar.setAttribute("aria-label", "Install the ADSC app");

  const icon = document.createElement("img");
  icon.src = "assets/icons/icon-192.png";
  icon.alt = "";

  const text = document.createElement("div");
  text.className = "adsc-install-text";
  const title = document.createElement("strong");
  title.textContent = "Keep ADSC on your home screen";
  const sub = document.createElement("span");
  sub.textContent = body;
  text.append(title, sub);

  const close = document.createElement("button");
  close.type = "button";
  close.className = "adsc-install-close";
  close.setAttribute("aria-label", "Dismiss");
  close.textContent = "×";

  const dismiss = () => {
    rememberDismissal();
    bar.classList.remove("is-visible");
    setTimeout(() => bar.remove(), 350);
  };
  close.addEventListener("click", dismiss);

  bar.append(icon, text);
  if (actionLabel) {
    const action = document.createElement("button");
    action.type = "button";
    action.textContent = actionLabel;
    action.addEventListener("click", async () => {
      await onAction();
      dismiss();
    });
    bar.append(action);
  }
  bar.append(close);

  document.body.appendChild(bar);
  requestAnimationFrame(() => bar.classList.add("is-visible"));
}

function maybeOfferInstall() {
  if (isStandalone() || recentlyDismissed()) return;

  if (deferredPrompt) {
    showBanner({
      body: "Install the app for one-tap access to events and RSVPs.",
      actionLabel: "Install",
      onAction: async () => {
        const prompt = deferredPrompt;
        deferredPrompt = null;
        prompt.prompt();
        await prompt.userChoice;
      },
    });
    return;
  }

  if (isIOS()) {
    showBanner({
      body: "Tap the Share button, then “Add to Home Screen”.",
      actionLabel: null,
    });
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  // file:// and other insecure origins can't host a worker.
  if (location.protocol !== "https:" && location.hostname !== "localhost") return;

  navigator.serviceWorker
    .register("/sw.js", { scope: "/" })
    .then((registration) => {
      registration.addEventListener("updatefound", () => {
        const incoming = registration.installing;
        if (!incoming) return;
        incoming.addEventListener("statechange", () => {
          // A new worker parked behind the current one means fresh content is
          // ready; take it on the next navigation rather than yanking the page
          // out from under whoever is reading it.
          if (incoming.state === "installed" && navigator.serviceWorker.controller) {
            incoming.postMessage("SKIP_WAITING");
          }
        });
      });
    })
    .catch(() => {
      /* registration failures are non-fatal — the site works without it */
    });
}

export function init() {
  registerServiceWorker();

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    maybeOfferInstall();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    rememberDismissal();
  });

  // iOS never fires beforeinstallprompt, so give the page a moment to settle
  // and then offer the manual route.
  setTimeout(maybeOfferInstall, 2500);
}
