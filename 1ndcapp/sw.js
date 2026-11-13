// 진행 웹앱을 내렸다(2026-11-13 햇살님 «진행 빼고 참가랑 피드만»). 예전에 진행 웹을 열어 이 일꾼이 깔린 브라우저에서
// 옛 화면을 계속 꺼내 주지 않게 — 새 판으로 바뀌면 캐시를 모두 지우고 스스로 물러난다. 요청은 가로채지 않는다
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('1ndcapp-')).map(k => caches.delete(k)))).then(() => self.registration.unregister()).then(() => self.clients.matchAll({ type: 'window' })).then(cs => cs.forEach(c => c.navigate(c.url)))); });
