// 오프라인 — 한 번 연 뒤엔 네트워크 없이도 판을 진행할 수 있게. 버전은 묶기 스크립트가 바꾼다
const CACHE = '1ndcapp-b08f227299';
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', 'index.html', 'app.css', 'core/dom_stub.js', 'core/app.js', 'core/native_core.js'])).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('1ndcapp-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    const r = await fetch(e.request); if (r.ok) c.put(e.request, r.clone()); return r;
  }).catch(() => fetch(e.request)));
});
