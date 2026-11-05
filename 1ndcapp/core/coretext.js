/* 판 진행 글 영어 — 앱 CoreText.swift 와 같은 규칙의 JS 판(웹 진행 화면·번역 덮음 재기) (2026-10-06)
   사전: data(직업·모드 글) + core(문장 조각 틀 {p} 사람 이름 · {n} 숫자 · {r} 직업 이름). 문장·줄·« · » 로 쪼개 조각마다 찾고 못 찾으면 원문 그대로. */
(function (root) {
  function make(core, data) {
    var exact = {}, tmpls = [], memo = {};
    Object.keys(core || {}).forEach(function (ko) {
      if (ko.indexOf('{') < 0) { exact[ko] = core[ko]; return; }
      if (!ko.replace(/\{[pnrl]\}/g, '').trim()) return;   // «{r}» 처럼 빈칸뿐인 틀은 같은 길이의 진짜 틀을 가린다(2026-10-24)
      var slots = [], pat = '^' + ko.replace(/\{([pnrl])\}|[.*+?^$()|[\]\\{}]/g, function (m, c) { if (c) { slots.push(c); return c === 'n' ? '(\\d+)' : c === 'l' ? '([^.!?\\n]+?)' : '([^.!?\\n·]+?)';   /* 빈칸은 문장을 넘지 않는다 — 짧은 틀이 여러 문장 내레이션을 통째로 삼키던 것 */ } return '\\' + m; }) + '$';
      tmpls.push({ re: new RegExp(pat), en: core[ko], slots: slots, len: pat.length });
    });
    tmpls.sort(function (a, b) { return b.len - a.len; });
    data = data || {};
    function word(v) { if (data[v] != null || exact[v] != null) return data[v] || exact[v]; if (/^\d+번(, \d+번)*$/.test(v)) return (v.match(/\d+/g) || []).map(function (n) { return String(exact.__seat || '#{n}').replace('{n}', n); }).join(exact.__sep || ', ');   /* 자리 목록 «1번, 3번» → 그 말의 자리 꼴(팩 _seat·_sep, 없으면 #1, #3) */ return v.indexOf('·') > 0 ? v.split('·').map(function (x) { return data[x] || exact[x] || x; }).join(', ') : v; }   // «마피아·대부» 목록은 낱말마다(2026-11-04 말 장치 목록 빈칸)
    function whole(s) {
      if (exact[s] != null) return exact[s]; if (data[s] != null) return data[s];
      for (var i = 0; i < tmpls.length; i++) { var t = tmpls[i], m = s.match(t.re); if (!m) continue;
        var out = t.en.replace(/\{#(\d)\}/g, function (x, j) { var v = m[+j] && m[+j].replace(/님, /g, ', '), c = t.slots[j - 1]; return v == null ? x : (c === 'n' ? v : word(v)); });   /* {#2} = 두 번째 빈칸 — 번역 어순이 바뀐 %2$lld (2026-10-06) */
        t.slots.forEach(function (c, k) { var v = m[k + 1].replace(/님, /g, ', ');   /* 여러 이름 «민수님, 지수»(아침 발표) */ out = out.replace('{' + c + '}', c === 'n' ? v : word(v));   /* 빈칸에 든 낱말(마당·직업 이름)도 사전에 있으면 */ }); return out; }
      return null;
    }
    function tr(s) {
      if (typeof s !== 'string' || !/[가-힣]/.test(s)) return s;
      if (memo[s] != null) return memo[s];
      var w = whole(s), out = w != null ? w : s.split(/((?<=[.!?])\s+|\n+|\s+·\s+)/).map(function (seg, i) { if (i % 2) return seg; var x = whole(seg); return x != null ? x : seg; }).join('');
      return (memo[s] = out);
    }
    return tr;
  }
  /* 말 장치(2026-11-04 7단계) — 코어가 낸 코드·값 → 문장. 팩 = {코드: 틀}, 틀 빈칸 {이름} 은 값 그대로, {이름@종류} 는 names[종류](값) 으로 이름표를 붙인다.
     팩에 없는 코드는 «[코드]» 로 드러낸다(조용히 비우지 않는다 — 팩 덮음 검사가 잡는다). */
  /* 계열 문장 — names.hub 가 있으면 «열쇠@계열»(예 wn.x@mafia)을 먼저 찾고 없으면 기본 열쇠. 팀 이름만 다르면 {=town@tw} 빈칸으로 충분하고, 문장 자체가 다를 때만 쓴다(2026-11-04 구조 개선 5·발견 7, 햇살님 «다음» = 추천안) */
  function say(pack, k, v, names) {
    var hub = names && names.hub, t = pack && ((hub && pack[k + '@' + hub]) || pack[k]); if (t == null) return '[' + k + ']';
    v = v || {};
    return t.replace(/\{(=?\w+)(?:@(\w+))?(?:([|^])([가-힣]+))?\}/g, function (m, key, kind, op, j) { var x = key[0] === '=' ? key.slice(1) : v[key]; if (x == null) return m;   /* {=demon@tw} — 값 대신 틀에 적은 고정 열쇠(팀 이름처럼 문장마다 같은 것, 2026-11-04) */
      var w = kind && names && names[kind] ? names[kind](x) : String(x); if (!j) return w; var jj = pack._josa ? josa(w, j) : ''; return op === '^' ? jj : w + jj; });   // {x|을} 낱말+조사 · {x^을} 조사만('…'처럼 따옴표 뒤에)
  }
  /* 이름표 묶음(2026-11-04 구조 개선 5·발견 7) — 자리·목록 꼴은 팩(_seat·_sep·_list)에서, 직업·표식·팀처럼 판 자료가 필요한 것은 부르는 쪽 고리(hooks)로.
     앱·웹·아이폰이 같은 함수를 써서 세 벌로 갈라지지 않게. 자리 값은 0부터 센 자리 번호 */
  /* 자리 이름 하나 — n 은 1부터 센 자리 번호, 꼴은 팩 _seat(ko 팩에 있다). 자리 이름을 만드는 곳은 모두 이것을 쓴다(발견 6) */
  function seat(pack, n) { return String((pack && pack._seat) || '{n}').replace('{n}', n); }
  function namers(pack, hooks) {
    pack = pack || {}; var o = { w: function (x) { return String(x); } };
    o.seats = function (a) { return [].concat(a).map(function (i) { return seat(pack, i + 1); }).join(pack._sep || ', '); };
    o.list = function (a) { return [].concat(a).join(pack._list || pack._sep || ', '); };
    Object.keys(hooks || {}).forEach(function (k) { o[k] = hooks[k]; });
    return o;
  }
  /* 조사 — 한국어 팩(_josa)만. 받침 있으면 앞 것(이·을·은·과·으로), 없으면 뒤 것. 받침이 ㄹ이면 «로». 한글이 아니면 숫자 읽기로, 그 밖은 앞 것 */
  var JOSA = { '이': ['이', '가'], '가': ['이', '가'], '을': ['을', '를'], '를': ['을', '를'], '은': ['은', '는'], '는': ['은', '는'], '과': ['과', '와'], '와': ['과', '와'], '으로': ['으로', '로'], '로': ['으로', '로'], '이에요': ['이에요', '예요'], '예요': ['이에요', '예요'] };
  function josa(w, j) { var p = JOSA[j]; if (!p) return j; var c = String(w).replace(/[\s)\]»'"]+$/, '').slice(-1), code = c.charCodeAt(0), fin;
    if (code >= 0xAC00 && code <= 0xD7A3) fin = (code - 0xAC00) % 28; else if (/[0-9]/.test(c)) fin = '013678'.indexOf(c) >= 0 ? 1 : 0; else return p[0];
    if (!fin) return p[1]; if (p[0] === '으로' && fin === 8) return '로'; return p[0]; }
  /* 화면 말(2026-11-04 구조 개선 6) — lang 은 지금 글을 만드는 말. 코어는 기본 ko(기록은 늘 한국어), 화면이 조회할 때만 기기 언어로 바꿔 부른다.
     use(lang, pack, data) — 그 말의 팩과 자료 사전(한국어 낱말 → 그 말: 직업·표식·팀 이름). word(x) — 지금 말로 낱말 하나(없으면 그대로) */
  var api = { make: make, say: say, namers: namers, seat: seat, josa: josa, packs: {}, data: {}, lang: 'ko' };
  api.use = function (lang, pack, data) { if (pack) api.packs[lang] = typeof pack === 'string' ? JSON.parse(pack) : pack; if (data) api.data[lang] = typeof data === 'string' ? JSON.parse(data) : data; };
  api.word = function (x) { if (api.lang === 'ko' || x == null) return x; var P = api.packs[api.lang], w = P && P._words, d = api.data[api.lang];   /* 팩의 _words(팀·편 낱말 — 손으로 관리) 먼저, 그다음 자료 사전(직업·표식) */
    return w && w[x] != null ? w[x] : d && d[x] != null ? d[x] : x; };
  api.pack = function (k) { var L = api.lang, P = api.packs[L]; return L !== 'ko' && P && P[k] != null ? P : api.packs.ko; };   // 그 말 팩에 열쇠가 없으면 한국어 팩(빈 화면보다 낫다 — 팩 덮음 검사가 따로 본다)
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  /** @type {any} */ (root).CoreText = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
