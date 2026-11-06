var 드러냄 = /** @type {any} */ (globalThis).드러냄 || (/** @type {any} */ (globalThis).드러냄 = function (곳, e) { var g = /** @type {any} */ (globalThis), L = g.__드러냄 || (g.__드러냄 = []); L.push(String(곳) + ': ' + String((e && e.message) || e)); if (L.length > 200) L.shift(); });   // P1 없는 것도 보이게 — 삼킨 오류는 여기 남는다(docs/원칙.md)
/* GameReplay — 끝난 판 복기 (2026-10-01 밤, 계획 docs/게임이해_엔진/복기_계획_v1.md)
   입력은 판 기록 하나(state.log 또는 logsAll() 의 한 판: players·events·winner). 판 상태(state)는 읽지 않는다 — 지난 판도 같은 결과.
   AI 없음 — 기록과 규칙만: 밤마다 악·선의 행동·결과·받은 정보, 낮마다 지명·표·처형, 주요 장면, 통계, 정보만으로 좁힌 흉수 후보(GameReasoner).
   public: 참가자 공유판 — 사람별 숫자는 빼고 «좋은 장면»만 이름과 함께. 진행자 재량(앱 선택·판세 개입)은 진행자판에도 넣지 않는다(햇살님 10/1).
   NativeCore·GameEngine·GameReasoner 다음에 같은 JS 컨텍스트에 올린다(ios_코어_묶기·웹앱_묶기). */
