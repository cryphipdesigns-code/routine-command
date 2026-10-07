const CACHE_NAME = "routine-command-shell-v12";
const scopePath = new URL(self.registration.scope).pathname;
const APP_SHELL = [scopePath, `${scopePath}manifest.webmanifest`, `${scopePath}icon.svg`];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("routine-command-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(scopePath, copy));
            return response;
        })
        .catch(() => caches.match(scopePath)),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});

self.addEventListener("push", (event) => {
  let message = {};
  try { message = event.data?.json() ?? {}; } catch { /* Show a visible fallback, required by Safari. */ }
  const data = message.data && typeof message.data === "object" ? message.data : {};
  event.waitUntil(Promise.all([
    self.registration.showNotification(message.title || "Routine Command", {
      body: message.body || "Your next choice is waiting. Open Routine Command for a check-in.",
      tag: message.tag || "routine-command-check-in", icon: `${scopePath}icon.svg`, badge: `${scopePath}icon.svg`,
      data, requireInteraction: false,
    }),
    data.badgeEnabled && Number.isFinite(data.remaining) && "setAppBadge" in self.navigator
      ? data.remaining > 0 ? self.navigator.setAppBadge(data.remaining) : self.navigator.clearAppBadge()
      : Promise.resolve(),
  ]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let target = new URL(scopePath, self.location.origin);
  try {
    const requested = new URL(event.notification.data?.url || target.href);
    if (requested.origin === self.location.origin && requested.pathname === scopePath) target = requested;
  } catch { /* Keep the app's own URL. */ }
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).pathname === scopePath && "focus" in client) {
        await client.navigate(target.href);
        return client.focus();
      }
    }
    return self.clients.openWindow(target.href);
  })());
});
