/* GameReasoner — 공통 엔진 P4 원형 (2026-10-01 새벽, 계획 docs/게임이해_엔진/P4_계획_v1.md — 교차 검토 전 원형)
   입력은 참가자 보기(GameEngine.view(좌석)) 하나 + 대본의 직업 목록(공개 정보: CMAP 의 이름·편). 판의 정답(state)은 읽지 않는다.
   가능한 세계(흉수 좌석 + 하수인 좌석들)를 전부 세고, 본인이 받은 정보가 그 세계에서 맞는지 대조해 무게를 준다.
   정보가 틀릴 설명: 본인이 주정뱅이(마을이면 늘 가능) · 그 밤 중독/오등록(하수인이 있으면). 없애지 않고 무게를 낮춘다.
   v1: TB 정보 직업 중 세탁부·조사관·요리사·공감능력자·장의사·레이븐키퍼. 점쟁이는 본인이 고른 두 자리가 보기에 없어 v2(엔진 보기에 «내 행동» 추가 뒤). */
var GameReasoner = (function () {
  'use strict';
  var COMP = { 5: [3, 0, 1, 1], 6: [3, 1, 1, 1], 7: [5, 0, 1, 1], 8: [5, 1, 1, 1], 9: [5, 2, 1, 1], 10: [7, 0, 2, 1], 11: [7, 1, 2, 1], 12: [7, 2, 2, 1], 13: [9, 0, 3, 1], 14: [9, 1, 3, 1], 15: [9, 2, 3, 1] };
  var W = { 중독: 0.04, 주정뱅이: 0.1, 몸주: 0.3, 오등록: 0.1 };   // 오등록(스파이는 선으로·은둔자는 악으로 잡힐 수 있음)은 규칙상 흔하다 — 시험에서 거짓 아닌 정보의 어긋남 전부가 이것(2026-10-01)   // 틀릴 설명의 무게 — 밸런스 근거 아님, 순위만 세운다(ponytail: 고정 표, 기록이 쌓이면 측정)
  function script() { var m = {}; CHARS().forEach(function (c) { m[c.ko] = { id: c.id, team: c.team }; }); return m; }
  function combos(arr, k) { var out = []; (function go(s, acc) { if (acc.length === k) { out.push(acc.slice()); return; } for (var i = s; i < arr.length; i++) { acc.push(arr[i]); go(i + 1, acc); acc.pop(); } })(0, []); return out; }
  function num(s) { var m = String(s || '').match(/\d+/); return m ? +m[0] : null; }
  /* 그 밤에 살아 있던 자리 — 공개 사망·처형만으로(아침 발표 기준) */
  function aliveAt(v, night) {
    var dead = {}; v.공개.forEach(function (e) { if ((e.종류 === '사망' && e.밤 < night) || (e.종류 === '처형' && e.밤 < night)) dead[e.자리] = true; });
    return function (seat) { return !dead[seat]; };
  }
  /* 한 정보가 세계(evil: 자리→'demon'|'minion')에서 맞나. null = 이 정보는 판정 못 함 */
  function check(role, info, world, v, S) {
    var N = v.좌석.length, t = function (seat) { return world[seat] || 'good'; };
    var roleTeam = function (ko) { var r = S[ko]; return r ? r.team : null; };
    if (role === '공감능력자' || role === '삽살개 주인') {
      var alive = aliveAt(v, info.밤), me = v.자리, cnt = 0, want = num(info.답); if (want === null) return null;
      [-1, 1].forEach(function (d) { for (var k = 1; k < N; k++) { var s = ((me - 1 + d * k) % N + N) % N + 1; if (s === me) break; if (alive(s)) { if (t(s) !== 'good') cnt++; break; } } });
      return cnt === want;
    }
    if (role === '요리사' || role === '아낙') {
      var w2 = num(info.답); if (w2 === null) return null; var pairs = 0;
      for (var s1 = 1; s1 <= N; s1++) { var s2 = s1 % N + 1; if (t(s1) !== 'good' && t(s2) !== 'good') pairs++; }
      return pairs === w2;
    }
    if (role === '세탁부' || role === '훈장') { var a = info.자리; if (a.length < 2) return null; return !(t(a[0]) !== 'good' && t(a[1]) !== 'good'); }
    if (role === '조사관' || role === '포졸') { var b = info.자리; if (b.length < 2) return null; return t(b[0]) === 'minion' || t(b[1]) === 'minion'; }
    if (role === '장의사' || role === '이방' || role === '레이븐키퍼' || role === '봉사') {
      var seat = info.자리[0], ko = (info.직업들 || [])[0]; if (!seat || !ko) return null;
      var tm = roleTeam(ko); if (!tm) return null;
      var want2 = tm === 'demon' ? 'demon' : tm === 'minion' ? 'minion' : 'good';
      return t(seat) === want2;
    }
    return null;
  }
  /* 오등록 한 번으로 맞출 수 있나 — 하수인 하나를 선으로(스파이), 또는 선 하나를 악(하수인·흉수)으로(은둔자) */
  function misregOk(role, info, world, v, S, can) {
    var N = v.좌석.length, k, w2, s;
    if (can.spy) for (k in world) if (world[k] === 'minion') { w2 = Object.assign({}, world); delete w2[k]; if (check(role, info, w2, v, S)) return true; }
    if (can.recluse) for (s = 1; s <= N; s++) if (!world[s] && s !== v.자리) { w2 = Object.assign({}, world); w2[s] = 'minion'; if (check(role, info, w2, v, S)) return true; w2[s] = 'demon'; if (check(role, info, w2, v, S)) return true; }
    return false;
  }
  function run(v) {
    if (!v || !v.좌석) return null;
    var N = v.좌석.length, comp = COMP[N]; if (!comp) return { 지원: false, 이유: N + '명 구성표 없음' };
    var S = script(), me = v.자리, role = v.나.직업, myTeam = (S[role] || {}).team;
    if (v.악안내) return { 지원: true, 악: true, 이유: '악은 동료를 안다 — 추론 대상 아님' };
    var minions = comp[2], others = []; for (var s = 1; s <= N; s++) if (s !== me) others.push(s);
    var has = function (ids) { return CHARS().some(function (c) { return ids.indexOf(c.id) >= 0; }); };
    var outsiders = comp[1] > 0;   // ponytail: 남작(+2 외지인)은 아직 안 셈 — 외지인 0인 인원에서 남작 판이면 주정뱅이·은둔자를 놓친다
    var hasDrunk = outsiders && has(['drunk', 'chwigaek']) && myTeam === 'town';
    var can = { spy: has(['spy', 'sejak']), recluse: outsiders && has(['recluse', 'nageune']) }, misreg = can.spy || can.recluse;
    var infos = (v.받은정보 || []).map(function (x) { return x; });
    var execs = v.공개.filter(function (e) { return e.종류 === '처형'; });
    var tot = 0, pd = {}, pe = {}, worlds = 0, best = [];
    others.forEach(function (d) {
      combos(others.filter(function (x) { return x !== d; }), minions).forEach(function (M) {
        var world = {}; world[d] = 'demon'; M.forEach(function (m) { world[m] = 'minion'; });
        var w = 1;
        /* 공개: 흉수가 처형됐는데 판이 계속이면 몸주가 이어받았어야 */
        execs.forEach(function (e) { if (world[e.자리] === 'demon') w *= W.몸주; });
        /* 받은 정보 — 본인이 믿을 만할 때 / 주정뱅이일 때 두 갈래 */
        var wReliable = 1, bad = [];
        infos.forEach(function (i) {
          var ok = check(role, i, world, v, S); if (ok !== false) return;
          if (misreg && misregOk(role, i, world, v, S, can)) { wReliable *= W.오등록; return; }
          wReliable *= W.중독; bad.push(i.밤);
        });
        w *= hasDrunk ? (wReliable * (1 - W.주정뱅이) + W.주정뱅이) : wReliable;
        if (!(w > 0)) return;
        worlds++; tot += w; pd[d] = (pd[d] || 0) + w; pe[d] = (pe[d] || 0) + w; M.forEach(function (m) { pe[m] = (pe[m] || 0) + w; });
      });
    });
    var seats = others.map(function (s) { return { 자리: s, 흉수: tot ? (pd[s] || 0) / tot : 0, 악: tot ? (pe[s] || 0) / tot : 0 }; })
      .sort(function (a, b) { return b.흉수 - a.흉수; });
    return { 지원: true, 세계: worlds, 좌석: seats, 쓴정보: infos.filter(function (i) { return check(role, i, {}, v, S) !== null; }).length };
  }

  /* ───── v2 — 이력 세계 + 답 집합 (P4 계획 v2.1, 2026-10-01 아침) ─────
     세계 = 흉수 자리 · 하수인 자리와 직업 · 계승 흐름 · 내가 주정뱅이인가 · 밤마다 중독 · 헛짚음 · 조회마다 등록(스파이·은둔자).
     흉수·하수인·계승·주정뱅이는 전부 센다(구조). 선 쪽 직업·헛짚음·은둔자 자리는 정보가 가리킬 때만 정한다(게으른 변수).
     답 판정은 «받은 답 ∈ 그 세계에서 가능한 답들». 모든 정보를 같은 한 세계가 동시에 만족해야 한다.
     출력은 가능/불가능/미확인. 비중은 «이 가정 아래 후보 비중»(가능한 구조의 몫)이지 확률이 아니다. 임의 무게 없음. */
  var EFFECT = { washerwoman: '두자리', librarian: '두자리', investigator: '두자리', chef: '쌍', empath: '이웃', fortuneteller: '점', undertaker: '처형직업', ravenkeeper: '직업공개' };
  var CAT = { town: 'town', outsider: 'outsider', minion: 'minion', demon: 'demon' };
  var NOT_YET = ['처녀', '슬레이어', '성자', '시장', '집사', '군인', '수도승', '밤 사망 수', '중독된 스파이·은둔자 등록'];   // 공개 사건에서 끌어낼 수 있지만 아직 안 쓰는 제약 — 후보를 덜 좁힐 뿐 빼지는 않는다
  function solve(v, opt) {
    opt = opt || {}; var LIMIT = opt.한도 || 3000000, fix = opt.고정 || null;
    if (!v || !v.좌석) return { 상태: '미지원', 이유: '보기 없음' };
    if (v.악안내) return { 상태: '미지원', 이유: '악은 동료를 안다 — 추론 대상 아님' };
    var N = v.좌석.length, comp = COMP[N]; if (!comp) return { 상태: '미지원', 이유: N + '명 구성표 없음' };
    var byKo = {}, byId = {}; CHARS().forEach(function (c) { if (CAT[c.team]) { byKo[c.ko] = c; byId[c.id] = c; } });
    if (!byId.imp) return { 상태: '미지원', 이유: '시계탑 기본판(TB) 대본만' };
    var me = v.자리, shown = byKo[v.나.직업]; if (!shown) return { 상태: '미지원', 이유: '내 직업을 대본에서 못 찾음' };
    if (shown.team === 'minion' || shown.team === 'demon') return { 상태: '미지원', 이유: '악 좌석(5·6명 판은 악 안내가 없다)' };
    var MINIONS = ['poisoner', 'spy', 'scarletwoman', 'baron'].filter(function (id) { return byId[id]; });
    /* 공개 사건 — 사망 시각표 */
    var pub = v.공개 || [], deaths = [];
    pub.forEach(function (e, i) { if (e.종류 === '처형' || e.종류 === '사망') deaths.push({ 자리: e.자리, 밤: e.밤, 낮: e.종류 === '처형' || e.때 === 'day', 순: i }); });
    var dawn = {}; pub.forEach(function (e) { if (e.종류 === '낮 시작') dawn[e.밤] = true; });
    /* 밤 n 에 정보가 풀릴 때(흉수 뒤) 죽어 있나 / 밤 n 이 시작될 때 죽어 있나 */
    function deadAtInfo(s, n) { return deaths.some(function (d) { return d.자리 === s && (d.밤 < n || (d.밤 === n && !d.낮)); }); }
    function deadAtDusk(s, n) { return deaths.some(function (d) { return d.자리 === s && d.밤 < n; }); }
    /* 받은 정보 → 제약. 답 종류 + 내가 믿는 직업의 효과로(파생 직업도 같은 효과면 같은 해석) */
    var acts = {}; (v.내행동 || []).forEach(function (a) { acts[a.사건] = a; });
    var infos = [], unsupported = [];
    (v.받은정보 || []).forEach(function (r) {
      var eff = EFFECT[shown.id], x = null;
      if (eff === '두자리' && r.답종류 === '두자리직업' && r.자리.length === 2 && byKo[r.값]) x = { k: '두자리', a: r.자리, X: byKo[r.값].id };
      else if (eff === '두자리' && r.답종류 === '없음') x = { k: { washerwoman: '마을없음', librarian: '외지없음', investigator: '하수없음' }[shown.id] };   // 5·6명 남작 판이면 세탁부도 «마을주민 없음»을 받는다
      else if (eff === '쌍' && r.답종류 === '수') x = { k: '쌍', 값: r.값 };
      else if (eff === '이웃' && r.답종류 === '수') x = { k: '이웃', 값: r.값 };
      else if (eff === '점' && r.답종류 === '예아니오' && r.계기 && acts[r.계기] && acts[r.계기].대상.length === 2) x = { k: '점', 값: r.값, a: acts[r.계기].대상 };
      else if (eff === '처형직업' && r.답종류 === '직업' && byKo[r.값]) { var ex = deaths.filter(function (d) { return d.낮 && d.밤 === r.밤 - 1; }).pop(); if (ex) x = { k: '한자리', s: ex.자리, X: byKo[r.값].id, 때: r.밤 - 1, 낮: true }; }
      else if (eff === '직업공개' && r.답종류 === '직업' && byKo[r.값] && r.자리.length === 1) x = { k: '한자리', s: r.자리[0], X: byKo[r.값].id, 때: r.밤, 낮: false };
      if (x) { x.밤 = r.밤; x.사건 = r.사건; infos.push(x); } else unsupported.push(r.사건 || r.밤);
    });
    /* 계승 — 흉수가 죽었는데 판이 이어졌으면 누가 이어받았나. 부정한 여자(살아 있고 죽기 전 5명 이상)가 먼저, 밤(넘겨주기)이면 산 하수인 누구든(진행자 재량) */
    function timelines(d, M) {
      var out = [];
      (function go(k, cur, dead, trans) {
        if (k === deaths.length) { out.push(trans); return; }
        var e = deaths[k], dead2 = Object.assign({}, dead); dead2[e.자리] = true;
        if (e.자리 !== cur || e.순 === pub.length - 1) { go(k + 1, cur, dead2, trans); return; }   // 흉수가 아니거나, 그 뒤 사건이 없으면(판이 끝났을 수 있다) 계승을 묻지 않는다
        var aliveBefore = N - Object.keys(dead).length, heirs = [];
        var sw = Object.keys(M).filter(function (m) { return M[m] === 'scarletwoman' && !dead2[m]; })[0];
        var minAlive = Object.keys(M).map(Number).filter(function (m) { return !dead2[m]; });
        if (sw && aliveBefore >= 5) {
          heirs = [+sw];
          /* 중독된 부정한 여자는 못 이어받는다 — 밤 넘겨주기이고 그 밤 독살자가 살아 있는 하수인이면, 독 대상이 부정한 여자인 같은 한 이력으로 다른 하수인도(코덱스 09:47 반례). 낮 처형은 그대로(중독이면 판이 끝났어야) */
          var pz0 = Object.keys(M).filter(function (m) { return M[m] === 'poisoner'; })[0];
          if (!e.낮 && pz0 && !dead[pz0] && +pz0 !== +sw) minAlive.forEach(function (m) { if (m !== +sw) go(k + 1, m, dead2, trans.concat([{ 자리: m, 밤: e.밤, 낮: false, 독SW: true }])); });
        }
        else if (!e.낮) heirs = minAlive;
        heirs.forEach(function (h) { go(k + 1, h, dead2, trans.concat([{ 자리: h, 밤: e.밤, 낮: e.낮 }])); });
      })(0, d, {}, []);
      return out;
    }
    /* 그 때 흉수 직업인 자리들(죽은 임프 포함) — 낮 처형으로 이어받으면 다음 밤부터, 밤 넘겨주기면 그 밤 정보부터 */
    function impsAt(d, T, n) { var s = {}; s[d] = true; T.forEach(function (t) { if (t.밤 < n || (t.밤 === n && !t.낮)) s[t.자리] = true; }); return s; }   // 밤 n 정보·낮 n 처형 모두 그 밤 넘겨주기 뒤, 그 낮 처형 계승 앞
    var nodes = 0, stop = false;
    /* 등록 — 이 자리가 역할 X 로 보일 수 있나(한자리·두자리 정보). 반환: 확장 목록 */
    function asRole(W, s, X, imps) {
      if (imps[s]) return X === 'imp' ? [{}] : [];
      var r = W.role[s], c = byId[X];
      if (r) { if (r === X) return [{}]; if (r === 'spy' && (c.team === 'town' || c.team === 'outsider')) return [{}]; if (r === 'recluse' && (c.team === 'minion' || c.team === 'demon')) return [{}]; return []; }
      return c.team === 'minion' || c.team === 'demon' ? [{ 놓기: [[s, 'recluse']] }] : [{ 놓기: [[s, X]] }];
    }
    /* 악으로 보이나: 1 확실 · 0.5 둘 다 가능(스파이·은둔자) · 0 아님 */
    function evilness(W, s) { var r = W.role[s]; if (!r) return 0; if (r === 'spy' || r === 'recluse') return 0.5; var t = byId[r].team; return t === 'minion' || t === 'demon' ? 1 : 0; }
    /* list: 쌍([a,b]) 또는 자리([s]) — 각각 따로 등록(v2.1 1절). 은둔자를 한 자리에 놓으면 그 자리가 든 항목만 다시 센다 */
    function withRecluse(W, list, want) {
      var ev = [], lo = 0, hi = 0, has = {};
      for (var s = 1; s <= N; s++) ev[s] = evilness(W, s);
      var val = function (u, x) { var m = 1; for (var j = 0; j < u.length; j++) { var e = u[j] === x ? 0.5 : ev[u[j]]; if (e < m) m = e; } return m; };
      list.forEach(function (u, k) { var v1 = val(u, 0); if (v1 === 1) lo++; if (v1 > 0) hi++; u.forEach(function (x) { (has[x] = has[x] || []).push(k); }); });
      if (want >= lo && want <= hi) return [{}];
      if (want < lo || want > hi + 2 || W.used.recluse || !byId.recluse) return [];   // 은둔자 한 명은 항목 둘까지만 «가능»으로 늘린다
      var out = [];
      Object.keys(has).forEach(function (x) { x = +x; if (W.role[x]) return; var h2 = hi; has[x].forEach(function (k) { if (val(list[k], 0) === 0 && val(list[k], x) > 0) h2++; }); if (want <= h2) out.push({ 놓기: [[x, 'recluse']] }); });
      return out;
    }
    function neighbors(n, extraDead) {
      var alive = function (s) { return s !== extraDead && !deadAtInfo(s, n); }, out = [];
      [-1, 1].forEach(function (dir) { for (var k = 1; k < N; k++) { var s = ((me - 1 + dir * k) % N + N) % N + 1; if (s === me) break; if (alive(s)) { if (out.indexOf(s) < 0) out.push(s); break; } } });
      return out;
    }
    function exts(W, x) {
      if (x.k === '두자리') { var o = []; x.a.forEach(function (s) { o = o.concat(asRole(W, s, x.X, W.imps(1))); }); return o; }
      if (x.k === '한자리') return asRole(W, x.s, x.X, W.imps(x.때));
      if (x.k === '외지없음') {
        var outs = Object.keys(W.role).filter(function (s) { return byId[W.role[s]].team === 'outsider'; });
        if (outs.some(function (s) { return W.role[s] !== 'recluse'; })) return [];
        if (W.O === 0) return [{}]; if (W.O > 1) return [];
        if (outs.length) return [{}];
        var o2 = []; for (var s = 1; s <= N; s++) if (!W.role[s]) o2.push({ 놓기: [[s, 'recluse']] }); return o2;
      }
      if (x.k === '마을없음') return W.T - (byId[W.role[me]].team === 'town' ? 1 : 0) === 0 ? [{}] : [];   // 나 말고 마을 자리가 없어야(스파이가 마을로 보이는 건 고를 수 있는 일)
      if (x.k === '하수없음') return Object.keys(W.M).every(function (m) { return W.M[m] === 'spy'; }) ? [{}] : [];
      if (x.k === '쌍') { var pairs = []; for (var a = 1; a <= N; a++) pairs.push([a, a % N + 1]); return withRecluse(W, pairs, x.값); }
      if (x.k === '이웃') {
        if (x.밤 > 1 && !dawn[x.밤]) {   // 그 밤 사망이 아직 발표 전 — 누가 죽었는지 모르는 채로(아무도 안 죽음 또는 한 사람)
          var o3 = [], seen = {}; [0].concat(W.others).forEach(function (vd) { var nb = neighbors(x.밤, vd), key = nb.join(); if (seen[key]) return; seen[key] = 1; o3 = o3.concat(withRecluse(W, nb.map(function (y) { return [y]; }), x.값)); }); return o3;
        }
        return withRecluse(W, neighbors(x.밤).map(function (y) { return [y]; }), x.값);
      }
      if (x.k === '점') {
        var imps = W.imps(x.밤), a2 = x.a;
        if (!x.값) { if (a2.some(function (s) { return imps[s]; }) || a2.indexOf(W.rh) >= 0) return []; return [{ 헛아님: a2 }]; }
        if (a2.some(function (s) { return imps[s] || W.role[s] === 'recluse' || W.rh === s; })) return [{}];
        var o4 = []; a2.forEach(function (s) { if (!W.role[s] || byId[W.role[s]].team === 'town' || byId[W.role[s]].team === 'outsider') { if (W.rh == null && !W.rhNot[s]) o4.push({ 헛: s }); if (!W.role[s]) o4.push({ 놓기: [[s, 'recluse']] }); } }); return o4;
      }
      return [{}];
    }
    function apply(W, e) {   // 되돌릴 수 있게 바뀐 것만 기록
      var undo = [];
      if (e.놓기) for (var i = 0; i < e.놓기.length; i++) {
        var s = e.놓기[i][0], X = e.놓기[i][1], t = byId[X].team;
        if (W.role[s]) { if (W.role[s] !== X) { revert(W, undo); return null; } continue; }
        if (W.used[X] || (t === 'town' && W.t >= W.T) || (t === 'outsider' && W.o >= W.O)) { revert(W, undo); return null; }
        W.role[s] = X; W.used[X] = s; if (t === 'town') W.t++; else W.o++; undo.push(['놓기', s, X, t]);
      }
      if (e.헛 != null) { if (W.rh != null || W.rhNot[e.헛]) { revert(W, undo); return null; } W.rh = e.헛; undo.push(['헛']); }
      if (e.헛아님) e.헛아님.forEach(function (s) { if (!W.rhNot[s]) { W.rhNot[s] = true; undo.push(['헛아님', s]); } });
      return undo;
    }
    function revert(W, undo) { for (var i = undo.length - 1; i >= 0; i--) { var u = undo[i]; if (u[0] === '놓기') { delete W.role[u[1]]; delete W.used[u[2]]; if (u[3] === 'town') W.t--; else W.o--; } else if (u[0] === '헛') W.rh = null; else delete W.rhNot[u[1]]; } }
    /* 이 구조에서 모든 정보를 함께 만족하는 세계가 있나 — 있으면 그 세계 하나를 돌려준다 */
    /* 예시가 필요 없으면(그 흉수 후보의 예시를 이미 찾았으면) 틀릴 수 있는 정보를 먼저 건너뛴다 — 있기만 하면 되니 빨리 끝난다.
       예시가 필요하면 맞는 답 쪽부터 — 예시가 «정보가 참인 세계»를 먼저 보여 준다 */
    var HIT = {};
    function dfs(W, k) {
      if (++nodes > LIMIT) { stop = true; return null; }
      if (k === infos.length) return W.need ? { 직업: Object.assign({}, W.role), 헛짚음: W.rh, 거짓: W.lies.slice() } : HIT;
      var x = infos[k];
      /* 틀릴 수 있는 정보 — 내가 주정뱅이이거나, 그 밤 살아 있는 독살자가 나를 골랐을 수 있다(거짓일 필요는 없다 — 아무 답) */
      var lie = !fix || !fix.건강 ? (W.drunk ? '주정뱅이' : (W.poisonAlive(x.밤) ? '중독' : null)) : null;
      if (lie && !W.need) return dfs(W, k + 1);   // 아무 답이나 되는 정보 — 건너뛰어도 나머지가 되면 된다(건너뛰어 안 되면 맞춰도 안 된다)
      var E = exts(W, x);
      for (var i = 0; i < E.length && !stop; i++) { var u = apply(W, E[i]); if (!u) continue; var got = dfs(W, k + 1); revert(W, u); if (got) return got; }
      if (lie && !stop) { W.lies.push(x.사건 + ':' + lie); var g2 = dfs(W, k + 1); W.lies.pop(); if (g2) return g2; }
      return null;
    }
    var others = []; for (var s0 = 1; s0 <= N; s0++) if (s0 !== me) others.push(s0);
    var tally = {}, total = 0, ok = 0, examples = {};
    var tlCache = {};
    others.forEach(function (s) { tally[s] = { 흉수: 0, 처음흉수: 0, 악: 0 }; });
    var canDrunk = shown.team === 'town' && byId.drunk;
    outer:
    for (var di = 0; di < others.length; di++) {
      var d = others[di]; if (fix && fix.흉수 && fix.흉수 !== d) continue;
      var rest = others.filter(function (x) { return x !== d; });
      var seatSets = combos(rest, comp[2]), roleSets = perms(MINIONS, comp[2]);
      for (var si = 0; si < seatSets.length; si++) for (var ri = 0; ri < roleSets.length; ri++) {
        var M = {}; seatSets[si].forEach(function (m, j) { M[m] = roleSets[ri][j]; });
        if (fix && fix.하수인 && JSON.stringify(sortObj(M)) !== JSON.stringify(sortObj(fix.하수인))) continue;
        var baron = roleSets[ri].indexOf('baron') >= 0, O = comp[1] + (baron ? 2 : 0), T = comp[0] - (baron ? 2 : 0);
        if (T < 0 || O > 4) continue;
        var swSeat = Object.keys(M).filter(function (m) { return M[m] === 'scarletwoman'; })[0] || '', tk = d + '|' + seatSets[si].join() + '|' + swSeat;
        var TL = tlCache[tk] || (tlCache[tk] = timelines(d, M));   // 계승 흐름은 흉수·하수인 자리·부정한 여자 자리로만 갈린다
        for (var ti = 0; ti < TL.length; ti++) for (var dk = 0; dk < (canDrunk && O > 0 && !(fix && fix.건강) ? 2 : 1); dk++) {
          if (fix && fix.취함 != null && !!fix.취함 !== !!dk) continue;
          total++;
          var tr = TL[ti], W = { M: M, O: O, T: T, t: 0, o: 0, role: {}, used: {}, rh: null, rhNot: {}, lies: [], drunk: !!dk, others: others };
          W.role[d] = 'imp'; W.used.imp = d; Object.keys(M).forEach(function (m) { W.role[m] = M[m]; W.used[M[m]] = m; });
          if (dk) { W.role[me] = 'drunk'; W.used.drunk = me; W.used[shown.id] = -1; W.o = 1; }   // 주정뱅이가 믿는 직업은 판에 없다
          else { W.role[me] = shown.id; W.used[shown.id] = me; if (shown.team === 'town') W.t = 1; else W.o = 1; }
          if (W.t > T || W.o > O) { total--; continue; }
          W.imps = function (n) { return impsAt(d, tr, n); };
          var pz = Object.keys(M).filter(function (m) { return M[m] === 'poisoner'; })[0];
          W.poisonAlive = function (n) { return !!pz && !deadAtDusk(+pz, n) && !tr.some(function (t) { return (t.자리 === +pz && (t.밤 < n || (t.밤 === n && !t.낮))) || (t.독SW && t.밤 === n); }); };   // 독살자가 흉수가 되는 순간 독이 풀린다(원작, 10/1 결정) — 그 밤 흉수 뒤 정보부터 참. 그 밤 독이 부정한 여자에게 갔으면 나는 아님
          var cur = tr.length ? tr[tr.length - 1].자리 : d; W.need = !examples[cur];
          var w = dfs(W, 0);
          if (stop) break outer;
          if (!w) continue;
          ok++;
          tally[cur].흉수++; tally[d].처음흉수++; tally[d].악++; Object.keys(M).forEach(function (m) { tally[m].악++; });
          if (W.need) examples[cur] = { 흉수: d, 하수인: M, 계승: tr, 주정뱅이: !!dk, 선직업: w.직업, 헛짚음: w.헛짚음, 틀린정보: w.거짓 };
        }
      }
    }
    var done = !stop;
    var seats = others.map(function (s) {
      var t = tally[s], st = function (c) { return c > 0 ? '가능' : (done ? '불가능' : '미확인'); };
      return { 자리: s, 흉수: st(t.흉수), 악: st(t.악), 비중: ok ? { 흉수: t.흉수 / ok, 악: t.악 / ok } : null };
    });
    /* 범위 — «완료»는 탐색을 끝냈다는 뜻이지 시계탑 합법성 증명이 아니다(코덱스 10:24). 못 쓴 정보·아직 안 쓰는 규칙 제약을 같이 낸다 */
    var 범위 = { 탐색: done ? '끝까지' : '한도에서 멈춤', 쓴정보: infos.length, 못쓴정보: unsupported.length, 안쓰는제약: NOT_YET };
    return { 상태: done ? '완료' : '중단', 이유: done ? null : '탐색 한도(' + LIMIT + ') 넘음 — 불가능으로 단정하지 않는다', 범위: 범위, 구조: total, 가능: ok, 쓴정보: infos.length, 미지원정보: unsupported, 좌석: seats, 예시: examples, 노드: nodes };
  }
  function perms(arr, k) { var out = []; (function go(acc, used) { if (acc.length === k) { out.push(acc.slice()); return; } for (var i = 0; i < arr.length; i++) if (!used[i]) { used[i] = 1; acc.push(arr[i]); go(acc, used); acc.pop(); used[i] = 0; } })([], {}); return out; }
  function sortObj(o) { var r = {}; Object.keys(o).sort().forEach(function (k) { r[k] = o[k]; }); return r; }

  return { run: run, solve: solve, _check: function (role, info, world, v) { return check(role, info, world, v, script()); } };   // _check — 시험(규칙 해석 대조)용
})();