var GameReplay = (function () {
  'use strict';
  var EVIL = { minion: 1, demon: 1, mafia: 1 };
  /* 화면 글은 말 장치로(2026-11-04 구조 개선 6) — 코어와 함께면 앱 SAY(화면 조회면 기기 언어), 복기만 따로 돌면 말 장치와 한국어 팩만으로 */
  function T(k, v) { if (typeof SAY === 'function') return SAY(k, v); var CT = /** @type {any} */ (globalThis).CoreText; if (!CT || !CT.packs || !CT.packs.ko) return '[' + k + ']';
    var P = CT.pack(k); return CT.say(P, k, v, CT.namers(P, { ko: CT.word, tw: function (t) { return typeof teamWord === 'function' ? teamWord(t) : t; } })); }
  function seatNm(n) { if (typeof seatNo === 'function') return seatNo(n); var CT = /** @type {any} */ (globalThis).CoreText; return CT && CT.packs && CT.packs.ko ? CT.seat(CT.pack('_seat'), n) : String(n); }
  /* 사건 종류 코드 — 코어가 함께 올라와 있으면 그 접근자(evType), 복기만 따로 돌면 code 칸 → 옛 한국어 type 표(고정값 EVENT 와 같은 값) (2026-11-04 구조 개선 4) */
  /* 장면 톤(톤: good 마을에 좋은 일 · bad 나쁜 일) — 화면은 종류 글 대신 이 코드로 색을 정한다(2026-11-04 구조 개선 5) */
  var EV_KO = { '밤 시작': 'night_start', '밤 지목': 'night_pick', '낮 시작': 'day_start', '사망': 'death', '부활': 'revive', '처형': 'execute', '지명': 'nominate', '투표': 'vote', '1회 능력 사용': 'once_used', '계승': 'succession', '토큰': 'token', '판 종료': 'finish', '판 시작': 'start', '역할 변경': 'role_change', '판세 개입': 'director', '앱 선택': 'app_pick', '정보 전달': 'info_shown', '되돌림': 'undo', '블러프 바꿈': 'bluff_reroll', '자동 마감': 'auto_close' };
  function evType(e) { if (typeof globalThis.evType === 'function') return globalThis.evType(e); var c = e && e.code; if (c && c !== 'other') return c; return (e && EV_KO[e.type]) || 'other'; }
  /* 정보 직업 — 코어가 함께 올라와 있으면 그 판단(옛 기록엔 «정보 전달»이 없어 이걸로 «주요 인물»을 잡는다) */
  function infoRole(id, mode) { try {   // 그 판의 모드 직업표에서 — 지난 판은 지금 모드와 다를 수 있다
    if (typeof isInfoRole !== 'function') return false; var M = typeof allMods === 'function' ? allMods()[mode] : null;
    var c = (M && (M.chars || []).filter(function (x) { return x.id === id; })[0]) || (typeof CMAP === 'function' ? CMAP()[id] : null); return !!isInfoRole(c); } catch (e) { return false; } }
  /* 지목 처리가 보호 표식인가 — 처리 «token:이름» 의 표식을 등록부 분류(protect)로. 코어 없이 돌면(복기만 따로) 옛 글자 읽기(2026-11-04 구조 개선 4) */
  function isGuardWhat(w) { var m = /^token:(.+)$/.exec(String(w || '')); if (!m) return false; if (typeof tokCls === 'function') return tokCls(m[1]) === 'protect'; return /보호/.test(m[1]); }
  function seatsOf(list) { return (list || []).map(function (l) { var m = String(l).match(/좌석 (\d+)/); return m ? +m[1] : null; }).filter(function (x) { return x; }); }

  function build(L, o) {
    o = o || {};
    var P = {}, ev = (L && L.events) || [], N = 0;
    ((L && L.players) || []).forEach(function (p) { P[p.seat] = { 자리: p.seat, 이름: p.name || seatNm(p.seat), 직업: p.role, roleId: p.roleId, 편: p.team }; N = Math.max(N, p.seat); });
    var team = {}; Object.keys(P).forEach(function (k) { team[k] = P[k].편; });   // 계승으로 바뀌는 지금 편(밤을 지나며 갱신)
    var evil = function (s) { return !!EVIL[team[s]]; }, name = function (s) { return P[s] ? P[s].이름 : seatNm(s); };
    var nights = Math.max(1, (L && L.nights) || 1); ev.forEach(function (e) { if (e.n > nights) nights = e.n; });
    var gotInfo = {}, pointedEvil = {};   // 그 전까지 정보를 받았나 · 참 정보로 악을 짚었나 — «주요 인물»
    var out = { 승자: (L && L.winner) || null, 인원: Object.keys(P).length, 모드: (L && L.modeName) || '', 사람: Object.keys(P).map(Number).sort(function (a, b) { return a - b; }).map(function (s) { return { 자리: s, 이름: P[s].이름, 직업: P[s].직업, 편: P[s].편 }; }), 밤: [], 낮: [], 주요장면: [], 통계: {}, 흐름: [] };   // 사람 — 판이 끝난 뒤라 직업 공개
    var scenes = [];

    for (var n = 1; n <= nights; n++) {
      var night = function (e) { return e.n === n && e.phase !== 'day'; }, day = function (e) { return e.n === n && e.phase === 'day'; };
      /* 밤 */
      var picks = ev.filter(function (e) { return night(e) && evType(e) === 'night_pick'; }).map(function (e) {
        var t = (e.대상ref || []).map(function (r) { return r.seat; }); if (!t.length) t = seatsOf(e.대상);
        return { 자리: e.seat, 이름: name(e.seat), 직업: e.role, 대상: t, 처리: e.처리 || null, 악: evil(e.seat), 흉수: team[e.seat] === 'demon' };
      });
      var deaths = ev.filter(function (e) { return night(e) && evType(e) === 'death'; }).map(function (e) { return { 자리: e.seat, 이름: name(e.seat), 직업: e.role, 까닭: e.cause || null, 악: evil(e.seat), 정보직업: infoRole(e.roleId, L && L.mode) }; });
      var infos = ev.filter(function (e) { return night(e) && evType(e) === 'info_shown' && !e.종류; /* 카드로 준 정보만(동료·통보 같은 시점 기록은 빼고) */ }).map(function (e) {
        return { 자리: e.누구, 이름: name(e.누구), 직업: e.직업, 답: (e.코드 && e.코드.type === 'char' && (e.직업들 || []).length) ? e.직업들.join('·') : e.답,   /* 직업을 알려 준 정보는 꼬리표(«직업») 대신 그 직업 이름(2026-11-06) */ 거짓: !!e.거짓, 까닭: e.까닭 || null, 까닭종류: e.까닭종류 || null, 짚은: (e.자리 || []).slice(), 짚은악: (e.자리 || []).filter(function (s) { return evil(s); }) };
      });
      var blocked = [];
      picks.filter(function (p) { return p.흉수; }).forEach(function (p) {
        p.대상.forEach(function (t) {
          if (t === p.자리 || deaths.some(function (d) { return d.자리 === t; })) return;   // 자기 지목은 계승, 죽었으면 막힌 게 아니다
          var guard = picks.filter(function (g) { return !g.악 && g.대상.indexOf(t) >= 0 && isGuardWhat(g.처리); })[0];
          blocked.push({ 대상: t, 이름: name(t), 까닭: guard ? T('rpl.block.guard') : T('rpl.block.other'), 막은: guard ? guard.이름 : null });
        });
      });
      var succ = ev.filter(function (e) { return e.n === n && evType(e) === 'succession'; });
      out.밤.push({ 밤: n, 악행동: picks.filter(function (p) { return p.악; }), 선행동: picks.filter(function (p) { return !p.악; }), 죽음: deaths, 막힘: blocked, 정보: infos, 계승: succ.length });
      deaths.forEach(function (d) {
        if (d.까닭 === 'demon' && !d.악 && (gotInfo[d.자리] || pointedEvil[d.자리] || d.정보직업)) scenes.push({ 순위: 3, 때: T('ui.nightN', { n: n }), 순: n * 2, 종류: T('rpl.kind.lostKey'), 톤: 'bad', 글: T(pointedEvil[d.자리] ? 'rpl.t.lostPointed' : gotInfo[d.자리] ? 'rpl.t.lostInfo' : 'rpl.t.lostRole', { p: d.이름, r: d.직업 }), 자리: [d.자리] });
      });
      blocked.forEach(function (b) { scenes.push({ 순위: 4, 때: T('ui.nightN', { n: n }), 순: n * 2, 종류: T('rpl.kind.blocked'), 톤: 'good', 글: b.막은 ? T('rpl.t.guarded', { p: b.이름, g: b.막은 }) : T('rpl.t.survived', { p: b.이름 }), 자리: [b.대상] }); });
      infos.filter(function (x) { return x.거짓 && (x.까닭종류 ? x.까닭종류 !== 'other' : /중독|취/.test(x.까닭 || ''));   /* 코드 먼저, 옛 기록만 글자 */ }).forEach(function (x) { scenes.push({ 순위: 5, 때: T('ui.nightN', { n: n }), 순: n * 2, 종류: T('rpl.kind.blurred'), 톤: 'bad', 글: T('rpl.t.blurred', { p: x.이름, r: x.직업, w: x.까닭 }), 자리: [x.자리] }); });
      var heir = function (e) { return e.seat || Object.keys(P).map(Number).filter(function (s) { return P[s].이름 === e.대상; })[0] || null; };   // 계승 기록은 이름(대상)으로 남는다
      succ.forEach(function (e) { var h = heir(e); scenes.push({ 순위: 5, 때: T('ui.nightN', { n: n }), 순: n * 2, 종류: T('rpl.kind.succ'), 톤: 'bad', 글: e.이전 ? T('rpl.t.succ', { p: e.대상 || '', a: e.이전, b: e.이후 || T('rpl.t.demonWord') }) : T('rpl.t.succPlain', { p: e.대상 || '' }), 자리: h ? [h] : [] }); });
      infos.forEach(function (x) { gotInfo[x.자리] = true; if (!x.거짓 && x.짚은악.length) pointedEvil[x.자리] = true; });
      succ.forEach(function (e) { var h = heir(e); if (h) team[h] = 'demon'; });   // 계승 — 이 뒤로는 새 흉수
      /* 낮 */
      var noms = ev.filter(function (e) { return day(e) && evType(e) === 'nominate'; }).map(function (e) { return { 지명자: e.bySeat || null, 대상: e.seat, 악: evil(e.seat), 지명자악: e.bySeat ? evil(e.bySeat) : null }; });
      var votes = ev.filter(function (e) { return day(e) && evType(e) === 'vote'; }).map(function (e) {
        var t = Object.keys(P).map(Number).filter(function (s) { return P[s].이름 === e.대상; })[0] || null;
        return { 대상: t, 표: (e.투표자seats || []).length, 투표자: e.투표자seats || [], 악: t ? evil(t) : null };
      });
      var execs = ev.filter(function (e) { return day(e) && evType(e) === 'execute' && !e.cancel; }).map(function (e) { return { 자리: e.seat, 이름: name(e.seat), 직업: e.role, 악: evil(e.seat), 흉수: team[e.seat] === 'demon' }; });
      var dayDeaths = ev.filter(function (e) { return day(e) && evType(e) === 'death'; }).map(function (e) { return { 자리: e.seat, 이름: name(e.seat), 직업: e.role, 까닭: e.cause || null, 악: evil(e.seat) }; });
      var start = ev.filter(function (e) { return day(e) && evType(e) === 'day_start'; })[0];
      if (start) out.흐름.push({ 밤: n, 산선: start.산선, 산악: start.산악 });
      if (noms.length || votes.length || execs.length || dayDeaths.length || start) out.낮.push({ 밤: n, 지명: noms, 투표: votes, 처형: execs, 죽음: dayDeaths });
      execs.forEach(function (x) {
        if (x.악) scenes.push({ 순위: 2, 때: T('ui.dayN', { n: n }), 순: n * 2 + 1, 종류: T('rpl.kind.caught'), 톤: 'good', 글: T('rpl.t.exec', { p: x.이름, r: x.직업 }), 자리: [x.자리], 흉수: x.흉수 });
        else scenes.push({ 순위: 5, 때: T('ui.dayN', { n: n }), 순: n * 2 + 1, 종류: T('rpl.kind.execGood'), 톤: 'bad', 글: T('rpl.t.exec', { p: x.이름, r: x.직업 }), 자리: [x.자리] });
      });
      dayDeaths.filter(function (d) { return d.악; }).forEach(function (d) { scenes.push({ 순위: 2, 때: T('ui.dayN', { n: n }), 순: n * 2 + 1, 종류: T('rpl.kind.caught'), 톤: 'good', 글: T('rpl.t.died', { p: d.이름, r: d.직업 }), 자리: [d.자리] }); });
    }
    /* 승부를 가른 장면 — 판의 마지막 처형·사망 */
    var last = ev.filter(function (e) { return evType(e) === 'execute' || evType(e) === 'death'; }).pop();
    if (last && out.승자) scenes.push({ 순위: 1, 때: T(last.phase === 'day' ? 'ui.dayN' : 'ui.nightN', { n: last.n }), 순: last.n * 2 + (last.phase === 'day' ? 1 : 0), 종류: T('rpl.kind.decider'), 톤: 'good', 글: T('rpl.t.final', { p: name(last.seat), r: last.role, h: T(evType(last) === 'execute' ? 'ui.cause.exec' : 'ui.dead'), w: T(out.승자 === 'good' ? 'ui.win.good' : out.승자 === 'evil' ? 'ui.win.evil' : 'ui.gameOver') }), 자리: [last.seat] });
    out.주요장면 = pickScenes(scenes);
    out.통계 = stats(out, P, o.public);
    tell(out, L);   /* 문장 엔진 — 사람별 이야기·걸음 제목·한 줄 요약(규칙으로, 같은 판이면 같은 글, 2026-11-06 햇살님 «극도로 잘 짜인 코드로 흉내») */
    out.좁힌후보 = o.narrow ? narrowOf(L) : null;   // 무겁다(13명 판 2초대) — 화면은 game.replayNarrow 로 따로, 그린 뒤에
    if (o.public) out.밤.forEach(function (x) { x.정보 = x.정보.map(function (i) { return { 자리: i.자리, 이름: i.이름, 직업: i.직업, 답: i.답, 거짓: i.거짓, 짚은: i.짚은, 짚은악: i.짚은악 }; }); });   // 공개판 — 거짓 까닭(중독·취함)은 남기되 진행자 메모 없음
    return out;
  }

  /* 문장 엔진 — 판 사실만으로 글을 짓는다(앱 계산값 없음). 절은 «이음꼴(.c)»과 «끝꼴(.e)» 두 벌, 우선순위로 최대 둘 + 결말 하나. 조사는 말 장치({x|을}) */
  function tell(out, L) {
    var P = {}; out.사람.forEach(function (p) { P[p.자리] = p; });
    var EV = function (s) { return !!EVIL[(P[s] || {}).편]; }, nm = function (s) { return (P[s] || {}).이름 || seatNm(s); };
    var when = function (n, day) { return day ? T('rpl.w.day', { n: n }) : n <= 1 ? T('rpl.w.night0') : T('rpl.w.night', { n: n - 1 }); };
    var F = {}; var f = function (s) { return F[s] = F[s] || { save: [], point: [], saved: [], info: [], aimK: [], aimM: [], nomE: [], nomG: 0, nomd: 0, fate: null, voteE: [], voteG: [] }; };
    out.밤.forEach(function (x) {
      var d = when(x.밤), dead = {}; x.죽음.forEach(function (k) { dead[k.자리] = 1; if (!f(k.자리).fate) F[k.자리].fate = { k: 'died', d: d }; });
      (x.막힘 || []).forEach(function (b) { f(b.대상).saved.push({ d: d, g: b.막은 || '' }); if (b.막은) { var g = out.사람.filter(function (p) { return p.이름 === b.막은; })[0]; if (g) f(g.자리).save.push({ d: d, t: b.이름 }); } });
      x.정보.forEach(function (i) { var o = { d: d, a: String(i.답 == null ? '' : i.답), fake: i.거짓 }; if (!i.거짓 && (i.짚은악 || []).length) f(i.자리).point.push(o); else f(i.자리).info.push(o); });
      x.악행동.forEach(function (a) { var ts = a.대상.filter(function (t) { return t !== a.자리; }); if (!ts.length) return; var k = ts.filter(function (t) { return dead[t]; }); (k.length ? f(a.자리).aimK : f(a.자리).aimM).push(k.length ? k : ts); });
    });
    out.낮.forEach(function (x) {
      var d = when(x.밤, true);
      x.지명.forEach(function (z) { if (z.지명자) { if (z.악) f(z.지명자).nomE.push(z.대상); else f(z.지명자).nomG++; } f(z.대상).nomd++; });
      x.처형.forEach(function (e) { var v = (x.투표.filter(function (t) { return t.대상 === e.자리; })[0] || {}).표; f(e.자리).fate = { k: 'exec', d: d, v: v || 0 }; });
      x.처형.forEach(function (e) { var vt = x.투표.filter(function (t) { return t.대상 === e.자리; })[0]; ((vt && vt.투표자) || []).forEach(function (s) { if (s !== e.자리) (e.악 ? f(s).voteE : f(s).voteG).push(e.자리); }); });
      x.죽음.forEach(function (k) { if (!f(k.자리).fate) F[k.자리].fate = { k: 'died', d: d }; });
    });
    var won = function (s) { var w = out.승자; return w === 'good' ? !EV(s) : w === 'evil' ? EV(s) : false; };
    var uniq = function (a) { var o = []; a.forEach(function (x) { if (o.indexOf(x) < 0) o.push(x); }); return o; };
    var names = function (ss) { return uniq(ss).map(nm).join('·'); };
    out.사람.forEach(function (p) {
      var x = f(p.자리), c = [];   /* [열쇠, 값] 우선순위 순 */
      if (EV(p.자리)) {
        if (x.aimK.length) c.push(['rpl.s.aimKill.c', { t: names([].concat.apply([], x.aimK)) }]);
        else if (x.aimM.length) c.push(['rpl.s.aimMiss.c', { t: names([].concat.apply([], x.aimM)) }]);
        if (!x.nomd) c.push(['rpl.s.hidden.c', {}]);
      } else {
        if (x.save.length) c.push(['rpl.s.save.c', { d: x.save[0].d, t: x.save[0].t }]);
        if (x.point.length) c.push(['rpl.s.point.c', { d: x.point[0].d, a: x.point[0].a }]);
        if (x.nomE.length && !x.nomG) c.push(['rpl.s.nomHit.c', { t: names(x.nomE) }]);
        if (x.saved.length && x.saved[0].g) c.push(['rpl.s.saved.c', { g: x.saved[0].g }]);
        if (!x.point.length && x.info.length) { var i = x.info[x.info.length - 1]; c.push([i.fake ? 'rpl.s.infoFake.c' : 'rpl.s.info.c', { d: i.d, a: i.a }]); }
        if (!c.length && x.voteE.length) c.push(['rpl.s.voteHit.c', { t: names(x.voteE) }]);   /* 밋밋하면 투표로 — 처형된 악에게 손 든 것 */
        else if (!c.length && x.voteG.length) c.push(['rpl.s.voteMiss.c', { t: names(x.voteG) }]);
      }
      var end = x.fate ? (x.fate.k === 'exec' ? ['rpl.s.exec', { d: x.fate.d, v: x.fate.v }] : ['rpl.s.died', { d: x.fate.d }]) : [won(p.자리) ? 'rpl.s.aliveWin' : 'rpl.s.alive', {}];
      var pick = c.slice(0, 2), say = function (ps) { return ps.map(function (q) { return T(q[0], q[1]); }).concat([T(end[0], end[1])]).join(' '); };
      var t = say(pick); while (pick.length && t.length > 40) { pick.pop(); t = say(pick); }   /* 길면 덜 중요한 절부터 뺀다 */
      p.이야기 = t;
    });
    out.밤.forEach(function (x) { var dd = x.죽음.map(function (k) { return k.이름; }), bb = (x.막힘 || []).filter(function (b) { return b.막은; }).map(function (b) { return b.이름; });
      x.제목 = when(x.밤) + ' · ' + (dd.length ? T('rpl.h.nightDead', { p: dd.join('·') }) : bb.length ? T('rpl.h.nightSaved', { p: bb.join('·') }) : T('rpl.h.nightQuiet')); });
    out.낮.forEach(function (x) { var e = x.처형[0], v = e ? (x.투표.filter(function (t) { return t.대상 === e.자리; })[0] || {}).표 : 0;
      x.제목 = when(x.밤, true) + ' · ' + (e ? T('rpl.h.dayExec', { p: e.이름, v: v || 0 }) : T('rpl.h.dayNone')); });
    var st = out.통계 || {}, ex = st.처형 || { 악: 0, 수: 0 };
    out.한줄 = T('rpl.sum', { w: out.승자 === 'good' ? T('rpl.w.good') : out.승자 === 'evil' ? T('rpl.w.evil') : T('rpl.w.void'), a: ex.악, b: ex.수,
      d: out.밤.reduce(function (a, x) { return a + x.죽음.length; }, 0), k: out.밤.reduce(function (a, x) { return a + (x.막힘 || []).length; }, 0) });
  }
  /* 3~6개 — 승부·악을 잡음은 다, 나머지는 순위대로 채우고 시간 순으로 */
  function pickScenes(sc) {
    var fin = sc.filter(function (s) { return s.순위 === 1; })[0];
    if (fin) sc = sc.filter(function (s) { return s.순위 === 1 || !(s.때 === fin.때 && s.자리[0] === fin.자리[0]); });   // 승부 장면과 같은 처형은 한 번만
    var keep = sc.filter(function (s) { return s.순위 <= 2; }), rest = sc.filter(function (s) { return s.순위 > 2; }).sort(function (a, b) { return a.순위 - b.순위; });
    while (keep.length < 6 && rest.length) keep.push(rest.shift());
    var key = function (s) { return typeof s.순 === 'number' ? s.순 : 0; };   // 순 — 밤 n = 2n, 낮 n = 2n+1(글을 다시 읽지 않는다, 2026-11-04)
    return keep.sort(function (a, b) { return key(a) - key(b) || a.순위 - b.순위; });
  }
  function stats(out, P, pub) {
    var ex = [], nom = [], info = [], voters = {}, firstEvilNom = {}, deciding = null;
    out.낮.forEach(function (d) { d.처형.forEach(function (x) { ex.push(x); }); d.지명.forEach(function (x) { nom.push(x); }); d.투표.forEach(function (v) { v.투표자.forEach(function (s) { var r = voters[s] || (voters[s] = { 찬성: 0, 악에: 0 }); r.찬성++; if (v.악) r.악에++; }); }); });
    out.밤.forEach(function (x) { x.정보.forEach(function (i) { info.push(i); }); });
    var goodNom = nom.filter(function (x) { return x.지명자 && !x.지명자악; });
    var later = function (seat) { return ex.some(function (x) { return x.자리 === seat; }) || nom.some(function (x) { return x.대상 === seat; }); };
    var pointed = info.filter(function (i) { return !i.거짓 && i.짚은악.length; });
    /* 좋은 장면(이름 공개) — 처형까지 간 악을 처음 지명한 사람 · 승부 처형의 찬성표 */
    out.낮.forEach(function (d) { d.지명.forEach(function (x) { if (x.악 && x.지명자 && !x.지명자악 && !firstEvilNom[x.대상] && ex.some(function (e) { return e.자리 === x.대상; })) firstEvilNom[x.대상] = x.지명자; }); });
    var lastDay = out.낮[out.낮.length - 1]; if (lastDay && out.승자 === 'good') { var fx = lastDay.처형.filter(function (x) { return x.흉수; })[0]; if (fx) { var v = lastDay.투표.filter(function (t) { return t.대상 === fx.자리; }).pop(); if (v) deciding = v.투표자.filter(function (s) { return !EVIL[(P[s] || {}).편]; }); } }
    var good = [];
    Object.keys(firstEvilNom).forEach(function (t) { good.push({ 종류: T('rpl.good.firstEvilNom'), 이름: P[firstEvilNom[t]] ? P[firstEvilNom[t]].이름 : '', 대상: P[t] ? P[t].이름 : '' }); });
    if (deciding && deciding.length) good.push({ 종류: T('rpl.good.deciding'), 이름: deciding.map(function (s) { return P[s] ? P[s].이름 : s; }).join(', ') });
    pointed.forEach(function (i) { good.push({ 종류: T('rpl.good.pointed'), 이름: i.이름, 직업: i.직업 }); });
    var seen = {}; good = good.filter(function (g) { var k = g.종류 + '|' + g.이름 + '|' + (g.대상 || ''); if (seen[k]) return false; seen[k] = 1; return true; });   // 같은 장면 한 번만
    var st = {
      처형: { 수: ex.length, 악: ex.filter(function (x) { return x.악; }).length },
      지명: { 수: goodNom.length, 악: goodNom.filter(function (x) { return x.악; }).length },   // 선이 한 지명 중 악을 겨눈 것
      정보: { 수: info.length, 참: info.filter(function (i) { return !i.거짓; }).length, 악을짚음: pointed.length, 이어짐: pointed.filter(function (i) { return i.짚은악.some(later); }).length },
      좋은장면: good
    };
    if (!pub) st.사람별 = Object.keys(P).map(Number).map(function (s) { var r = voters[s] || { 찬성: 0, 악에: 0 }; return { 자리: s, 이름: P[s].이름, 편: P[s].편, 찬성: r.찬성, 악에찬성: r.악에, 악지명: nom.filter(function (x) { return x.지명자 === s && x.악; }).length }; });
    return st;
  }
  /* 정보만으로 좁힌 흉수 후보 — 낮마다 선 좌석의 «그때까지 안 것»으로 풀이기를 돌려 가장 좁힌 수. 보기는 기록만으로 다시 세운다 */
  function narrowOf(L) {
    var P = {}, nights = Math.max(1, (L && L.nights) || 1), team = {};
    ((L && L.players) || []).forEach(function (p) { P[p.seat] = { 이름: p.name || seatNm(p.seat), 편: p.team }; team[p.seat] = p.team; });
    ((L && L.events) || []).forEach(function (e) { if (e.n > nights) nights = e.n; if (evType(e) === 'succession' && e.seat) team[e.seat] = 'demon'; });
    var M = null; try { M = typeof allMods === 'function' ? allMods()[L.mode] : null; } catch (e) { 드러냄('replay.narrowOf', e); }   // 그 판의 모드 직업표로 푼다
    if (M && M.chars && typeof GameReasoner !== 'undefined' && GameReasoner.withChars) return GameReasoner.withChars(M.chars, function () { return narrow(L, P, team, nights); });
    return narrow(L, P, team, nights);
  }
  function narrow(L, P, team, nights) {
    if (typeof GameReasoner === 'undefined' || typeof GameEngine === 'undefined' || !GameEngine.answerKind) return null;
    var ev = (L && L.events) || [], N = Object.keys(P).length, res = [];
    var dayStarted = {}; ev.forEach(function (e) { if (evType(e) === 'day_start') dayStarted[e.n] = true; });
    var demon0 = Object.keys(P).map(Number).filter(function (s) { return P[s].편 === 'demon'; });
    for (var n = 1; n <= nights; n++) {
      if (!dayStarted[n]) continue;
      var pub = [], k = 0;
      ev.forEach(function (e) {
        if (e.n > n || !{ '지명': 1, '투표': 1, '처형': 1, '사망': 1 }[e.type]) return;
        if (e.n === n && e.phase === 'day') return;   // 그 낮 아침 기준 — 낮의 일은 아직
        var x = { 사건: '공개' + (++k), 밤: e.n, 때: e.phase, 종류: e.type }; if (e.seat) x.자리 = e.seat; if (e.bySeat) x.지명자 = e.bySeat; if (e.투표자seats) x.투표자 = e.투표자seats; pub.push(x);
      });
      var dead = {}; pub.forEach(function (x) { if (x.종류 === '사망' || x.종류 === '처형') dead[x.자리] = true; });
      var best = null;
      Object.keys(P).map(Number).forEach(function (s) {
        if (EVIL[P[s].편] || dead[s]) return;
        var got = ev.filter(function (e) { return evType(e) === 'info_shown' && e.누구 === s && e.n <= n; });
        if (!got.length) return;
        var rec = got.map(function (e, j) { var kk = GameEngine.answerKind(e), o = { 사건: '받음' + (j + 1), 밤: e.n, 답: e.답, 자리: e.자리 || [], 직업들: e.직업들 || [], 직업열쇠들: e.직업열쇠들 || (e.코드 && e.코드.type === 'char' && typeof e.코드.value === 'string' ? [e.코드.value] : (e.코드 && e.코드.value && e.코드.value.r ? [e.코드.value.r] : undefined)),   /* 답 코드의 직업 열쇠(장의사류 char·둘 중 하나 r) */ 답종류: kk.종류 }; if ('값' in kk) o.값 = kk.값; return o; });
        var v = { 자리: s, 나: { 직업: got[got.length - 1].직업, 직업열쇠: got[got.length - 1].roleId || undefined, 살아있음: true }, 좌석: Object.keys(P).map(Number).map(function (j) { return { 자리: j, 이름: P[j].이름, 살아있음: !dead[j] }; }), 공개: pub, 받은정보: rec };
        var r = null; try { r = GameReasoner.solve(v); } catch (e) { r = null; }
        if (!r || !r.좌석) return;
        var cand = r.좌석.filter(function (x) { return x.흉수 === '가능'; }).map(function (x) { return x.자리; });
        if (cand.length && (!best || cand.length < best.후보.length)) best = { 자리: s, 이름: P[s].이름, 후보: cand };
      });
      if (best) res.push({ 낮: n, 좁힘: best.후보.length < (N - Object.keys(dead).length) - 1, 후보수: best.후보.length, 누구: best.이름, 흉수포함: best.후보.some(function (c) { return demon0.indexOf(c) >= 0 || team[c] === 'demon'; }), 살아있는수: N - Object.keys(dead).length });
    }
    return res;
  }
  return { build: build, narrow: narrowOf };
})();
