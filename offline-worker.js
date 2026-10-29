// Zen Grains offline: the page and everything it needs are kept on the phone after the first visit.
// The page itself is asked for fresh each time (so an update shows up at once) and falls back to the kept copy;
// pictures, sound and fonts come from the kept copy. The page is kept under ./ only, never under index.html: Cloudflare
// Pages answers index.html with a redirect to ./, and a kept redirect cannot answer a page load. The room video is left to the network: phones fetch it in
// pieces, which a kept whole file cannot answer, and without it the room shows its still picture instead.
const VERSION = '__VERSION__';
const CACHE = 'zen-grain-' + VERSION;
const CORE = ['./', 'zen-room.jpg', 'zen-room.mp3', 'zen-night.jpg', 'zen-flame.png', 'zen-chime.png', 'zen-lantern.png',
  'icon-192.png', 'icon-512.png', 'icon-180.png', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('zen-grain-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || /\.(mp4|webm)$/.test(url.pathname)) return;
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !fonts) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./', copy)); return res; })
      .catch(() => caches.match('./')));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});
