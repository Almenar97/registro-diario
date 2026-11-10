// Permite usar la app sin conexión.
// Estrategia: abre al instante con la copia guardada y, si hay conexión, descarga la versión
// más reciente en segundo plano (se verá la próxima vez que abras la app).
const VERSION = 'registro-v7';
const FILES = [
  './', './index.html', './styles.css', './app.js', './pdf.js', './exercises.js',
  './vendor/jspdf.umd.min.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  // Una sola clave por archivo (sin «?v=…»), la misma con la que se guardan al instalar
  const key = req.mode === 'navigate'
    ? new URL('./index.html', self.registration.scope).href
    : url.origin + url.pathname;

  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const cached = await cache.match(key);
    const network = fetch(req, { cache: 'no-cache' })
      .then((res) => { if (res.ok) cache.put(key, res.clone()); return res; })
      .catch(() => null);
    if (cached) { e.waitUntil(network); return cached; }
    return (await network) || new Response('Sin conexión', { status: 503 });
  }));
});
