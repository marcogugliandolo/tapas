// Que Tapa!: guarda la web en el móvil para que abra aunque no haya cobertura en el bar.
// Con conexión siempre se pide la versión nueva (y se guarda); sin conexión, o si la red tarda
// demasiado, se sirve la guardada. Las fotos no cambian nunca: se guardan aparte y se sirven de ahí.

const CACHE = 'quetapa-v1';
const FOTOS = 'quetapa-fotos-v1';
const MAX_FOTOS = 150;
const CORE = [
  './', 'index.html', 'style.css', 'app.js', 'i18n.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png',
  'vendor/maplibre-gl.js', 'vendor/maplibre-gl.css',
  'vendor/fonts/atkinson-hyperlegible-next-latin-400-normal.woff2',
  'vendor/fonts/atkinson-hyperlegible-next-latin-700-normal.woff2',
  'vendor/fonts/bricolage-grotesque-latin-700-normal.woff2',
];
const LATER = ['data/map-style.json', 'data/streets.json'];
const NETWORK_WAIT_MS = 3500;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE);
    await Promise.allSettled(LATER.map((url) => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => event.waitUntil((async () => {
  for (const name of await caches.keys()) if (name !== CACHE && name !== FOTOS) await caches.delete(name);
  await self.clients.claim();
})()));

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  const fromNetwork = fetch(request).then((response) => {
    if (response.ok && response.type === 'basic') cache.put(request, response.clone());
    return response;
  });
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_WAIT_MS, null));
  try {
    const first = await Promise.race([fromNetwork, timeout]);
    if (first) return first;
  } catch { /* sin red: se mira lo guardado */ }
  const saved = await cache.match(request, { ignoreSearch: true });
  if (saved) return saved;
  if (request.mode === 'navigate') {
    const page = await cache.match('index.html');
    if (page) return page;
  }
  return fromNetwork;
}

async function photo(request) {
  const cache = await caches.open(FOTOS);
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    const keys = await cache.keys();
    for (const old of keys.slice(0, Math.max(0, keys.length - MAX_FOTOS))) await cache.delete(old);
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/fotos/')) { event.respondWith(photo(request)); return; }
  // La API tiene que ser fresca: no se guarda aquí (la web guarda la última portada por su cuenta).
  if (url.pathname.startsWith('/api/')) return;
  event.respondWith(networkFirst(request));
});
