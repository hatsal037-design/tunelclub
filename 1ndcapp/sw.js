// 오프라인 — 한 번 연 뒤엔 네트워크 없이도 판을 진행할 수 있게. 버전은 묶기 스크립트가 바꾼다
const CACHE = '1ndcapp-ba7fcd1931', MEDIA = '1ndcapp-media';   // 그림·아이콘은 판 번호와 따로 — 배포마다 버리지 않고, 받아 둔 걸 쓰며 뒤에서 새로 받는다
// 첫 화면까지 필요한 것 전부(2026-10-05). js/·js/screens/ 에 파일을 더하면 여기도 — tests/웹저장.test.js 가 빠진 걸 잡는다
const SHELL = ['./', 'index.html', 'app.css', 'manifest.json',
  'core/dom_stub.js', 'core/core_ver.js', 'core/app.js', 'core/native_core.js', 'core/engine.js', 'core/reasoner.js', 'core/replay.js',
  'lib/preact-htm.js', 'lib/supabase.js',
  'js/account.js', 'js/app.js', 'js/bgm.js', 'js/core.js', 'js/icons.js', 'js/narrator.js', 'js/nav.js', 'js/screenlink.js',
  'js/seatboard.js', 'js/settings.js', 'js/store.js', 'js/ui.js',
  'js/screens/composer.js', 'js/screens/day.js', 'js/screens/display.js', 'js/screens/friends.js', 'js/screens/game.js',
  'js/screens/library.js', 'js/screens/prep.js', 'js/screens/records.js', 'js/screens/replay.js', 'js/screens/seatdetail.js',
  'js/screens/settingsView.js', 'js/screens/stages.js', 'js/screens/today.js'];
// 설치 때는 브라우저 HTTP 캐시를 건너뛴다(cache:'reload') — 옛 파일을 새 판본 캐시에 담아 고친 배포가 안 먹던 것(2026-10-06 긴급 수정 때 겪음)
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('1ndcapp-') && k !== CACHE && k !== MEDIA).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (/\/(voice|bgm)\//.test(u.pathname)) return;   // 소리는 206(범위 응답)이라 Cache API 에 못 넣는다 — 네트워크로
  if (/\/(art|icons)\//.test(u.pathname)) {
    e.respondWith(caches.open(MEDIA).then(async c => {
      const hit = await c.match(e.request, { ignoreSearch: true });
      const net = fetch(e.request).then(r => { if (r.status === 200) c.put(e.request, r.clone()); return r; });
      if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
      return net;
    }));
    return;
  }
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    const r = await fetch(e.request); if (r.status === 200) c.put(e.request, r.clone()); return r;
  }).catch(() => fetch(e.request)));
});
