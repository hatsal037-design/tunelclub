/* GameReplay — 끝난 판 복기 (2026-10-01 밤, 계획 docs/게임이해_엔진/복기_계획_v1.md)
   입력은 판 기록 하나(state.log 또는 logsAll() 의 한 판: players·events·winner). 판 상태(state)는 읽지 않는다 — 지난 판도 같은 결과.
   AI 없음 — 기록과 규칙만: 밤마다 악·선의 행동·결과·받은 정보, 낮마다 지명·표·처형, 주요 장면, 통계, 정보만으로 좁힌 흉수 후보(GameReasoner).
   public: 참가자 공유판 — 사람별 숫자는 빼고 «좋은 장면»만 이름과 함께. 진행자 재량(앱 선택·판세 개입)은 진행자판에도 넣지 않는다(햇살님 10/1).
   NativeCore·GameEngine·GameReasoner 다음에 같은 JS 컨텍스트에 올린다(ios_코어_묶기·웹앱_묶기). */
var GameReplay = (function () {
  'use strict';
  var EVIL = { minion: 1, demon: 1, mafia: 1 };
  /* 정보 직업 — 코어가 함께 올라와 있으면 그 판단(옛 기록엔 «정보 전달»이 없어 이걸로 «주요 인물»을 잡는다) */
  function infoRole(id, mode) { try {   // 그 판의 모드 직업표에서 — 지난 판은 지금 모드와 다를 수 있다
    if (typeof isInfoRole !== 'function') return false; var M = typeof allMods === 'function' ? allMods()[mode] : null;
    var c = (M && (M.chars || []).filter(function (x) { return x.id === id; })[0]) || (typeof CMAP === 'function' ? CMAP()[id] : null); return !!isInfoRole(c); } catch (e) { return false; } }
  function seatsOf(list) { return (list || []).map(function (l) { var m = String(l).match(/좌석 (\d+)/); return m ? +m[1] : null; }).filter(function (x) { return x; }); }

  function build(L, o) {
    o = o || {};
    var P = {}, ev = (L && L.events) || [], N = 0;
    ((L && L.players) || []).forEach(function (p) { P[p.seat] = { 자리: p.seat, 이름: p.name || (p.seat + '번'), 직업: p.role, roleId: p.roleId, 편: p.team }; N = Math.max(N, p.seat); });
    var team = {}; Object.keys(P).forEach(function (k) { team[k] = P[k].편; });   // 계승으로 바뀌는 지금 편(밤을 지나며 갱신)
    var evil = function (s) { return !!EVIL[team[s]]; }, name = function (s) { return P[s] ? P[s].이름 : s + '번'; };
    var nights = Math.max(1, (L && L.nights) || 1); ev.forEach(function (e) { if (e.n > nights) nights = e.n; });
    var gotInfo = {}, pointedEvil = {};   // 그 전까지 정보를 받았나 · 참 정보로 악을 짚었나 — «주요 인물»
    var out = { 승자: (L && L.winner) || null, 인원: Object.keys(P).length, 모드: (L && L.modeName) || '', 사람: Object.keys(P).map(Number).sort(function (a, b) { return a - b; }).map(function (s) { return { 자리: s, 이름: P[s].이름, 직업: P[s].직업, 편: P[s].편 }; }), 밤: [], 낮: [], 주요장면: [], 통계: {}, 흐름: [] };   // 사람 — 판이 끝난 뒤라 직업 공개
    var scenes = [];

    for (var n = 1; n <= nights; n++) {
      var night = function (e) { return e.n === n && e.phase !== 'day'; }, day = function (e) { return e.n === n && e.phase === 'day'; };
      /* 밤 */
      var picks = ev.filter(function (e) { return night(e) && e.type === '밤 지목'; }).map(function (e) {
        var t = (e.대상ref || []).map(function (r) { return r.seat; }); if (!t.length) t = seatsOf(e.대상);
        return { 자리: e.seat, 이름: name(e.seat), 직업: e.role, 대상: t, 처리: e.처리 || null, 악: evil(e.seat), 흉수: team[e.seat] === 'demon' };
      });
      var deaths = ev.filter(function (e) { return night(e) && e.type === '사망'; }).map(function (e) { return { 자리: e.seat, 이름: name(e.seat), 직업: e.role, 까닭: e.cause || null, 악: evil(e.seat), 정보직업: infoRole(e.roleId, L && L.mode) }; });
      var infos = ev.filter(function (e) { return night(e) && e.type === '정보 전달'; }).map(function (e) {
        return { 자리: e.누구, 이름: name(e.누구), 직업: e.직업, 답: e.답, 거짓: !!e.거짓, 까닭: e.까닭 || null, 짚은: (e.자리 || []).slice(), 짚은악: (e.자리 || []).filter(function (s) { return evil(s); }) };
      });
      var blocked = [];
      picks.filter(function (p) { return p.흉수; }).forEach(function (p) {
        p.대상.forEach(function (t) {
          if (t === p.자리 || deaths.some(function (d) { return d.자리 === t; })) return;   // 자기 지목은 계승, 죽었으면 막힌 게 아니다
          var guard = picks.filter(function (g) { return !g.악 && g.대상.indexOf(t) >= 0 && /보호/.test(g.처리 || ''); })[0];
          blocked.push({ 대상: t, 이름: name(t), 까닭: guard ? '보호' : '능력·그 밖', 막은: guard ? guard.이름 : null });
        });
      });
      var succ = ev.filter(function (e) { return e.n === n && e.type === '계승'; });
      out.밤.push({ 밤: n, 악행동: picks.filter(function (p) { return p.악; }), 선행동: picks.filter(function (p) { return !p.악; }), 죽음: deaths, 막힘: blocked, 정보: infos, 계승: succ.length });
      deaths.forEach(function (d) {
        if (d.까닭 === 'demon' && !d.악 && (gotInfo[d.자리] || pointedEvil[d.자리] || d.정보직업)) scenes.push({ 순위: 3, 때: '밤 ' + n, 종류: '주요 인물을 잃음', 글: d.이름 + '(' + d.직업 + ')' + (pointedEvil[d.자리] ? ' — 악을 짚었던 사람' : gotInfo[d.자리] ? ' — 정보를 받던 사람' : ' — 정보 직업'), 자리: [d.자리] });
      });
      blocked.forEach(function (b) { scenes.push({ 순위: 4, 때: '밤 ' + n, 종류: '킬을 막음', 글: b.이름 + (b.막은 ? ' — ' + b.막은 + '의 보호' : ' — 죽지 않음'), 자리: [b.대상] }); });
      infos.filter(function (x) { return x.거짓 && /중독|취/.test(x.까닭 || ''); }).forEach(function (x) { scenes.push({ 순위: 5, 때: '밤 ' + n, 종류: '정보가 흐려짐', 글: x.이름 + '(' + x.직업 + ')이 ' + x.까닭 + ' 상태로 받은 정보', 자리: [x.자리] }); });
      var heir = function (e) { return e.seat || Object.keys(P).map(Number).filter(function (s) { return P[s].이름 === e.대상; })[0] || null; };   // 계승 기록은 이름(대상)으로 남는다
      succ.forEach(function (e) { var h = heir(e); scenes.push({ 순위: 5, 때: '밤 ' + n, 종류: '계승', 글: (e.대상 || '') + (e.이전 ? '(' + e.이전 + ' → ' + (e.이후 || '흉수') + ')' : '') + ' — 흉수가 넘어감', 자리: h ? [h] : [] }); });
      infos.forEach(function (x) { gotInfo[x.자리] = true; if (!x.거짓 && x.짚은악.length) pointedEvil[x.자리] = true; });
      succ.forEach(function (e) { var h = heir(e); if (h) team[h] = 'demon'; });   // 계승 — 이 뒤로는 새 흉수
      /* 낮 */
      var noms = ev.filter(function (e) { return day(e) && e.type === '지명'; }).map(function (e) { return { 지명자: e.bySeat || null, 대상: e.seat, 악: evil(e.seat), 지명자악: e.bySeat ? evil(e.bySeat) : null }; });
      var votes = ev.filter(function (e) { return day(e) && e.type === '투표'; }).map(function (e) {
        var t = Object.keys(P).map(Number).filter(function (s) { return P[s].이름 === e.대상; })[0] || null;
        return { 대상: t, 표: (e.투표자seats || []).length, 투표자: e.투표자seats || [], 악: t ? evil(t) : null };
      });
      var execs = ev.filter(function (e) { return day(e) && e.type === '처형' && !e.cancel; }).map(function (e) { return { 자리: e.seat, 이름: name(e.seat), 직업: e.role, 악: evil(e.seat), 흉수: team[e.seat] === 'demon' }; });
      var dayDeaths = ev.filter(function (e) { return day(e) && e.type === '사망'; }).map(function (e) { return { 자리: e.seat, 이름: name(e.seat), 직업: e.role, 까닭: e.cause || null, 악: evil(e.seat) }; });
      var start = ev.filter(function (e) { return day(e) && e.type === '낮 시작'; })[0];
      if (start) out.흐름.push({ 밤: n, 산선: start.산선, 산악: start.산악 });
      if (noms.length || votes.length || execs.length || dayDeaths.length || start) out.낮.push({ 밤: n, 지명: noms, 투표: votes, 처형: execs, 죽음: dayDeaths });
      execs.forEach(function (x) {
        if (x.악) scenes.push({ 순위: 2, 때: '낮 ' + n, 종류: '악을 잡음', 글: x.이름 + '(' + x.직업 + ') 처형', 자리: [x.자리], 흉수: x.흉수 });
        else scenes.push({ 순위: 5, 때: '낮 ' + n, 종류: '선을 처형', 글: x.이름 + '(' + x.직업 + ') 처형', 자리: [x.자리] });
      });
      dayDeaths.filter(function (d) { return d.악; }).forEach(function (d) { scenes.push({ 순위: 2, 때: '낮 ' + n, 종류: '악을 잡음', 글: d.이름 + '(' + d.직업 + ') 사망', 자리: [d.자리] }); });
    }
    /* 승부를 가른 장면 — 판의 마지막 처형·사망 */
    var last = ev.filter(function (e) { return e.type === '처형' || e.type === '사망'; }).pop();
    if (last && out.승자) scenes.push({ 순위: 1, 때: (last.phase === 'day' ? '낮 ' : '밤 ') + last.n, 종류: '승부', 글: name(last.seat) + '(' + last.role + ') ' + (last.type === '처형' ? '처형' : '사망') + ' → ' + (out.승자 === 'good' ? '선 승리' : out.승자 === 'evil' ? '악 승리' : '판 끝'), 자리: [last.seat] });
    out.주요장면 = pickScenes(scenes);
    out.통계 = stats(out, P, o.public);
    out.좁힌후보 = o.narrow ? narrowOf(L) : null;   // 무겁다(13명 판 2초대) — 화면은 game.replayNarrow 로 따로, 그린 뒤에
    if (o.public) out.밤.forEach(function (x) { x.정보 = x.정보.map(function (i) { return { 자리: i.자리, 이름: i.이름, 직업: i.직업, 답: i.답, 거짓: i.거짓, 짚은: i.짚은, 짚은악: i.짚은악 }; }); });   // 공개판 — 거짓 까닭(중독·취함)은 남기되 진행자 메모 없음
    return out;
  }
  /* 3~6개 — 승부·악을 잡음은 다, 나머지는 순위대로 채우고 시간 순으로 */
  function pickScenes(sc) {
    var fin = sc.filter(function (s) { return s.순위 === 1; })[0];
    if (fin) sc = sc.filter(function (s) { return s.순위 === 1 || !(s.때 === fin.때 && s.자리[0] === fin.자리[0]); });   // 승부 장면과 같은 처형은 한 번만
    var keep = sc.filter(function (s) { return s.순위 <= 2; }), rest = sc.filter(function (s) { return s.순위 > 2; }).sort(function (a, b) { return a.순위 - b.순위; });
    while (keep.length < 6 && rest.length) keep.push(rest.shift());
    var key = function (s) { var m = s.때.match(/(밤|낮) (\d+)/); return m ? (+m[2]) * 2 + (m[1] === '낮' ? 1 : 0) : 0; };
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
    Object.keys(firstEvilNom).forEach(function (t) { good.push({ 종류: '악을 처음 지명', 이름: P[firstEvilNom[t]] ? P[firstEvilNom[t]].이름 : '', 대상: P[t] ? P[t].이름 : '' }); });
    if (deciding && deciding.length) good.push({ 종류: '결정표', 이름: deciding.map(function (s) { return P[s] ? P[s].이름 : s; }).join(', ') });
    pointed.forEach(function (i) { good.push({ 종류: '정보로 악을 짚음', 이름: i.이름, 직업: i.직업 }); });
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
    ((L && L.players) || []).forEach(function (p) { P[p.seat] = { 이름: p.name || (p.seat + '번'), 편: p.team }; team[p.seat] = p.team; });
    ((L && L.events) || []).forEach(function (e) { if (e.n > nights) nights = e.n; if (e.type === '계승' && e.seat) team[e.seat] = 'demon'; });
    var M = null; try { M = typeof allMods === 'function' ? allMods()[L.mode] : null; } catch (e) {}   // 그 판의 모드 직업표로 푼다
    if (M && M.chars && typeof GameReasoner !== 'undefined' && GameReasoner.withChars) return GameReasoner.withChars(M.chars, function () { return narrow(L, P, team, nights); });
    return narrow(L, P, team, nights);
  }
  function narrow(L, P, team, nights) {
    if (typeof GameReasoner === 'undefined' || typeof GameEngine === 'undefined' || !GameEngine.answerKind) return null;
    var ev = (L && L.events) || [], N = Object.keys(P).length, res = [];
    var dayStarted = {}; ev.forEach(function (e) { if (e.type === '낮 시작') dayStarted[e.n] = true; });
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
        var got = ev.filter(function (e) { return e.type === '정보 전달' && e.누구 === s && e.n <= n; });
        if (!got.length) return;
        var rec = got.map(function (e, j) { var kk = GameEngine.answerKind(e), o = { 사건: '받음' + (j + 1), 밤: e.n, 답: e.답, 자리: e.자리 || [], 직업들: e.직업들 || [], 답종류: kk.종류 }; if ('값' in kk) o.값 = kk.값; return o; });
        var v = { 자리: s, 나: { 직업: got[got.length - 1].직업, 살아있음: true }, 좌석: Object.keys(P).map(Number).map(function (j) { return { 자리: j, 이름: P[j].이름, 살아있음: !dead[j] }; }), 공개: pub, 받은정보: rec };
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
