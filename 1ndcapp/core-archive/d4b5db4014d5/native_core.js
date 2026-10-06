/* NativeCore — 스위프트가 부르는 유일한 창구 (2026-09-28 iOS 3단계, 설계 03 §3 제안 API 의 첫 구현).
   규칙은 전부 기존 앱 함수(build/app.js)가 한다. 여기는 읽기 모델로 옮기고, 명령을 기존 함수에 잇고, 저장 경계를 긋는 일만.
   · query(name, args) — 순수 읽기. 상태를 바꾸지 않는다(wzNightList 처럼 바꾸는 함수는 쓰지 않는다 — nightListOf 를 쓴다).
   · dispatch(cmd) — {commandId, expectedRevision, type, payload}. 같은 commandId 는 처음 응답을 그대로(중복 탭), 낡은 revision 은 거부.
   · 응답·조회는 순수 JSON 문자열. 아직 명령에 잇지 못한 것은 notConnected 로 거부한다 — 성공한 척하지 않는다. */
var NativeCore = (function () {
  var revision = 0, replies = {}, lastImport = null, lastNote = '';
  var lastMerged = 0;
  var lastBig = {};
  var undoTgt = null;   // 직전 대상 확정 되돌리기(2026-10-05 햇살님) — 확정 직전 판 상태. 다른 명령이 성공하면 사라진다(그 차례에서만)   // exportSplit — 마지막으로 파일에 쓴 판 기록·마당 요약 글(같으면 다시 안 쓴다)   // 서버에서 내려받아 합친 판 수(sync.merge 결과)
  // 배분 참고값은 이번 판의 진행자 입력이다. 승률·자동 실력값으로 환산하지 않는다.
  var EXPERIENCE_MIN = 20, experienceRecords = {};   // 앱 TILT.SKILL_MIN 과 같은 값 — 둘을 함께 바꾼다 (2026-09-30 «20판으로 통일»)
  function experienceOf(member, manual) {
    var n = member ? experienceRecords[member] : null;
    if (member && n === undefined) {
      try { var saved = JSON.parse(localStorage.getItem('preparation_experience_locks') || '{}'); n = saved[member]; } catch (e) {}
    }
    var grade = null; try { grade = member && JSON.parse(localStorage.getItem('preparation_experience_grades') || '{}')[member] || null; } catch (e) {}
    /* 잠금 = 20판 + 서버가 자동 판정을 줌(등급 있음). 서버 숙련 판이 100판 전이면 등급이 안 와서 20판 넘어도 손 단계를 고른다(0120, 2026-10-03 «표본이 서버에 일정 이상 모이면 그때부터 자동») */
    var locked = Number.isInteger(n) && n >= EXPERIENCE_MIN && grade != null;
    if (!locked) grade = null;
    return { source: locked ? 'records' : member && !Number.isInteger(n) ? 'unknown' : 'manual', grade: grade,
      manual: !locked && Number.isInteger(manual) && manual >= 1 && manual <= 5 ? manual : null, threshold: EXPERIENCE_MIN };
  }
  var J = function (o) { return JSON.stringify(o); };
  /* 계열 말 — 화면으로 나가는 글의 «흉수»를 그 계열의 말로(클래식 악마 · 오리지널 마피아 범죄 조직, 등록부 team.demon 표기). 2026-10-02 햇살님 «클래식 테마에선 악마».
     앱 글 수백 줄이 당산나무 말로 적혀 있어, 글마다 고치지 않고 출구(query·dispatch 답) 한 곳에서 바꾼다. 열쇠는 안 건드리고 글자 값만.
     ponytail: 닉네임에 «흉수»가 들어 있으면 그것도 바뀐다 — 문제 되면 name 열쇠를 건너뛴다. 조사 도구 tools/테마말/전수조사.cjs */
  var outHub = null;   // 조회가 «다른 계열 것을 보는 중»이면 그 계열(자료실 모드 등) — 없으면 지금 고른 계열
  var JOSA = { '가': '이', '를': '을', '는': '은', '와': '과', '로': '으로', '라': '이라', '면': '이면', '다': '이다', '예': '이에', '였': '이었' };
  function themeWords(o) {
    var hub = outHub; outHub = null; if (!hub) { try { hub = hubRep(); } catch (e) { hub = 'dangsan'; } }
    if (hub === 'dangsan') {   // 당산나무 — 글에 섞인 클래식 말을 걷는다(2026-10-02 햇살님 «응 흉수로 바꾸고»)
      var DS = [['흉수(악마)', '흉수'], ['객귀(악마)', '객귀'], ['악마가 죽으면 주민 승', '흉수가 죽으면 마을 승']];
      var fixD = function (s) { if (s.indexOf('악마') < 0) return s; DS.forEach(function (p) { s = s.split(p[0]).join(p[1]); }); return s; };
      var walkD = function (v) { if (typeof v === 'string') return fixD(v); if (Array.isArray(v)) return v.map(walkD);
        if (v && typeof v === 'object') { var r = {}; Object.keys(v).forEach(function (k) { r[k] = walkD(v[k]); }); return r; } return v; };
      return walkD(o); }
    var demon = KO('team', 'demon', hub), tail = /[가-힣]$/.test(demon) && (demon.charCodeAt(demon.length - 1) - 0xAC00) % 28 !== 0;   // 받침으로 끝나면 조사를 맞춘다(범죄 조직이·을)
    var fix = function (s) { if (s.indexOf('흉수') < 0 && s.indexOf('역당') < 0) return s;
      s = s.replace(/흉수\(악마\)/g, '흉수').replace(/하수인\(역당\)/g, KO('team', 'minion', hub));
      return s.replace(/흉수(가|를|는|와|로|라|면|다|예|였)?/g, function (_, j) { return demon + (j ? (tail && JOSA[j] ? JOSA[j] : j) : ''); }); };
    var walk = function (v) { if (typeof v === 'string') return fix(v); if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === 'object') { var r = {}; Object.keys(v).forEach(function (k) { r[k] = walk(v[k]); }); return r; } return v; };
    return walk(o);
  }
  var JT = function (o) { return JSON.stringify(themeWords(o)); };
  var cm = function () { return CMAP(); };
  var rejected = function (code, recovery) { return { status: 'rejected', code: code, revision: revision, recovery: recovery || '' }; };

  /* 연습판 — 오늘 화면에서 고른 «다음 판은 연습»을 배정 때까지 들고 있다(웹 ngPractice 는 메모리라 앱을 껐다 켜면 사라진다). 판에 들어가면 state.practice 가 잇는다 */
  var PRACTICE_KEY = 'dangsan_practice_next';
  /* 광장(그릇) — 그날 모임. 화면 말은 계열 말(PKO). 새 화면엔 없던 것을 다시 들인다(2026-10-05 햇살님 «오늘 화면에 광장 칸») */
  function potView() {
    var p = potNow(); if (!p) return null;   /* 조회는 순수하게 — 닫기는 명령(preparation.enter·pot.*)과 앱을 열 때만. 여기선 24시간 지난 광장을 «없음»으로만 보인다 */
    if (Date.now() >= potEndsAt(p) && !(state.log && state.log.potId === p.id && !state.practice && !gameEnded())) return null;
    return { id: p.id, title: p.title || '', practice: !!p.practice, openedAt: p.openedAt, endsAt: potEndsAt(p), games: (p.gameIds || []).length };
  }
  function home() {
    var h = homeState(), ed = ED();
    var dest = h === 'play' ? 'resumeGame' : h === 'draft' ? 'resumePreparation' : 'newPreparation';
    var n = (state.seats || []).filter(function (s) { return s && (s.name || s.char); }).length;
    var summary = h === 'play' ? ((state.nights || 1) === 1 ? '첫밤' : (state.phase === 'day' ? '낮 ' : '밤 ') + (state.nights || 1)) + ' · ' + n + '명'
      : h === 'draft' ? n + '명 준비 중' : null;
    return { destination: dest, ruleFamily: ed.hub || '당산나무', modeName: ed.name || null, demonKo: KO('team', 'demon', hubRep()), potKo: PKO('그릇'), pot: potView(),   /* 그날 모임·낮 다 같이 이야기 자리의 계열 말 — 당산나무 마당·클래식 광장·오리지널 구역(2026-10-05 햇살님 «테마 따라 이름, 낮에도») */ skillOff: hubRep() === 'mafia',   // 숙련도 안 쓰는 계열(오리지널 마피아) — 준비 화면이 경험 단계를 숨긴다   // 화면 글이 쓰는 계열 말(흉수·악마·범죄 조직)
      summary: summary, hasRecords: (localStorage.getItem('botc_logs') || '[]').length > 2,   // 원문 길이로 — 홈을 그릴 때마다 기록 전체를 펴던 것(앱구조점검, 2026-10-05)
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
      var rc = s.char ? CMAP()[s.char] : null;
      return { id: seatKey(s, i), index: i, number: i + 1, name: s.name || '', role: rc ? rc.ko : null, evil: rc ? ['minion', 'demon', 'mafia'].indexOf(rc.team) >= 0 : false, member: (function () { var w = s.pid ? personById(s.pid) : null; return (w && (w.tunelId || (w.accountId ? 'a:' + w.accountId : null))) || null; })(), dead: dead, tonight: diedTonight(s), ghost: dead && (s.rem || []).indexOf('유령표') >= 0, pdead: dead || (function () { var f = fakeAt(i); return !!f && !(state.phase !== 'day' && f.n === (state.nights || 1) && f.ph !== 'day'); })(),   /* 참가자 판의 생사 — 죽은 척은 발표된 뒤부터 사망(2026-10-05 «죽은 사람처럼») */ tokens: tokens,
        manualExperience: s.manualExperience || null,
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
    var bluffs = []; try { if (usesBluff()) bluffs = (state.bluffIds || []).map(function (id) { var c = CMAP()[id]; return c ? c.ko : id; }); } catch (e) {}   // 진행자 판 가운데 블러프
    return { shape: rect ? 'rect' : 'round', seats: seats, cells: cells, rows: state.rows || 0, cols: state.cols || 0, canRearrange: !inGame(), bluffs: bluffs };
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

  /* 깨우지 않는 밤 — 옛 웹(index.html 6710·6983행)의 거름을 폰 카드에도(2026-10-01 엔진 P1 에서 발견):
     죽은 뒤에만 쓰는 능력(봉사·까마귀지기)은 그 밤에 죽었을 때만, 몸주(주홍여인)는 흉수를 이어받을 때만(그땐 흉수 카드로 뜬다) */
  /* ── 재량 슬라이드(2026-10-01 햇살님) — 코어가 후보 전체를 칸으로 묶어 두고(명령 안에서), 화면은 칸만 보고 고른다. 열거·묶기는 index.html 의 dirEnumerate·discStops ── */
  function discKey(card) { return (state.nights || 1) + '|' + card.stepKey; }
  function discOf(card) { return card ? (state.disc || {})[discKey(card)] || null : null; }
  function discAnsOf(card) { return { answer: card.answer, ansBoard: card.ansBoard, trueAnswer: card.trueAnswer, falseReason: card.falseReason, grimoire: card.boardPieces ? card.grimoire : undefined }; }   // 거짓 판은 판 자체가 답
  /* 현재 카드의 재량표를 한 번 만든다 — 답이 있는 카드만. 이미 있으면 그대로(접었다 펴도·다시 열어도 같다) */
  function discPrepare() {
    var card = nightCard(); if (!card || card.dormant || !(card.answer != null || card.falseReason)) return;
    var key = discKey(card); state.disc = state.disc || {}; if (state.disc[key]) return;
    var cur = current(), owner = cur.o.i, onlyFake = !!card.falseReason;
    var E = dirEnumerate(function () { var c = nightCardRaw(); return c && (c.answer != null || c.falseReason) ? discAnsOf(c) : null; }, owner, onlyFake), cands = E.후보;
    var bad = !E.완료 ? '한도' : E.예외 ? '예외' : E.부작용 ? '부작용' : (cands.length < 2 ? '갈래 하나' : null);   // 하나라도 실패한 길이 있으면 띠 없음(코덱스 13:03)
    var stops = bad ? null : discStops(cands);
    if (!stops) { state.disc[key] = { 없음: true, 까닭: bad || '갈래 하나' }; return; }
    /* 추천 — 칸을 먼저 고른다(2026-10-01 햇살님 A «가운데가 비등», 재량_칸쏠림_고찰.md).
       후보 하나하나를 뽑으면 후보 많은 칸이 이긴다(실측: 비등한 판에서 추천 평균 −0.43, 절반 넘게 악 끝).
       칸은 띠 위에 고르게 −1(악 끝)…+1(선 끝). 판세 기울기 T 가 목표 위치 — 두 칸 사이면 가까운 만큼의 확률로 둘 중 하나(판 열쇠 해시라 다시 물어도 같다).
       그래서 추천 위치의 평균이 곧 T 다(±0.3 이 3칸 띠에서 늘 가운데로 붙던 것 — 첫 구현 실측에서 고침).
       들통날 답(위험 1 이상 — 둘째 밤 취한 스파이의 직업 바꾸기)만 있는 칸은 자동에서 뺀다. 칸 안에선 위험 적은 답 중 판 열쇠 해시로 하나 */
    var half = (stops.length - 1) / 2, pos = stops.map(function (st, k) { return (k - half) / half; });
    var T = tiltOn() ? Math.max(-1, Math.min(1, tiltValue().T || 0)) : 0, minR = function (st) { return Math.min.apply(null, st.후보.map(function (i) { return cands[i].위험 || 0; })); };
    var elig = stops.map(function (st, k) { return k; }).filter(function (k) { return minR(stops[k]) < 1; }); if (!elig.length) elig = stops.map(function (st, k) { return k; });
    var lowK = elig.filter(function (k) { return pos[k] <= T + 1e-9; }).pop(), upK = elig.filter(function (k) { return pos[k] >= T - 1e-9; })[0], best;
    if (lowK === undefined) best = upK; else if (upK === undefined || upK === lowK) best = lowK;
    else best = (discHash(((state.log && state.log.uuid) || '') + '|' + key + '|칸') % 10000) / 10000 < (T - pos[lowK]) / (pos[upK] - pos[lowK]) ? upK : lowK;
    var seedKey = ((state.log && state.log.uuid) || '') + '|' + key, sb = stops[best];
    if (sb.뜻 !== '중간') { var m = minR(sb), low = sb.후보.filter(function (i) { return (cands[i].위험 || 0) === m; }); sb.첫 = low[discHash(seedKey) % low.length]; }
    var D = state.disc[key] = { 후보: cands.map(function (x) { return { 답: x.답, 점수: x.점수, 위험: x.위험, 메모: x.메모 }; }), 칸: stops, 추천: tiltOn() ? best : null, 현재: best, alt: 0, 잠김: false, 삭제: onlyFake ? 'fake' : 'all', 자동답: null, 위치: pos.map(function (v) { return Math.round(v * 100) / 100; }), 목표: Math.round(T * 100) / 100, 정책: 'disc-v2' };
    if (discApply(card, D)) { var c2 = nightCardRaw(); D.자동답 = c2 ? c2.answer : null;   // 추천 칸의 답을 바로 심는다 — 화면 첫 답 = 추천(보정이 꺼져도 가운데 칸 답)
      /* 판세 분석 기록 — 후보마다 뽑던 «앱 선택»은 이 카드에선 버려졌다고 표시하고, 실제로 심은 추천을 한 줄로(분석은 버림 줄을 건너뛴다) */
      if (state.log) { var N = state.nights || 1; state.log.events.forEach(function (e) { if (e.type === '앱 선택' && e.n === N && e.누구 === owner + 1 && !e.버림) e.버림 = '재량 추천'; });
        var bs = (c2 && c2.ansBoard && c2.ansBoard.seats) || [];
        logEvent('앱 선택', { 곳: '재량 추천', 누구: owner + 1, 고름: { 자리: bs.map(function (i) { return i + 1; }), 악: bs.filter(function (i) { return state.seats[i] && realEvil(state.seats[i]); }).length, 칸: best, 칸수: stops.length }, 후보: sb.후보.length, 확률: 1, 기울기: Math.round(T * 100) / 100, 위치: D.위치[best], 근거: 'disc-v2' }); } }
  }
  function discView(card) {
    var D = discOf(card); if (!D || D.없음) return null;
    return { 칸수: D.칸.length, 칸: D.칸.map(function (st) { return { 뜻: st.뜻, 후보수: st.후보.length }; }), 추천: D.추천, 현재: D.현재, 잠김: !!D.잠김, 다른답: !D.잠김 && D.칸[D.현재].후보.length > 1 };
  }
  /* 고른 칸의 후보를 그 카드의 답으로 — state.fixed 에 열거 때 적힌 메모를 그대로 심는다(그 뒤 nightCard 가 그 답을 보인다) */
  function discApply(card, D) {
    var cur = current(), owner = cur.o.i, pick = discPickIn(D, D.현재, D.alt, ((state.log && state.log.uuid) || '') + '|' + discKey(card)); if (!pick) return false;
    state.fixed = state.fixed || {};
    Object.keys(state.fixed).forEach(function (k) { if (+k.split('#').pop() !== owner) return; if (D.삭제 === 'fake' && k.indexOf('fake:') !== 0) return; delete state.fixed[k]; });
    Object.keys(pick.메모).forEach(function (k) { state.fixed[k] = pick.메모[k]; });
    return true;
  }
  /* 확정 기록 — «정보 전달»에 붙는다. 추천 그대로면 auto, 중간 칸이면 중간, 옮겼으면 manual, 직접 고른 답이면 직접 */
  function discRecord(card, how) {
    var D = discOf(card); if (!D || D.없음) return undefined; D.잠김 = true;
    var st = D.칸[D.현재], why = how || ((D.현재 === D.추천 && !D.alt) ? 'auto' : (st.뜻 === '중간' ? '중간' : 'manual'));
    return { 칸수: D.칸.length, 칸뜻: D.칸.map(function (x) { return x.뜻; }), 추천칸: D.추천, 고른칸: D.현재, 다른답: D.alt || 0, 근거: why, 자동답: D.자동답, 정책: D.정책 };
  }
  function nightCard() {
    var card = nightCardRaw(); if (!card) return card;
    try {
      var cur = current(), o = cur.o, c = o.c, s = o.s || {}, RR = fxRule(c) || {}, W = RR.when || [];   // 깨우는 때는 보이는 직업 기준 — 주정뱅이가 받은 가짜 레이븐키퍼가 살아서도 매밤 깨던 것(2026-10-05)
      var deathOnly = W.indexOf('death') >= 0 && !W.some(function (x) { return ['first', 'every', 'later', 'night', 'day'].indexOf(x) >= 0; });
      var dormant = (deathOnly && !(s.dead && diedTonight(s))) || isRoleAny(c, ['scarletwoman', 'momju']);
      if (dormant) {
        card.instruction = deathOnly ? '깨우지 않아요 — 이 밤에 죽었을 때만 깨워요.' : '깨우지 않아요 — 흉수가 죽어 이어받을 때만(그땐 흉수 카드로 떠요).';
        card.targets = []; card.pickCount = 0; card.minPick = 0; card.needsTargetsFirst = false; card.answer = null; card.ansBoard = null;
        card.trueAnswer = null; card.falseReason = null; card.mustShow = false; card.primaryTitle = '다음 차례'; card.dormant = true;
      }
    } catch (e) {}
    try { card.discretion = card.dormant ? null : discView(card); } catch (e) { card.discretion = null; }
    return card;
  }
  function nightCardRaw() {
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
      if (o.type === 'char' && v) { var ab = (t && t.length) ? t.slice() : (o.about || []).slice();   // 대상을 고르지 않는 직업 답(장의사 — 처형자)은 답이 가리키는 자리를
        var dead = !(t && t.length) && ab.length > 0 && ab.every(function (i) { return state.seats[i] && state.seats[i].dead; });
        return { seats: ab, roles: [ko(v)], head: '', side: dead ? 'dead' : side(v) }; }   // 죽은 사람의 직업이면 side 'dead' — 자리 테두리를 보라로(2026-10-04 햇살님 «보라 테두리»)
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
    if (!usable && R.act === 'auto' || !R.pick) {   // 자동 정보(스님·유모…) — 앱이 계산한 답. 대상을 안 고르는 정보 직업(요리사·공감능력자·장의사 = 아낙·삽살개 주인·이방)은 규칙 데이터 act 가 비어 있어도 autoAns 가 답을 낸다 — 2026-09-30 엔진 P1 지원표에서 카드에 숫자가 안 실리던 것 발견. 답이 없는 직업(스파이·부정한 여자…)은 autoAns 가 null 이라 그대로 빈 칸
      try { var au = autoAns(c, owner); if (!falsify(au, [])) { if (pickFalsified(owner).length && (au || R.act === 'auto')) answer = '거짓 정보를 주세요 (' + pickFalsified(owner).join('·') + ')'; else if (au) { answer = uiAnsText(au) || au.label || null; ansBoard = boardOf(au, []); } } } catch (e) {}
    }
    /* 판을 보는 직업(세작·스파이·호방·과부)이 취했거나 중독됐으면 거짓 판(spyFakeBoard, 2026-10-01 스파이_취함_고찰 v2) — 진행자 좌석판은 늘 진짜 */
    var seesBoard = isRoleAny(o.real || c, ['sejak', 'spy', 'hobang', 'widow']), spyFake = null;
    if (seesBoard && !short) { var sw = pickFalsified(owner); if (sw.length) { try { spyFake = spyFakeBoard(owner); } catch (e) { spyFake = null; } if (spyFake && !falseReason) falseReason = sw.join('·'); } }
    return { phaseTitle: (state.nights || 1) === 1 ? '첫밤' : '밤 ' + state.nights, index: cur.k + 1, total: cur.list.length,
      seatNumber: owner + 1, name: s.name || ('좌석 ' + (owner + 1)), roleName: c.ko, teamName: TKO(c.team),
      instruction: short ? '고를 수 있는 사람이 모자라요 — 이번엔 넘어가요.' : doNow(a, cap, usable, resolved), pickCount: cap, minPick: minPick, targets: targets,
      primaryTitle: short ? '다음 차례' : usable && !resolved ? '대상 확정' : (usable ? '전달하고 재우기' : '다음 차례'),
      trueAnswer: trueAnswer, falseReason: falseReason,
      /* 세작·스파이·호방·과부 — 판 전체(모든 좌석의 정체·상태)를 건네 보여 주는 화면(웹 ansGrimoire). 그 직업 카드에만 싣는다 */
      grimoire: seesBoard ? seatsPublic('board').filter(function (p) { return p && p.charId; }).map(function (p) { var f = spyFake && spyFake.판[p.i], fc = f && CMAP()[f.id];
        return { number: p.no, name: p.name || '', role: fc ? fc.ko : (p.ko || ''), evil: ['minion', 'demon', 'mafia'].indexOf(p.team) >= 0, dead: !!p.dead, tokens: (f ? f.tokens : (p.rem || [])).map(String) }; }) : null,
      boardPieces: spyFake ? spyFake.조각 : null,   // 거짓 판에 얹은 조각(종류·무게·자리·바꾼 것) — 기록·복기용
      bluffs: isRoleAny(o.real || c, ['sejak', 'spy', 'hobang', 'widow']) ? (function () { try { return usesBluff() ? (state.bluffIds || []).map(function (id) { var x = CMAP()[id]; return x ? x.ko : id; }) : []; } catch (e) { return []; } })() : null,   // 판 공개 화면 가운데 블러프(2026-10-01)
      warns: (function () { var w = []; try { w = htmlLines(wzCardWarns(o)); } catch (e) {} if (s.dead) w.unshift('이 사람은 사망 상태 — 사후 능력이 아닐 땐 깨우지 말고 넘어가세요.'); return w; })(),
      actions: (function () { try { var fr = wz.pickRes && wz.pickRes.owner === owner ? wz.pickRes.html : '';   // «그래도 처리» — 무효·착호꾼으로 막힌 처리를 진행자 판단으로 밀고 나가기(웹 결과 줄의 단추)
        return htmlItems(fr + wzOnceBtns(o) + ((c.tk || []).some(function (t) { return DELAY_KILL[t]; }) ? delayedHtml() : '') + (o.dk === 'lm' ? blHolderHtml(o) : '')).filter(function (x) { return x.call; }); } catch (e) { return []; } })(),   // 몸 없는 흉수(꼬마 괴물·업귀) — 하수인이 정한 «품은 사람» 옮기기
      allies: usable ? knownAllies(owner) : [],
      needsTargetsFirst: usable && !resolved && !short, canUndoTargets: !!(undoTgt && undoTgt.dk === o.dk && undoTgt.n === (state.nights || 1)), detail: c.ab + (c.say ? '\n\n진행: ' + c.say : ''), stepKey: String(o.dk),
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
      return { id: c.id, ko: c.ko, team: c.team, teamKo: TKO(c.team), count: ngCounts[c.id] || 0, many: !!ngMany(c),
        pinned: pinsResolved().filter(function (p) { return p.id === c.id; }).map(function (p) { return p.i; }) };   // 이 직업을 정해 둔 자리
    });
    var need = tvNeed(), tv = tvSeatIdx(), total = ngTotal();
    /* 모드가 받는 인원 밖이면 배정을 막는다 — 베이직(6~13)에 14명 이상을 넣으면 표가 없어 표준 편성으로 빠지며 수사관·대부를 여러 장 채웠다(2026-10-05 햇살님 «수사관이랑 대부가 3명씩») */
    var P = edPlayable(ed), out = P.set && P.set.indexOf(n) < 0 ? '이 모드는 ' + P.min + '~' + P.max + '명이에요 — 인원에 맞는 모드를 골라 주세요.' : null;
    var reason = out ? out : total !== n ? '직업 ' + total + '개 · 자리 ' + n + '명 — 수를 맞춰 주세요.' : (need && tv.length !== need ? '여행자 ' + need + '명을 선택해주세요.' : null);
    return { family: ed.hub || '당산나무', families: hubs, modeID: state.edition, modes: modes, count: n, total: total,
      setups: (ed.setups || []).map(function (su, i) { return { index: i, name: su.name, diff: su.diff || '' }; }),
      /* 승리 조건 — 웹 새 판 «승리 조건» 고르기와 같은 목록. 판정은 바꾸지 않고 «이번 판 공지»에 읽어 줄 문장 */
      win: (function () { var w = winPick(); return { mode: w.mode, text: w.text, options: WINPRESETS.map(function (x) { return { id: x.id, label: x.id === 'custom' ? '직접 입력' : winLabel(x) }; }) }; })(),
      roles: list, guide: textOf(document.getElementById('ngGuide').innerHTML).replace(/인원\s*−?\s*\d+\s*＋?\s*/, ''),
      summary: textOf(document.getElementById('ngSummary').innerHTML), notice: textOf(document.getElementById('ngNotice').innerHTML) || null,
      travelerNeed: need, travelerSeats: tv, seats: (state.seats || []).map(function (x, i) { return { index: i, number: i + 1, name: x.name || ('좌석 ' + (i + 1)) }; }),
      canAssign: !reason, disabledReason: reason, seatShuffle: !!state.seatShuffle, newSeats: !!state.newSeats };   // 자리 섞기(켜면 직업 먼저 나누고 사람을 앉힘) · 새 자리 시트 열림(2026-10-01)
  }

  /* P04 넘기기 — 진행자 목록(누구까지 넘겼나)과 참가자 한 사람 몫의 공개 모델을 나눈다(03 §5).
     공개 모델엔 그 사람이 볼 카드만 — 취객류는 가짜 카드(state.fakes). 진짜 직업·다른 사람 정보는 넣지 않는다 */
  function handoffOrder() { var cm = CMAP(); return state.seats.map(function (s, i) { return s.char && cm[s.char].team !== 'host' ? i : -1; }).filter(function (i) { return i >= 0; }); }
  function handoff() {
    var cm = CMAP(), order = handoffOrder(), pos = typeof state.rvPos === 'number' ? state.rvPos : -1;
    return { position: pos, seen: (Array.isArray(state.rvSeen) ? state.rvSeen : []).filter(function (k) { return k > pos; }), order: order.map(function (i) { return { index: i, number: i + 1, name: state.seats[i].name || ('좌석 ' + (i + 1)) }; }),
      fakes: Object.keys(state.fakes || {}).filter(function (k) { return cm[state.fakes[k]] && state.seats[+k]; }).map(function (k) {
        return { number: +k + 1, real: cm[state.seats[+k].char].ko, shown: cm[state.fakes[k]].ko }; }),
      notice: (function () { try { return prepNoticeItems(); } catch (e) { return []; } })(),   // 이번 판 공지 — 돌리기 전에 읽어 줄 방 규칙·승리 조건(웹 준비 4단계)
      composition: (function () { try {   // 구성 발표(2026-10-01 햇살님 «총 몇 명, 시민+외지인=선 몇, 악 몇 발표하고 가닥을 잡게») — 앉은 사람의 진짜 직업 팀으로 센다(취객·스파이도 제 팀)
        var n = {}; (state.seats || []).forEach(function (st) { var c = st && st.char ? cm[st.char] : null; if (c) n[c.team] = (n[c.team] || 0) + 1; });
        var town = n.town || 0, out = n.outsider || 0, min = (n.minion || 0) + (n.mafia || 0), dem = n.demon || 0, total = (state.seats || []).filter(function (st) { return st && st.char; }).length;
        return { total: total, good: town + out, town: town, outsider: out, evil: min + dem, minion: min, demon: dem, other: total - town - out - min - dem,
          labels: { town: TKO('town'), outsider: TKO('outsider'), minion: TKO(n.mafia ? 'mafia' : 'minion'), demon: TKO('demon') } };
      } catch (e) { return null; } })() };
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
      var dead = state.seats.map(function (x, i) { if (x.dead && x.causeN >= from && x.causeN <= n && x.cause !== 'exec') return seatLabel(i);
        var f = !x.dead && fakeAt(i); if (f && f.n >= from && f.n <= n && f.ph !== 'day') { var l = seatLabel(i); l.fake = true; return l; }   // 죽은 척 — 사망으로 발표하되 진행자에겐 딱지(2026-10-05 햇살님)
        return null; }).filter(Boolean);
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
    var row = function (c) { var r = roleArt(c, state.edition || 'basic'); return { id: c.id, ko: c.ko, team: c.team, teamKo: TKO(c.team), ab: c.ab, icon: r.icon, e: r.e }; };
    var all = CHARS().filter(function (c) { return c.team !== 'host'; });
    /* 판이 돌 때 — 판에 있는 직업을 위에: 누가 그 직업인지, 선·중립·악 묶음, 묶음 안에서 죽은 사람은 아래(2026-10-01 햇살님) */
    var groups = [];
    if (inGame()) {
      var hold = {}; (state.seats || []).forEach(function (st, i) { if (!st || !st.char) return; (hold[st.char] = hold[st.char] || []).push({ number: i + 1, name: st.name || '', dead: !!st.dead }); });
      var sideOf = function (c) { var sd = fxSide(c.team); return sd === 'evil' ? 'evil' : sd === 'good' ? 'good' : 'neutral'; };
      [['good', '선'], ['neutral', '중립'], ['evil', '악']].forEach(function (g) {
        var rs = all.filter(function (c) { return hold[c.id] && sideOf(c) === g[0]; }).map(function (c) { var o = row(c); o.holders = hold[c.id]; o.dead = hold[c.id].every(function (h) { return h.dead; }); return o; });
        rs.sort(function (a, b) { return (a.dead ? 1 : 0) - (b.dead ? 1 : 0); });   // 안정 정렬 — 산 직업 먼저, 죽은 직업 아래
        if (rs.length) groups.push({ side: g[0], ko: g[1], roles: rs });
      });
    }
    var inPlay = {}; groups.forEach(function (g) { g.roles.forEach(function (r) { inPlay[r.id] = 1; }); });
    /* 블러프로 제시된 직업 — «그 밖의 직업» 위에 따로(2026-10-01 햇살님) */
    var bluffIds = {}; try { if (inGame() && usesBluff()) (state.bluffIds || []).forEach(function (id) { bluffIds[id] = 1; }); } catch (e) {}
    var bluffRoles = all.filter(function (c) { return bluffIds[c.id] && !inPlay[c.id]; }).map(row);
    return { modeName: ed.name, guide: textOf(ed.guide || ''), current: card ? { roleName: card.roleName, detail: card.detail } : null,
      groups: groups, bluffs: bluffRoles, roles: all.filter(function (c) { return !inPlay[c.id] && !bluffIds[c.id]; }).map(row) };
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
      return o.x.char && cm[o.x.char].team !== 'host' && (!pubDead(o.x) || (o.x.rem || []).indexOf('유령표') >= 0 || (o.x.rem || []).indexOf('두 몫') >= 0 || cur.indexOf(o.i) >= 0); })
      .map(function (o) { var l = seatLabel(o.i); l.weight = voteWeight(o.i); l.ghost = pubDead(o.x); return l; });
  }
  /* 처형 문 — 웹 낮 «처형 확인»과 같은 잣대: 최다표 1명 + 문턱 이상일 때만 그 사람 처형. 동수·문턱 미달이면 처형 없이 밤으로 (2026-09-29 격차 3차 — 아이폰은 아무 후보나 처형 단추가 있었다) */
  function execGate() {
    var D = dayRec(), need = Math.ceil(voterCount() / 2), open = (D.noms || []).filter(function (x) { return !x.done; });
    /* 처형은 하루 1회(웹 uiDayExec 의 execedToday 와 같은 잣대) — 처형한 지명을 빼고 남은 최다를 다시 뽑으면 둘째 득표자에게 처형 단추가 켜진다(2026-10-04 햇살님 스크린샷). 금부도사 같은 예외는 «예외로 처형» 길로 */
    var nT = state.nights || 1;
    if ((D.noms || []).some(function (x) { return x.done; }) || state.seats.some(function (x) { return x && x.dead && x.cause === 'exec' && x.causeN === nT; }))
      return { ok: false, k: -1, leaders: [], lead: 0, need: need, reason: '오늘 처형 끝', done: true };
    var lead = open.length ? Math.max.apply(null, open.map(function (x) { return x.v || 0; })) : 0;
    var leaders = open.filter(function (x) { return (x.v || 0) === lead && lead > 0; }), ok = leaders.length === 1 && lead >= need;
    var reason = ok ? null : leaders.length > 1 ? '동수 ' + lead + '표 — 처형 없음' : lead ? '최다 ' + lead + '표 < 문턱 ' + need + '표 — 처형 없음' : null;
    return { ok: ok, k: ok ? D.noms.indexOf(leaders[0]) : -1, leaders: leaders, lead: lead, need: need, reason: reason };
  }
  function day() {
    if (state.phase !== 'day') return null;
    var pend = null; try { pend = pendingResult(); } catch (e) {}   // 처형해 봤다가 되돌리므로 다른 것을 읽기 전에 먼저(되돌린 뒤의 판을 읽어야 한다)
    var D = dayRec(), n = state.nights || 1, cm = CMAP();
    var alive = state.seats.filter(function (x) { return x.char && !x.dead && cm[x.char].team !== 'host'; }).length;
    var G = execGate();
    return { title: '낮 ' + dayNo(n), announced: !!D.announced, need: Math.ceil(voterCount() / 2), alive: alive,
      deaths: state.seats.map(function (x, i) { return x.dead && x.causeN === n && x.cause !== 'exec' ? seatLabel(i) : null; }).filter(Boolean),
      /* 아침 발표 대본(2026-10-04 햇살님 «발표는 대본을 좀 써 주면») — 진행자가 읽는 두 줄. 이름만, 사인 없음 */
      script: dayNarr().lines, scriptPlan: dayNarr().plan,   // 아침 발표 대본 — 화면 줄(이름)과 읽어 주기 순서(이름 대신 자리 번호). 원본 tools/진행목소리/대본.js
      nominators: uiDayNomIdxs().map(seatLabel),
      targets: state.seats.map(function (x, i) { return x.char && cm[x.char].team !== 'host' && !x.dead && !D.noms.some(function (o) { return o.t === i; }) ? seatLabel(i) : null; }).filter(Boolean),
      noms: D.noms.map(function (o, k) { var st = !o.done && G.leaders.indexOf(o) >= 0 ? (G.leaders.length > 1 ? '동수' : (G.ok ? '단독 선두' : null)) : null;
        var pv = null; if (k === G.k) { try { var v = execVerdicts(state.seats[o.t], o.t).find(function (x) { return x.lv === 'end'; }); if (v) pv = textOf(v.t); } catch (e) {} }
        return { k: k, target: seatLabel(o.t), by: o.by === null || o.by === undefined ? null : seatLabel(o.by), votes: o.v || 0, voters: (o.voters || []).length ? o.voters : [], done: !!o.done,
        blocked: o.blockedBy || null, dead: !!(state.seats[o.t] && state.seats[o.t].dead), canExecute: k === G.k, tag: st, preview: pv, saved: !!o.saved }; }),
      /* 동수(2026-10-04 햇살님 시안 C «선택지 주자») — 문턱 넘은 최다가 둘 이상이면 진행자가 고른다: 처형 없음(규칙)·결선 투표·다시 지명 */
      tie: (function () { if (D.noms.some(function (o) { return o.done; })) return null; if (D.tieNone) return { state: 'none' };
        return G.leaders.length > 1 && G.lead >= G.need ? { state: 'open', names: G.leaders.map(function (o) { return seatLabel(o.t); }) } : null; })(),
      mafia: hubRep() === 'mafia', tieVoid: D.tieVoid ? D.tieVoid.map(seatLabel) : null,   // 오리지널 마피아 낮 — 지목받은 사람 → 살린다·죽인다, 동수 무효
      /* 처형만 누르면 판이 끝나는 상태 — 처형 버튼 대신 승패 판정을 앞세운다(2026-09-30 햇살님 «끝났다고 판단해서 처형 안 누르고 얼렁뚱땅 끝나버릴 수 있으니까»). 실제로 처형해 본 뒤 되돌린 판정이라 사후 능력·계승까지 본 값 */
      endIfExecuted: (function () { var pr = pend; if (!pr || pr.how !== '처형 가정') return null; var k = D.noms.findIndex(function (o) { return o.t === pr.seat - 1 && !o.done; }); if (k < 0) return null;
        return { k: k, seat: pr.seat, winner: pr.winner, winnerKo: (WINKO[pr.winner] || pr.winner), text: seatLabel(pr.seat - 1).number + '번 ' + seatLabel(pr.seat - 1).name + ' 처형 → ' + (WINKO[pr.winner] || pr.winner) }; })(),
      noExecReason: D.noms.some(function (o) { return o.done; }) ? null : G.reason,
      executed: D.noms.some(function (o) { return o.done; }),
      notes: htmlItems((D.notes || []).join('<br>')).concat(voterCount() !== alive ? [{ kind: 'text', text: '판사만 투표합니다 — 투표권 ' + voterCount() + '명', label: null, call: null, on: false }] : []),   // 판사 모드 — 문턱이 생존 수보다 낮은 까닭(웹 dayBriefHtml)
      special: htmlItems(spHtml()), verdict: verdict() };
  }

  /* 큰 화면 공개 투영(2026-10-02, docs/큰화면_공개데이터_계약_v1.md · 코덱스 검토 반영) — 이 허용목록 밖의 값은 내보내지 않는다.
     직업·진영·직업 id·표식·회원 id·집계 중 득표·처형 미리보기는 정체 정보라 넣지 않는다. 자리 id 는 명단 pid 대신 자리 번호.
     생사·유령표는 «공개 스냅샷» — 준비 중·발표한 낮·끝난 판에서만 실제 값을 찍어 두고, 밤과 발표 전 아침엔 찍어 둔 것만 보인다(밤 사망·부활·유령표 변화 모두 가림).
     스냅샷·처음 구성·revision 은 판 저장본이 아니라 따로(dangsan_display_pub) — 판 모양 가드를 건드리지 않고, 앱을 다시 켜도 revision 이 이어진다.
     투표 확정 표식은 n.need(uiDayVoteCommit 만 적는다) — done 은 처형 완료.
     ponytail: 처형 뒤 예외로 다시 지명해도 처형 장면이 앞선다 — 추가 처형 모드를 붙일 때. 아이폰 voting 은 presenter 이벤트를 붙일 때. */
  var PUB_KEY = 'dangsan_display_pub';
  function pubState(epoch) { var P = {}; try { P = JSON.parse(localStorage.getItem(PUB_KEY) || 'null') || {}; } catch (e) {}
    return P.epoch === epoch ? P : { epoch: epoch, rev: P.rev || 0 }; }   // 판이 바뀌면 스냅샷·구성은 비우고 revision 은 이어서
  function pubSave(P) { localStorage.setItem(PUB_KEY, J(P)); }
  function pubEpoch() { return firstNightBegun() && state.log ? (state.log.uuid || state.log.id || null) : null; }
  /* 조회는 마지막 확정본만 읽는다. 부팅 준비와 성공 명령이 공개 본문·스냅샷을 함께 갱신한다.
     조회 중 dayRec·execGate를 부르거나 저장하지 않아, 연결 화면을 읽는 횟수가 판에 영향을 주지 않는다. */
  function displayPublic() {
    var P; try { P = JSON.parse(localStorage.getItem(PUB_KEY) || 'null'); } catch (e) { return null; }
    if (!P || !P.last) return null;
    try { var body = JSON.parse(P.last); body.revision = P.rev; return body; } catch (e) { return null; }
  }
  /* 사각 실제 칸(2026-10-06 코덱스 요청 «사각 전수 — 공개 실제 칸») — 진행자 판 board() 와 같은 칸 계산, 공개 자리 번호(s1…)만. 빈자리는 seatId null. 직업·표식은 안 싣는다 */
  function pubBoard() {
    if (state.layout !== 'rect') return null;
    var P = rectPositions(), c = state.cols, r = state.rows, gaps = new Set(normGaps()), order = seatCells(), n = (state.seats || []).length;
    return { rows: r || 0, cols: c || 0, cells: P.map(function (p, cell) {
      var col = c < 2 ? 0 : Math.round((p.x - 13) / 74 * (c - 1)), row = r < 2 ? 0 : Math.round((p.y - 15) / 70 * (r - 1)), si = gaps.has(cell) ? -1 : order.indexOf(cell);
      return { id: cell, row: row, col: col, seatId: si >= 0 && si < n ? 's' + (si + 1) : null }; }) };
  }
  function prepareDisplayPublic() {
    var n = state.nights || 1, began = firstNightBegun(), ended = began && gameEnded(), isDay = began && !ended && state.phase === 'day';
    var D = isDay ? dayRec() : null, announced = !!(D && D.announced), P = pubState(pubEpoch());
    var sid = function (i) { return 's' + (i + 1); };
    if (began && (ended || announced)) P.announcedThrough = Math.max(P.announcedThrough || 0, n);
    if (!began || ended || announced) P.seats = (state.seats || []).map(function (s) { var dead = began && pubDead(s);   // 공개 생사(index.html pubDead) — 죽은 척은 사망 · 유령표가 있는 걸로 — 표식 이름은 안 내보낸다
      return { dead: dead, ghost: dead && ((s.rem || []).indexOf('유령표') >= 0 || (!s.dead && !villageType())) }; });   // 죽은 척도 유령표를 받는다(fakeDeadMark, 유령표 쓰는 판) — 안 쓰는 판은 예전처럼 있음으로
    var seats = (state.seats || []).map(function (s, i) { var v = (P.seats && P.seats[i]) || { dead: false, ghost: false };
      return { id: sid(i), number: i + 1, name: s.name || '', dead: v.dead, ghost: v.ghost }; });
    var scene = !began ? 'prep' : ended ? 'ended' : !isDay ? 'night' : !announced ? 'dawn' : 'discussion';
    var noms = D ? D.noms || [] : [], G = isDay ? execGate() : null, nom = null, exec = null;
    var vo = typeof wz.voteOpen === 'number' && noms[wz.voteOpen] && !noms[wz.voteOpen].done ? wz.voteOpen : -1;
    var execd = noms.filter(function (o) { return o.done; }).pop(), execSeat = execd ? execd.t : (state.seats || []).findIndex(function (x) { return x && x.dead && x.cause === 'exec' && x.causeN === n; });
    if (execSeat < 0 && isDay) {   // 지명 밖 처형인데 살아남은 것(처형 방어·목숨 소진) — 판 기록의 오늘 «처형» 사건, 처형 취소로 되돌린 것은 뺀다(코덱스 재검토 C)
      var ev = (state.log && state.log.events) || [], live = {};
      ev.forEach(function (e) { if (e.n !== n || e.phase !== 'day' || !e.seat) return; if (e.type === '처형') live[e.seat] = 1; else if (e.type === '되돌림' && e['종류'] === '처형 취소') delete live[e.seat]; });
      var ks = Object.keys(live); if (ks.length) execSeat = +ks[ks.length - 1] - 1; }
    if (announced && execSeat >= 0) { scene = 'execution'; exec = { targetId: sid(execSeat), died: !!(P.seats && P.seats[execSeat] && P.seats[execSeat].dead) }; }   // 공개 생사를 따른다(죽은 척도 사망)   // 지명 처형·하늘의 벌·좌석 처형 모두 — 안 죽은 처형은 지명 기록(done)으로
    else if (announced && noms.length) { var k = vo >= 0 ? vo : noms.length - 1, o = noms[k];
      scene = vo >= 0 ? 'voting' : o.need === undefined ? 'nomination' : 'confirmed';
      nom = { byId: o.by === null || o.by === undefined ? null : sid(o.by), targetId: sid(o.t) }; }
    var results = nom ? noms.filter(function (o) { return o.need !== undefined && !o.done; }).map(function (o) {
      var v = o.v || 0, lead = G.leaders.indexOf(o) >= 0;
      return { id: 'n' + (noms.indexOf(o) + 1), targetId: sid(o.t), votes: v, neededVotes: o.need,
        status: lead && G.leaders.length > 1 && v >= G.need ? 'tied' : lead && G.ok ? 'leading' : v >= G.need ? 'qualified' : 'below' }; }) : [];
    if (!isDay) P.timer = null;   // 화면 쪽 타이머(display.setTimer)는 그 낮에만
    var timer = null; if (scene === 'discussion' && P.timer) { timer = Object.assign({}, P.timer); delete timer.n; }   // n(그날)은 음악 판정용 — 화면엔 안 보낸다
    else if (scene === 'discussion' && typeof tm !== 'undefined') {
      if (tm.on) timer = { state: tm.paused ? 'paused' : 'running', endsAt: tm.paused ? null : tm.endAt, durationMs: tm.total, leftMs: tm.paused ? tm.left : null };
      else if (tm.doneAt && tm.doneN === n) timer = { state: 'elapsed', endsAt: tm.doneAt, durationMs: tm.total, leftMs: 0 }; }   // 자연 만료(00:00)는 남기고, 진행자가 지운 것(tmReset)만 null
    /* 역할 넘기기 — 지금 폰을 받아 볼 차례인 자리(누가 폰을 들었는지는 다 보이는 사실, 2026-10-02 햇살님 «역할 배치할때 보고 있는사람 자리 표기»). 직업은 물론 안 나간다 */
    var turn = null; if (!began && typeof state.rvPos === 'number' && (state.seats || []).some(function (x) { return x && x.char; })) {
      var ord = handoffOrder(), k = state.rvPos + 1; turn = { seatId: k < ord.length ? sid(ord[k]) : null, seen: Math.min(k, ord.length), total: ord.length }; }
    /* 2026-10-04 햇살님 선택(docs/공용화면_추가정보_구상_v1.md 끝 표 · 그리기계약_v2) — 넷 다 공개 사실만, 발표 전엔 null */
    var morning = null; if (isDay && announced) {   // 1 아침 발표 — 발표를 누른 뒤에만, 이름만(사인 없음). at = 발표 시각(TV 가 잠깐만 크게 보이는 기준)
      var dead = pubNightDeaths(n).map(function (o) { return sid(o.i); });   // 공개 생사 — 아침 낭독(dayNarr)과 같은 명단
      morning = { id: 'm' + n, dayNumber: dayNo(n), deaths: dead, revivals: [], at: D.announcedAt || null }; }
    var past = [];   // 2 마지막 처형 하나 — 오늘보다 앞선 낮 중 가장 최근(«처형 없는 낮»이 지난 처형을 덮지 않는다)
    if (began) { var days = state.days || {}; Object.keys(days).map(Number).filter(function (d) { return d < n || (ended && d <= n); }).sort(function (a, b) { return b - a; }).some(function (d) {
      var done = (days[d].noms || []).filter(function (o) { return o.done; }).pop(); var t = done ? done.t : (state.seats || []).findIndex(function (x) { return x && x.dead && x.cause === 'exec' && x.causeN === d; });
      if (t < 0) return false; var x = state.seats[t], f = fakeAt(t), died = !!(x && ((x.dead && x.cause === 'exec' && x.causeN === d) || (f && f.n === d && f.ph === 'day')));   // 그 낮 처형에서 죽은 척 = 공개 사망
      past.push({ id: 'x' + d, dayNumber: dayNo(d), targetId: sid(t), outcome: died ? 'died' : 'survived' }); return true; }); }
    var usage = null; if (isDay && hubRep() !== 'mafia') {   // 5 오늘 지명 이력 — 이력만(가능 여부·차단 사유 없음). 오리지널 마피아는 지명 기록이 없어 null
      var by = [], tg = []; noms.forEach(function (o) { if (o.by !== null && o.by !== undefined && by.indexOf(sid(o.by)) < 0) by.push(sid(o.by)); if (tg.indexOf(sid(o.t)) < 0) tg.push(sid(o.t)); });
      usage = { dayNumber: dayNo(n), nominatedBy: by, nominatedTargets: tg }; }
    var ending = null; if (ended) { var R = result(); ending = { kind: state.practice ? 'practice' : (R.winner && R.winner !== 'void') ? 'completed' : 'aborted', winnerLabel: R.winner && R.winner !== 'void' ? (WINKO[R.winner] || R.winner) : null }; }   // 7 승리 진영 — 확정 공개 승리만, 선악 둘로 가두지 않음
    var body = { schema: 1, gameEpoch: P.epoch, handoff: turn, dayNumber: isDay ? dayNo(n) : null, nightNumber: began && !ended && !isDay ? n : null,
      scene: scene, shape: state.layout === 'rect' ? 'rect' : 'round', seats: seats, board: pubBoard(), initialComposition: P.comp || null, timer: timer, nomination: nom,
      neededVotes: nom ? G.need : null, results: results, execution: exec,
      morningAnnouncement: morning, pastExecutions: past, nominationUsage: usage, ending: ending,
      endReveal: ended && state.tvReveal ? endReveal() : null, endReplay: ended && typeof state.tvReplay === 'number' ? endReplay(state.tvReplay) : null };   // 7 — 끝난 뒤 진행자가 연 것만
    var key = J(body); if (key !== P.last) { P.last = key; P.rev = (P.rev || 0) + 1; }   // 공개 내용이 같으면 revision 그대로
    pubSave(P); body.revision = P.rev; return body;
  }
  function verdict() { var w = []; try { w = winCheck() || []; } catch (e) {} return w.filter(function (x) { return x.lv === 'end' || x.lv === 'warn'; }).map(function (x) { return { level: x.lv, text: textOf(x.t), win: x.win || null }; }); }
  var WINKO = { good: '선 승리', evil: '악 승리', other: '중립 승리', void: '무효 · 중단' };
  /* 7 종료 공개·복기(2026-10-04 햇살님 «직업 + 진영 + 바뀐 것» · «낮 + 밤 행동») — 판이 끝난 뒤, 진행자가 누를 때만 TV 로 나간다.
     앱 재량(판세 보정·앱 선택)은 넣지 않는다 — 그건 진행 도구의 속이라 끝나도 안 보인다 */
  function endLog() { return (state.log && state.log.winner) ? state.log : (state.lastLogId ? (logsAll().find(function (x) { return x.id === state.lastLogId; }) || null) : null); }
  function endReveal() {
    var cm = CMAP(), L = endLog(), ev = (L && L.events) || [];
    return (state.seats || []).map(function (x, i) { if (!x || !x.char || !cm[x.char] || cm[x.char].team === 'host') return null; var c = cm[x.char], ch = [];
      ev.forEach(function (e) { if ((e.type === '역할 변경' || e.type === '계승') && (e.seat === i + 1 || (e.swapSeats || []).indexOf(i + 1) >= 0)) ch.push(e.type === '계승' ? '계승' + (e.role ? ' → ' + e.role : '') : '직업 바뀜' + (e.role ? ' → ' + e.role : '')); });
      (x.rem || []).forEach(function (r) { var cv = tokConv(r); if (cv) ch.push(r + '(편이 바뀜)'); else if (/^(중독|취함)/.test(r)) ch.push(r); });
      var fk = (state.fakes || {})[i]; if (fk && cm[fk]) ch.push('받은 카드 ' + cm[fk].ko); else if (c.drunkAs || (x.rem || []).indexOf('주정뱅이') >= 0) ch.push('자기 직업을 잘못 알았음');   // 가짜 카드는 state.fakes 에 있다(반증 검토 2-9)
      return { seatId: 's' + (i + 1), name: x.name || ('좌석 ' + (i + 1)), role: c.ko, team: TKO(c.team), side: realEvil(x) ? 'evil' : (seatSide(x) === 'neutral' ? 'neutral' : 'good'), dead: !!x.dead, icon: roleArt(c, state.edition || 'basic').icon || null, changes: ch }; }).filter(Boolean);
  }
  /* 복기 쪽 나누기(2026-10-05 햇살님 «첫밤은 정보의 밤, 1낮 1밤이 1일차» · 모든 모드) — 0쪽 = 정보의 밤(첫 낮 전 밤들, 스피드는 둘), k쪽 = 낮 k + 그 뒤 밤 */
  function firstDayN() { return ED().twoNights ? 2 : 1; }   // 첫 낮이 열리는 state.nights
  function endReplayDays() { var L = endLog(), fd = firstDayN(); return L && L.events ? L.events.reduce(function (m, e) { var n = e.n || 0; return Math.max(m, e.phase === 'day' ? n - fd + 1 : n - fd); }, 0) : 0; }
  /* 복기 하루(2026-10-04 햇살님 «한 줄씩 밤 먼저 낮 아래» · «행동을 아이콘으로» · «직업표에 화살표를 행동 색으로») —
     줄 = { act(행동 종류), actor(자리 id), targets(자리 id), value(정보·표 수), key(강조), text(글로만 볼 때) }.
     act: attack 공격 · poison 중독 · protect 보호 · revive 살림 · change 직업 바뀜 · block 막힘 · pick 그 밖 능력 · info 받은 정보 · false 거짓 정보 · death 사망 · nominate 지명 · vote 찬성 · execute 처형 */
  function endReplay(n) {
    var fd = firstDayN(), dn = n + fd - 1;   // n = 쪽(0 정보의 밤), dn = 그 쪽 낮의 state.nights
    var L = endLog(), ev = ((L && L.events) || []).filter(function (e) { if (e.cancel) return false; return n === 0 ? (e.phase !== 'day' && e.n <= fd) : (e.phase === 'day' ? e.n === dn : e.n === dn + 1); }), night = [], day = [];
    var nm = function (k) { var x = state.seats[k - 1]; return (x && x.name) || ('좌석 ' + k); };
    var who = function (e) { return (e.name || nm(e.seat)) + (e.role ? '(' + e.role + ')' : ''); };
    var sid = function (k) { return typeof k === 'number' && k > 0 ? 's' + k : null; };
    var clean = function (t) { return String(t || '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').replace(/ \)/g, ')').trim(); };   // 그림 문자는 TV 글꼴에서 네모로 깨진다
    var cmR = CMAP(), evilPick = function (e) { var c = e.roleId && cmR[e.roleId]; return !!(c && (c.team === 'demon' || c.team === 'mafia')); };
    var actOf = function (e) { var w = String(e.처리 || '');
      if (/^void:/.test(w)) return 'block';
      if (/^kill/.test(w)) return 'attack';
      if (/^token:/.test(w)) return /중독|취함|만취/.test(w) ? 'poison' : /보호/.test(w) ? 'protect' : 'pick';
      if (/^revive/.test(w)) return 'revive';
      if (/^(transform|swap)/.test(w)) return 'change';
      return evilPick(e) ? 'attack' : 'pick'; };
    /* 그 순간의 생사(2026-10-05 햇살님 «복기 시점에서 죽은 사람 시점도, 아직 죽기 전 행동이면 죽기 전으로») — 판 기록 전체에서 자리마다 처음 죽은 사건 순번을 잡고,
       줄마다 «그 사건 전에 이미 죽어 있던» 행동자·대상만 dead 로 붙인다. 화면은 이것만 긋는다(판이 끝난 시점의 생사가 아니라) */
    var allEv = (L && L.events) || [], diedAt = {}, seg = [], sg = 0, prevKey = null;   // seg — 같은 밤·같은 낮이 한 구간(사망이 지목보다 먼저 적혀도 그 구간 안 죽음은 «그 전»이 아니다)
    allEv.forEach(function (e, i) { var key = e.n + '|' + (e.phase === 'day' ? 'day' : 'night'); if (key !== prevKey) { sg++; prevKey = key; } seg[i] = sg;
      var k = e.type === '사망' ? e.seat : (e.type === '처형' && !e.무효 ? e.seat : null); if (k && diedAt[k] === undefined) diedAt[k] = sg; });
    var deadBefore = function (e, ids) { var sgi = seg[allEv.indexOf(e)]; return ids.filter(function (id) { var k = +String(id).slice(1); return diedAt[k] !== undefined && diedAt[k] < sgi; }); };
    var attacked = {}; ev.forEach(function (e) { if (e.type === '밤 지목' && actOf(e) === 'attack') (e.대상ref || []).forEach(function (r) { attacked[r.seat] = 1; }); });
    var diedNight = {}; ev.forEach(function (e) { if (e.type === '사망' && e.phase !== 'day') diedNight[e.seat] = 1; });   // 공격 줄에 «사망/막힘»을 붙인다 — 둘이 똑같이 나와 죽은 밤에 사망 정보가 사라졌다(반증 검토 2-6)
    var lastNom = null;
    ev.forEach(function (e) { var out = e.phase === 'day' ? day : night, l = null;
      if (e.type === '밤 지목') { var a = actOf(e); l = { act: a, actor: sid(e.seat), targets: (e.대상ref || []).map(function (r) { return sid(r.seat); }).filter(Boolean), value: a === 'block' ? '막힘' : a === 'attack' ? ((e.대상ref || []).some(function (r) { return diedNight[r.seat]; }) ? '사망' : '막힘') : null,
        key: a === 'attack' || a === 'change' || a === 'revive', text: who(e) + ' → ' + (e.대상 || []).join(', ').replace(/좌석 \d+ /g, '') }; }
      else if (e.type === '정보 전달') { var seenL = (e.본 || []).map(function (x) { return { seatId: sid(x.자리), role: x.직업, evil: !!x.악 }; });   // 본 사람 — 공감능력자 이웃·요리사 쌍(악으로 센 사람 표시)
        var pointed = (e.자리 || []).map(sid).filter(Boolean);   // 답이 가리킨 자리(사서·세탁부·점쟁이 대상…) — 화살표로
        l = { act: e.거짓 ? 'false' : 'info', why: e.거짓 ? (/중독/.test(e.까닭 || '') ? 'poison' : /취|주정/.test(e.까닭 || '') ? 'drunk' : 'other') : null, arrow: false, actor: sid(e.누구), targets: seenL.length ? seenL.map(function (x) { return x.seatId; }) : pointed, seen: seenL, value: (pointed.length && (e.직업들 || []).length ? e.직업들.join('·') : clean(e.답)) + (e.거짓 ? (/중독/.test(e.까닭 || '') ? ' · 거짓(중독)' : /취|주정/.test(e.까닭 || '') ? ' · 거짓(취함)' : ' · 거짓') : ''),   /* 왜 거짓인지(2026-10-05 «독에 의해 잘못 간 정보도») */   /* 자리를 가리키는 답은 자리가 대상으로 그려지니 값엔 직업만(«요리사 (좌석 2·7 중 하나)» → «요리사») */ key: !!e.거짓,
        text: (e.name || nm(e.누구)) + (e.직업 ? '(' + e.직업 + ')' : '') + ' 받은 정보: ' + clean(e.답) + (e.거짓 ? ' — 거짓이었음' : '') + (seenL.length ? ' · 본 사람 ' + (e.본 || []).map(function (x) { return x.자리 + '번 ' + nm(x.자리) + '(' + x.직업 + (x.악 ? '·악으로 셈' : '') + ')'; }).join(', ') : '') }; }
      else if (e.type === '사망') { if (attacked[e.seat] && e.phase !== 'day') return;   // 공격 줄이 이미 보여 준 죽음은 겹쳐 쓰지 않는다
        l = { act: 'death', actor: sid(e.seat), targets: [], value: '사망', key: true, text: who(e) + ' 사망' }; }
      else if (e.type === '지명' && e.취소) l = { act: 'cancel', actor: null, targets: [sid(e.bySeat)].filter(Boolean), value: null, key: false, text: '' };   // 걷은 지명 — 합칠 때 앞선 지명 줄을 지운다(반증 검토 2-3, 기록의 bySeat 가 대상 자리)
      else if (e.type === '지명') { lastNom = e.seat; l = { act: 'nominate', actor: sid(e.bySeat), targets: [sid(e.seat)].filter(Boolean), value: null, key: false, text: (e.by || '') + ' → ' + (e.name || '') + ' 지명' }; }
      else if (e.type === '투표') l = { act: 'vote', actor: sid(lastNom), targets: [sid(e.대상seat || lastNom)].filter(Boolean), value: (typeof e.표 === 'number' ? e.표 : (e.투표자 || []).length) + '표', key: false, text: (e.대상 || '') + ' ' + ((e.투표자 || []).length) + '표' };
      else if (e.type === '처형') { var died = !e.무효;   // 그날 기록으로 — 판 끝 좌석 상태로 정하면 다음 날 재처형·되살림에 앞날 칸이 바뀌었다(반증 검토 2-5)
        l = { act: 'execute', actor: sid(e.seat), targets: [], value: died ? '사망' : '살아남음', key: true, text: who(e) + ' 처형' }; }
      else if (e.type === '계승' || e.type === '역할 변경') { var sw = e.swapSeats || []; l = sw.length === 2 ? { act: 'change', actor: sid(sw[0]), targets: [sid(sw[1])].filter(Boolean), value: '맞바꿈', key: true, text: nm(sw[0]) + ' ↔ ' + nm(sw[1]) + ' ' + e.type }   // 맞바꾸기 — «좌석 undefined» 칸이 생기던 것
        : { act: 'change', actor: sid(e.seat), targets: [], value: e.type, key: true, text: who(e) + ' ' + e.type }; }
      if (l) { l.kind = e.code || e.type; l.dead = deadBefore(e, [l.actor].concat(l.targets || []).filter(Boolean));
        /* 같은 사람의 «고름 → 받은 정보»는 한 줄로(2026-10-04 햇살님 «밤에 받은 정보들도 정리») — 바로 앞 줄이 그 사람의 능력 사용이면 대상을 이어받고 그 줄을 지운다 */
        var prev = out[out.length - 1];
        if ((l.act === 'info' || l.act === 'false') && prev && prev.act === 'pick' && prev.actor === l.actor) { if (!l.targets.length) l.targets = prev.targets; l.arrow = true; out.pop(); }   /* 찍어서 알아본 정보만 화살표(2026-10-05 햇살님 «정보를 얻은 화살표는 그냥 넣지 말자, 찍어서 알아본 것만») */
        out.push(l); } });
    /* 낮은 지명 한 건 = 한 줄(2026-10-05 햇살님 확정 타일 — 화면-122): 지명 줄에 그 뒤 찬성 표·처형을 합친다. outcome = execute(처형) · reject(부결) */
    var merged = [];
    /* 같은 대상의 열린 지명 줄을 찾아 붙인다 — 마지막 지명하고만 대조해 표가 엉뚱한 줄에 붙고 처형된 지명이 «부결»로 나왔다(반증 검토 2-1·2-2). 표는 늘 덮어써 마지막 확정 표가 남는다 */
    var openNom = function (t) { for (var i = merged.length - 1; i >= 0; i--) if (merged[i].act === 'nominate' && merged[i].targets[0] === t && !merged[i].outcome) return i; return -1; };
    day.forEach(function (l) { var i;
      if (l.act === 'cancel') { i = openNom(l.targets[0]); if (i >= 0) merged.splice(i, 1); return; }
      if (l.act === 'vote' && (i = openNom(l.targets[0])) >= 0) { merged[i].votes = l.value; return; }
      if (l.act === 'execute' && (i = openNom(l.actor)) >= 0) { merged[i].outcome = 'execute'; merged[i].key = true; merged[i].survived = l.value === '살아남음'; return; }
      if (l.act === 'vote') return;   // 붙일 지명이 없는 표는 버린다(떠도는 «n표» 줄)
      merged.push(l); });
    merged.forEach(function (l) { if (l.act !== 'nominate') return; if (!l.outcome) l.outcome = 'reject';
      l.value = [l.votes, l.outcome === 'execute' ? (l.survived ? '처형 · 살아남음' : '처형') : '부결'].filter(Boolean).join(' · ');
      l.text += ' · ' + l.value; });
    return { dayNumber: n, title: n === 0 ? '정보의 밤' : n + '일차', order: ['day', 'night'], total: endReplayDays(), night: night, day: merged };   // order — 위에서 아래로 그릴 순서(낮 먼저)
  }
  function result() {
    var L = (state.log && state.log.winner) ? state.log : (state.lastLogId ? (logsAll().find(function (x) { return x.id === state.lastLogId; }) || null) : null);
    var win = state.practice ? null : ((L && L.winner) || wz.doneWin || null), ends = verdict().filter(function (x) { return x.level === 'end'; }).map(function (x) { return x.text; });
    return { winner: win, title: win ? WINKO[win] || win : (state.practice ? '연습판 마감' : '판 마감'), why: ends.length ? ends.join(' → ') : (L && L.note ? L.note : (win ? '진행자가 승자를 정해 끝냄' : '승자 없이 마감')),
      recorded: !!(L && L.winner), practice: !!state.practice, politician: htmlItems(state.practice ? '' : polHtml()),
      players: ((L && L.players) || []).map(function (p) { return { number: p.seat, name: p.name || '', role: p.finalRole || p.role, side: p.side || '', won: p.won === true, dead: !!p.dead }; }),
      tvReveal: !!state.tvReveal, tvReplay: typeof state.tvReplay === 'number' ? state.tvReplay : null, replayDays: endReplayDays() };   // 7 큰 화면 공개·복기 조작용
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
    var L = logsAll().find(function (x) { return x.id === id; }); if (!L) return null; logHub(L);
    var r = recordRow(L); r.note = L.note || '';
    r.players = (L.players || []).map(function (p) { return { number: p.seat, name: p.name || '', role: p.finalRole || p.role, side: p.side || '', won: p.won === true, dead: !!p.dead }; });
    r.events = (L.events || []).map(eventLine).filter(Boolean); return r;
  }
  function library() {
    var M = allMods(), hubs = {};
    Object.keys(M).forEach(function (id) { if (id === 'compendium') return; var m = M[id], h = m.hub || '당산나무', P = edPlayable(m);
      (hubs[h] = hubs[h] || []).push({ id: id, name: m.name, players: P.set && P.set.length ? P.set[0] + '~' + P.set[P.set.length - 1] + '명' : '', roles: (m.chars || []).filter(function (c) { return c.team !== 'host'; }).length,
        roleNames: (m.chars || []).filter(function (c) { return c.team !== 'host'; }).map(function (c) { return c.ko; }) }); });   // 직업 이름으로도 찾게(«무당» → 무당이 나오는 모드)
    /* 같은 제목의 확장판은 원래 모드 아래로 묶는다(2026-10-02 햇살님 «확장개념은 묶기 같은장르 같은제목 끼리») — «우물가 — 두레박» → parent=우물가, short=두레박.
       당산나무 계열만: 클래식은 «클래식 — …»이 제목이 아니라 계열 이름이라 묶지 않는다. 화면은 parent 가 있는 모드를 그 모드 밑에 접어 둔다 */
    (hubs['당산나무'] || []).forEach(function (m, _, L) { var cut = m.name.indexOf(' — '); if (cut < 0) return; var key = m.name.slice(0, cut);
      var base = L.find(function (b) { return b.name.indexOf(' — ') < 0 && (b.name.indexOf(key) === 0 || b.name.replace(/^당산나무 /, '').indexOf(key) === 0); });
      if (base) { m.parent = base.id; m.short = m.name.slice(cut + 3); } });
    return { hubs: Object.keys(hubs).map(function (h) { return { name: h, modes: hubs[h] }; }) };
  }
  function libraryMode(id) {
    var m = allMods()[id]; if (!m) return null; outHub = hubRepOf(m);   // 보고 있는 모드의 계열 말로(지금 고른 계열이 아니라)
    return { id: id, name: m.name, guide: textOf(m.guide || ''), rules: (m.guideBlocks || []).map(function (b) { return { ph: b.ph, steps: b.steps || [] }; }), tips: m.guideTips || [], roles: (m.chars || []).filter(function (c) { return c.team !== 'host'; }).map(function (c) { var r = roleArt(c, id); return { id: c.id, ko: c.ko, team: c.team, teamKo: TKOof(m, c.team), ab: c.ab || '', icon: r.icon, e: r.e }; }) };
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
  /* 전역 속성이 아니라 이름에 직접 넣는다 — 웹은 코어를 함수 안에서 올려(web/js/core.js new Function) 전역 speak 을 바꿔도 코어 안 호출은 옛 speak 으로 갔다(2026-10-02 Fable 검토 A) */
  /* 짧은 소리(처형·판 끝) — 웹 bgmStingPlay 를 가로채 효과로 넘긴다. 판 끝은 이긴 편으로 win/lose */
  /* 판 끝 자동 발표(2026-10-04 햇살님 «판 끝 자동 발표») — 명령 뒤 승패가 정해졌으면(종료 판정) «판 끝내기»를 기다리지 않고 그 자리에서 승패 낭독·효과음을 낸다.
     판을 닫거나 기록하지는 않는다(진행자가 계승·예외를 확인하고 닫는다). 같은 판·같은 승자로는 한 번만 — 나중에 판을 닫을 때 같은 말을 또 하지 않게 endSaid 로 거른다 */
  var endSaying = false;
  /* 자동 발표한 승자 — 판 상태에 «그 판 번호와 함께» 둔다. 메모리에만 두면 다시 켠 뒤 첫 명령에서 승패를 또 읽었다(반증 검토 2-11, 2026-10-05). 판정이 풀리거나 새 판이면 비운다 */
  function endSaidGet() { var e = state.endSaid, id = state.log ? state.log.id : state.lastLogId; return e && id && e.id === id ? e.w : null; }   // 판을 닫는 중엔 state.log 가 지난 판(lastLogId)으로 넘어간다
  function endSaidSet(w) { if (w && state.log) state.endSaid = { id: state.log.id, w: w }; else delete state.endSaid; try { save(); } catch (e) {} }
  function endAlready() { var said = endSaidGet(); if (endSaying || !said) return false; try { return endWinner() === said; } catch (e) { return false; } }
  function announceEnd() {
    if (!firstNightBegun() || state.practice || !state.log) { if (state.endSaid) endSaidSet(null); return; }
    if (state.log.winner) return;
    if (state.phase !== 'day') return;   // 밤엔 미루고 아침(낮이 열릴 때)에 읽는다 — 눈 감은 밤에 승패를 말하면 같은 밤 뒤 차례(살림 등)로 판정이 풀리기도 하고 정보가 샌다(2026-10-05 햇살님 «아침에 읽어», 반증 검토 1-2)
    var w = endWinner(); if (!w) { if (endSaidGet()) endSaidSet(null); return; } if (endSaidGet() === w) return;
    endSaidSet(w); endSaying = true;
    try { bgmStingPlay('end'); var x = narrPick(w === 'good' ? 'end.good' : w === 'evil' ? 'end.evil' : w === 'void' ? 'end.void' : 'end.other');
      speak(x ? x.say : '판이 끝났습니다.', 'end', 'gameEnd', x ? [{ clip: x.clip, say: x.say }] : null); } finally { endSaying = false; }
  }
  bgmStingPlay = function (kind) { if (kind === 'end' && endAlready()) return true; var name = kind === 'end' ? ((function () { try { return endWinner(); } catch (e) { return null; } })() === 'evil' ? 'lose' : 'win') : kind;
    effects.push({ kind: 'sting', hub: narrHub(), name: name }); return true; };
  speak = function (text, mood, src, plan) {
    if (typeof NR_SRC === 'undefined' || !NR_SRC[src] || !text) return false;
    if (src === 'gameEnd' && endAlready()) return true;   // 이미 자동 발표한 판 — 닫을 때 또 읽지 않는다
    var t = String(text).replace(/<[^>]*>/g, ' ').replace(/[『』]/g, '').replace(/\s+/g, ' ').trim();
    if (!t) return false;
    var e = { kind: 'speak', text: t, mood: mood || 'day' }; if (plan && plan.length) e.plan = plan;   // plan — 미리 뽑은 목소리 순서(clip id · 자리 번호). 목소리를 골랐으면 이걸, 아니면 text 를 기기 음성으로
    effects.push(e); return true;
  };
  /* 가정 처형(pendingResult — «이대로 처형하면 끝나나»를 처형해 보고 되돌린다) 안에서 난 소리·낭독은 실제로 일어난 일이 아니다 — 판처럼 효과도 되돌린다.
     안 그러면 두 번째 지명 때 처형 효과음과 «처형되었습니다»가 실제로 나갔다(반증 검토 1-1, 2026-10-05). day()·autoClose·sync.snapshot 이 모두 이 이름으로 부른다 */
  /* 판 난수(2026-10-05 햇살님 «씨앗+명령 기록 시작», docs/보고서/서버부하_고찰_20261005) — 역할을 나누는 순간 씨앗을 정해 state.rng 에 두고, 그 뒤 코어 난수는 전부 거기서 뽑는다.
     판 상태에 있으니 다시 켜도 이어지고, 거절된 명령은 판과 함께 되돌아간다. 같은 시작 저장소 + 씨앗 + 명령이면 같은 판(tools/엔진/명령재생.cjs 가 확인) */
  var RNG0 = Math.random;
  Math = Object.create(Math);   // 이 코어만의 Math — 시험 하네스는 여러 판이 Node 의 Math 하나를 같이 써서 난수 함수가 서로 덮였다(웹은 dom_stub 의 지역 Math 에 들어간다)
  Math.random = function () { var g = state && state.rng; if (!g || typeof g.s !== 'number') return RNG0(); g.s = (Math.imul(g.s, 1664525) + 1013904223) >>> 0; g.k = (g.k || 0) + 1; return g.s / 4294967296; };
  /* 번호(uuid·사람 id)는 판 난수를 쓰지 않는다 — 판과 상관없고, 환경마다(crypto 유무) 난수 쓰는 횟수가 달라 재생이 갈렸다 */
  [ 'uuidV7', 'personNew' ].forEach(function (nm) { var f0 = this[nm]; if (typeof f0 !== 'function') return;
    var g = function () { if (nm === 'uuidV7' && typeof __recUuid === 'string' && __recUuid) { var u = __recUuid; __recUuid = null; return u; }   // 재생 — 판 번호는 기록된 것(재량 추천이 판 번호 해시로 칸을 고른다)
      var r = state.rng; state.rng = null; try { return f0.apply(this, arguments); } finally { state.rng = r; } };
    if (nm === 'uuidV7') uuidV7 = g; else personNew = g; }, this);
  noticeHook = function (m) { effects.push({ kind: 'notice', text: String(m) }); };   // 앱 쪽 안내 한 줄을 화면 알림으로(기록 덜어 내기 등)
  var REC_SKIP = { 'sync.markUploaded': 1, 'sync.merge': 1 };   // 판 밖 일(서버 동기화)은 적지 않는다
  function recStore() { var o = {}; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k !== 'botc_logs' && k !== 'botc_pots') o[k] = localStorage.getItem(k); } return o; }
  /* 판 시작 때의 기록 요약(logsDigest) — 앉은 사람 것만. 다른 판 사람 이름은 남기지 않는다(직전 판 자리는 앉은 사람 아니면 '~번호') */
  function recDigest() { var d = logsDigest(), names = {}, keys = {};
    (state.seats || []).forEach(function (s) { if (!s) return; if (s.name) names[s.name.trim()] = 1; var w = s.pid ? personById(s.pid) : null; if (w && w.name) names[w.name] = 1; keys[s.pid || s.name] = 1; });
    var people = {}; Object.keys(d.people || {}).forEach(function (k) { if (names[k]) people[k] = d.people[k]; });
    return JSON.parse(J({ byN: d.byN, roles: d.roles, people: people, prev: d.prev ? d.prev.map(function (p, i) { return { seat: p.seat, team: p.team, k: keys[p.k] ? p.k : '~' + i }; }) : null })); }
  var CANON_SKIP = { at: 1, endedAt: 1, srvAt: 1, announcedAt: 1, touchedAt: 1, rec: 1, uuid: 1, id: 1, oid: 1, pid: 1, aid: 1 };
  function canonOf(L) { var norm = function (o) { if (Array.isArray(o)) return o.map(norm); if (o && typeof o === 'object') { var r = {}; Object.keys(o).sort().forEach(function (k) { if (!CANON_SKIP[k]) r[k] = norm(o[k]); }); return r; } return o; };
    return J(norm({ e: L.events || [], p: L.players || [], w: L.winner || null })); }
  function recOf() { return (state.log && state.log.rec) || state.rec || null; }
  var pendingResult0 = pendingResult;
  var prMemo = null;   /* 같은 판 상태면 다시 처형해 보지 않는다 — 과반 투표 뒤 탭마다 다시 해서 18명 판 낮 조회가 7.5→52.5ms(앱구조점검 «무게», 2026-10-05). 열쇠는 판 상태 글 그대로 */
  pendingResult = function () { var key = J(state); if (prMemo && prMemo.key === key) return prMemo.v === undefined ? null : JSON.parse(prMemo.v);
    var n = effects.length, v; try { v = pendingResult0.apply(this, arguments); } finally { effects.length = n; }
    prMemo = { key: J(state), v: v == null ? undefined : J(v) }; return v; };

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
  /* 복기(2026-10-01, docs/게임이해_엔진/복기_계획_v1.md) — 인자: 판 id(없으면 방금 끝난 판) · 'public:' 앞붙임이면 참가자 공유판 */
  function replayLogRaw(a) { var id = String(a || '').replace(/^public:/, ''); if (id) return logsAll().find(function (x) { return x.id === id; }) || null;
    return (state.log && state.log.winner) ? state.log : (state.lastLogId ? (logsAll().find(function (x) { return x.id === state.lastLogId; }) || null) : null); }
  function logHub(L) { try { var m = L && allMods()[L.mode]; if (m) outHub = hubRepOf(m); } catch (e) {} return L; }   // 지난 판은 그 판의 계열 말로
  function replayLog(a) { return logHub(replayLogRaw(a)); }
  var narrowMemo = {};
  var QUERIES = { home: home, 'preparation.board': board, 'game.current': nightCard, 'preparation.roles': roles, 'preparation.handoff': handoff, 'handoff.public': handoffPublic, 'game.stage': stage, 'game.process': process, reference: reference, 'roles.art': function () { var mid = state.edition || 'basic'; return CHARS().filter(function (c) { return c.team !== 'host'; }).map(function (c) { var r = roleArt(c, mid); return { ko: c.ko, icon: r.icon, e: r.e }; }); }, 'game.day': day, 'display.public': displayPublic, 'game.verdict': function () { return { items: verdict(), winner: endWinner() }; }, 'game.result': result, 'game.replay': function (a) { var L = replayLog(a); if (!L || typeof GameReplay === 'undefined') return null; return GameReplay.build(L, { public: /^public:/.test(String(a || '')) }); },
    'game.replayNarrow': function (a) { var L = replayLog(a); if (!L || typeof GameReplay === 'undefined') return null; var k = L.uuid || L.id; if (!(k in narrowMemo)) narrowMemo[k] = GameReplay.narrow(L); return narrowMemo[k]; }, 'day.voters': function (k) { return voters(+k); }, records: records, record: record, library: library, 'library.mode': libraryMode,
    /* 엔진 내부 관측: 공개 확정본의 생사·공개한 밤만. 큰 화면 전송 형식에는 추가하지 않는다. */
    'observation.public': function () { var P = pubState(pubEpoch()); return { through: P.announcedThrough || 0, dead: (P.seats || []).map(function (s) { return !!s.dead; }) }; },
    /* 배경 음악(2026-10-04 햇살님 «노래, 테마별로 과정별로») — 지금 틀어야 할 곡 이름. 파일은 assets/bgm/<계열>_<과정>.m4a(tools/진행음악). 판이 안 돌면 null */
    'bgm.slot': function () { var hub = narrHub(), began = firstNightBegun(), ended = began && gameEnded();
      if (ended) return null;
      if (!began) return hasRoles() ? { hub: hub, slot: 'prep' } : null;
      if (state.phase !== 'day') return { hub: hub, slot: (state.nights || 1) > 1 ? 'night' : 'first' };
      /* 낮(2026-10-05 햇살님 «타이머를 켜는 순간부터 · 지목할 때는 노래 없이 · 밀담은 노래, 다 모여서는 없이»): 그날 밀담 타이머가 도는 동안만 낮 곡. 광장·지명·처형은 무음 */
      var D = dayRec(), T = pubState(pubEpoch()).timer;
      if ((D.noms || []).length || !T || T.kind !== 'whisper' || T.state !== 'running' || T.n !== (state.nights || 1)) return null;
      return { hub: hub, slot: 'day' }; },
    'narration.dawn': function () { if (state.phase !== 'day') return null; var d = dayNarr(); return { text: d.lines.join(' '), plan: d.plan, mood: 'day' }; },   // 아침 발표 «읽어 주기» 단추
    'seat.detail': seatDetail,
    /* 서버 올리기 — 아직 안 올라간 판을 서버 모양 그대로(코어 SRV.payloadOf). 보내는 건 웹앱·아이폰 앱 몫 (2026-09-29) */
    'sync.merged': function () { return lastMerged; },
    /* 판세 보정 — 서버에 물을 것(이 판 모드·인원, 회원 자리의 편). 켜짐 여부 (2026-09-29) */
    'director.context': function () { if (hubRep() === 'mafia') return null;   // 오리지널 마피아는 숙련도(편 균형)도 안 쓴다(2026-10-03 햇살님)
      var cm = CMAP(), good = [], evil = [];
      state.seats.forEach(function (s) { if (!s || !s.char || !s.pid) return; var w = personById(s.pid); if (!w || !(w.tunelId || w.accountId)) return; (realEvil(s) ? evil : good).push(w.tunelId || w.accountId); });   // 계정만 있는 사람도(서버가 계정 번호를 받는다)
      return { mode: state.edition, n: inPlaySeats().length, good: good, evil: evil }; },
    'director.enabled': function () { return tiltOn(); },
    'director.tilt': function () { var t = tiltValue(); return { T: Math.round(t.T * 100) / 100, why: t.why }; },
    'sync.pendingCount': function () { return SRV.pending().length; },   // 개수만 — 화면 배지용. sync.pending 은 판마다 서버 모양을 만든다(2026-10-05)
    'sync.pending': function () { return SRV.pending().map(function (L) { return SRV.payloadOf(L); }); },
    /* 진행 중인 판 — 밤·낮 경계와 처형 뒤에 서버에 올려 둔다(폰이 죽어도 남고, 서버가 12시간 뒤 닫을 수 있게). 끝난 판과 같은 모양 + status·pending·touched_at */
    'sync.snapshot': function () {
      if (!state.log || state.log.winner || state.practice || !firstNightBegun()) return null;
      var cm = CMAP(), L = JSON.parse(JSON.stringify(state.log));
      state.seats.forEach(function (s, i) { var p = (L.players || []).find(function (x) { return x.seat === i + 1; }); if (p && s.char && cm[s.char]) { p.finalRole = cm[s.char].ko; p.finalRoleId = s.char; p.finalTeam = cm[s.char].team; p.dead = !!s.dead; } });
      L.nights = state.nights || L.nights;
      var out = SRV.payloadOf(L), pr = pendingResult();
      out.game.status = 'in_progress'; out.game.pending = pr; out.game.touched_at = state.touchedAt || null; out.game.phase = state.phase; out.game.ended_at = null; out.game.ended_raw = null;
      return out;
    },
    'backup.export': function () { var x = buildExport('backup'); return x ? x.text : null; } };

  /* 진행 중인 판 — 첫밤을 시작했고 아직 끝나지 않은 판. 끝난 판(새 판 — 자리 그대로 뒤)은 다시 준비할 수 있다 */
  function inGame() { return firstNightBegun() && !gameEnded(); }
  function hasRoles() { return (state.seats || []).some(function (x) { return x && x.char; }); }
  function clearAsk() { return { status: 'needsConfirmation', token: 'clearRoles', revision: revision, reasonCode: 'rolesAssigned', choices: ['역할을 이미 나눴어요. 바꾸면 역할을 다시 나눠요 — 사람·자리는 그대로예요.'] }; }
  function guardSetup() { return inGame() ? rejected('notAllowedInPhase', '첫밤이 시작된 뒤에는 자리를 바꿀 수 없어요.') : null; }

  /* 참가자에게 보여 준 답을 «정보 전달»로 — 한 카드(밤|차례)에 한 번만. 덮개를 닫을 때(night.markShown)·전달하고 재울 때(advance) 둘 다 여기로 와서 겹치지 않는다(코덱스 13:03: 이전 차례 → 다시 전달이 두 번 적히던 것) */
  function logDelivery(card) {
    var nk = ((state.log && state.log.id) || '') + '|' + (state.nights || 1) + '|' + card.stepKey; wz.noted = wz.noted || {}; if (wz.noted[nk]) return false;   // 판 번호까지 — 같은 기기 다음 판에서 지난 판 기억으로 정보 전달 기록이 빠졌다(2026-10-05 재생 검사에서 찾음)
    if (((state.log && state.log.events) || []).some(function (e) { return e.type === '정보 전달' && e.n === (state.nights || 1) && e.단계 === card.stepKey; })) { wz.noted[nk] = 1; return false; }   // 다시 켠 뒤 같은 카드 — wz.noted 는 메모리라 두 번 적혔다(반증 검토 2-12)
    if (!(card.answer != null || card.falseReason || card.grimoire)) return false;
    try { var bs = (card.ansBoard && card.ansBoard.seats) || [];
      /* 숫자로 답하는 정보(공감능력자 이웃·요리사 쌍) — 누구를 보고 셌는지 진짜 판 기준으로 남긴다(복기 «인지된 사람과 직업», 2026-10-04 햇살님). 거짓 답이어도 본 사람은 같다 */
      var seen; try { var oi = card.seatNumber - 1, oc = CMAP()[state.seats[oi].char], row = function (st) { var k = state.seats.indexOf(st); return { 자리: k + 1, 직업: CMAP()[st.char] ? CMAP()[st.char].ko : '', 악: !!ansSeatEvil(st) }; };
        if (isRole(oc, 'empath')) seen = ansNeighbors(oi).map(row);
        else if (isRole(oc, 'chef')) { var au0 = autoAns(oc, oi); seen = []; ((au0 && au0.pairs) || []).forEach(function (pr) { pr.forEach(function (k) { if (!seen.some(function (x) { return x.자리 === k + 1; })) seen.push(row(state.seats[k])); }); }); }
      } catch (e) { seen = undefined; }
      logEvent('정보 전달', { 단계: card.stepKey, 본: seen, 누구: card.seatNumber, 직업: card.roleName, 답: card.answer != null ? card.answer : (card.grimoire ? '진행자 판' : null), 판: card.grimoire || undefined, 자리: bs.map(function (i) { return i + 1; }), 직업들: (card.ansBoard && card.ansBoard.roles) || [],
        악: bs.filter(function (i) { return state.seats[i] && realEvil(state.seats[i]); }).length, 거짓: !!card.falseReason, 까닭: card.falseReason || null, 진짜: card.trueAnswer || null,
        재량: discRecord(card), 편: (card.ansBoard && card.ansBoard.side) || null, 조각: card.boardPieces || undefined }); wz.noted[nk] = 1; return true; } catch (e) { return false; }   // 조각 — 다음 밤에도 취했으면 고정 조각을 여기서 이어받는다
  }
  var COMMANDS = {
    'preparation.experienceUnavailable': function (p) { if (experienceRecords[p.member] < EXPERIENCE_MIN) delete experienceRecords[p.member]; return null; },
    /* 친구가 아니라 전적은 못 보고 «20판 이상인가»만 받은 경우(서버 member_experienced, 2026-09-30 «예/아니오만 열기») — 예면 잠금, 아니오면 수동 */
    'preparation.recordExperienced': function (p) {
      if (!p.member || typeof p.experienced !== 'boolean') return rejected('invalidSelection');
      return COMMANDS['preparation.recordExperience']({ member: p.member, games: p.experienced ? EXPERIENCE_MIN : 0 });
    },
    /* 서버 등급(0110·0120 member_grades) — 20판 이상 회원의 1~5 와 위치 pct(0~100). 손 입력과 따로 둔다(index.html seatGrade). grade 가 null 이면 지운다 */
    'preparation.recordGrade': function (p) {
      if (!p.member || !(p.grade === null || (Number.isInteger(p.grade) && p.grade >= 1 && p.grade <= 5))) return rejected('invalidSelection');
      if (p.pct != null && !(typeof p.pct === 'number' && p.pct >= 0 && p.pct <= 100)) return rejected('invalidSelection');
      var g = {}; try { g = JSON.parse(localStorage.getItem('preparation_experience_grades') || '{}'); } catch (e) {}
      if (p.grade === null) delete g[p.member]; else g[p.member] = p.pct != null ? { grade: p.grade, pct: p.pct } : p.grade;
      localStorage.setItem('preparation_experience_grades', JSON.stringify(g)); return null; },
    'preparation.recordExperience': function (p) {
      if (!p.member || !Number.isInteger(p.games) || p.games < 0) return rejected('invalidSelection');
      var saved = {}; try { saved = JSON.parse(localStorage.getItem('preparation_experience_locks') || '{}'); } catch (e) {}
      experienceRecords[p.member] = Math.max(saved[p.member] || 0, p.games);
      if (p.games >= EXPERIENCE_MIN) saved[p.member] = p.games;
      localStorage.setItem('preparation_experience_locks', JSON.stringify(saved));
      return null;
    },
    'preparation.commitPeople': function (p) {
      var people = (p.people || []).filter(function (x) { return x && String(x.name || '').trim(); });
      for (var x of people) {
        if (x.manualExperience != null && (!Number.isInteger(x.manualExperience) || x.manualExperience < 1 || x.manualExperience > 5)) return rejected('invalidSelection', '경험 단계는 1~5 중에서 골라 주세요.');
        if (experienceOf(x.member, null).source === 'unknown' && x.manualExperience != null) return rejected('experienceUnknown', '회원 기록을 확인한 뒤 경험 단계를 골라 주세요.');
      }
      /* 투넬 회원에서 고른 사람 — 사람 명부에 회원 번호를 잇고 그 사람(pid)으로 앉힌다. 판을 올릴 때 회원 전적으로 붙는다 (2026-09-29) */
      people = people.map(function (x) {
        var nm = String(x.name).trim(), manual = experienceOf(x.member, x.manualExperience).manual;
        if (!x.member) return { name: nm, manualExperience: manual };
        if (String(x.member).indexOf('a:') === 0) {   // 투넬 회원이 아닌 첫밤 계정(광장 체크인) — 계정 번호로 잇는다(2026-10-06)
          var acc = String(x.member).slice(2), wa = personByAccountId(acc) || personNew(nm);
          personLinkAccount(wa.id, acc); return { name: wa.name, pid: wa.id, manualExperience: manual };
        }
        var who = personByTunelId(x.member) || personNew(nm);
        if (experienceOf(x.member, null).source === 'unknown') {
          var old = state.seats.find(function (s) { return s.pid === who.id; });
          manual = old && old.manualExperience || null; // 재조회 실패가 저장된 초안을 지우지는 않는다. 사용 여부는 source로 구분
        }
        personLinkTunel(who.id, x.member); return { name: who.name, pid: who.id, manualExperience: manual };
      });
      if (people.length < 5 || people.length > 20) return rejected('invalidSelection', '5명에서 20명까지 넣을 수 있어요.');
      if (inGame()) return rejected('notAllowedInPhase', '진행 중인 판이 있어요 — 판을 끝내거나 버린 뒤 바꿀 수 있어요.');
      var same = people.length === state.seats.length && people.every(function (x, i) { return state.seats[i] && state.seats[i].name === String(x.name).trim() && (!x.pid || state.seats[i].pid === x.pid); });
      if (same && !gameEnded()) { people.forEach(function (x, i) { state.seats[i].manualExperience = x.manualExperience; }); return null; }   // 참고값만 수정해도 역할은 유지
      if (gameEnded()) {   // 끝난 판 다음 새 준비 — 판 흔적(역할·밤·기록 위치)을 걷고 사람(이름·pid)만 이어받는다 (2026-09-29 «자리 정하기 처리 못함»)
        switchEdition(state.edition, { quiet: true, force: true });
        state.seats.forEach(function (x) { x.dead = false; delete x.cause; delete x.causeN; });
      } else if (hasRoles() && !p.force) return clearAsk();
      var ok = false; asking({ force: true }, function () { ok = partyApply(people); });
      if (!ok) return rejected('notAllowedInPhase', '지금은 명단을 바꿀 수 없어요.');
      people.forEach(function (x) { if (!x.pid) return; state.seats.concat(state.bench || []).forEach(function (st) { if (st && !st.pid && st.name === x.name) st.pid = x.pid; }); });   // 이름으로 남아 있던 자리에 회원 사람(pid)을 잇는다
      /* 새로 더한 사람은 웹에선 대기자 — 아이폰 자리 화면엔 대기자 칸이 없으니 자리 끝에 앉힌다(자리가 비었을 때의 partyApply 와 같은 방식) */
      if ((state.bench || []).length) { state.bench.forEach(function (b) { state.seats.push(Object.assign(blankSeat(), personOf(b))); }); state.bench = []; state.count = state.seats.length; if (state.layout === 'rect') fitGrid(state.count, true); save(); }
      people.forEach(function (x) { var s = state.seats.find(function (s) { return samePerson(x, s); }); if (s) s.manualExperience = x.manualExperience; });
      return null;
    },
    /* 새 판 준비로 들어간다 — practice 면 이번 준비의 판은 연습판(기록 안 남김). 진행 중인 판이 있으면 거부 */
    'preparation.enter': function (p) { if (inGame()) return rejected('notAllowedInPhase', '진행 중인 판이 있어요.'); if (p.practice) localStorage.setItem(PRACTICE_KEY, '1'); else localStorage.removeItem(PRACTICE_KEY);
      /* 판은 광장 안에서 — 없으면 조용히 연다(화면-038b). 연습이면 즉석 광장(요약 안 남김), 실전인데 연습 광장이 열려 있으면 닫고 새로(웹 newGameEntry 와 같게) */
      try { potAutoCloseCheck(); } catch (e) {}   // 24시간 지난 광장은 여기서 닫는다
      var cur = potNow(); if (cur && cur.practice && !p.practice) { try { potClose('practice'); } catch (e) {} cur = null; }
      if (!cur) potOpen(p.practice ? { practice: true } : undefined);
      return null; },
    'pot.open': function () { try { potAutoCloseCheck(); } catch (e) {} if (potNow()) return rejected('notAllowedInPhase', '이미 열린 ' + PKO('그릇') + '이 있어요.'); potOpen(); return null; },
    'pot.close': function () { if (!potNow()) return null; if (inGame() && !gameEnded()) return rejected('notAllowedInPhase', '진행 중인 판이 있어 닫을 수 없어요.'); potClose('hand'); return null; },
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
      state.rvPos = -1; state.rvSeen = []; save(); return null;
    },
    /* 자리 섞기 — 끄면 사람은 그대로 직업끼리만 맞바꿔 보정, 켜면 배정 때 사람 자리까지(seatArrange, 2026-10-01) */
    'roles.setSeatShuffle': function (p) { state.seatShuffle = !!p.on; save(); return null; },
    'seats.rearrange': function () { if (!state.newSeats || !state.seatUndo || firstNightBegun()) return rejected('notAllowedInPhase', '새로 정한 자리가 없어요.');
      state.seats = state.seatUndo.map(function (x) { return Object.assign({}, x); }); var note = seatArrange(true); logPlayersRefresh(); try { if (note) logEvent('판세 개입', note); } catch (e) {} save(); return null; },
    'seats.undoArrange': function () { if (!state.newSeats || !state.seatUndo || firstNightBegun()) return rejected('notAllowedInPhase', '되돌릴 자리가 없어요.');
      state.seats = state.seatUndo.map(function (x) { return Object.assign({}, x); }); logPlayersRefresh(); try { logEvent('판세 개입', { 곳: '자리 섞기', 되돌림: true }); } catch (e) {} save(); return null; },
    'seats.arrangeDone': function () { state.newSeats = false; save(); return null; },
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
      /* 사람별로 본 것을 따로 센다(앱구조점검 2-10, 2026-10-05) — 위치를 덮어쓰면 6번 줄을 잘못 눌러도 1~5번이 «확인함»이 되고 첫밤이 켜졌고,
         다 돌린 뒤 2번이 다시 보면 3~10번을 다시 돌려야 했다. 위치(rvPos) = 앞에서부터 빠짐없이 본 마지막 자리 */
      if (k < 0) { state.rvPos = -1; state.rvSeen = []; save(); return null; }
      var seen = Array.isArray(state.rvSeen) ? state.rvSeen.slice() : []; for (var j = 0; j <= (typeof state.rvPos === 'number' ? state.rvPos : -1); j++) if (seen.indexOf(j) < 0) seen.push(j);
      if (seen.indexOf(k) < 0) seen.push(k); var pos = -1; while (seen.indexOf(pos + 1) >= 0) pos++;
      state.rvSeen = seen; state.rvPos = pos; save(); return null; },
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
    /* 직업 정해 주기 — 그 직업을 받을 자리들(직업 수까지). 다른 직업에 정해 둔 사람이면 그쪽에서 빠진다 */
    'roles.setPins': function (p) { if (inGame()) return rejected('notAllowedInPhase', '첫밤 뒤에는 바꿀 수 없어요.'); ensureNg();
      var id = p.id, seats = (p.seats || []).map(Number), cm = CMAP();
      if (!cm[id] || seats.some(function (i) { return !state.seats[i]; }) || seats.length > (ngCounts[id] || 0) || new Set(seats).size !== seats.length) return rejected('invalidSelection', '정할 수 없는 자리예요.');
      var who = seats.map(function (i) { return pinWho(state.seats[i]); });
      ngPins = ngPins.filter(function (x) { return x.id !== id && who.indexOf(x.who) < 0; }).concat(who.map(function (w) { return { who: w, id: id }; }));
      return null; },
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
    'bluff.reroll': function () { if ((state.nights || 1) !== 1 || state.phase === 'day' || !bluffUsable()) return rejected('notAllowedInPhase', '지금은 블러프를 바꿀 수 없어요.'); var was = (state.bluffIds || []).slice(); autoBluff(); logEvent('블러프 바꿈', { 전: was, 후: (state.bluffIds || []).slice() }); return null; },
    'night.previous': function () { if (state.phase === 'day' || (wz.idx || 0) === 0) return rejected('notAllowedInPhase', '처음이에요.'); wzPrev(); save(); return null; },
    'phase.enterDay': function () { var st = stage(); if (st.stage !== 'dawn' && st.stage !== 'intro') return rejected('notAllowedInPhase', '밤 차례가 남아 있어요.');
      if (st.stage === 'intro' && st.order.length) return rejected('notAllowedInPhase', '밤 차례가 남아 있어요.'); wzToDay(); return null; },
    'succession.apply': function (p) { var r = successionReady().find(function (x) { return x.id === p.id; });
      /* 스타패스(객귀·임프 자발적 계승)는 감지가 없는 수동 계승(trigger false) — 웹 계승 시트처럼 밤에 흉수가 스스로를 골랐을 때 진행자가 직접 연다(2026-10-01 엔진 P2) */
      if (!r && p.id === 'imp_self' && state.phase !== 'day') r = SUCCESSION.find(function (x) { return x.id === 'imp_self'; });
      if (!r) return rejected('notAllowedInPhase', '지금은 계승할 일이 없어요.');
      var ok = (r.후보() || []).some(function (o) { return o.i === +p.seat; }); if (!ok) return rejected('invalidSelection', '그 자리는 계승 후보가 아니에요.');
      var c0 = current(), dk = c0 ? c0.o.dk : undefined; sucSelect(r.id); sucPickSeat(+p.seat); doSuccession(); follow(dk); return null; },
    'game.discardToRoles': function () { if (!firstNightBegun() || gameEnded()) return rejected('notAllowedInPhase', '버릴 판이 없어요.'); var pr = !!state.practice; wzDiscardToRoles(); if (pr) localStorage.setItem(PRACTICE_KEY, '1'); return null; },   // 연습판을 버리고 다시 나눠도 연습
    /* 큰 화면 — 진행자가 처음 구성(선·악 수)을 말했을 때만 공개 스냅샷에 고정. 그 뒤 진영이 바뀌어도 그대로 */
    'display.announceComposition': function () { if (!firstNightBegun()) return rejected('notAllowedInPhase', '판이 시작되지 않았어요.');
      var P = pubState(pubEpoch()), c = { good: 0, evil: 0 };
      ((state.log && state.log.players) || []).forEach(function (p) { if (p.team === 'town' || p.team === 'outsider') c.good++; else if (['minion', 'demon', 'mafia'].indexOf(p.team) >= 0) c.evil++; });
      P.comp = c; pubSave(P); return null; },
    /* 큰 화면 — 토론 타이머가 코어(tm)가 아니라 화면 쪽에 있는 앱(웹·아이폰)이 시작·멈춤·재개·추가·끝·지움을 알린다. 허용한 칸만 받는다 */
    'display.setTimer': function (p) { var P = pubState(pubEpoch()), s = p && p.state;
      if (!p || s === null || s === undefined) P.timer = null;
      else { if (['running', 'paused', 'elapsed'].indexOf(s) < 0) return rejected('invalidSelection', '타이머 상태가 아니에요.');
        var num = function (x) { return typeof x === 'number' && isFinite(x) && x >= 0 ? Math.round(x) : null; };
        P.timer = { state: s, endsAt: s === 'paused' ? null : num(p.endsAt), durationMs: num(p.durationMs) || 0, leftMs: s === 'paused' ? num(p.leftMs) : s === 'elapsed' ? 0 : null,
          kind: p.kind === 'square' ? 'square' : 'whisper', n: state.nights || 1 }; }   // 밀담(whisper)·광장(square) 두 줄(2026-10-05) — kind 없으면 옛 앱이라 밀담으로
      pubSave(P); return null; },
    /* 진행자 내부 입구. 원격 참가자에게 노출하지 않는다. 기존 플랫폼 dispatch가 저장·복구를 소유한다. */
    'engine.act': function (p) {
      if (typeof p.observedRevision !== 'number' || p.observedRevision !== revision) return rejected('staleRevision', '제안 이후 판이 바뀌었어요. 다시 확인해 주세요.');
      if (typeof GameEngine === 'undefined' || !GameEngine.prepareAction) return rejected('engineUnavailable', '엔진을 불러오지 못했어요.');
      var action = GameEngine.prepareAction(p.seat, p.action);
      if (action.status !== 'ready') return rejected(action.code || 'invalidSelection', '지금 적용할 수 없는 행동이에요.');
      if (action.type !== 'day.nominate') return rejected('unsupportedAction', '아직 지원하지 않는 행동이에요.');
      if (p.confirmation === 'accept') action.payload.ok_shield = true;
      else if (p.confirmation === 'decline') action.payload.decline_shield = true;
      else if (p.confirmation !== undefined) return rejected('invalidSelection', '확인 선택이 올바르지 않아요.');
      return COMMANDS['day.nominate'](action.payload);
    },
    'day.announce': function () { if (state.phase !== 'day') return rejected('notAllowedInPhase', '낮이 아니에요.'); var was = !!dayRec().announced; uiDayAnnounce(); var D0 = dayRec(); if (D0.announced && !was) D0.announcedAt = Date.now(); else if (!D0.announced) delete D0.announcedAt; save(); return null; },   // 발표 시각 — TV 가 이름을 잠깐만 크게 보이는 기준(2026-10-04)
    'day.nominate': function (p) { if (state.phase !== 'day') return rejected('notAllowedInPhase', '낮이 아니에요.');
      var t = +p.target, D = dayRec(), m = day(), by = (p.by === null || p.by === undefined) ? null : +p.by;
      if (!m.targets.some(function (x) { return x.index === t; })) return rejected('invalidSelection', '지명할 수 없는 사람이에요.');   // 웹 지명 대상·지명자 목록과 같은 잣대(죽은 사람·이미 지명된 사람 거름)
      if (by !== null && !m.nominators.some(function (x) { return x.index === by; })) return rejected('invalidSelection', '지명할 수 없는 사람이 골랐어요.');
      nomBy = by; wz.nomTgt = t; var rr = shieldRun(p, function () { uiDayNomSubmit(); try { uiDayVoteCancel(); } catch (e) {} });
      if (!rr && hubRep() !== 'mafia') { var x = narrPick('nom.call'); if (x) speak(x.show.replace(/\{who\}/g, seatLabel(t).name).replace(/\{by\}/g, by === null ? '진행자' : seatLabel(by).name), 'day', 'nomCall', [{ clip: x.clip, say: x.say }]); }   // 지명 알림 낭독(2026-10-04) — 마피아는 «살린다·죽인다» 흐름이라 없음
      return rr; },
    /* 오리지널 마피아 낮(2026-10-03 햇살님 «이렇게 확정», 시안/오리지널마피아_낮_20261003 v5) — 지목은 기록하지 않고 가장 많이 지목받은 사람만 → 살린다·죽인다.
       지명 줄 하나를 만들고(지명자 없음) 죽이면 처형(표 문턱 없이), 살리면 그 줄에 «살림». 동수는 그 자리에서 무효·둘 다 찬반·다시 지목.
       ponytail: 살림은 판 기록 사건을 따로 안 남긴다(지명 사건만) — 복기에서 «살림»을 보이고 싶어지면 그때 */
    'day.verdict': function (p) { if (hubRep() !== 'mafia') return rejected('notAllowedInPhase', '오리지널 마피아 판에서만 써요.');
      if (typeof p.kill !== 'boolean') return rejected('invalidSelection');
      var r = COMMANDS['day.nominate']({ target: p.target, ok_shield: p.ok_shield, decline_shield: p.decline_shield }); if (r) return r;
      var D = dayRec(), k = D.noms.length - 1;
      if (!p.kill) { D.noms[k].saved = true; save(); var x = narrPick('exec.survived'); if (x) speak(x.say, 'exec', 'tieNone', [{ clip: x.clip, say: x.say }]); return null; }   // 마피아 «살린다» — 공개 결과라 읽어도 된다
      return COMMANDS['day.execute'](Object.assign({}, p, { k: k, ok_execGate: true })); },
    'day.nomRemove': function (p) { var k = +p.k, n = dayRec().noms[k]; if (!n) return rejected('invalidSelection', '지명을 못 찾았어요.'); if (n.done) return rejected('notAllowedInPhase', '처형한 지명은 지울 수 없어요.'); dayNomRemove(k); return null; },   // 잘못 넣은 지명 지우기(2026-10-05) — 유령표는 돌려준다
    'day.verdictUndo': function (p) { var n = dayRec().noms[+p.k]; if (!n || n.done || !n.saved) return rejected('invalidSelection', '되돌릴 결과가 없어요.'); dayNomRemove(+p.k); return null; },
    'day.tie': function (p) { if (state.phase !== 'day') return rejected('notAllowedInPhase', '낮이 아니에요.');
      var D = dayRec(), G = execGate();
      if (p.how === 'undo') { if (!D.tieNone) return rejected('invalidSelection', '되돌릴 결정이 없어요.'); delete D.tieNone; save(); return null; }
      if (!(G.leaders.length > 1 && G.lead >= G.need)) return rejected('invalidSelection', '동수가 아니에요.');
      var ks = G.leaders.map(function (o) { return D.noms.indexOf(o); }).sort(function (a, b) { return b - a; });
      if (p.how === 'none') { D.tieNone = true; save(); var x = narrPick('tie.none'); if (x) speak(x.say, 'day', 'tieNone', [{ clip: x.clip, say: x.say }]); return null; }
      if (p.how === 'revote') { ks.forEach(function (k) { dayVotersClear(k); }); return null; }   // 동수인 둘의 표를 비운다 — 진행자가 각각 다시 «투표»
      if (p.how === 'renominate') { ks.forEach(function (k) { dayNomRemove(k); }); return null; }   // 동수인 지명을 걷는다 — 다시 지명할 수 있다
      return rejected('invalidSelection'); },
    'day.tieVoid': function (p) { if (hubRep() !== 'mafia') return rejected('notAllowedInPhase', '오리지널 마피아 판에서만 써요.');
      var t = (p.targets || []).map(Number), m = day();
      if (t.length !== 2 || t[0] === t[1] || !t.every(function (i) { return m.targets.some(function (x) { return x.index === i; }); })) return rejected('invalidSelection', '동수인 두 사람을 골라 주세요.');
      dayRec().tieVoid = t; save(); var x = narrPick('tie.none'); if (x) speak(x.say, 'day', 'tieNone', [{ clip: x.clip, say: x.say }]); return null; },
    'day.tieVoidUndo': function () { var D = dayRec(); if (!D.tieVoid) return rejected('invalidSelection', '되돌릴 결과가 없어요.'); delete D.tieVoid; save(); return null; },
    'day.vote': function (p) { var D = dayRec(), k = +p.k, n = D.noms[k]; if (!n || n.done) return rejected('invalidSelection', '투표할 지명이 없어요.');
      var ok = {}; voters(k).forEach(function (v) { ok[v.index] = 1; }); var sel = (p.voters || []).map(Number);
      if (sel.some(function (i) { return !ok[i]; })) return rejected('invalidSelection', '투표할 수 없는 사람이 있어요.');
      uiDayVoteOpen(k); pickOv.free = pickOv.free || {}; pickOv.free.sel = sel; uiDayVoteCommit(); return null; },
    'day.execute': function (p) { var D = dayRec(), k = +p.k, n = D.noms[k]; if (!n || n.done) return rejected('invalidSelection', '처형할 지명이 없어요.');
      var G = execGate(); if (k !== G.k && !p.ok_execGate) return { status: 'needsConfirmation', token: 'execGate', revision: revision, reasonCode: 'belowGate', choices: [(G.reason ? G.reason.split(' — ')[0] + ' — ' : '') + '규칙상 처형이 아니에요. 방 규칙·예외로 처형할까요?'] };   // 웹도 묻고 예면 진행한다
      var nToday = state.nights || 1, execedToday = D.noms.some(function (o) { return o.done; }) || state.seats.some(function (x) { return x && x.dead && x.cause === 'exec' && x.causeN === nToday; });   // 웹 uiDayExec 와 같은 잣대 — 하늘의 벌·좌석 시트 처형도 센다
      if (execedToday && !p.ok_exec2 && !p.force) return { status: 'needsConfirmation', token: 'exec2', revision: revision, reasonCode: 'secondExecution', choices: ['오늘 이미 처형이 있었어요(하루 1회). 예외일 때만 계속하세요.'] };
      return shieldRun(p, function () { uiDayExec(k); }); },
    /* 처형하고 바로 마감 — 처형만 남은 판에서 승패 판정 버튼이 부른다. 처형 뒤 판정이 안 나면(예: 보호로 안 죽음) 처형만 하고 멈춘다 */
    'day.executeAndFinish': function (p) {
      var r = COMMANDS['day.execute'](p); if (r) return r;
      if (!endWinner()) return null;
      wzFinish(); return wz.mode === 'done' ? null : null;
    },
    'day.executeUndo': function (p) { var n = dayRec().noms[+p.k]; if (!n || !n.done) return rejected('invalidSelection', '되돌릴 처형이 없어요.'); uiDayExecUndo(+p.k); return null; },
    'day.call': function (p) { var c = String(p.call || ''); if (!ALLOW.test(c)) return rejected('invalidSelection', '허용하지 않은 동작이에요.'); return shieldRun(p, function () { eval(c); }); },   // 직접 eval — 이 자리의 범위에서 찾는다. 간접 eval 은 전역에서 찾아 웹(함수 안에 올린 코어)에선 «markUsed is not defined» 로 전부 거절됐다(2026-10-02 Fable 검토 A). 허용 정규식 ALLOW 를 지난 것만 온다
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
    /* 결과가 정해진 판을 12시간 안 건드렸으면 그 결과로 닫는다(2026-09-30 햇살님). 앱을 켤 때 부른다. force 는 시험용 */
    'game.autoClose': function (p) {
      if (state.practice || !firstNightBegun() || gameEnded()) return rejected('notAllowedInPhase', '닫을 판이 없어요.');
      var hours = +(p.hours || 12), last = Date.parse(state.touchedAt || '') || 0, idle = (Date.now() - last) / 36e5;
      if (!p.force && (!last || idle < hours)) return rejected('notAllowedInPhase', '아직 ' + Math.max(0, hours - idle).toFixed(1) + '시간 남았어요.');
      var pr = pendingResult(); if (!pr) return rejected('notAllowedInPhase', '결과가 정해지지 않은 판이에요.');
      if (pr.how === '처형 가정') { uiDayExec(dayRec().noms.findIndex(function (n) { return n.t === pr.seat - 1 && !n.done; })); }
      logEvent('자동 마감', { 근거: pr.how, 승자: pr.winner, 자리: pr.seat || null, 방치시간: Math.round(idle * 10) / 10 });
      wzFinish(); if (wz.mode !== 'done') { wzFinishDo(pr.winner, true); }
      if (wz.mode !== 'done') return rejected('coreFailure', '마감하지 못했어요.');
      effects.push({ kind: 'notice', text: '손대지 않은 판을 ' + (pr.how === '판정' ? '판정 기준' : pr.seat + '번 처형 가정') + '으로 닫았어요.' }); return null;
    },
    'display.endReveal': function (p) { if (!(firstNightBegun() && gameEnded())) return rejected('notAllowedInPhase', '판이 끝난 뒤에 열 수 있어요.'); state.tvReveal = !!p.on; return null; },
    'display.endReplay': function (p) { if (!(firstNightBegun() && gameEnded())) return rejected('notAllowedInPhase', '판이 끝난 뒤에 열 수 있어요.');
      if (p.day === null || p.day === undefined) { delete state.tvReplay; return null; } var d = +p.day, t = endReplayDays(); if (!(d >= 0 && d <= t)) return rejected('invalidSelection', '그날 기록이 없어요.'); state.tvReplay = d; return null; },
    'game.finish': function (p) { if (gameEnded()) return rejected('notAllowedInPhase', '이미 끝난 판이에요.');
      wzFinish(); if (wz.mode === 'done') return null;
      if (['good', 'evil', 'other', 'void'].indexOf(p.winner) < 0) return rejected('invalidSelection', '승자를 골라 주세요.');
      wzFinishDo(p.winner, true); return wz.mode === 'done' ? null : rejected('coreFailure', '마감하지 못했어요.'); },
    'game.again': function (p) { if (!gameEnded()) return rejected('notAllowedInPhase', '끝난 판이 아니에요.'); delete state.tvReveal; delete state.tvReplay;   /* 한 판 더 — 지난 판 직업 공개·복기를 TV 에서 걷는다 */ if (state.practice) localStorage.setItem(PRACTICE_KEY, '1');   /* 연습판에서 «한 판 더»는 계속 연습(웹 연습 마당과 같게) */ wz.again = {}; wzAgainGo(); try { prepClose(); } catch (e) {}
      if (p && p.shuffle) state.seatShuffle = true;   // «자리 섞어서 다시»
      if (p && p.fresh) { switchEdition(state.edition, { quiet: true, force: true }); state.seats.forEach(function (x) { x.dead = false; delete x.cause; delete x.causeN; }); }   // «바꿔서 한 판 더» — 인원·자리부터 다시 볼 땐 지난 판 흔적(사망·역할)을 걷는다(명단 확정의 끝난 판 갈래와 같게)
      return null; },
    'seat.toggleToken': function (p) { var i = +p.seat; if (!state.seats[i]) return rejected('invalidSelection', '자리를 찾지 못했어요.');
      try { if (!KREG.개념[KID('tok', String(p.token))]) return rejected('invalidSelection', '등록되지 않은 표식이에요.'); } catch (e) {}   // 입구에서 막는다 — 미등록 이름은 저장 가드가 거부한다
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
    'director.setModeStats': function (p) { try { localStorage.setItem('dangsan_modestats', JSON.stringify(p.rows || {})); } catch (e) {} return null; },   // 모드·인원별 선·악 승수(서버 합계) — 앱을 켤 때 받아 둔다. 구성·블러프처럼 첫밤 전에 뽑는 것도 쓸 수 있게
    'director.setRoleStats': function (p) { try { localStorage.setItem('dangsan_rolestats', JSON.stringify(p.rows || {})); } catch (e) {} return null; },   // 직업별 승률 합계(서버) — 구성 기울이기
    'director.setEnabled': function (p) { try { localStorage.setItem('dangsan_tilt', p.on ? 'on' : 'off'); } catch (e) {} return null; },
    'director.setServer': function (p) { state.director = state.director || {};
      if (p.skill && typeof p.skill.gap === 'number') state.director.skillSrv = { gap: p.skill.gap, n: p.skill.n | 0 };
      if (p.rate) state.director.rateSrv = { good: p.rate.good | 0, evil: p.rate.evil | 0 };
      save(); return null; },
    'sync.markUploaded': function (p) { var ids = p.ids || []; if (!ids.length) return rejected('invalidSelection', '올린 판이 없어요.');
      logsAll().filter(function (L) { return L && ids.indexOf(L.uuid || L.id) >= 0; }).forEach(function (L) { SRV.markUploaded(L); }); return null; },
    'sync.merge': function (p) { var n = SRV.mergeRows(p.rows || []); if (n === null) return rejected('coreFailure', '기록을 합치지 못했어요.'); lastMerged = n; return null; },
    'record.delete': function (p) { var a = logsAll(), i = a.findIndex(function (x) { return x.id === p.id; }); if (i < 0) return rejected('invalidSelection', '기록을 못 찾았어요.'); var gone = a[i]; deleteLog(i); try { if (gone && endLog() === null && state.lastLogId === gone.id) { delete state.tvReveal; delete state.tvReplay; } } catch (e) {} return null; },   // 지운 판의 TV 공개·복기는 걷는다(반증 검토 2-14)
    'backup.import': function (p) { var data; try { data = JSON.parse(p.json); } catch (e) { return rejected('invalidSelection', '백업 파일을 읽지 못했어요.'); }
      try { var r = importBackup(data); lastImport = r; } catch (e) { return rejected('invalidSelection', String(e.message || e)); } return null; },
    'night.undoTargets': function () { if (!undoTgt) return rejected('notAllowedInPhase', '되돌릴 확정이 없어요.');
      var u = undoTgt; restoreState(u.raw); var w0 = JSON.parse(u.wz); Object.keys(wz).forEach(function (k) { delete wz[k]; }); Object.assign(wz, w0); return null; },
    'night.commitTargets': function (p) {
      try { var c00 = current(); if (c00 && c00.o.dk === 'lm') blAutoHolder(c00.o); } catch (e) {}   /* 품은 하수인 자동 — 진행자가 안 골랐을 때만 */
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
    /* 진행자가 «답 직접 고르기»로 보여 준 답 — 전부 기록한다(2026-09-30 햇살님 «진행자 답도 다 저장해»). 앱 답이 있었으면 그것도 나란히 */
    'night.noteAnswer': function (p) {
      var card = nightCard(); if (!card) return rejected('notAllowedInPhase', '깨울 차례가 없어요.');
      var seats = (p.seats || []).map(function (n) { return +n - 1; }).filter(function (i) { return state.seats[i] && state.seats[i].char; });
      logEvent('정보 전달', { 누구: card.seatNumber, 직업: card.roleName, 답: String(p.text || ''), 자리: seats.map(function (i) { return i + 1; }), 직업들: p.role ? [String(p.role)] : [],
        악: seats.filter(function (i) { return realEvil(state.seats[i]); }).length, 거짓: !!card.falseReason, 까닭: card.falseReason || null, 진짜: card.trueAnswer || null, 재량: discRecord(card, '직접'), 진행자: true, 앱답: card.answer || null,
        편: (function () { var t = String(p.text || ''); if (p.role) { var c = CHARS().find(function (x) { return x.ko === String(p.role); }); return c ? (((FIXED.TEAM || {})[c.team] || {}).side || null) : null; } return /흉수|악/.test(t) ? 'evil' : (/선/.test(t) ? 'good' : null); })() });
      wz.noted = wz.noted || {}; wz.noted[((state.log && state.log.id) || '') + '|' + (state.nights || 1) + '|' + card.stepKey] = 1; save(); return null;   /* logDelivery 와 같은 열쇠(판 번호까지) */
    },
    /* 재량 슬라이드 — 칸을 옮기거나(칸) 같은 칸에서 다른 답(다른답). 미리보기만 바뀌고 기록은 없다. 확정은 전달(«정보 전달») 때 */
    'night.setDiscretion': function (p) {
      var card = nightCard(); if (!card) return rejected('notAllowedInPhase', '깨울 차례가 없어요.');
      var D = discOf(card); if (!D || D.없음) return rejected('invalidSelection', '이 카드엔 고를 재량이 없어요.');
      if (D.잠김) return rejected('notAllowedInPhase', '이미 보여 준 답이에요.');
      if (p.잠금) return COMMANDS['night.markShown']({});   // 옛 이름 — 공개 완료와 같다
      if (p.칸 !== undefined && p.칸 !== null) { var k = +p.칸; if (!(k >= 0 && k < D.칸.length)) return rejected('invalidSelection', '없는 칸이에요.'); if (k !== D.현재) { D.현재 = k; D.alt = 0; } }
      if (p.다른답) D.alt = (D.alt || 0) + 1;
      if (!discApply(card, D)) return rejected('coreFailure', '후보를 못 찾았어요.');
      save(); return null;
    },
    /* 공개 완료 — 참가자에게 답을 보여 준 순간: 전달 기록(답 스냅샷·재량)과 재량 잠금을 함께 저장한다. 앱이 꺼져도 기록이 남고, advance 는 같은 기록을 다시 적지 않는다 */
    'night.markShown': function () {
      var card = nightCard(); if (!card) return rejected('notAllowedInPhase', '깨울 차례가 없어요.');
      var D = discOf(card); if (D && !D.없음) D.잠김 = true;
      logDelivery(card); save(); return null;
    },
    'night.advance': function (p) {   // 대상이 없는 카드만(또는 skip). 대상이 있는 카드는 night.commitTargets 가 이어져야 한다
      try { var c01 = current(); if (c01 && c01.o.dk === 'lm') blAutoHolder(c01.o); } catch (e) {}   /* 품은 하수인 자동 — 진행자가 안 골랐을 때만 */
      var card = nightCard(); if (!card) return rejected('notAllowedInPhase', '깨울 차례가 없어요.');
      if (card.needsTargetsFirst && !p.skip) return rejected('invalidSelection', '먼저 대상을 확정해 주세요.');   // skip — 고르지 않고 재움(웹 «재웠음 · 다음»: 안 쓰겠다는 사람·쓸 수 없는 밤)
      /* 참가자에게 보여 준 답 — «정보 전달» 한 줄(판세 분석: 짚인 사람이 이후 지명·표·처형·밤 사망에 오르나를 잇는다, 2026-09-30). 진행자가 직접 고른 답을 이미 적었으면 앱 답은 안 적는다 */
      if (!p.skip) logDelivery(card);   // 전달 기록(한 번만) — 덮개를 닫을 때 이미 적었으면 건너뛴다
      wz.pickRes = null; wzMarkNext(state.nights || 1, isNaN(+card.stepKey) ? card.stepKey : +card.stepKey); save(); return null;
    },
  };

  return {
    initializeDisplay: prepareDisplayPublic,   // 플랫폼 부팅: 저장본 복원·타이머 정리 뒤 한 번. 일반 조회/원격 명령으로 노출하지 않음
    query: function (name, arg) { if (name === 'preparation.experience') return J({ revision: revision, data: experienceOf(arg || null, null) }); var f = QUERIES[name]; outHub = null; if (name === 'display.public' || name.indexOf('sync.') === 0 || name === 'backup.export') return J({ revision: revision, data: f(arg) });   // 서버·백업·큰 화면으로 가는 자료는 글을 바꾸지 않는다
      return JT(f ? { revision: revision, data: f(arg) } : { revision: revision, data: null, error: 'unknownQuery' }); },
    dispatch: function (json) {
      var cmd = JSON.parse(json);
      if (replies[cmd.commandId]) return replies[cmd.commandId];                       // 같은 명령 재요청 — 처음 응답 그대로
      if (cmd.expectedRevision !== revision) return J(rejected('staleRevision', '판이 바뀌었어요. 다시 읽어 올게요.'));
      var f = COMMANDS[cmd.type]; if (!f) return J(rejected('unknownCommand', cmd.type));
      var snap = localStorage.getItem('botc_state'), wzSnap = JSON.stringify(wz);        // 실패·거절하면 직전 상태로
      /* 받침 저장소 전체 — 판(botc_state)만 되돌리면 명령이 중간에 쓴 다른 칸(사람 명부·연결·공개 스냅샷…)이 거절된 뒤에도 남았다(2026-10-02 Fable·코덱스 관측 2). 값은 글자라 베끼는 값이 아니라 가리키기만 한다 */
      var all0 = {}; for (var si = 0; si < localStorage.length; si++) { var sk = localStorage.key(si); all0[sk] = localStorage.getItem(sk); }
      var recStart = null, recAt = Date.now(); if (cmd.type === 'roles.assign') { var seed = typeof __recSeed === 'number' ? __recSeed >>> 0 : (RNG0() * 4294967296) >>> 0; if (typeof __recMem === 'object' && __recMem) { ngCounts = __recMem.ng.counts; ngTarget = __recMem.ng.target; ngPins = __recMem.ng.pins; ngPractice = __recMem.ng.practice; ngFor = __recMem.ng.for; experienceRecords = __recMem.exp || {}; }   // 재생 — 메모리에만 있던 구성 초안·숙련 기록을 되살린다
        recStart = { seed: seed, store: recStore(), digest: recDigest(), mem: JSON.parse(J({ ng: { counts: ngCounts, target: ngTarget, pins: ngPins, practice: ngPractice, for: ngFor }, exp: experienceRecords })) }; state.rng = { s: seed, k: 0 }; }   // 새 판의 시작점 — 배정 직전 저장소(기록 묶음 빼고) + 씨앗
      var undoStorage = function () { var ks = []; for (var j = 0; j < localStorage.length; j++) ks.push(localStorage.key(j));
        ks.forEach(function (k) { if (!(k in all0)) localStorage.removeItem(k); }); Object.keys(all0).forEach(function (k) { if (localStorage.getItem(k) !== all0[k]) localStorage.setItem(k, all0[k]); }); };
      var guard0 = typeof lastGuardFail === 'undefined' ? null : lastGuardFail;   // 저장 가드가 이 명령에서 거부했는지 보려고
      effects = [];
      /* 밤 도중 좌석 시트에서 죽이기·살리기·표식·지연 사망을 하면 깨울 목록이 바뀐다 — 보던 카드(dk)를 따라가게(웹 wzRender 의 lastWho 와 같은 몫). 안 그러면 다른 사람 카드로 밀려 옛 대상이 확정될 수 있었다 */
      var dk0 = null; if (STAY[cmd.type] && state.phase !== 'day') { try { var c0 = current(); if (c0) dk0 = c0.o.dk; } catch (e) {} }
      var tgt0 = cmd.type === 'night.commitTargets' ? (function () { var c0 = current(); return c0 ? { raw: snap, wz: wzSnap, dk: c0.o.dk, n: state.nights || 1 } : null; })() : null;
      var r, rc0 = recStart ? null : recOf(), ent = null; if (rc0 && !REC_SKIP[cmd.type]) { ent = [cmd.type, cmd.payload || {}, recAt, 0]; rc0.c.push(ent); }   // 실행 전에 적는다 — 판을 닫는 명령은 실행 중에 판 기록이 보관함으로 옮겨져, 뒤에 적으면 빠졌다
      try { r = f(cmd.payload || {}); __flushTimers(); }
      catch (e) { r = rejected('coreFailure', String(e && e.message || e)); }
      if (r && r.status !== 'ok') {   // 거절·확인 요청 — 명령이 중간에 바꿔 둔 것(예: game.finish 의 wz.mode)을 되돌린다
        try { undoStorage(); if (snap) restoreState(snap); var w0 = JSON.parse(wzSnap); Object.keys(wz).forEach(function (k) { delete wz[k]; }); Object.assign(wz, w0); } catch (e2) {}
      }
      if (!r && dk0 !== null) { try { follow(dk0); } catch (e) {} }
      /* 현재 밤 카드를 명령 안에서 한 번 계산 — 중독·취함 거짓 답 같은 앱 재량이 state.fixed 에 적혀 저장된다.
         안 그러면 첫 «조회»가 판을 바꾸고 난수를 쓴다(2026-10-01 엔진 대량 검사 «조회 불변» 20건) */
      if (!r) { try { if (state.phase !== 'day' && current()) { nightCard(); discPrepare(); } } catch (e) {} }   // 재량표도 명령 안에서 — 조회는 읽기만
      if (!r) { try { if (recStart) { state.rec = { v: 1, core: typeof __CORE_VER === 'string' ? __CORE_VER : null, archived: typeof __CORE_ARCHIVED !== 'undefined' && !!__CORE_ARCHIVED, seed: recStart.seed, uuid: (state.log && state.log.uuid) || null, start: recStart.store, digest: recStart.digest, mem: recStart.mem, c: [ent = [cmd.type, cmd.payload || {}, recAt, 0]] }; if (state.log) delete state.log.rec; }   // 씨앗+명령 기록 — 판 기록이 생기면 그 안으로 옮겨 함께 올라간다
          if (ent) { var rcN = recOf(), last = rcN && rcN.c[rcN.c.length - 1]; if (last && last[0] === ent[0]) last[3] = (state.rng && state.rng.k) || 0; }   /* 판 기록이 사본으로 바뀌었을 수 있어(가정 처형) 지금 기록의 마지막 줄에 */ /* 넷째 = 이 명령 뒤 판 난수를 쓴 횟수 — 재생이 어디서 갈리는지 바로 보인다 */ if (state.log && state.rec) { state.log.rec = state.rec; delete state.rec; } } catch (e) {}
        try { if (cmd.type !== 'game.autoClose' && cmd.type !== 'sync.markUploaded' && cmd.type !== 'sync.merge') state.touchedAt = new Date().toISOString(); wzPersist(); save(); } catch (e) {}
        /* 저장 가드가 거부했으면(등록부에 없는 값) 성공이 아니다 — 저장 안 된 채 ok 를 내면 화면과 저장본이 갈라지고, 다음 거절 때 그사이 진행이 통째로 사라졌다(2026-10-02 Fable·코덱스 관측 3) */
        if (typeof lastGuardFail !== 'undefined' && lastGuardFail !== guard0) {
          try { undoStorage(); if (snap) restoreState(snap); var w1 = JSON.parse(wzSnap); Object.keys(wz).forEach(function (k) { delete wz[k]; }); Object.assign(wz, w1); } catch (e3) {}
          r = rejected('persistenceFailed', '저장할 수 없는 값이 있어 이 조작을 취소했어요.'); } }
      if (!r) { undoTgt = tgt0; }   // 대상 확정이면 직전 상태를 들고, 다른 명령이 성공하면 버린다
      if (!r) { try { announceEnd(); } catch (e) {} try { if (!(firstNightBegun() && gameEnded())) { delete state.tvReveal; delete state.tvReplay; } } catch (e) {} }   // 새 판이면 지난 판 공개를 걷는다   // 판 끝 자동 발표 — 저장 뒤, 효과로만(판 상태는 안 바꾼다)
      if (!r) { try { prepareDisplayPublic(); } catch (e) {
        try { undoStorage(); if (snap) restoreState(snap); var w2 = JSON.parse(wzSnap); Object.keys(wz).forEach(function (k) { delete wz[k]; }); Object.assign(wz, w2); } catch (e4) {}
        r = rejected('persistenceFailed', '공개 화면 정보를 저장하지 못해 이 조작을 취소했어요.');
      } }
      if (!r) { revision += 1; r = { status: 'ok', commandId: cmd.commandId, revision: revision, effects: effects.map(function (e, i) { return Object.assign({ effectId: cmd.commandId + ':' + i }, e); }) }; }   // 진행 위치(wz)도 판과 함께 저장 — 다시 켜면 보던 카드로(03 수용 08)
      outHub = null; var out = JT(r); if (r.status === 'ok') replies[cmd.commandId] = out; return out;
    },
    /* 아이폰 저장 두 파일(2026-10-05) — main 은 판 기록·마당 요약 빼고 전부, logs 는 그 둘이 바뀐 때만(아니면 null). 300판이면 7MB 를 명령마다 다시 쓰던 것 */
    /* 씨앗+명령 2단계(2026-10-05) — 올리기 전 확인. canonLog: 판 기록에서 시각·번호를 뺀 비교용 글(사건·참가자·승자).
       replayRun: «새로 띄운» 코어(시작 저장소 = rec.start)에서 씨앗·명령을 다시 돌려 같은 비교용 글을 돌려준다. 둘이 같아야 사건 기록을 빼고 올린다 */
    coreVersion: function () { return typeof __CORE_VER === 'string' ? __CORE_VER : null; },
    canonLog: function (id) { var L = logsAll().find(function (x) { return x && (x.id === id || x.uuid === id); }); return L ? canonOf(L) : null; },
    replayRun: function (recJson) { var rec = JSON.parse(recJson), g = globalThis, out = null;
      g.__recSeed = rec.seed; g.__recMem = rec.mem; g.__recUuid = rec.uuid; g.__recDigest = rec.digest;   // 다시 돌리는 동안만(동기) — 끝나면 걷는다
      try { (rec.c || []).forEach(function (x, i) { var r = JSON.parse(NativeCore.dispatch(J({ commandId: 'rp' + i, expectedRevision: revision, type: x[0], payload: x[1] }))); if (r.status === 'ok') revision = r.revision; });
        var L = logsAll().slice(-1)[0] || state.log; out = L ? canonOf(L) : null;
      } catch (e) { out = null; } finally { delete g.__recSeed; delete g.__recMem; delete g.__recUuid; delete g.__recDigest; }
      return out; },
    /* 받아서 되살리기 — 새로 띄운 코어에서 다시 돌린 판 기록을 «저장된 모양» 그대로(서버 payload 와 같은 꼴). 실패면 null */
    replayLog: function (recJson) { var c = NativeCore.replayRun(recJson); if (!c) return null; try { var a = JSON.parse(localStorage.getItem('botc_logs') || '[]'); return J(a[a.length - 1] || null); } catch (e) { return null; } },
    exportSplit: function () { var main = {}, big = {}, changed = false;
      for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i), v = localStorage.getItem(k); if (k === 'botc_logs' || k === 'botc_pots') big[k] = v; else main[k] = v; }
      ['botc_logs', 'botc_pots'].forEach(function (k) { if (big[k] !== lastBig[k]) changed = true; });
      if (changed) lastBig = { botc_logs: big.botc_logs, botc_pots: big.botc_pots };
      return J({ main: main, logs: changed ? big : null }); },
    markSplitSaved: function (ok) { if (!ok) lastBig = {}; },   // 쓰기 실패면 다음엔 다시 쓰게
    exportStorage: function () { var o = {}; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); o[k] = localStorage.getItem(k); } return J(o); },
    setRevision: function (n) { revision = n | 0; }
  };
})();
