// Cauldron Service Worker
// Caches the app shell for offline load.
// Audio (cdn1.suno.ai) is always fetched live — never cached.

const CACHE = 'cauldron-v1';
const SHELL  = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Never intercept Suno CDN audio — let it stream directly
  if(e.request.url.includes('cdn1.suno.ai') ||
     e.request.url.includes('suno.ai') ||
     e.request.url.includes('fonts.googleapis.com') ||
     e.request.url.includes('fonts.gstatic.com')){
    return; // browser handles it natively
  }

  // App shell: cache-first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
