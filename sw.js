/* ADSC service worker.
 *
 * Goals, in order: never serve a stale event, never show a dead page on a bad
 * connection, and never get in the way of the third parties we depend on
 * (JotForm, MailerLite, PayPal) -- those always go straight to the network.
 *
 * Bump CACHE_VERSION to retire every old cache on the next visit.
 */
const CACHE_VERSION = "adsc-v1";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const DATA_CACHE = `${CACHE_VERSION}-data`;
const OFFLINE_URL = "/offline.html";

// Kept deliberately small: the shell, the scripts that render it, and the
// icons. Event JSON is intentionally absent -- it is fetched fresh.
const PRECACHE = [
  "/",
  "/index.html",
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/js/events.js",
  "/js/blogs.js",
  "/js/photos.js",
  "/js/testimonials.js",
  "/js/membership.js",
  "/js/calendar.js",
  "/js/ics.js",
  "/js/eventtime.js",
  "/js/pwa.js",
  "/assets/logo.png",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(async (cache) => {
      // One missing file must not fail the whole install, so each URL is
      // cached on its own and failures are tolerated.
      await Promise.allSettled(
        PRECACHE.map((url) => cache.add(new Request(url, { cache: "reload" })))
      );
      await self.skipWaiting();
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function isDataRequest(url) {
  return url.pathname.startsWith("/_data/");
}

/** Fresh if we can get it, cached if we cannot. Used for pages and event data. */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

/** Instant from cache, refreshed in the background. Used for static assets. */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || network.then((r) => r || Promise.reject(new Error("offline")));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Third-party calls (forms, email signup, payments, fonts) are left alone.
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      networkFirst(request, SHELL_CACHE).catch(async () => {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match(OFFLINE_URL)) || Response.error();
      })
    );
    return;
  }

  if (isDataRequest(url)) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  event.respondWith(staleWhileRevalidate(request).catch(() => Response.error()));
});

/* ---- Push notifications ----------------------------------------------
 * The handlers below are live, but nothing sends to them yet: web push needs
 * a server holding the VAPID private key and the subscription list. Until
 * that exists, event reminders ride on the calendar alarms written by
 * js/ics.js. See the PWA notes in README/CONTEXT before wiring a sender.
 */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (err) {
    payload = { body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "Autism Dads Social Club";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/assets/icons/icon-192.png",
      badge: "/assets/icons/icon-192.png",
      tag: payload.tag || "adsc",
      data: { url: payload.url || "/#events" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/#events";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
