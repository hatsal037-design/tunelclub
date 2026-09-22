// 당산나무 — 서비스 워커 (오프라인 캐시)
const CACHE = 'dangsan-v288';
/* 셸 — 이게 없으면 앱이 아예 안 열린다. 하나라도 실패하면 설치를 접는다.
   (2026-09-09) 예전엔 셸까지 개별 실패를 삼키고 새 캐시를 채택해서,
   업데이트 도중 네트워크가 끊기면 «오프라인에서 앱이 안 열리는» 상태가 될 수 있었다. */
const SHELL = ['./', './index.html', './manifest.json'];
/* 있으면 좋지만 없어도 앱은 돈다 — 개별 실패를 허용한다 */
const ASSETS = ['./icon-192.png', './icon-512.png', './apple-touch-icon.png', './favicon-32.png', './lib/supabase.js',   // 서버 라이브러리는 앱 안에 둔다 — 오프라인에서도 앱이 열려야 한다 (2026-09-13)
  './img/home-tree-v1.jpg', './img/home-clocktower-v1.jpg', './img/icons/arrow_brush.webp', './img/icons/arrow_leaf.webp', './img/icons/book.webp', './img/icons/brush.webp', './img/icons/claw-scratches-1024-v1.webp', './img/icons/cushion.webp', './img/icons/footprints.webp', './img/icons/job_baemjabi.webp', './img/icons/job_doksal.webp', './img/icons/job_gakseori.webp', './img/icons/job_gangtaegong.webp', './img/icons/job_geumjul.webp', './img/icons/job_haemongga.webp', './img/icons/job_hunjang.webp', './img/icons/job_imugi.webp', './img/icons/job_janguisa.webp', './img/icons/job_jeomsul.webp', './img/icons/job_jujeong.webp', './img/icons/job_kkamagwi.webp', './img/icons/job_mangnani.webp', './img/icons/job_mudang.webp', './img/icons/job_nageune.webp', './img/icons/job_sangun.webp', './img/icons/job_sapsal.webp', './img/icons/job_sejak.webp', './img/icons/job_uiwon.webp', './img/icons/job_yeotjangsu.webp', './img/icons/lantern.webp', './img/icons/mat.webp', './img/icons/moon.webp', './img/icons/sandals.webp', './img/icons/scroll.webp', './img/icons/sun.webp', './img/icons/team_demon.webp', './img/icons/team_minion.webp', './img/icons/team_neutral.webp', './img/icons/team_outsider.webp', './img/icons/team_town.webp', './img/icons/team_traveler.webp',
  './img/coin/om_badjudge.webp', './img/coin/om_citizen.webp', './img/coin/om_detective.webp', './img/coin/om_doctor.webp', './img/coin/om_godfather.webp', './img/coin/om_immortal.webp', './img/coin/om_judge.webp', './img/coin/om_lawyer.webp', './img/coin/om_lunatic.webp', './img/coin/om_mafia.webp', './img/coin/om_ninja.webp', './img/coin/om_sheriff.webp', './img/coin/om_werewolf.webp', './img/coin/om_yakuza.webp',   // 오리지널 마피아 직업 코인 아트 14 (2026-09-21)
  './img/prop/om_gun.webp', './img/prop/om_ashtray.webp',   // 오리지널 마피아 탁자 소품 (2026-09-21)
  './img/tex/tex-suede.png',   // 코인 바닥 천 — 무리를 바닥 색으로 가른다 (2026-09-21)   // 시작 화면 삽화·상징 아이템 (2026-09-12~13)
  // 캐릭터 스킨 — 미리 담아둬야 오프라인에서도 그림이 나온다 (tools/스킨_목록_갱신.py 가 이 줄을 다시 씀)
  './스킨/botc-tb/baron.webp', './스킨/botc-tb/beggar.webp', './스킨/botc-tb/bureaucrat.webp', './스킨/botc-tb/butler.webp', './스킨/botc-tb/chef.webp', './스킨/botc-tb/drunk.webp', './스킨/botc-tb/empath.webp', './스킨/botc-tb/fortuneteller.webp', './스킨/botc-tb/gunslinger.webp', './스킨/botc-tb/imp.webp', './스킨/botc-tb/investigator.webp', './스킨/botc-tb/librarian.webp', './스킨/botc-tb/mayor.webp', './스킨/botc-tb/monk.webp', './스킨/botc-tb/poisoner.webp', './스킨/botc-tb/ravenkeeper.webp', './스킨/botc-tb/recluse.webp', './스킨/botc-tb/saint.webp', './스킨/botc-tb/scapegoat.webp', './스킨/botc-tb/scarletwoman.webp', './스킨/botc-tb/slayer.webp', './스킨/botc-tb/soldier.webp', './스킨/botc-tb/spy.webp', './스킨/botc-tb/thief.webp', './스킨/botc-tb/undertaker.webp', './스킨/botc-tb/virgin.webp', './스킨/botc-tb/washerwoman.webp'];

/* 자산은 예닐곱 개씩 나눠 담는다 — 67개를 한꺼번에 던지면 느린 회선·단일 스레드 서버에서
   일부가 조용히 빠지고, 오프라인에서 그림이 비는 형태로만 드러난다 (2026-09-13 실측: 70개 중 47~49개만 담겼다).
   빠진 것은 끝에 한 번 더 시도한다. 셸은 위에서 실패하면 설치를 접는다. */
async function fillAssets(c) {
  const CHUNK = 6, rest = [];
  for (let i = 0; i < ASSETS.length; i += CHUNK) {
    await Promise.all(ASSETS.slice(i, i + CHUNK).map(u => c.add(u).catch(() => { rest.push(u); })));
  }
  for (const u of rest) { try { await c.add(u); } catch (e) { /* 없어도 앱은 돈다 */ } }
}
self.addEventListener('install', e => {
  // 셸은 addAll — 하나라도 실패하면 설치가 통째로 실패하고 구버전이 살아 있는다.
  // 스킨은 개별로 — 늘고 줄어도 설치가 깨지지 않아야 한다.
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(SHELL).then(() => fillAssets(c)))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    // 우리 캐시만 지운다 — 같은 주소에 다른 앱이 있으면 그 캐시까지 지우면 안 된다
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith('dangsan-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 캐시 우선 + 네트워크 폴백. 새 버전은 백그라운드로 갱신.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      const net = fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});
