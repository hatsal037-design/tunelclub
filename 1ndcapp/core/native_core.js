/* NativeCore — 스위프트가 부르는 유일한 창구 (2026-09-28 iOS 3단계, 설계 03 §3 제안 API 의 첫 구현).
   규칙은 전부 기존 앱 함수(build/app.js)가 한다. 여기는 읽기 모델로 옮기고, 명령을 기존 함수에 잇고, 저장 경계를 긋는 일만.
   · query(name, args) — 순수 읽기. 상태를 바꾸지 않는다(wzNightList 처럼 바꾸는 함수는 쓰지 않는다 — nightListOf 를 쓴다).
   · dispatch(cmd) — {commandId, expectedRevision, type, payload}. 같은 commandId 는 처음 응답을 그대로(중복 탭), 낡은 revision 은 거부.
   · 응답·조회는 순수 JSON 문자열. 아직 명령에 잇지 못한 것은 notConnected 로 거부한다 — 성공한 척하지 않는다. */
var NativeCore = (function () {
  var revision = 0, replies = {}, lastImport = null, lastNote = '';
  var lastMerged = 0;   // 서버에서 내려받아 합친 판 수(sync.merge 결과)
  var J = function (o) { return JSON.stringify(o); };
  var cm = function () { return CMAP(); };
  var rejected = function (code, recovery) { return { status: 'rejected', code: code, revision: revision, recovery: recovery || '' }; };

  /* 연습판 — 오늘 화면에서 고른 «다음 판은 연습»을 배정 때까지 들고 있다(웹 ngPractice 는 메모리라 앱을 껐다 켜면 사라진다). 판에 들어가면 state.practice 가 잇는다 */
  var PRACTICE_KEY = 'dangsan_practice_next';
  function home() {
    var h = homeState(), ed = ED();
    var dest = h === 'play' ? 'resumeGame' : h === 'draft' ? 'resumePreparation' : 'newPreparation';
    var n = (state.seats || []).filter(function (s) { return s && (s.name || s.char); }).length;
    var summary = h === 'play' ? ((state.nights || 1) === 1 ? '첫밤' : (state.phase === 'day' ? '낮 ' : '밤 ') + (state.nights || 1)) + ' · ' + n + '명'
      : h === 'draft' ? n + '명 준비 중' : null;
    return { destination: dest, ruleFamily: ed.hub || '당산나무', modeName: ed.name || null, summary: summary, hasRecords: logsAll().length > 0,
      practice: h === 'play' ? !!state.practice : localStorage.getItem(PRACTICE_KEY) === '1',
      prepStep: h !== 'draft' ? null : hasRoles() ? 'handoff' : n >= 5 ? 'seats' : 'people' };   // 준비 이어 하기 — 역할을 나눴으면 넘기기부터(앱을 껐다 켜도 하던 자리로)
  }

  /* 좌석 화면 id — 명단 pid 가 없는 사람도 끼워 넣기 전후로 같은 id 여야 화면이 «누가 어디로 갔는지»를 안다.
     자리 번호로 id 를 만들면 순서가 바뀌어도 id 가 그대로라 화면이 옛 미리보기를 붙들고 있었다(2026-09-29 «덜덜·두 칸씩»).
     저장하지 않는 표식이라 좌석 객체에 약한 참조로만 붙인다(웹 저장 모양은 그대로). */
  var seatKeys = new WeakMap(), seatKeyN = 0;
  function seatKey(s, i) { if (!s || typeof s !== 'object') return 'seat-' + i; if (s.pid) return s.pid; if (!seatKeys.has(s)) seatKeys.set(s, 'p' + (++seatKeyN)); return seatKeys.get(s); }

  /* 오늘 밤 죽은 사람 — 아침 발표 전까지 참가자 화면엔 산 사람으로(보이기·고르기 둘 다). 원작도 밤 죽음은 아침까지 비밀 (2026-09-29 햇살님 확정) */
  function diedTonight(s) { return !!(s && s.dead) && state.phase !== 'day' && s.cause !== 'exec' && s.cause !== 'day' && (s.causeN || 0) === (state.nights || 1); }
  function pickDis(x, R) { var tn = diedTonight(x.s); return R.dead === 'dead' ? (!x.s.dead || tn) : (!!x.s.dead && !tn); }   // 부활류는 죽은 사람만 — 오늘 밤 죽은 사람은 산 사람 취급
  function board() {
    var rect = state.layout === 'rect', seats = (state.seats || []).map(function (s, i) {
      /* 진행자 판 — 죽음·유령표·표식을 칸 위에 바로(웹 renderSquare 의 사망 흑백·표식 딱지). status 는 명단 줄 한 줄 요약 */
      var rem = (s.rem || []).filter(function (t) { return t !== '유령표'; }), dead = !!s.dead;
      var causeKo = { exec: '처형', demon: '흉수 습격', night: '밤', day: '낮', curse: '저주', succession: '계승' };
      var tokens = rem.map(function (t) { return TK(t); });
      return { id: seatKey(s, i), index: i, number: i + 1, name: s.name || '', member: (function () { var w = s.pid ? personById(s.pid) : null; return (w && w.tunelId) || null; })(), dead: dead, tonight: diedTonight(s), ghost: dead && (s.rem || []).indexOf('유령표') >= 0, tokens: tokens,
        status: [dead ? '사망' + (s.cause && causeKo[s.cause] ? ' · ' + causeKo[s.cause] : '') : '생존'].concat(tokens).join(' · ') };
    });
    var cells = [];
    if (rect) {   // 칸 위치는 앱의 rectPositions(둘레 순서) 그대로 — 행·열로만 바꾼다
      var P = rectPositions(), c = state.cols, r = state.rows, gaps = new Set(normGaps()), order = seatCells();
      P.forEach(function (p, cell) {
        var col = c < 2 ? 0 : Math.round((p.x - 13) / 74 * (c - 1)), row = r < 2 ? 0 : Math.round((p.y - 15) / 70 * (r - 1));
        var si = gaps.has(cell) ? -1 : order.indexOf(cell);
        cells.push({ id: cell, row: row, col: col, seatID: si >= 0 && seats[si] ? seats[si].id : null });
      });
    }
    return { shape: rect ? 'rect' : 'round', seats: seats, cells: cells, rows: state.rows || 0, cols: state.cols || 0, canRearrange: !inGame() };
  }

  /* 밤 카드의 능력 종류 — pickPanel 과 같은 방식으로 act 를 읽는다. 연결한 종류만 SUPPORTED */
  var SUPPORTED = { token: 1, kill: 1, info: 1, record: 1, cure: 1, revive: 1, swap: 1, reveal: 1, killif: 1, tokenif: 1, joinif: 1, guess: 1, guesses: 1, transform: 1, madness: 1, askdie: 1 };
  function actOf(c) {
    var R = pickRuleOf(c) || {}, act = R.act || 'record';
    return { R: R, kind: act.split(':')[0].split('|')[0], arg: act.split('|')[0].split(':').slice(1).join(':'), opt: act.split('|')[1] || '' };
  }
  /* 경고 묶음 html(div 여러 개) → 한 줄씩 글로 */
  function htmlLines(html) { return String(html || '').split(/<\/div>/).map(textOf).filter(Boolean); }
  function textOf(html) { return String(html || '').replace(/<button[\s\S]*?<\/button>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/ ([·,.)])/g, '$1').trim().replace(/^[^0-9A-Za-z가-힣'"(]+/, ''); }   // 웹 결과 문구 앞 이모지는 뗀다
  /* «지금 할 일» 한 문장 — 능력 종류·인원으로 (웹 pickHeadOf 와 같은 갈래). 긴 진행 대사(say)는 상세 안내로 보낸다 (2026-09-28 코덱스 검토 G01) */
  function doNow(a, cap, usable, resolved) {
    if (!usable) return '깨워서 확인하고 재워요.';
    if (resolved) return a.kind === 'info' ? '답을 알려 주고 재워요.' : '결과를 확인하고 재워요.';
    var n = cap > 1 ? '최대 ' + cap + '명' : '한 명';
    return ({ token: n + '을 골라 \'' + a.arg + '\' 표식을 붙여요.', kill: '데려갈 사람 ' + n + '을 골라요.', info: '가리킨 ' + (cap > 1 ? cap + '명' : '한 명') + '을 고르면 답을 알려 드려요.',
      record: '지목한 사람을 기록해요.', cure: '\'' + a.arg + '\'을 뗄 사람을 골라요.', revive: '되살릴 사람을 골라요.', swap: '직업을 맞바꿀 두 사람을 골라요.',
      reveal: '내 좌석을 알려 줄 사람을 골라요.', killif: '판정할 사람을 골라요.', tokenif: '판정할 사람을 골라요.', joinif: '마피아인지 볼 사람을 골라요.',
      guess: '한 명과 그 사람의 직업을 짚게 해요.', guesses: '사람과 직업을 짝지어 추측을 받아요.', transform: '바꿀 사람과 새 직업을 골라요.', madness: '홀릴 사람과 행세할 직업을 골라요.',
      askdie: n + '을 골라 한 사람씩 «살겠다/죽겠다»를 받아요.' })[a.kind] || '대상을 골라요.';
  }
  /* 카드 따라가기 — 처리 중 사망·둔갑·계승으로 깨울 순서가 바뀌면 보던 카드(같은 dk)의 새 자리로 옮긴다(웹 wz.lastWho 와 같은 일) */
  function follow(dk) {
    if (dk === undefined || state.phase === 'day') return;
    var list = nightListOf((state.nights || 1) === 1 ? 'fn' : 'on'), at = -1;
    for (var i = 0; i < list.length; i++) if (String(list[i].dk) === String(dk)) { at = i; break; }
    if (at >= 0) wz.idx = at + 1;
  }
  function current() {
    var key = (state.nights || 1) === 1 ? 'fn' : 'on', list = nightListOf(key);
    if (!list.length) return null;
    var idx = wz.idx || 0; if (state.phase === 'day' || idx < 1 || idx > list.length) return null;
    return { list: list, k: idx - 1, o: list[idx - 1] };
  }

  function nightCard() {
    var cur = current(); if (!cur) return null;
    var o = cur.o, c = o.c, s = o.s || {}, owner = o.i, a = actOf(c), R = a.R;
    var usable = R.pick > 0 && pickUsableNow(R) && R.act !== 'auto' && !(isRoleAny(c, ['sanjeok', 'godfather']) && (state.nights || 1) === 1);
    var cap = usable ? pickCapNow(c, R) : 0, minPick = usable ? ((a.kind === 'kill' || a.kind === 'record') ? 1 : a.kind === 'guesses' ? 0 : cap) : 0;
    var supported = !usable || !!SUPPORTED[a.kind];
    var roleMode = a.opt === 'role';
    var missKey = (state.nights || 1) + '|' + owner, miss = (state.roleMiss || {})[missKey];   // 판에 없는 직업을 고른 기록
    var resolved = usable && (pickGet(owner).length > 0 || !!miss);
    var targets = [];
    if (usable && roleMode) {   // 직업 칸으로 고른다(술도가·처사·명두·달걀귀신) — 같은 직업의 첫 좌석이 대상(웹 pickPanel 과 같음)
      var seen = {}; pickCands(c, owner).forEach(function (x) { if (!pickDis(x, R) && seen[x.s.char] === undefined) seen[x.s.char] = x.i; });
      if (isRoleAny(c, ['myeongdu', 'pixie'])) Object.keys(seen).forEach(function (id) { targets.push({ id: 'role-' + id, index: seen[id], number: 0, name: CMAP()[id].ko, disabledReason: null }); });   // 명두(픽시)는 진행자가 판에 있는 직업을 보여 준다
      else {   // 대신·처사·달걀귀신 — 원작처럼 모드 전체에서 고른다(판에 있는지 드러나지 않게). 판에 없으면 좌석 번호 대신 음수(헛방) — 2026-09-29 햇살님
        var phil = isRoleAny(c, ['cheosa', 'philosopher']);
        CHARS().filter(function (x) { return x.team !== 'host' && x.team !== 'fabled' && (!phil || x.team === 'town' || x.team === 'outsider'); })
          .forEach(function (x, k) { targets.push({ id: 'role-' + x.id, index: seen[x.id] !== undefined ? seen[x.id] : -(k + 1), number: 0, name: x.ko, disabledReason: null }); });
      }
    } else if (usable && a.kind !== 'guesses') targets = pickCands(c, owner).map(function (x) {
      return { id: seatKey(x.s, x.i), index: x.i, number: x.i + 1, name: x.s.name || ('좌석 ' + (x.i + 1)),
        disabledReason: pickDis(x, R) ? (R.dead === 'dead' ? '살아 있음' : '사망') : null };
    });
    /* 대상 말고 더 물을 것 — 직업(맞히기·둔갑·행세), 본인/대상(주모), 여러 추측(남사당), 생사 답(저승사자) */
    var roleOptions = null, roleTitle = null;
    if (usable && (a.kind === 'guess' || a.kind === 'guesses' || a.kind === 'transform' || a.kind === 'madness')) {
      var inPlay = {}; state.seats.forEach(function (x) { if (x.char) inPlay[x.char] = 1; });
      roleOptions = CHARS().filter(function (x) { return x.team !== 'host' && (a.kind === 'guess' || a.kind === 'guesses' ? true : a.kind === 'transform' ? (x.team !== 'fabled' && x.team !== 'traveler' && !inPlay[x.id]) : (x.team === 'town' || x.team === 'outsider')); })
        .map(function (x) { return { id: x.id, ko: x.ko }; });
      roleTitle = a.kind === 'guess' || a.kind === 'guesses' ? '맞히려는 직업' : a.kind === 'transform' ? '새 직업(판에 없는 직업만)' : '행세할 선한 직업';
    }
    var seatsAlive = a.kind === 'guesses' ? pickCands(c, owner).filter(function (x) { return !x.s.dead || diedTonight(x.s); }).map(function (x) { return { index: x.i, number: x.i + 1, name: x.s.name || ('좌석 ' + (x.i + 1)) }; }) : null;
    var enabledN = targets.filter(function (t) { return !t.disabledReason; }).length;
    var short = usable && !resolved && a.kind !== 'guesses' && enabledN < minPick;   // 고를 대상이 모자람 — «선택 안 함»과 다르다(01 G01). 웹처럼 넘길 수 있게
    var missKo = miss && CMAP()[miss] ? CMAP()[miss].ko : '';
    var missNote = !miss ? null : a.kind === 'kill' ? '«' + missKo + '»는 판에 없어요 — 원작대로 진행자가 대신 한 명을 골라 죽여요. 좌석 시트에서 «흉수의 습격»으로 사망 처리하세요.'
      : isRoleAny(c, ['cheosa', 'philosopher']) ? '«' + missKo + '»는 판에 없어요 — 이제 그 능력을 써요. 그 능력의 차례는 진행자가 직접 챙겨 주세요.'
      : '«' + missKo + '»는 판에 없어요 — 아무 일도 일어나지 않아요. 참가자에게는 알리지 않아요.';   // 조회는 상태를 안 바꾼다 — 문구만 계산
    var result = missNote ? missNote : (wz.pickRes && wz.pickRes.owner === owner) ? textOf(wz.pickRes.html).replace(/(아래 )?'?답 보여주기'?에서/g, '«답 직접 고르기»로') : (resolved ? '처리했어요.' : null);   // 아이폰의 직접 답 도구 이름으로
    /* 정보 능력의 답 — 웹은 «답 보여주기» 화면으로 넘긴다. 앱의 공개 화면이 생기기 전까지 진행자에게 글로 보여준다.
       거짓을 줘야 하는 상태(중독·취함…)면 적지 않는다 — pickShowInfo 가 이미 경고를 결과로 남긴다 */
    var answer = null, trueAnswer = null, falseReason = null, ansBoard = null;
    /* 답 자리표 — 자리·직업을 가리키는 답(두 사람 중 하나가 이 직업·이 사람은 이 직업·흉수는 이 사람…)은 자리표+직업 그림으로 보인다(2026-09-29 햇살님).
       seats 는 보여 줄 자리(나머지는 빈 동그라미), roles 는 가운데 직업 이름 */
    function boardOf(o, t) {
      if (!o) return null; var v = o.value, cm = CMAP(), ko = function (id) { return cm[id] ? cm[id].ko : String(id); };
      var side = function (id) { var c = cm[id]; return c ? (((FIXED.TEAM || {})[c.team] || {}).side || null) : null; };   // 알려 준 직업의 편 — 자리 테두리 색
      if ((o.type === 'duo' || o.type === 'trio' || o.type === 'seats') && v && v.seats) return { seats: v.seats.slice(), roles: v.char ? [ko(v.char)] : [], head: v.head || '', side: v.char ? side(v.char) : (o.type === 'trio' || /흉수|악|하수인/.test(v.head || '') ? 'evil' : null) };
      if (o.type === 'seat' && typeof v === 'number') return { seats: [v], roles: [], head: o.label || '', side: /흉수|악|하수인/.test(o.label || '') ? 'evil' : null };
      if (o.type === 'char' && v) return { seats: (t || []).slice(), roles: [ko(v)], head: '', side: side(v) };
      if (o.type === 'dream' && Array.isArray(v)) return { seats: (t || []).slice(), roles: v.map(ko), head: '' };
      return null;
    }
    /* 거짓을 줘야 하는 상태(중독·취함·헛것…) — 웹 pickShowInfo 처럼 앱이 고른 그럴듯한 거짓을 답으로, 진짜 답은 진행자만 펼쳐 보게.
       반전 계열(헛것·만물 거짓)의 예/아니오·선악은 반대 답이 곧 정답. 거짓은 fakeFromAns 가 판 안에 한 번 정해 두고(state.fixed) 다시 물어도 같다 */
    function falsify(a0, t) {
      var why = pickFalsified(owner); if (!why.length || !a0) return false;
      var fk = null;
      if ((a0.type === 'ox' || a0.type === 'team') && why.every(function (x) { return /헛것|만물 거짓/.test(x); })) fk = { type: a0.type, value: a0.type === 'ox' ? !a0.value : (a0.value === 'good' ? 'evil' : 'good') };
      else fk = fakeFromAns(a0, c, owner, t);
      falseReason = why.join('·'); trueAnswer = uiAnsText(a0) || a0.label || null;
      answer = fk ? (uiAnsText(fk) || fk.label || null) : null; ansBoard = boardOf(fk, t); return true;
    }
    if (resolved && (a.kind === 'info' || a.kind === 'guess')) { var pg = wz.pickGuess; try { var t0 = pickGet(owner); if (a.kind === 'guess') wz.pickGuess = guessOf()[(state.nights || 1) + '|' + owner] || null;   // 투전꾼 — 짚은 직업(확정 때 적어 둔 것)으로 답을 다시 계산
      var an = targetAns(c, owner, t0); if (!falsify(an, t0) && !pickFalsified(owner).length && an) { answer = uiAnsText(an) || null; ansBoard = boardOf(an, t0); } } catch (e) {} wz.pickGuess = pg; }
    /* 참가자에게 보여줄 답 — 웹이 답 화면으로 넘기던 능력들(딱따기꾼 알림·남사당 적중 수·구미호 행세 직업) */
    if (resolved && !answer && !falseReason) { try {
      if (a.kind === 'reveal') { answer = seatLabel(owner).number + '번 ' + seatLabel(owner).name + ' — ' + c.ko + '예요'; ansBoard = { seats: [owner], roles: [c.ko], head: '', side: ((FIXED.TEAM || {})[c.team] || {}).side || null }; }
      else if (a.kind === 'guesses') { var G = (state.guesses || {})[owner] || []; answer = G.filter(function (g) { return state.seats[g.seat] && state.seats[g.seat].char === g.char; }).length + '개 맞음'; }
      else if (a.kind === 'madness') { var mt = pickGet(owner)[0], ma = (state.madAs || {})[mt]; if (ma && CMAP()[ma.role]) { answer = CMAP()[ma.role].ko + ' 행세'; ansBoard = { seats: [mt], roles: [CMAP()[ma.role].ko], head: '행세', side: ((FIXED.TEAM || {})[CMAP()[ma.role].team] || {}).side || null }; } }
    } catch (e) {} }
    if (!usable && R.act === 'auto' || (!R.pick && fxRule(c) && fxRule(c).act === 'auto')) {   // 자동 정보(스님·유모…) — 앱이 계산한 답
      try { var au = autoAns(c, owner); if (!falsify(au, [])) { if (pickFalsified(owner).length) answer = '거짓 정보를 주세요 (' + pickFalsified(owner).join('·') + ')'; else if (au) { answer = uiAnsText(au) || au.label || null; ansBoard = boardOf(au, []); } } } catch (e) {}
    }
    return { phaseTitle: (state.nights || 1) === 1 ? '첫밤' : '밤 ' + state.nights, index: cur.k + 1, total: cur.list.length,
      seatNumber: owner + 1, name: s.name || ('좌석 ' + (owner + 1)), roleName: c.ko, teamName: TKO(c.team),
      instruction: short ? '고를 수 있는 사람이 모자라요 — 이번엔 넘어가요.' : doNow(a, cap, usable, resolved), pickCount: cap, minPick: minPick, targets: targets,
      primaryTitle: short ? '다음 차례' : usable && !resolved ? '대상 확정' : (usable ? '전달하고 재우기' : '다음 차례'),
      trueAnswer: trueAnswer, falseReason: falseReason,
      /* 세작·스파이·호방·과부 — 판 전체(모든 좌석의 정체·상태)를 건네 보여 주는 화면(웹 ansGrimoire). 그 직업 카드에만 싣는다 */
      grimoire: isRoleAny(o.real || c, ['sejak', 'spy', 'hobang', 'widow']) ? seatsPublic('board').filter(function (p) { return p && p.charId; }).map(function (p) {
        return { number: p.no, name: p.name || '', role: p.ko || '', evil: ['minion', 'demon', 'mafia'].indexOf(p.team) >= 0, dead: !!p.dead, tokens: (p.rem || []).map(String) }; }) : null,
      warns: (function () { var w = []; try { w = htmlLines(wzCardWarns(o)); } catch (e) {} if (s.dead) w.unshift('이 사람은 사망 상태 — 사후 능력이 아닐 땐 깨우지 말고 넘어가세요.'); return w; })(),
      actions: (function () { try { var fr = wz.pickRes && wz.pickRes.owner === owner ? wz.pickRes.html : '';   // «그래도 처리» — 무효·착호꾼으로 막힌 처리를 진행자 판단으로 밀고 나가기(웹 결과 줄의 단추)
        return htmlItems(fr + wzOnceBtns(o) + ((c.tk || []).some(function (t) { return DELAY_KILL[t]; }) ? delayedHtml() : '') + (o.dk === 'lm' ? blHolderHtml(o) : '')).filter(function (x) { return x.call; }); } catch (e) { return []; } })(),   // 몸 없는 흉수(꼬마 괴물·업귀) — 하수인이 정한 «품은 사람» 옮기기
      allies: usable ? knownAllies(owner) : [],
      needsTargetsFirst: usable && !resolved && !short, detail: c.ab + (c.say ? '\n\n진행: ' + c.say : ''), stepKey: String(o.dk),
      resolved: resolved, result: result, answer: answer, ansBoard: ansBoard,
      /* 꼭 뭔가 보여 줘야 하는 카드 — 보여 주기 전엔 «재우기»를 잠근다(2026-09-29 햇살님 «잘못 넘기는 일 없게») */
      mustShow: !short && (answer != null || falseReason != null || (usable && ['info', 'guess', 'guesses', 'reveal', 'madness'].indexOf(a.kind) >= 0)),   // 고를 사람이 모자라 넘기는 카드는 빼고
      /* 1회 능력 사용함 표식(본 능력 + 부분 능력) — 두 번 톡 눌러 되돌린다(seat.toggleToken) */
      onceUsed: (function () { var F = fxRule(c) || {}; return ['능력 사용함'].concat(F.once_sub || []).filter(function (t) { return (s.rem || []).indexOf(t) >= 0; }); })(), roleOptions: roleOptions, roleTitle: roleTitle, either: a.opt === 'either' && usable,
      guessMax: a.kind === 'guesses' ? (R.pick || 1) : 0, guessSeats: seatsAlive, askDie: a.kind === 'askdie' && usable, chosen: resolved ? pickGet(owner).map(function (i) { return i; }) : [],
      chosenLabels: resolved ? pickGet(owner).map(function (i) { var l = seatLabel(i); return l.number + '번 ' + l.name; }) : [],   // 본인에게 붙이기·추측처럼 대상 목록 밖 사람도 이름으로
      supported: !!supported, unsupportedNote: supported ? null : '이 능력(' + a.kind + (a.opt ? '|' + a.opt : '') + ')은 아직 앱에서 처리 화면이 없어요. 웹 진행 화면에서 처리해 주세요.' };
  }

  /* P03 역할 — 구성 초안은 웹과 같은 ngCounts(메모리). 인원·모드가 바뀌면 자동 구성으로 다시 시작(openNewGame 과 같은 규칙) */
  function ensureNg() { var n = (state.seats || []).length || 8; if (typeof ngFor === 'undefined' || ngFor !== ngKey() || ngTarget !== n) { ngTarget = Math.max(5, Math.min(20, n)); ngCounts = autoCompose(ngTarget); ngFor = ngKey(); } }
  function roles() {
    ensureNg(); renderNewGame();
    var n = ngTarget, ed = ED(), M = allMods(), hubs = [];
    Object.keys(M).forEach(function (id) { var h = M[id].hub || '당산나무'; if (id !== 'compendium' && hubs.indexOf(h) < 0) hubs.push(h); });
    var modes = Object.keys(M).filter(function (id) { return id !== 'compendium' && (M[id].hub || '당산나무') === (ed.hub || '당산나무'); }).map(function (id) {
      var P = edPlayable(M[id]); var ok = !P.set || P.set.indexOf(n) >= 0;
      return { id: id, name: M[id].name, playable: ok, note: ok ? null : n + '명으로는 할 수 없어요' };
    });
    var list = CHARS().filter(function (c) { return c.team !== 'host'; }).map(function (c) {
      return { id: c.id, ko: c.ko, team: c.team, teamKo: TKO(c.team), count: ngCounts[c.id] || 0, many: !!ngMany(c) };
    });
    var need = tvNeed(), tv = tvSeatIdx(), total = ngTotal();
    var reason = total !== n ? '직업 ' + total + '개 · 자리 ' + n + '명 — 수를 맞춰 주세요.' : (need && tv.length !== need ? '여행자 ' + need + '명을 선택해주세요.' : null);
    return { family: ed.hub || '당산나무', families: hubs, modeID: state.edition, modes: modes, count: n, total: total,
      setups: (ed.setups || []).map(function (su, i) { return { index: i, name: su.name, diff: su.diff || '' }; }),
      /* 승리 조건 — 웹 새 판 «승리 조건» 고르기와 같은 목록. 판정은 바꾸지 않고 «이번 판 공지»에 읽어 줄 문장 */
      win: (function () { var w = winPick(); return { mode: w.mode, text: w.text, options: WINPRESETS.map(function (x) { return { id: x.id, label: x.id === 'custom' ? '직접 입력' : winLabel(x) }; }) }; })(),
      roles: list, guide: textOf(document.getElementById('ngGuide').innerHTML).replace(/인원\s*−?\s*\d+\s*＋?\s*/, ''),
      summary: textOf(document.getElementById('ngSummary').innerHTML), notice: textOf(document.getElementById('ngNotice').innerHTML) || null,
      travelerNeed: need, travelerSeats: tv, seats: (state.seats || []).map(function (x, i) { return { index: i, number: i + 1, name: x.name || ('좌석 ' + (i + 1)) }; }),
      canAssign: !reason, disabledReason: reason };
  }

  /* P04 넘기기 — 진행자 목록(누구까지 넘겼나)과 참가자 한 사람 몫의 공개 모델을 나눈다(03 §5).
     공개 모델엔 그 사람이 볼 카드만 — 취객류는 가짜 카드(state.fakes). 진짜 직업·다른 사람 정보는 넣지 않는다 */
  function handoffOrder() { var cm = CMAP(); return state.seats.map(function (s, i) { return s.char && cm[s.char].team !== 'host' ? i : -1; }).filter(function (i) { return i >= 0; }); }
  function handoff() {
    var cm = CMAP(), order = handoffOrder(), pos = typeof state.rvPos === 'number' ? state.rvPos : -1;
    return { position: pos, order: order.map(function (i) { return { index: i, number: i + 1, name: state.seats[i].name || ('좌석 ' + (i + 1)) }; }),
      fakes: Object.keys(state.fakes || {}).filter(function (k) { return cm[state.fakes[k]] && state.seats[+k]; }).map(function (k) {
        return { number: +k + 1, real: cm[state.seats[+k].char].ko, shown: cm[state.fakes[k]].ko }; }),
      notice: (function () { try { return prepNoticeItems(); } catch (e) { return []; } })() };   // 이번 판 공지 — 돌리기 전에 읽어 줄 방 규칙·승리 조건(웹 준비 4단계)
  }
  function handoffPublic(arg) {
    var i = +arg, s = state.seats[i], cm = CMAP(); if (!s || !s.char) return null;
    var shown = cm[(state.fakes || {})[i] || s.char];
    return { name: s.name || ('좌석 ' + (i + 1)), roleName: shown.ko, teamName: TKO(shown.team), ability: shown.ab, side: ((FIXED.TEAM || {})[shown.team] || {}).side || null };   // side — 팀 글자 색(선·악). 가짜 카드면 보이는 직업의 편
  }

  /* 진행 단계 — 밤 시작 카드(idx 0) · 카드 · 새벽(마지막 뒤) · 낮 · 마감. 화면은 이것만 보고 무엇을 그릴지 고른다 */
  function seatLabel(i) { var x = state.seats[i]; return { index: i, number: i + 1, name: (x && x.name) || ('좌석 ' + (i + 1)) }; }
  function succession() {
    return successionReady().map(function (x) { var c = []; try { c = x.후보() || []; } catch (e) {}
      return { id: x.id, name: x.이름, note: x.안내 || '', candidates: c.map(function (o) { return seatLabel(o.i); }) }; });
  }
  function stage() {
    if (gameEnded()) return { stage: 'done', title: '판 끝' };
    if (state.phase === 'day') return { stage: 'day', title: '낮 ' + dayNo(state.nights), succession: succession() };
    var key = (state.nights || 1) === 1 ? 'fn' : 'on', list = nightListOf(key), idx = wz.idx || 0, cm = CMAP();
    var title = (state.nights || 1) === 1 ? '첫밤' : '밤 ' + state.nights;
    if (idx === 0) {
      var em = null; if (key === 'fn') { try { em = evilMeetSteps(); } catch (e) {} }
      /* 밤 시작 알림 — 계승 대기·취함·중독 수·가짜 직업 미정·지연 사망 때가 된 사람(웹 시작 카드 아래 줄과 같게). 지연 사망은 «지금 사망 처리» 단추 */
      var introNotes = [], introActs = [];
      try { introNotes = htmlLines(nightExtraHtml() + fakesWarnHtml()); introActs = htmlItems(delayedHtml()); } catch (e) {}   // 지연 사망은 안내+단추 한 묶음으로만(코덱스 2묶음 — 안내가 두 번 나오던 것)
      return { stage: 'intro', title: title, succession: succession(), notes: introNotes, actions: introActs, nextNight: !!ED().twoNights && (state.nights || 1) === 1,
        order: list.map(function (o) { var l = seatLabel(o.i); l.role = o.c ? o.c.ko : ''; return l; }),
        skipped: nightSkipped(list).map(function (x) { var l = seatLabel(x.i); l.role = x.c.ko;
          l.why = (key === 'fn' && x.why === '조건' && meetCoversFirst({ c: x.c, s: x.s, i: x.i })) ? '악팀 알려주기' : x.why; return l; }),
        meet: em ? { steps: em.steps.map(textOf), warn: em.warn.map(textOf) } : null,
        bluffs: key === 'fn' && em && usesBluff() ? (state.bluffIds || []).map(function (id) { return cm[id] ? cm[id].ko : id; }) : [],
        /* 블러프 보여 줄 때의 자리표 — 흉수 자리(내 자리 표시)와 흉수가 아는 같은 편(붉은 테두리). 같은 편 규칙은 knownAllies 그대로 */
        bluffDemon: (function () { var d = evilRoster().filter(function (o) { return o.c.team === 'demon'; })[0]; return d ? d.i : null; })(),
        bluffAllies: (function () { var d = evilRoster().filter(function (o) { return o.c.team === 'demon'; })[0]; return d ? knownAllies(d.i) : []; })() };
    }
    if (idx > list.length) {
      var n = state.nights || 1, two = !!ED().twoNights, from = two && n === 2 ? 1 : n;   // 선2밤 — 첫 낮에는 두 밤의 사망을 함께 발표
      var dead = state.seats.map(function (x, i) { return x.dead && x.causeN >= from && x.causeN <= n && x.cause !== 'exec' ? seatLabel(i) : null; }).filter(Boolean);
      if (two && n === 1) return { stage: 'dawn', title: title, deaths: [], nextNight: true, succession: succession() };
      return { stage: 'dawn', title: title, deaths: dead, succession: succession() };
    }
    return { stage: 'card', title: title, succession: succession() };
  }
  function process() {
    var key = (state.nights || 1) === 1 ? 'fn' : 'on', list = nightListOf(key), n = state.nights || 1, done = (state.done || {})[n] || {}, idx = wz.idx || 0;
    return { title: state.phase === 'day' ? ((n === 1) ? '첫밤' : '밤 ' + n) + ' 진행(지난밤)' : ((n === 1) ? '첫밤' : '밤 ' + n),   // 낮에 열면 지난밤 목록이다 — «낮 1»이라 적으면 낮에 다시 처리할 순서로 읽혔다(코덱스 전체 흐름)
      steps: list.map(function (o, k) { var l = seatLabel(o.i); l.role = o.c ? o.c.ko : ''; l.status = done[o.dk] ? 'done' : (state.phase !== 'day' && k === idx - 1 ? 'current' : 'upcoming'); return l; }),
      skipped: nightSkipped(list).map(function (x) { var l = seatLabel(x.i); l.role = x.c.ko; l.why = x.why; return l; }),
      canDiscard: firstNightBegun() && !gameEnded() };
  }
  /* 같은 편 표시(고를 때 붉은 테두리) — «악팀 알려주기»에서 서로 확인한 사람만. 알려주기가 생략·조작되는 판은 아예 끈다(2026-09-29 햇살님 확정).
     조직(오리지널 마피아)은 같은 조직 중 서로 깨우는 조직만. 편이 나중에 바뀐 사람(창귀·전향)은 그 자리에 없었으니 빼고, 망석중은 자기가 악인 걸 모른다.
     인원 부족(evilInfoSkipped)·금줄쟁이/양귀비 재배자(알려주기 생략)·대역꾼/마술사(섞어 소개)·신들린이/미치광이(가짜 흉수 — 진짜에게만 뜨면 샌다) 판은 끈다. */
  function knownAllies(owner) {
    var cm = CMAP(), me = state.seats[owner]; if (!me || !me.char) return [];
    var gm = null; try { gm = groupMeetSteps(); } catch (e) {}
    if (gm) { var g = seatGroup(me, cm); if (!g || !groupMeets(g)) return [];
      return state.seats.map(function (x, i) { return i; }).filter(function (i) { return i !== owner && state.seats[i].char && seatGroup(state.seats[i], cm) === g; }); }
    if (evilInfoSkipped()) return [];
    if (state.seats.some(function (x) { return x.char && isRoleAny(cm[x.char], ['geumjul', 'poppygrower', 'daeyeokkun', 'magician', 'sindeullini', 'lunatic']); })) return [];
    var show = evilRoster().filter(function (o) { return !isRole(o.c, 'mangseokjung') && !isConv(o.s); });
    if (!show.some(function (o) { return o.i === owner; })) return [];
    return show.filter(function (o) { return o.i !== owner; }).map(function (o) { return o.i; });
  }
  /* 직업 그림 — 웹 CE() 와 같은 규칙: 목판화(ICON_BY_ID) → 코인 아트 → 이모지. 테마 스킨 직업은 이모지만 */
  function roleArt(c, mid) {
    var skin = typeof SKINS !== 'undefined' && (SKINS[mid] || []).indexOf(c.id) >= 0;
    var ic = !skin && typeof ICON_BY_ID !== 'undefined' ? ICON_BY_ID[c.id] : null;
    var coin = !skin && !ic && typeof coinArt === 'function' ? coinArt(c) : '';
    return { icon: skin ? 'skin_' + mid + '_' + c.id : ic || (coin ? coin.replace(/^.*\//, '').replace(/\.webp$/, '') : null), e: String(c.e || '') };   // 시계탑 세 판은 스킨/<모드>/<직업>.webp
  }
  function reference() {
    var ed = ED(), card = null; try { card = nightCard(); } catch (e) {}
    return { modeName: ed.name, guide: textOf(ed.guide || ''), current: card ? { roleName: card.roleName, detail: card.detail } : null,
      roles: CHARS().filter(function (c) { return c.team !== 'host'; }).map(function (c) { var r = roleArt(c, state.edition || 'basic'); return { id: c.id, ko: c.ko, team: c.team, teamKo: TKO(c.team), ab: c.ab, icon: r.icon, e: r.e }; }) };
  }

  /* 웹 버튼 → 항목 목록. 허용한 호출(ALLOW)만 누를 수 있게 넘긴다 — 특수 승리·정치인·낮 알림의 즉시 처리 */
  var ALLOW = /^(?:(spGuess|spClaim|spBangToggle|spBangDo|spCult|spPolitician|dayHeavenKill|dayCurseKill|markUsed)\((\d+|true|false)?\)|(?:markSubUsed|delayedKill)\(\d+,'[^'<>]{1,20}'\)|(?:pickApplyTokenV|pickCure|pickKill|pickRevive|pickJudge|pickTokenIf|pickTransform|pickMadness)\(\d+(?:,'[^'<>]{1,40}'|,false){0,2},true\)|pickRec\(state\.nights\|\|1\)\[\d+\]=\[\d+\];pickKill\(\d+,false\)|blSetHolder\(\d+\))$/;   // 마지막 — 몽달이(killif) «조건 충족 → 사망 처리»   // markUsed·markSubUsed — 밤 카드 «1회 능력 사용함» (2026-09-29)
  function htmlItems(html) {
    var out = [], re = /<button([^>]*)>([\s\S]*?)<\/button>/g, last = 0, m;
    while ((m = re.exec(html))) {
      var before = textOf(html.slice(last, m.index)); if (before) out.push({ kind: 'text', text: before, label: null, call: null, on: false });
      var oc = ((m[1].match(/onclick="([^"]*)"/) || [])[1] || '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
      out.push({ kind: 'button', text: null, label: textOf(m[2]).replace(/\s*✓$/, ''), call: ALLOW.test(oc) ? oc : null, on: /class="[^"]*\b(on|gold)\b/.test(m[1]) || /✓/.test(m[2]),
        danger: /Kill\(|,true\)$/.test(oc) });   // 사람을 죽이거나 보호를 뚫는 단추 — 화면에서 위험 행동 모양으로(코덱스 5묶음)
      last = re.lastIndex;
    }
    var tail = textOf(html.slice(last)); if (tail) out.push({ kind: 'text', text: tail, label: null, call: null, on: false }); return out;
  }
  function voters(k) {   // 투표할 수 있는 사람 — uiDayVoteOpen 의 ok 와 같은 잣대 + 표 무게
    var D = dayRec(), n = D.noms[k], cm = CMAP(), cur = (n && n.voters) || [];
    return state.seats.map(function (x, i) { return { x: x, i: i }; }).filter(function (o) {
      return o.x.char && cm[o.x.char].team !== 'host' && (!o.x.dead || (o.x.rem || []).indexOf('유령표') >= 0 || (o.x.rem || []).indexOf('두 몫') >= 0 || cur.indexOf(o.i) >= 0); })
      .map(function (o) { var l = seatLabel(o.i); l.weight = voteWeight(o.i); l.ghost = !!o.x.dead; return l; });
  }
  /* 처형 문 — 웹 낮 «처형 확인»과 같은 잣대: 최다표 1명 + 문턱 이상일 때만 그 사람 처형. 동수·문턱 미달이면 처형 없이 밤으로 (2026-09-29 격차 3차 — 아이폰은 아무 후보나 처형 단추가 있었다) */
  function execGate() {
    var D = dayRec(), need = Math.ceil(voterCount() / 2), open = (D.noms || []).filter(function (x) { return !x.done; });
    var lead = open.length ? Math.max.apply(null, open.map(function (x) { return x.v || 0; })) : 0;
    var leaders = open.filter(function (x) { return (x.v || 0) === lead && lead > 0; }), ok = leaders.length === 1 && lead >= need;
    var reason = ok ? null : leaders.length > 1 ? '동수 ' + lead + '표 — 처형 없음' : lead ? '최다 ' + lead + '표 < 문턱 ' + need + '표 — 처형 없음' : null;
    return { ok: ok, k: ok ? D.noms.indexOf(leaders[0]) : -1, leaders: leaders, lead: lead, need: need, reason: reason };
  }
  function day() {
    if (state.phase !== 'day') return null;
    var D = dayRec(), n = state.nights || 1, cm = CMAP();
    var alive = state.seats.filter(function (x) { return x.char && !x.dead && cm[x.char].team !== 'host'; }).length;
    var G = execGate();
    return { title: '낮 ' + dayNo(n), announced: !!D.announced, need: Math.ceil(voterCount() / 2), alive: alive,
      deaths: state.seats.map(function (x, i) { return x.dead && x.causeN === n && x.cause !== 'exec' ? seatLabel(i) : null; }).filter(Boolean),
      nominators: uiDayNomIdxs().map(seatLabel),
      targets: state.seats.map(function (x, i) { return x.char && cm[x.char].team !== 'host' && !x.dead && !D.noms.some(function (o) { return o.t === i; }) ? seatLabel(i) : null; }).filter(Boolean),
      noms: D.noms.map(function (o, k) { var st = !o.done && G.leaders.indexOf(o) >= 0 ? (G.leaders.length > 1 ? '동수' : (G.ok ? '단독 선두' : null)) : null;
        var pv = null; if (k === G.k) { try { var v = execVerdicts(state.seats[o.t], o.t).find(function (x) { return x.lv === 'end'; }); if (v) pv = textOf(v.t); } catch (e) {} }
        return { k: k, target: seatLabel(o.t), by: o.by === null || o.by === undefined ? null : seatLabel(o.by), votes: o.v || 0, voters: (o.voters || []).length ? o.voters : [], done: !!o.done,
        blocked: o.blockedBy || null, dead: !!(state.seats[o.t] && state.seats[o.t].dead), canExecute: k === G.k, tag: st, preview: pv }; }),
      noExecReason: D.noms.some(function (o) { return o.done; }) ? null : G.reason,
      executed: D.noms.some(function (o) { return o.done; }),
      notes: htmlItems((D.notes || []).join('<br>')).concat(voterCount() !== alive ? [{ kind: 'text', text: '판사만 투표합니다 — 투표권 ' + voterCount() + '명', label: null, call: null, on: false }] : []),   // 판사 모드 — 문턱이 생존 수보다 낮은 까닭(웹 dayBriefHtml)
      special: htmlItems(spHtml()), verdict: verdict() };
  }
  function verdict() { var w = []; try { w = winCheck() || []; } catch (e) {} return w.filter(function (x) { return x.lv === 'end' || x.lv === 'warn'; }).map(function (x) { return { level: x.lv, text: textOf(x.t), win: x.win || null }; }); }
  var WINKO = { good: '선 승리', evil: '악 승리', other: '중립 승리', void: '무효 · 중단' };
  function result() {
    var L = (state.log && state.log.winner) ? state.log : (state.lastLogId ? (logsAll().find(function (x) { return x.id === state.lastLogId; }) || null) : null);
    var win = state.practice ? null : ((L && L.winner) || wz.doneWin || null), ends = verdict().filter(function (x) { return x.level === 'end'; }).map(function (x) { return x.text; });
    return { winner: win, title: win ? WINKO[win] || win : (state.practice ? '연습판 마감' : '판 마감'), why: ends.length ? ends.join(' → ') : (L && L.note ? L.note : (win ? '진행자가 승자를 정해 끝냄' : '승자 없이 마감')),
      recorded: !!(L && L.winner), practice: !!state.practice, politician: htmlItems(state.practice ? '' : polHtml()),
      players: ((L && L.players) || []).map(function (p) { return { number: p.seat, name: p.name || '', role: p.finalRole || p.role, side: p.side || '', won: p.won === true, dead: !!p.dead }; }) };
  }

  /* R01 기록 · L01 자료실 · S01 백업 — 기록·통계 수식은 기존 함수(logsAll·statsOf·buildExport) 그대로 */
  function recordRow(L) { var ed = allMods()[L.mode] || {};
    return { id: L.id, date: String(L.endedAt || L.at || ''), mode: L.modeName || ed.name || L.mode || '', count: (L.players || []).length,
      winner: L.winner || null, winnerKo: L.winner ? (WINKO[L.winner] || L.winner) : '진행 중·기록 없음', nights: L.nights || 0 }; }
  function records() {
    var logs = logsAll().slice().reverse(), P = {}; try { P = statsOf(logsAll()); } catch (e) {}
    return { rows: logs.map(recordRow),
      people: Object.keys(P).map(function (k) { var st = P[k]; return { name: k, games: st.판, wins: st.승, good: st.선, evil: st.악, linked: !!st.연결 }; })
        .sort(function (x, y) { return y.games - x.games || x.name.localeCompare(y.name); }) };
  }
  function eventLine(e) {
    var n = e.n || '', nm = e.name || '', t = e.type;
    if (t === '밤 지목') return '밤' + n + ' ' + nm + (e.role ? '(' + e.role + ')' : '') + ' → ' + (e.대상 || []).join(', ');
    if (t === '지명') return '낮' + n + ' ' + (e.by || '지명자 미기록') + ' → ' + nm + ' 지명';
    if (t === '투표') return '낮' + n + ' ' + (e.대상 || '') + ' ' + ((e.투표자 || []).length) + '표';
    if (t === '처형') return '낮' + n + ' ' + nm + ' 처형' + (e.cancel ? ' (취소)' : '');
    if (t === '사망') return '밤' + n + ' ' + nm + ' 사망';
    if (t === '계승') return (e.대상 || '') + ' ' + (e.이전 || '') + ' → ' + (e.이후 || '') + ' (' + (e.종류 || '계승') + ')';
    if (t === '부활') return nm + ' 부활';
    if (t === '낮 시작' || t === '밤 시작') return null;
    return t + (nm ? ' ' + nm : '');
  }
  function record(id) {
    var L = logsAll().find(function (x) { return x.id === id; }); if (!L) return null;
    var r = recordRow(L); r.note = L.note || '';
    r.players = (L.players || []).map(function (p) { return { number: p.seat, name: p.name || '', role: p.finalRole || p.role, side: p.side || '', won: p.won === true, dead: !!p.dead }; });
    r.events = (L.events || []).map(eventLine).filter(Boolean); return r;
  }
  function library() {
    var M = allMods(), hubs = {};
    Object.keys(M).forEach(function (id) { if (id === 'compendium') return; var m = M[id], h = m.hub || '당산나무', P = edPlayable(m);
      (hubs[h] = hubs[h] || []).push({ id: id, name: m.name, players: P.set && P.set.length ? P.set[0] + '~' + P.set[P.set.length - 1] + '명' : '', roles: (m.chars || []).filter(function (c) { return c.team !== 'host'; }).length,
        roleNames: (m.chars || []).filter(function (c) { return c.team !== 'host'; }).map(function (c) { return c.ko; }) }); });   // 직업 이름으로도 찾게(«무당» → 무당이 나오는 모드)
    return { hubs: Object.keys(hubs).map(function (h) { return { name: h, modes: hubs[h] }; }) };
  }
  function libraryMode(id) {
    var m = allMods()[id]; if (!m) return null;
    return { id: id, name: m.name, guide: textOf(m.guide || ''), roles: (m.chars || []).filter(function (c) { return c.team !== 'host'; }).map(function (c) { var r = roleArt(c, id); return { id: c.id, ko: c.ko, team: c.team, teamKo: TKO(c.team), ab: c.ab || '', icon: r.icon, e: r.e }; }) };
  }

  /* A01 사람 상세 — 웹 좌석 시트(openSheet)와 같은 표식 목록: 판에 든 직업의 전용 표식 → 모드 공통 → 지금 붙은 것 */
  function seatDetail(arg) {
    var i = +arg, x = state.seats[i], cm = CMAP(); if (!x) return null;
    var c = x.char && cm[x.char], inPlay = {}, seen = {}, items = [];
    state.seats.forEach(function (y) { if (y.char) inPlay[y.char] = 1; });
    CHARS().forEach(function (cc) { if (inPlay[cc.id]) (cc.tk || []).forEach(function (t) { if (!seen[t]) { seen[t] = 1; items.push(t); } }); });
    (ED().reminders || []).forEach(function (t) { if (!seen[t]) { seen[t] = 1; items.push(t); } });
    (x.rem || []).forEach(function (t) { if (!seen[t]) { seen[t] = 1; items.push(t); } });
    var causeKo = { exec: '처형', demon: '흉수 습격', night: '밤', day: '낮', curse: '저주', succession: '계승' };
    return { index: i, number: i + 1, name: x.name || ('좌석 ' + (i + 1)), role: c ? c.ko : '', teamKo: c ? TKO(c.team) : '', ability: c ? c.ab : '',
      dead: !!x.dead, cause: x.dead ? (causeKo[x.cause] || x.cause || '') : null, sideKind: c && c.team === 'traveler' ? 'traveler' : c && c.team === 'neutral' ? 'neutral' : null, side: c && c.team === 'traveler' ? (x.side || null) : c && c.team === 'neutral' ? (x.lean || null) : null,   // 여행자 편(판정에 반영)·중립 편들기(기록용) — 웹 좌석 시트와 같게
      canRemove: (state.seats || []).length > 5, isDay: state.phase === 'day', askCause: state.phase !== 'day' && !x.dead && deathCauseMatters(i) && !firstNightNoDemonKill(),
      tokens: items.map(function (t) { return { id: t, label: TK(t), on: (x.rem || []).indexOf(t) >= 0 }; }) };
  }
  /* 처형·낮 즉사의 «보호 상태인데 그래도 죽일까요?» — 웹은 예면 죽이고, 아니면 «처형은 있었고 살아남음»으로 기록한다(execHappenedMark).
     아이폰은 확인 요청(token shield)으로 돌려보내고, ok_shield(그래도) / decline_shield(살아남음으로 기록) 둘 다 커밋한다. 다른 확인창(하루 2회 처형 등)은 이미 앞에서 물었으므로 예 */
  function shieldRun(p, fn) {
    var asked = null, oc = confirm;
    confirm = function (m) { if (/흉수의 습격인가요/.test(m)) return p.cause === 'demon';
      if (/사망 처리할까요/.test(m)) { if (p.ok_shield) return true; if (p.decline_shield) return false; asked = asked || String(m); return false; }
      return true; };
    try { fn(); } finally { confirm = oc; }
    return asked ? { status: 'needsConfirmation', token: 'shield', revision: revision, reasonCode: 'shielded', choices: [asked.replace(/\s*\(자객[^)]*\)/, '')] } : null;
  }
  /* 웹 확인창 가로채기 — 창구에선 confirm 이 늘 «예»라 보호가 무시될 수 있다. 질문은 확인 요청으로 돌려보내고, force 로 다시 오면 예 */
  function asking(p, fn) {
    var asked = null, notes = [], oc = confirm, oa = alert;
    confirm = function (m) { if (/흉수의 습격인가요/.test(m)) return p.cause === 'demon'; if (p.force) return true; asked = asked || String(m); return false; };
    alert = function (m) { notes.push(String(m)); };
    try { fn(); } finally { confirm = oc; alert = oa; }
    return { asked: asked, notes: notes };
  }

  /* 낭독 — 웹 speak() 를 가로채 «모두 들어도 되는 말»(NR_SRC 허용 목록)만 명령 응답의 effects 로 넘긴다.
     실제 소리는 스위프트가 커밋 뒤 한 번만 낸다(03 §효과). 비밀 답은 NR_SRC 밖이라 여기로 오지 않는다. */
  var effects = [];
  globalThis.speak = function (text, mood, src) {
    if (typeof NR_SRC === 'undefined' || !NR_SRC[src] || !text) return false;
    var t = String(text).replace(/<[^>]*>/g, ' ').replace(/[『』]/g, '').replace(/\s+/g, ' ').trim();
    if (!t) return false;
    effects.push({ kind: 'speak', text: t, mood: mood || 'day' }); return true;
  };

  /* 직전 상태로 — 웹 load() 는 판을 «읽어 돌려줄» 뿐 바꾸지 않는다(state = load() 로 써야 한다). 좌석 화면 id 는 자리 순서대로 옮겨 붙여 화면이 사람을 잃지 않게 */
  function restoreState(raw) {
    var old = state.seats || []; localStorage.setItem('botc_state', raw); var st = load(); if (!st) return;
    state = st; (state.seats || []).forEach(function (x, i) { if (x && old[i] && seatKeys.has(old[i])) seatKeys.set(x, seatKeys.get(old[i])); });
  }
  /* 투전꾼이 짚은 직업 — 웹은 화면 상태(wz.pickGuess)로만 들고 있어 다시 켜면 사라진다. 아이폰은 답을 다시 그려야 하니 따로 적어 둔다(판 저장 모양은 그대로) */
  function guessOf() { try { return JSON.parse(localStorage.getItem('dangsan_guess_of') || '{}'); } catch (e) { return {}; } }
  /* 고른 승리 조건 — 배정(startNewGame)이 웹 화면의 #ngWin 값을 읽으므로 배정 직전에 받침 요소에 넣어 준다 */
  function winPick() { try { var w = JSON.parse(localStorage.getItem('dangsan_win') || 'null'); if (w && w.mode) return w; } catch (e) {} return { mode: (state.win && state.win.mode) || 'std', text: (state.win && state.win.text) || '' }; }
  var STAY = { 'seat.toggleToken': 1, 'seat.kill': 1, 'seat.revive': 1, 'day.call': 1 };   // 보던 밤 카드를 지켜야 하는 명령
  var QUERIES = { home: home, 'preparation.board': board, 'game.current': nightCard, 'preparation.roles': roles, 'preparation.handoff': handoff, 'handoff.public': handoffPublic, 'game.stage': stage, 'game.process': process, reference: reference, 'roles.art': function () { var mid = state.edition || 'basic'; return CHARS().filter(function (c) { return c.team !== 'host'; }).map(function (c) { var r = roleArt(c, mid); return { ko: c.ko, icon: r.icon, e: r.e }; }); }, 'game.day': day, 'game.verdict': function () { return { items: verdict(), winner: endWinner() }; }, 'game.result': result, 'day.voters': function (k) { return voters(+k); }, records: records, record: record, library: library, 'library.mode': libraryMode,
    'seat.detail': seatDetail,
    /* 서버 올리기 — 아직 안 올라간 판을 서버 모양 그대로(코어 SRV.payloadOf). 보내는 건 웹앱·아이폰 앱 몫 (2026-09-29) */
    'sync.merged': function () { return lastMerged; },
    /* 판세 보정 — 서버에 물을 것(이 판 모드·인원, 회원 자리의 편). 켜짐 여부 (2026-09-29) */
    'director.context': function () { var cm = CMAP(), good = [], evil = [];
      state.seats.forEach(function (s) { if (!s || !s.char || !s.pid) return; var w = personById(s.pid); if (!w || !w.tunelId) return; (realEvil(s) ? evil : good).push(w.tunelId); });
      return { mode: state.edition, n: inPlaySeats().length, good: good, evil: evil }; },
    'director.enabled': function () { return tiltOn(); },
    'director.tilt': function () { var t = tiltValue(); return { T: Math.round(t.T * 100) / 100, why: t.why }; },
    'sync.pending': function () { return SRV.pending().map(function (L) { return SRV.payloadOf(L); }); },
    'backup.export': function () { var x = buildExport('backup'); return x ? x.text : null; } };

  /* 진행 중인 판 — 첫밤을 시작했고 아직 끝나지 않은 판. 끝난 판(새 판 — 자리 그대로 뒤)은 다시 준비할 수 있다 */
  function inGame() { return firstNightBegun() && !gameEnded(); }
  function hasRoles() { return (state.seats || []).some(function (x) { return x && x.char; }); }
  function clearAsk() { return { status: 'needsConfirmation', token: 'clearRoles', revision: revision, reasonCode: 'rolesAssigned', choices: ['역할을 이미 나눴어요. 바꾸면 역할을 다시 나눠요 — 사람·자리는 그대로예요.'] }; }
  function guardSetup() { return inGame() ? rejected('notAllowedInPhase', '첫밤이 시작된 뒤에는 자리를 바꿀 수 없어요.') : null; }

  var COMMANDS = {
    'preparation.commitPeople': function (p) {
      var people = (p.people || []).filter(function (x) { return x && String(x.name || '').trim(); });
      /* 투넬 회원에서 고른 사람 — 사람 명부에 회원 번호를 잇고 그 사람(pid)으로 앉힌다. 판을 올릴 때 회원 전적으로 붙는다 (2026-09-29) */
      people = people.map(function (x) {
        var nm = String(x.name).trim(); if (!x.member) return { name: nm };
        var who = personByTunelId(x.member) || personByName(nm) || personNew(nm);
        personLinkTunel(who.id, x.member); return { name: who.name, pid: who.id };
      });
      if (people.length < 5 || people.length > 20) return rejected('invalidSelection', '5명에서 20명까지 넣을 수 있어요.');
      if (inGame()) return rejected('notAllowedInPhase', '진행 중인 판이 있어요 — 판을 끝내거나 버린 뒤 바꿀 수 있어요.');
      var same = people.length === state.seats.length && people.every(function (x, i) { return state.seats[i] && state.seats[i].name === String(x.name).trim() && (!x.pid || state.seats[i].pid === x.pid); });
      if (same && !gameEnded()) return null;   // 같은 명단을 다시 누름 — 역할도 자리도 그대로
      if (gameEnded()) {   // 끝난 판 다음 새 준비 — 판 흔적(역할·밤·기록 위치)을 걷고 사람(이름·pid)만 이어받는다 (2026-09-29 «자리 정하기 처리 못함»)
        switchEdition(state.edition, { quiet: true, force: true });
        state.seats.forEach(function (x) { x.dead = false; delete x.cause; delete x.causeN; });
      } else if (hasRoles() && !p.force) return clearAsk();
      var ok = false; asking({ force: true }, function () { ok = partyApply(people); });
      if (!ok) return rejected('notAllowedInPhase', '지금은 명단을 바꿀 수 없어요.');
      people.forEach(function (x) { if (!x.pid) return; state.seats.concat(state.bench || []).forEach(function (st) { if (st && !st.pid && st.name === x.name) st.pid = x.pid; }); });   // 이름으로 남아 있던 자리에 회원 사람(pid)을 잇는다
      /* 새로 더한 사람은 웹에선 대기자 — 아이폰 자리 화면엔 대기자 칸이 없으니 자리 끝에 앉힌다(자리가 비었을 때의 partyApply 와 같은 방식) */
      if ((state.bench || []).length) { state.bench.forEach(function (b) { state.seats.push(Object.assign(blankSeat(), personOf(b))); }); state.bench = []; state.count = state.seats.length; if (state.layout === 'rect') fitGrid(state.count, true); save(); }
      return null;
    },
    /* 새 판 준비로 들어간다 — practice 면 이번 준비의 판은 연습판(기록 안 남김). 진행 중인 판이 있으면 거부 */
    'preparation.enter': function (p) { if (inGame()) return rejected('notAllowedInPhase', '진행 중인 판이 있어요.'); if (p.practice) localStorage.setItem(PRACTICE_KEY, '1'); else localStorage.removeItem(PRACTICE_KEY); return null; },
    'board.setLayout': function (p) { var g = guardSetup(); if (g) return g; setLayout(p.layout === 'rect' ? 'rect' : 'circle'); save(); return null; },
    /* 사각 빈자리 — 웹 자리 잡기의 «빈자리 없애기»(sbCloseGaps, 인원에 맞게 칸을 다시 고름)·«빈자리 고르게»(gapsSpread) */
    'board.closeGaps': function () { var g = guardSetup(); if (g) return g; if (state.layout !== 'rect') return rejected('invalidSelection', '사각 배치에서만 써요.');
      fitGrid(state.count || state.seats.length, true); state.gaps = []; normGaps(); state.origin = 0; save(); return null; },
    'board.spreadGaps': function () { var g = guardSetup(); if (g) return g; if (state.layout !== 'rect') return rejected('invalidSelection', '사각 배치에서만 써요.'); gapsSpread(); save(); return null; },
    'seat.swap': function (p) { var g = guardSetup(); if (g) return g; swapSeats(+p.a, +p.b); return null; },
    /* 끼워 넣기 — from 사람을 to 자리에 넣고 사이 사람은 한 칸씩 민다(아이폰 자리 끌기). 기록은 remapSeatIndices 로 따라간다 */
    'seat.move': function (p) {
      var g = guardSetup(); if (g) return g;
      var n = state.seats.length, a = +p.from, b = +p.to;
      if (!(a >= 0 && a < n && b >= 0 && b < n)) return rejected('invalidSelection', '자리를 찾지 못했어요.');
      if (a === b) return null;
      /* 자리는 둥글게 이어져 있다 — 사이 사람은 끈 방향(dir)의 호, 없으면 짧은 쪽 호로 한 칸씩 민다 */
      var d = (b - a + n) % n, fwd = p.dir === 'fwd' ? true : p.dir === 'back' ? false : d <= n - d;   // 끈 방향이 있으면 그 방향(화면 미리보기와 같게)
      var between = function (k) { var x = (k - a + n) % n; return fwd ? (x > 0 && x <= d) : (x >= d && x < n); };
      var mv = function (k) { if (k === a) return b; if (!between(k)) return k; return fwd ? (k - 1 + n) % n : (k + 1) % n; };
      var next = new Array(n); state.seats.forEach(function (x, k) { next[mv(k)] = x; });
      state.seats = next; remapSeatIndices(mv); return null;
    },
    'seat.setOrigin': function (p) {
      var g = guardSetup(); if (g) return g; var i = +p.seat;
      if (state.layout === 'rect') setOriginCell(cellOfSeat(i)); else { rotateSeats(i); save(); }
      return null;
    },
    'roles.assign': function (p) {   // 기존 startNewGame — P03 에서 고친 구성(ngCounts) 그대로. 검증은 roles() 와 같은 잣대
      if (inGame()) return rejected('notAllowedInPhase', '진행 중인 판이 있어요.');
      var n = (state.seats || []).length; if (n < 5) return rejected('invalidSelection', '인원을 먼저 정해주세요.');
      var r = roles(); if (!r.canAssign) return rejected('invalidSelection', r.disabledReason);
      if (hasRoles() && typeof state.rvPos === 'number' && state.rvPos >= 0 && !p.force) return clearAsk();   // 역할 카드를 돌리기 시작한 뒤 다시 섞기 전에 묻는다 — 본 카드와 달라진다
      var keep = ngCounts; openNewGame(); ngTarget = n; ngCounts = keep; ngFor = ngKey(); ngPractice = localStorage.getItem(PRACTICE_KEY) === '1'; var wp = winPick(); document.getElementById('ngWin').value = wp.mode; document.getElementById('ngWinText').value = wp.text; startNewGame(); try { rvClose(); } catch (e) {}
      state.rvPos = -1; save(); return null;
    },
    'board.changeGrid': function (p) { var g = guardSetup(); if (g) return g; if (state.layout !== 'rect') return rejected('notAllowedInPhase', '사각 배치에서만 바꿀 수 있어요.');
      var c0 = state.cols, r0 = state.rows; changeGrid(p.axis === 'rows' ? 'rows' : 'cols', +p.delta > 0 ? 1 : -1);
      if (state.cols === c0 && state.rows === r0) return rejected('invalidSelection', '인원이 들어가지 않는 크기예요.'); normGaps(); save(); return null; },
    'board.moveGap': function (p) { var g = guardSetup(); if (g) return g; var before = J(state.gaps); moveGap(+p.from, +p.to);
      return J(state.gaps) === before ? rejected('invalidSelection', '그 칸으로는 옮길 수 없어요.') : null; },
    'handoff.begin': function () {   // 웹 openReveal 과 같은 가짜 카드 배정(이미 준 가짜는 그대로) — 화면은 스위프트가 그린다
      if (inGame()) return rejected('notAllowedInPhase', '첫밤이 시작됐어요.');
      openReveal('resume'); try { rvClose(); } catch (e) {} if (typeof state.rvPos !== 'number') state.rvPos = -1; save(); return null;
    },
    'handoff.seen': function (p) { var n = handoffOrder().length, k = +p.position; if (!(k >= -1 && k < n)) return rejected('invalidSelection', '순서를 찾지 못했어요.');
      state.rvPos = k; save(); return null; },
    'roles.setFamily': function (p) { if (inGame()) return rejected('notAllowedInPhase', '첫밤 뒤에는 바꿀 수 없어요.');
      var t = THEMES.find(function (x) { return themeName(x.rep) === p.family; });
      var M = allMods(), id = Object.keys(M).find(function (k) { return k !== 'compendium' && (M[k].hub || '당산나무') === p.family; });
      if (!id) return rejected('invalidSelection', '그 계열의 모드가 없어요.');
      if (hasRoles() && !p.force) return clearAsk();   // 웹 테마 시트의 «역할 비우고 변경» — 한 번만 묻는다
      if (t) setTheme(t.rep, { sure: true }); else switchEdition(id, { quiet: true, force: true }); ensureNg(); return null; },
    'roles.setMode': function (p) { if (inGame()) return rejected('notAllowedInPhase', '첫밤 뒤에는 바꿀 수 없어요.');
      if (!allMods()[p.id]) return rejected('invalidSelection', '모드를 찾지 못했어요.');
      if (hasRoles() && !p.force) return clearAsk();
      switchEdition(p.id, { quiet: true, force: true }); ensureNg(); return null; },
    'roles.auto': function () { ensureNg(); ngCounts = autoCompose(ngTarget); return null; },
    'roles.applySetup': function (p) { ensureNg(); applySetup(+p.index); return null; },
    'roles.toggle': function (p) { ensureNg(); ngPick(p.id); return null; },
    'roles.step': function (p) { ensureNg(); ngStep(p.id, +p.delta); return null; },
    'roles.setWin': function (p) { if (inGame()) return rejected('notAllowedInPhase', '첫밤 뒤에는 바꿀 수 없어요.');
      if (!WINPRESETS.some(function (x) { return x.id === p.mode; })) return rejected('invalidSelection', '승리 조건을 골라 주세요.');
      localStorage.setItem('dangsan_win', JSON.stringify({ mode: p.mode, text: String(p.text || '').slice(0, 120) }));
      if (hasRoles()) { var pre = WINPRESETS.find(function (x) { return x.id === p.mode; }); state.win = { mode: p.mode, text: p.mode === 'custom' ? String(p.text || '').slice(0, 120) : winLabel(pre) }; }   // 이미 나눴으면 공지 문장만 바로 고친다
      return null; },
    /* 판에서 빼기 — 퇴장한 손님(사망과 다름). 웹 좌석 시트 «빼기»(removeSeat): 기록·지목은 seatRemoved 가 좌석 번호를 따라 옮긴다. 5자리 아래로는 못 뺀다 */
    'seat.remove': function (p) { var i = +p.seat; if (!state.seats[i]) return rejected('invalidSelection', '자리를 찾지 못했어요.'); if (state.seats.length <= 5) return rejected('invalidSelection', '최소 5자리는 있어야 해요.');
      var c0 = null; try { c0 = current(); } catch (e) {} var dk = c0 ? c0.o.dk : null;
      var keep = editing; editing = -1; try { asking({ force: true }, function () { removeSeat(i); }); } finally { editing = keep; }
      if (dk !== null && dk !== i && state.phase !== 'day') { try { follow(typeof dk === 'number' ? (dk > i ? dk - 1 : dk) : dk); } catch (e) {} }   // 보던 카드를 지킨다(앞 사람을 빼도 한 칸 건너뛰지 않게) — 보던 사람을 뺐으면 다음 카드로 자연히
      return null; },
    'seat.setSide': function (p) { var i = +p.seat, x = state.seats[i], c = x && x.char && CMAP()[x.char]; if (!c || ['good', 'evil'].indexOf(p.side) < 0) return rejected('invalidSelection', '편을 골라 주세요.');
      if (c.team === 'traveler') setTravSide(i, p.side); else if (c.team === 'neutral') setLean(i, p.side); else return rejected('invalidSelection', '편을 고르는 직업이 아니에요.'); return null; },   // 같은 편을 다시 누르면 비운다(웹과 같음)
    'roles.fit': function () { ensureNg(); ngFit(); return null; },
    'roles.toggleTraveler': function (p) { if (!state.seats[+p.seat]) return rejected('invalidSelection', '자리를 찾지 못했어요.'); tvToggle(+p.seat); return null; },
    'game.beginFirstNight': function () {
      if (seatsUnnamedBlock()) return rejected('invalidSelection', '이름이 없는 자리가 있어요.');
      prepStartNight(); wz.idx = 0; localStorage.removeItem(PRACTICE_KEY);   // 밤 시작 카드부터 · 연습 표시는 판(state.practice)으로 넘어갔으니 여기서 걷는다(다시 배정해도 연습이 풀리지 않게)
      try { if (usesBluff() && !(state.bluffIds || []).length && evilMeetSteps()) autoBluff(); } catch (e) {}   // 첫밤 블러프는 시작 카드에서 바로 보이게 — 오리지널 마피아엔 블러프가 없다(웹 usesBluff)
      save(); return null;
    },
    'night.start': function () { if (state.phase === 'day' || (wz.idx || 0) !== 0) return rejected('notAllowedInPhase', '이미 시작했어요.');
      if ((state.nights || 1) === 1 && usesBluff() && !(state.bluffIds || []).length && evilMeetSteps()) autoBluff();   // 첫밤 블러프 — 웹과 같은 자동 뽑기
      wz.idx = 1; save(); return null; },
    /* 블러프 다시 뽑기 — 웹 «블러프 바꾸기»의 가벼운 몫(판에 안 나온 선한 직업에서 다시). 첫밤·블러프 있는 판만 */
    'bluff.reroll': function () { if ((state.nights || 1) !== 1 || state.phase === 'day' || !bluffUsable()) return rejected('notAllowedInPhase', '지금은 블러프를 바꿀 수 없어요.'); autoBluff(); return null; },
    'night.previous': function () { if (state.phase === 'day' || (wz.idx || 0) === 0) return rejected('notAllowedInPhase', '처음이에요.'); wzPrev(); save(); return null; },
    'phase.enterDay': function () { var st = stage(); if (st.stage !== 'dawn' && st.stage !== 'intro') return rejected('notAllowedInPhase', '밤 차례가 남아 있어요.');
      if (st.stage === 'intro' && st.order.length) return rejected('notAllowedInPhase', '밤 차례가 남아 있어요.'); wzToDay(); return null; },
    'succession.apply': function (p) { var r = successionReady().find(function (x) { return x.id === p.id; }); if (!r) return rejected('notAllowedInPhase', '지금은 계승할 일이 없어요.');
      var ok = (r.후보() || []).some(function (o) { return o.i === +p.seat; }); if (!ok) return rejected('invalidSelection', '그 자리는 계승 후보가 아니에요.');
      var c0 = current(), dk = c0 ? c0.o.dk : undefined; sucSelect(r.id); sucPickSeat(+p.seat); doSuccession(); follow(dk); return null; },
    'game.discardToRoles': function () { if (!firstNightBegun() || gameEnded()) return rejected('notAllowedInPhase', '버릴 판이 없어요.'); var pr = !!state.practice; wzDiscardToRoles(); if (pr) localStorage.setItem(PRACTICE_KEY, '1'); return null; },   // 연습판을 버리고 다시 나눠도 연습
    'day.announce': function () { if (state.phase !== 'day') return rejected('notAllowedInPhase', '낮이 아니에요.'); uiDayAnnounce(); return null; },
    'day.nominate': function (p) { if (state.phase !== 'day') return rejected('notAllowedInPhase', '낮이 아니에요.');
      var t = +p.target, D = dayRec(), m = day(), by = (p.by === null || p.by === undefined) ? null : +p.by;
      if (!m.targets.some(function (x) { return x.index === t; })) return rejected('invalidSelection', '지명할 수 없는 사람이에요.');   // 웹 지명 대상·지명자 목록과 같은 잣대(죽은 사람·이미 지명된 사람 거름)
      if (by !== null && !m.nominators.some(function (x) { return x.index === by; })) return rejected('invalidSelection', '지명할 수 없는 사람이 골랐어요.');
      nomBy = by; wz.nomTgt = t; return shieldRun(p, function () { uiDayNomSubmit(); try { uiDayVoteCancel(); } catch (e) {} }); },
    'day.vote': function (p) { var D = dayRec(), k = +p.k, n = D.noms[k]; if (!n || n.done) return rejected('invalidSelection', '투표할 지명이 없어요.');
      var ok = {}; voters(k).forEach(function (v) { ok[v.index] = 1; }); var sel = (p.voters || []).map(Number);
      if (sel.some(function (i) { return !ok[i]; })) return rejected('invalidSelection', '투표할 수 없는 사람이 있어요.');
      uiDayVoteOpen(k); pickOv.free = pickOv.free || {}; pickOv.free.sel = sel; uiDayVoteCommit(); return null; },
    'day.execute': function (p) { var D = dayRec(), k = +p.k, n = D.noms[k]; if (!n || n.done) return rejected('invalidSelection', '처형할 지명이 없어요.');
      var G = execGate(); if (k !== G.k && !p.ok_execGate) return { status: 'needsConfirmation', token: 'execGate', revision: revision, reasonCode: 'belowGate', choices: [(G.reason ? G.reason.split(' — ')[0] + ' — ' : '') + '규칙상 처형이 아니에요. 방 규칙·예외로 처형할까요?'] };   // 웹도 묻고 예면 진행한다
      var nToday = state.nights || 1, execedToday = D.noms.some(function (o) { return o.done; }) || state.seats.some(function (x) { return x && x.dead && x.cause === 'exec' && x.causeN === nToday; });   // 웹 uiDayExec 와 같은 잣대 — 하늘의 벌·좌석 시트 처형도 센다
      if (execedToday && !p.ok_exec2 && !p.force) return { status: 'needsConfirmation', token: 'exec2', revision: revision, reasonCode: 'secondExecution', choices: ['오늘 이미 처형이 있었어요(하루 1회). 예외일 때만 계속하세요.'] };
      return shieldRun(p, function () { uiDayExec(k); }); },
    'day.executeUndo': function (p) { var n = dayRec().noms[+p.k]; if (!n || !n.done) return rejected('invalidSelection', '되돌릴 처형이 없어요.'); uiDayExecUndo(+p.k); return null; },
    'day.call': function (p) { var c = String(p.call || ''); if (!ALLOW.test(c)) return rejected('invalidSelection', '허용하지 않은 동작이에요.'); return shieldRun(p, function () { (0, eval)(c); }); },
    /* 낮으로 되돌리기 — 둘째 밤부터, 이 밤에 아무것도 안 했을 때만(웹 wzUndoNight «← 낮으로»). 막히면 웹 안내를 그대로 */
    'phase.undoNight': function () { if (state.phase === 'day' || (state.nights || 1) <= 1) return rejected('notAllowedInPhase', '되돌릴 낮이 없어요.');
      var notes = [], oa = alert; alert = function (m) { notes.push(String(m)); };
      try { wzUndoNight(); } finally { alert = oa; }
      if (state.phase !== 'day') return rejected('notAllowedInPhase', notes[0] || '되돌릴 수 없어요.');
      notes.forEach(function (t) { effects.push({ kind: 'notice', text: textOf(t) }); }); return null; },   // 웹 안내(정리된 표식 복구 못 함 등)는 화면에 알림으로
    'phase.enterNight': function (p) { if (state.phase !== 'day') return rejected('notAllowedInPhase', '낮이 아니에요.');
      var D = dayRec(), pending = !(D.noms || []).some(function (n) { return n.done; }) && execGate().ok;   // 처형할 사람이 정해졌는데 안 했을 때만 묻는다 — 동수·문턱 미달은 원래 처형 없이 밤
      if (pending && !p.force) return { status: 'needsConfirmation', token: 'night', revision: revision, reasonCode: 'pendingDay', choices: ['아직 처형하지 않은 투표가 있어요. 밤으로 넘길까요? 한 밤짜리 토큰이 정리됩니다.'] };
      wz.voteOpen = null; wzToNight(); return null; },
    'game.finish': function (p) { if (gameEnded()) return rejected('notAllowedInPhase', '이미 끝난 판이에요.');
      wzFinish(); if (wz.mode === 'done') return null;
      if (['good', 'evil', 'other', 'void'].indexOf(p.winner) < 0) return rejected('invalidSelection', '승자를 골라 주세요.');
      wzFinishDo(p.winner, true); return wz.mode === 'done' ? null : rejected('coreFailure', '마감하지 못했어요.'); },
    'game.again': function (p) { if (!gameEnded()) return rejected('notAllowedInPhase', '끝난 판이 아니에요.'); if (state.practice) localStorage.setItem(PRACTICE_KEY, '1');   /* 연습판에서 «한 판 더»는 계속 연습(웹 연습 마당과 같게) */ wz.again = {}; wzAgainGo(); try { prepClose(); } catch (e) {}
      if (p && p.fresh) { switchEdition(state.edition, { quiet: true, force: true }); state.seats.forEach(function (x) { x.dead = false; delete x.cause; delete x.causeN; }); }   // «바꿔서 한 판 더» — 인원·자리부터 다시 볼 땐 지난 판 흔적(사망·역할)을 걷는다(명단 확정의 끝난 판 갈래와 같게)
      return null; },
    'seat.toggleToken': function (p) { var i = +p.seat; if (!state.seats[i]) return rejected('invalidSelection', '자리를 찾지 못했어요.');
      var keep = editing; editing = i; try { toggleRem(String(p.token)); } finally { editing = keep; } return null; },
    'seat.kill': function (p) { var i = +p.seat, x = state.seats[i]; if (!x || x.dead) return rejected('invalidSelection', '이미 죽었거나 자리가 없어요.');
      var keep = editing; editing = i; var r;
      if (p.cause === 'exec') {   // 좌석 시트 처형 — 투표 문을 거치지 않는 진행자 기록. 보호 상태면 처형 화면과 같은 두 갈래(그래도 / 살아남음으로 기록)
        var sr; try { sr = shieldRun(p, function () { executeSeat(); }); } finally { editing = keep; } return sr; }
      try { r = asking(p, function () { toggleDead(state.phase === 'day' ? 'day' : 'night'); }); } finally { editing = keep; }   // 낮에 죽이면 낮 사망
      if (r.asked && !x.dead) return { status: 'needsConfirmation', token: 'kill', revision: revision, reasonCode: 'protected', choices: [r.asked] };
      r.notes.forEach(function (t) { effects.push({ kind: 'notice', text: textOf(t) }); }); return null; },   // «죽은 척하고 살아남아요» 같은 웹 안내를 화면에 — 안 그러면 누른 게 아무 일도 안 한 것처럼 보였다
    'seat.revive': function (p) { var i = +p.seat, x = state.seats[i]; if (!x || !x.dead) return rejected('invalidSelection', '살아 있는 사람이에요.');
      var keep = editing; editing = i; try { asking({ force: true }, function () { toggleDead(); }); } finally { editing = keep; } return null; },
    'record.setWinner': function (p) { if (['good', 'evil', 'other', 'void'].indexOf(p.winner) < 0) return rejected('invalidSelection', '승자를 골라 주세요.');
      if (!logsAll().some(function (x) { return x.id === p.id; })) return rejected('invalidSelection', '기록을 못 찾았어요.'); logSetWinner(p.id, p.winner); return null; },
    'director.setRoleStats': function (p) { try { localStorage.setItem('dangsan_rolestats', JSON.stringify(p.rows || {})); } catch (e) {} return null; },   // 직업별 승률 합계(서버) — 구성 기울이기
    'director.setEnabled': function (p) { try { localStorage.setItem('dangsan_tilt', p.on ? 'on' : 'off'); } catch (e) {} return null; },
    'director.setServer': function (p) { state.director = state.director || {};
      if (p.skill && typeof p.skill.gap === 'number') state.director.skillSrv = { gap: p.skill.gap, n: p.skill.n | 0 };
      if (p.rate) state.director.rateSrv = { good: p.rate.good | 0, evil: p.rate.evil | 0 };
      save(); return null; },
    'sync.markUploaded': function (p) { var ids = p.ids || []; if (!ids.length) return rejected('invalidSelection', '올린 판이 없어요.');
      logsAll().filter(function (L) { return L && ids.indexOf(L.uuid || L.id) >= 0; }).forEach(function (L) { SRV.markUploaded(L); }); return null; },
    'sync.merge': function (p) { var n = SRV.mergeRows(p.rows || []); if (n === null) return rejected('coreFailure', '기록을 합치지 못했어요.'); lastMerged = n; return null; },
    'record.delete': function (p) { var a = logsAll(), i = a.findIndex(function (x) { return x.id === p.id; }); if (i < 0) return rejected('invalidSelection', '기록을 못 찾았어요.'); deleteLog(i); return null; },
    'backup.import': function (p) { var data; try { data = JSON.parse(p.json); } catch (e) { return rejected('invalidSelection', '백업 파일을 읽지 못했어요.'); }
      try { var r = importBackup(data); lastImport = r; } catch (e) { return rejected('invalidSelection', String(e.message || e)); } return null; },
    'night.commitTargets': function (p) {
      var cur = current(); if (!cur) return rejected('notAllowedInPhase', '깨울 차례가 없어요.');
      var card = nightCard(), owner = cur.o.i, a = actOf(cur.o.c);
      if (!card.needsTargetsFirst) return rejected('notAllowedInPhase', '이미 처리한 차례예요.');
      if (!card.supported) return rejected('notConnected', card.unsupportedNote);
      var k = a.kind, dk0 = cur.o.dk;
      if (k === 'guesses') {   // 남사당·저글러 — (사람, 직업) 쌍을 최대 pick 개. 채점은 웹과 같은 함수
        var G = (p.guesses || []).filter(function (g) { return state.seats[+g.seat] && CMAP()[g.char]; }).map(function (g) { return { seat: +g.seat, char: g.char }; });
        if (!G.length || G.length > card.guessMax) return rejected('invalidSelection', '추측을 1~' + card.guessMax + '개 넣어 주세요.');
        state.guesses = state.guesses || {}; state.guesses[owner] = G; pickGuessScore(owner); follow(dk0);
        if (!pickGet(owner).length) return rejected('coreFailure', '처리 기록이 남지 않았어요.'); save(); return null;
      }
      var t = (p.targets || []).map(Number), ok = {};
      card.targets.forEach(function (x) { if (!x.disabledReason) ok[x.index] = 1; });
      if (t.length < card.minPick || t.length > card.pickCount || t.some(function (i) { return !ok[i]; }) || new Set(t).size !== t.length)
        return rejected('invalidSelection', card.pickCount > 1 ? card.minPick + '~' + card.pickCount + '명을 골라 주세요.' : '한 명을 골라 주세요.');
      if (card.roleOptions && !card.roleOptions.some(function (o) { return o.id === p.role; })) return rejected('invalidSelection', (card.roleTitle || '직업') + '을 골라 주세요.');
      if (card.askDie && t.some(function (i) { return ['live', 'die'].indexOf((p.answers || {})[i]) < 0; })) return rejected('invalidSelection', '고른 사람 모두의 답(살겠다/죽겠다)을 찍어 주세요.');
      if (t.some(function (i) { return i < 0; })) {   // 판에 없는 직업(대신·처사·달걀귀신) — 효과 없이 «사용함»·기록만, 결과 문구가 진행자에게 알린다
        var mt = card.targets.filter(function (x) { return x.index === t[0]; })[0], mid = mt ? mt.id.replace(/^role-/, '') : null;
        state.roleMiss = state.roleMiss || {}; state.roleMiss[(state.nights || 1) + '|' + owner] = mid;   // ponytail: 좌석 번호 열쇠 — 판 도중 자리를 빼면 어긋난다(드묾). 새 판에선 picks 와 같이 비운다
        pickCommit(owner, [], '판에 없는 직업 · ' + (CMAP()[mid] ? CMAP()[mid].ko : mid));
        follow(dk0); save(); return null;
      }
      pickRec(state.nights || 1)[owner] = t.slice();   // 웹의 pickToggle 과 같은 자리 — 아래 처리 함수가 이걸 읽는다
      if (k === 'token' && card.either && p.self) pickApplyToken(owner, a.arg, [owner]);
      else if (k === 'token') pickApplyToken(owner, a.arg, t);
      else if (k === 'guess') { var go = guessOf(); go[(state.nights || 1) + '|' + owner] = p.role; localStorage.setItem('dangsan_guess_of', JSON.stringify(go)); wz.pickGuess = p.role; pickShowInfo(owner); wz.pickGuess = null; }
      else if (k === 'transform') { wz.pickRole = p.role; pickTransform(owner, a.arg); }
      else if (k === 'madness') { wz.pickRole = p.role; pickMadness(owner, a.arg); }
      else if (k === 'askdie') { wz.askdie = wz.askdie || {}; wz.askdie[owner] = {}; t.forEach(function (i) { wz.askdie[owner][i] = p.answers[i]; }); pickAskDie(owner); }
      else if (k === 'kill') pickKill(owner, a.opt === 'force');
      else if (k === 'info') pickShowInfo(owner);
      else if (k === 'record') pickRecord(owner);
      else if (k === 'cure') pickCure(owner, a.arg);
      else if (k === 'revive') pickRevive(owner);
      else if (k === 'swap') pickSwap(owner);
      else if (k === 'reveal') pickReveal(owner);
      else if (k === 'killif') pickJudge(owner, a.arg);
      else if (k === 'tokenif') { var ct = a.arg.split(':'); pickTokenIf(owner, ct[0], ct[1]); }
      else if (k === 'joinif') pickJoinIf(owner, a.arg);
      follow(dk0);   // 처리로 순서가 바뀌었으면 같은 카드로
      if (!pickGet(owner).length) return rejected('coreFailure', '처리 기록이 남지 않았어요.');
      save(); return null;
    },
    'night.advance': function (p) {   // 대상이 없는 카드만(또는 skip). 대상이 있는 카드는 night.commitTargets 가 이어져야 한다
      var card = nightCard(); if (!card) return rejected('notAllowedInPhase', '깨울 차례가 없어요.');
      if (card.needsTargetsFirst && !p.skip) return rejected('invalidSelection', '먼저 대상을 확정해 주세요.');   // skip — 고르지 않고 재움(웹 «재웠음 · 다음»: 안 쓰겠다는 사람·쓸 수 없는 밤)
      wz.pickRes = null; wzMarkNext(state.nights || 1, isNaN(+card.stepKey) ? card.stepKey : +card.stepKey); save(); return null;
    },
  };

  return {
    query: function (name, arg) { var f = QUERIES[name]; return J(f ? { revision: revision, data: f(arg) } : { revision: revision, data: null, error: 'unknownQuery' }); },
    dispatch: function (json) {
      var cmd = JSON.parse(json);
      if (replies[cmd.commandId]) return replies[cmd.commandId];                       // 같은 명령 재요청 — 처음 응답 그대로
      if (cmd.expectedRevision !== revision) return J(rejected('staleRevision', '판이 바뀌었어요. 다시 읽어 올게요.'));
      var f = COMMANDS[cmd.type]; if (!f) return J(rejected('unknownCommand', cmd.type));
      var snap = localStorage.getItem('botc_state'), wzSnap = JSON.stringify(wz);        // 실패·거절하면 직전 상태로
      effects = [];
      /* 밤 도중 좌석 시트에서 죽이기·살리기·표식·지연 사망을 하면 깨울 목록이 바뀐다 — 보던 카드(dk)를 따라가게(웹 wzRender 의 lastWho 와 같은 몫). 안 그러면 다른 사람 카드로 밀려 옛 대상이 확정될 수 있었다 */
      var dk0 = null; if (STAY[cmd.type] && state.phase !== 'day') { try { var c0 = current(); if (c0) dk0 = c0.o.dk; } catch (e) {} }
      var r;
      try { r = f(cmd.payload || {}); __flushTimers(); }
      catch (e) { r = rejected('coreFailure', String(e && e.message || e)); }
      if (r && r.status !== 'ok') {   // 거절·확인 요청 — 명령이 중간에 바꿔 둔 것(예: game.finish 의 wz.mode)을 되돌린다
        try { if (snap) restoreState(snap); var w0 = JSON.parse(wzSnap); Object.keys(wz).forEach(function (k) { delete wz[k]; }); Object.assign(wz, w0); } catch (e2) {}
      }
      if (!r && dk0 !== null) { try { follow(dk0); } catch (e) {} }
      if (!r) { try { wzPersist(); save(); } catch (e) {} revision += 1; r = { status: 'ok', commandId: cmd.commandId, revision: revision, effects: effects.map(function (e, i) { return Object.assign({ effectId: cmd.commandId + ':' + i }, e); }) }; }   // 진행 위치(wz)도 판과 함께 저장 — 다시 켜면 보던 카드로(03 수용 08)
      var out = J(r); if (r.status === 'ok') replies[cmd.commandId] = out; return out;
    },
    exportStorage: function () { var o = {}; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); o[k] = localStorage.getItem(k); } return J(o); },
    setRevision: function (n) { revision = n | 0; }
  };
})();
