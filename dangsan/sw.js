// 옛 주소 정리 — 설치돼 있던 옛 앱을 지우고 새 주소로 보낸다
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('dangsan')).map(k => caches.delete(k))))
  .then(() => self.registration.unregister()).then(() => self.clients.matchAll()).then(cs => cs.forEach(c => c.navigate('../1ndcapp/')))));
