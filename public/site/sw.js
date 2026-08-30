// Hand-authored, framework-free service worker shared by both PWA scopes
// ("/" for the public site, "/dashboard" for the internal dashboard).
// Scope: cache the app shell only. Large scroll-journey videos and all API
// calls are explicitly excluded — see BYPASS_PREFIXES below.
const CACHE_VERSION = "swisscompact-shell-v1";

const BYPASS_PREFIXES = ["/media/", "/api/", "/offerte/"];

function shouldBypass(url) {
  return BYPASS_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

async function cachePut(request, response) {
  if (!response || !response.ok) return;
  if (response.headers.get("Cache-Control")?.includes("no-store")) return;
  const cache = await caches.open(CACHE_VERSION);
  await cache.put(request, response.clone());
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    await cachePut(request, response);
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const networkFetch = fetch(request)
    .then((response) => {
      cachePut(request, response);
      return response;
    })
    .catch(() => undefined);
  return cached ?? (await networkFetch) ?? fetch(request);
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("swisscompact-shell-") && name !== CACHE_VERSION)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (shouldBypass(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});
