/* GameEngine — 공통 게임이해 엔진 P2 기반 (2026-10-01, 계획 docs/게임이해_엔진/공통엔진_계획_v1.1.md · 11절 «앱에 심는다»)
   규칙은 새로 만들지 않는다 — 판을 움직이는 것은 NativeCore(query/dispatch) 하나. 여기는 그 위에
     보기(view)  : 좌석마다 «합법적으로 아는 것만» (P1_관측규칙표.md)
     합법(legal) : 그 좌석이 지금 할 수 있는 행동 — 막힌 이유 원문은 안 준다
     행동(act)   : 좌석을 고정한 행동만 코어 명령으로 옮긴다(남의 좌석으로 못 한다)
     기록(record): 이 판에 들어간 명령 열 — 같은 씨앗·시각이면 다시 돌려 같은 판(재생)
   를 얹는다. 화면 연결은 P5 에서 햇살님 승인 뒤 — 지금은 불러도 부르는 곳이 없다.
   NativeCore 다음에 같은 JS 컨텍스트에 올린다(ios_코어_묶기·웹앱_묶기가 같이 묶는다). */
var GameEngine = (function () {
  'use strict';
  var NC = NativeCore;
  var log = [], n = 0;
  function Q(name, arg) { return JSON.parse(NC.query(name, arg)); }
  function q(name, arg) { return Q(name, arg).data; }
  function rev() { return Q('home').revision; }
  /* 진행자(또는 실험 컨트롤러) 명령 — 기록에 남긴다 */
  function dispatch(type, payload) {
    /* 고정한 처음 상태 — 기록에 남겨 재생이 같은 판에서 시작하게(수기 추적·짝 검사용, 2026-10-01 코덱스 검토) */
    if (type === '엔진.넘겨주기무효') { log.push({ type: type, payload: payload, status: 'ok' }); return { status: 'ok' }; }   // 판정상 무효였던 넘겨주기 요청 — 기록만(재생에서도 아무 일 없음)
    if (type === '엔진.restore') {
      state = JSON.parse(payload.판);
      /* 첫밤 전 고정이면 판 시작 기록(처음 직업)도 그 구성으로 — 블러프 주인·복기가 이것을 본다 */
      if (state.log && state.log.players && !state.nightBegun) state.log.players.forEach(function (p) { var s = state.seats[p.seat - 1], c = s && cm()[s.char]; if (c) { p.roleId = c.id; p.role = c.ko; p.team = c.team; } });
      try { save(); } catch (e) {} log.push({ type: type, payload: payload, status: 'ok' }); return { status: 'ok' };
    }
    var cmd = { commandId: 'g' + (n++), expectedRevision: rev(), type: type, payload: payload || {} };
    var r = JSON.parse(NC.dispatch(JSON.stringify(cmd)));
    log.push({ type: type, payload: payload || {}, status: r.status });
    return r;
  }
  function seats() { return state.seats || []; }
  function cm() { return CMAP(); }
  function ko(id) { var c = cm()[id]; return c ? c.ko : ''; }
  function side(id) { var c = cm()[id]; return c ? fxSide(c.team) : null; }
  function isSpy(i) { var s = seats()[i]; return !!s && ['spy', 'sejak'].indexOf(s.char) >= 0; }
  /* 본인이 믿는 직업 — 속는 직업(취객·망석중…)은 받은 가짜 카드 */
  function shownChar(i) { var f = (state.fakes || {})[i]; return f && cm()[f] ? f : seats()[i].char; }
  /* 진행 중인 판의 기록(state.log) — logsAll()[0] 은 끝난 판 목록이라 진행 중엔 비어 있다(2026-10-01 수기 추적 검사에서 발견) */
  function events() { try { if (state.log && state.log.events) return state.log.events; var L = logsAll()[0]; return (L && L.events) || []; } catch (e) { return []; } }
  /* 공개 사건 — 직업·고정값은 벗긴다. 밤 사망은 아침(낮 시작) 뒤에만 */
  var PUBLIC = { '지명': 1, '투표': 1, '처형': 1, '사망': 1, '낮 시작': 1, '밤 시작': 1 };
  function publicEvents() {
    var ev = events(), out = [], dayStarted = {};
    ev.forEach(function (e) { if (e.type === '낮 시작') dayStarted[e.n] = true; });
    ev.forEach(function (e) {
      if (!PUBLIC[e.type]) return;
      if (e.type === '사망' && e.phase !== 'day' && !dayStarted[e.n]) return;   // 아직 발표 전인 밤 사망(그 밤 뒤 낮이 시작돼야 공개)
      var o = { 사건: '공개' + (out.length + 1), 밤: e.n, 때: e.phase, 종류: e.type };   // 사건 ID — 보이는 목록 안 순번. 판 기록 전체 순번은 숨은 사건 수를 새게 한다(짝 검사에서 잡힘)
      if (e.seat) o.자리 = e.seat;
      if (e.bySeat) o.지명자 = e.bySeat;
      if (e.투표자seats) o.투표자 = e.투표자seats;
      out.push(o);
    });
    return out;
  }
  /* 악 편 안내 — 코어가 첫밤에 깨워 알려 주는 것과 같은 조건(무대 meet). 판 도중엔 그때 받은 것을 기억으로 */
  /* 첫밤에 받은 악 안내 — 판 시작 기록의 처음 직업으로 고정한다. 알려 주지 않은 계승·진영 변화로 과거 기억을 바꾸지 않는다(2026-10-01 코덱스 재검토) */
  function startTeams() {
    var P = (state.log && state.log.players) || null; if (!P || !P.length) return seats().map(function (x) { var c = cm()[x.char]; return c ? c.team : null; });
    var t = []; P.forEach(function (p) { t[p.seat - 1] = p.team; }); return t;
  }
  function evilInfo(i) {
    var s = seats()[i], T = startTeams(), evilT = function (t) { return t === 'demon' || t === 'minion' || t === 'mafia'; };
    if (!s || !evilT(T[i])) return null;
    var skipped = false; try { skipped = evilInfoSkipped(); } catch (e) {}
    if (skipped) return null;
    var me = cm()[s.char], out = { 동료: [] };
    T.forEach(function (t, j) { if (j !== i && evilT(t)) out.동료.push({ 자리: j + 1, 흉수: t === 'demon' }); });
    /* 블러프는 첫밤 흉수에게만 — 스타패스로 새로 흉수가 된 사람은 받지 않는다(판 시작 기록의 처음 직업) */
    var start = ((state.log && state.log.players) || []).filter(function (p) { return p.seat === i + 1; })[0];
    if (me.team === 'demon' && start && start.team === 'demon') {   // 첫밤에 받은 것을 계속 안다 — 무대 조회는 첫밤에만 주므로 판에 저장된 bluffIds 에서
      var ids = state.bluffIds || []; if (ids.length) out.블러프 = ids.map(ko).filter(function (x) { return x; });
      else { try { out.블러프 = (q('game.stage') || {}).bluffs || null; } catch (e) {} }
    }
    return out;
  }
  /* 받은 정보 — 코어가 «정보 전달»로 남긴 것 중 이 좌석 몫. 참가자에게 보여 준 답만(진짜 답·거짓 이유는 안 준다) */
  /* 답 종류 — 직업 이름이 아니라 답 모양으로(파생 직업도 같은 해석, P4 v2.1 3절). 모르는 모양은 추측하지 않고 «미확인» */
  function answerKind(e) {
    var a = String(e.답 == null ? '' : e.답), n = (e.자리 || []).length, r = (e.직업들 || []).length;
    if (e.판) return { 종류: '판' };
    if (/^\s*\d+\s*$/.test(a)) return { 종류: '수', 값: +a };
    if (/그렇다|아니다/.test(a)) return { 종류: '예아니오', 값: /그렇다/.test(a) };
    if (n >= 2 && r) return { 종류: '두자리직업', 값: e.직업들[0] };
    if (r) return { 종류: '직업', 값: e.직업들[0] };
    if (/없음/.test(a)) return { 종류: '없음' };   // 사서 «외지인 없음»·조사관 «하수인 없음»
    return { 종류: '미확인' };
  }
  function received(i) {
    var out = [], acts = 0, last = null;
    events().forEach(function (e) {
      if (e.type === '밤 지목' && e.seat === i + 1) { acts++; last = { n: e.n, id: '행동' + acts }; return; }
      if (e.type !== '정보 전달' || e.누구 !== i + 1) return;
      var o = { 사건: '받음' + (out.length + 1), 밤: e.n, 답: e.답, 자리: e.자리 || [], 직업들: e.직업들 || [] }, k = answerKind(e);
      o.답종류 = k.종류; if ('값' in k) o.값 = k.값;
      if (last && last.n === e.n) { o.계기 = last.id; last = null; }   // 계기 — 같은 밤 이 좌석이 고른 지목(점술가·봉사). 없으면 자동 정보
      if (e.판) o.판 = e.판;   // 판 — 세작이 그 밤 본 진행자 판 스냅숏
      out.push(o);
    });
    return out;
  }
  function view(who) {
    if (who === 'host') return { 진행자: true, 판: JSON.parse(JSON.stringify(state)), 기록: events() };
    var i = who | 0, s = seats()[i]; if (!s) return null;
    var out = {
      자리: i + 1, 이름: s.name || '', 단계: state.phase || 'setup', 밤: state.nights || 1,
      나: { 직업: ko(shownChar(i)), 편: side(shownChar(i)), 살아있음: !(s.dead && publicDeath(i)) },   // 밤에 죽어도 아침 발표 전엔 본인도 모른다(봉사는 그 카드로 앎)
      좌석: seats().map(function (x, j) { return { 자리: j + 1, 이름: x.name || '', 살아있음: !x.dead || (x.dead && !publicDeath(j)) }; }),
      공개: publicEvents(), 받은정보: received(i)
    };
    var ev = evilInfo(i); if (ev) out.악안내 = ev;
    out.내행동 = myActions(i);
    var snaps = out.받은정보.filter(function (x) { return x.판; }); if (snaps.length) out.진행자판 = snaps[snaps.length - 1];   // 세작 — 그 밤 본 판(실시간 아님, 관측규칙표 v1.1 5절)
    return out;
  }
  /* 내가 한 행동 — 밤에 고른 자리(«밤 지목» 기록 중 본인 것) */
  function myActions(i) {
    return events().filter(function (e) { return e.type === '밤 지목' && e.seat === i + 1; }).map(function (e, k) {
      return { 사건: '행동' + (k + 1), 밤: e.n, 대상: (e.대상 || []).map(function (l) { var m = String(l).match(/좌석 (\d+)/); return m ? +m[1] : null; }).filter(function (x) { return x; }) };
    });
  }
  function publicDeath(j) { return publicEvents().some(function (e) { return (e.종류 === '사망' || e.종류 === '처형') && e.자리 === j + 1; }); }
  /* 합법 행동 — 막힌 대상은 이유 없이 뺀다 */
  function legal(who) {
    var i = who | 0, out = [];
    if (state.phase !== 'day') {
      var c = null; try { c = q('game.current'); } catch (e) {}
      if (c && c.seatNumber === i + 1 && c.needsTargetsFirst) {
        out.push({ 종류: '대상', 최소: c.minPick, 최대: c.pickCount, 후보: c.targets.filter(function (t) { return !t.disabledReason; }).map(function (t) { return t.index + 1; }) });
        if (canStarpass(i)) out.push({ 종류: '넘겨주기' });   // 원작 스타패스 — 코어는 «객귀·임프 자발적 계승» 흐름(SUC_MAP imp_self)
      }
      return out;
    }
    var d = null; try { d = q('game.day'); } catch (e) {}
    if (!d) return out;
    if ((d.nominators || []).some(function (x) { return x.index === i; }))
      out.push({ 종류: '지명', 후보: (d.targets || []).filter(function (t) { return t.index !== i; }).map(function (t) { return t.index + 1; }) });
    (d.noms || []).forEach(function (nm, k) {
      var vs = []; try { vs = q('day.voters', String(k)) || []; } catch (e) {}
      if (vs.some(function (v) { return v.index === i; })) out.push({ 종류: '투표', 지명: k });
    });
    return out;
  }
  function canStarpass(i) {
    var s = seats()[i]; if (!s || (state.nights || 1) < 2) return false;
    var c = cm()[s.char]; if (!c || ['imp', 'gaekgwi'].indexOf(c.id) < 0) return false;
    return seats().some(function (x, j) { return j !== i && !x.dead && cm()[x.char] && cm()[x.char].team === 'minion'; });
  }
  /* 좌석 행동 — legal 에 있는 것만. 투표는 모았다가 진행자가 closeVote 로 한 번에 */
  var votes = {};
  /* 참가자에게 돌려주는 응답 — 접수됐는지만, 한 모양으로. 내부 명령 번호·판 번호·효과·무효 여부는 진행자·재생(record) 쪽에만(2026-10-01 코덱스 2차 재검토) */
  function act(who, a) { var r = actRaw(who, a) || {}; return r.status === 'ok' ? { status: 'ok' } : { status: r.status || 'rejected', code: r.code || 'rejected' }; }
  function actRaw(who, a) {
    var i = who | 0, L = legal(i);
    if (a.종류 === '대상') {
      var g = L.filter(function (x) { return x.종류 === '대상'; })[0];
      if (!g) return { status: 'rejected', code: 'notYourTurn' };
      var t = (a.대상 || []).map(function (x) { return (x | 0) - 1; });
      if (t.length < g.최소 || t.length > g.최대 || t.some(function (x) { return g.후보.indexOf(x + 1) < 0; })) return { status: 'rejected', code: 'invalidSelection' };
      return dispatch('night.commitTargets', { targets: t });
    }
    if (a.종류 === '넘겨주기') {
      if (!L.some(function (x) { return x.종류 === '넘겨주기'; })) return { status: 'rejected', code: 'invalidSelection' };
      /* 자기 공격도 능력 판정을 거친다(2026-10-01 코덱스 재검토): 흉수가 중독·취함이거나 보호받으면 아무 일 없음 — 요청만 기록, 참가자에게 알리지 않는다 */
      var me = seats()[i], hurt = false; try { hurt = pickFalsified(i).length > 0; } catch (e) {}
      if (hurt || (me.rem || []).indexOf('보호됨') >= 0) return dispatch('엔진.넘겨주기무효', { seat: i });
      /* 계승: 건강한 몸주가 살아 있고 흉수 사망 직전 5명 이상이면 몸주(강제). 아니면 살아 있는 하수인 중 진행자 재량 — 엔진 기본값은 가장 앞자리(기록에 남는다) */
      var alive = seats().filter(function (x) { return !x.dead; }).length, heir = -1;
      seats().forEach(function (x, j) { if (heir < 0 && j !== i && !x.dead && ['scarletwoman', 'momju'].indexOf(x.char) >= 0 && alive >= 5) { var h = false; try { h = pickFalsified(j).length > 0; } catch (e) {} if (!h) heir = j; } });
      if (heir < 0) seats().forEach(function (x, j) { if (heir < 0 && j !== i && !x.dead && cm()[x.char] && cm()[x.char].team === 'minion') heir = j; });
      return heir < 0 ? { status: 'rejected', code: 'noHeir' } : dispatch('succession.apply', { id: 'imp_self', seat: heir });
    }
    if (a.종류 === '지명') {
      var h = L.filter(function (x) { return x.종류 === '지명'; })[0];
      if (!h || h.후보.indexOf(a.대상 | 0) < 0) return { status: 'rejected', code: 'invalidSelection' };
      return dispatch('day.nominate', { by: i, target: (a.대상 | 0) - 1 });
    }
    if (a.종류 === '투표') {
      if (!L.some(function (x) { return x.종류 === '투표' && x.지명 === a.지명; })) return { status: 'rejected', code: 'invalidSelection' };
      var v = votes[a.지명] || (votes[a.지명] = {}); v[i] = !!a.찬성; return { status: 'ok', pending: true };
    }
    return { status: 'rejected', code: 'unknownAction' };
  }
  function closeVote(k) {
    var v = votes[k] || {}; delete votes[k];
    return dispatch('day.vote', { k: k, voters: Object.keys(v).filter(function (x) { return v[x]; }).map(Number) });
  }
  return {
    view: view, legal: legal, act: act, closeVote: closeVote, answerKind: answerKind,   // answerKind — 복기(replay.js)가 끝난 판 기록으로 보기를 다시 세울 때 같은 해석을 쓴다
    host: { dispatch: dispatch, query: q },
    record: function () { return log.slice(); },
    reset: function () { log = []; n = 0; votes = {}; }
  };
})();
