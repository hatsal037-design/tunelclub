/* 장(피드 카드) 그리기 엔진 — 앱·웹 공용(2026-10-07 햇살님 «시안만 같게 하지 말고 올리는 코드를 공용화해 · 어느 시스템에 심어도 같은 결과가 나오게 원리적으로»)
 *
 * 원리: 장 한 장 = 데이터(post + 장 하나 spec) → 이 엔진 → «그리기 목록»(1000×1250 좌표의 배경·선·원·글 상자·그림·얼굴·링크).
 * 화면(SwiftUI·DOM·앞으로 안드로이드·서버 이미지)은 목록을 비율대로 그리기만 한다. 배치·크기·색·효과·장 순서·태그 나누기·날짜 글은 여기서만 정한다.
 * 그리는 쪽이 할 일: 바탕(그림 'night' 또는 rgb) → layers(선·원·그라데이션·질감) → items(글·그림·얼굴·아이콘) 순서로, 좌표 × (실제 너비 / 1000).
 *
 * 순수 함수만 — DOM·네트워크·시계 없음. 글 번역은 setText 로 받은 사전으로(없으면 키 그대로).
 * 시험: tests/postcard.test.js
 */
(function (root) {
  'use strict';
  var W = 1000, H = 1250;
  var CREAM = [0.96, 0.93, 0.89, 1], DARK = [0.10, 0.09, 0.11, 1], GOLD = [0.94, 0.84, 0.60, 1], GOLD_L = [0.62, 0.42, 0.05, 1], RED = [0.91, 0.20, 0.24, 1];
  var TIER = [null, null, [0.62, 0.66, 0.72, 1], [0.84, 0.66, 0.24, 1], RED];   // 칭호 단계 색(1 = 글자 색)
  var OLD = { ink: [0.07, 0.07, 0.08], blood: [0.29, 0.06, 0.08], moss: [0.11, 0.20, 0.14], sea: [0.06, 0.15, 0.25], dusk: [0.23, 0.14, 0.27], night: [0.13, 0.10, 0.25] };
  var FX = ['', 'grad', 'wave', 'focus', 'dots', 'stripe', 'linen', 'denim', 'wood'];
  var TEX = ['linen', 'denim', 'wood'];
  var MERGE = ['story', 'game', 'text', 'titles'];   // 한 장에 밀어 넣을 수 있는 장(2026-10-07 «같이 한 사람은 한 장으로밖에 안 되게»)

  // ── 글 사전 ──
  var TXT = { dict: {}, fallback: {}, data: {}, lang: 'ko' };
  function setText(dict, fallback, data, lang) { TXT = { dict: dict || {}, fallback: fallback || {}, data: data || {}, lang: lang || 'ko' }; }
  /* 칭호 이름(2026-10-07) — 서버는 한국어 이름을 준다. 보는 사람 언어 사전(i18n/titles/<언어>.json)으로 바꾸고, {r}(모드·직업 이름)이 낀 틀은 틀로 찾는다 */
  var TT = { d: {}, re: [] };
  function setTitles(d) { TT = { d: d || {}, re: Object.keys(d || {}).filter(function (k) { return k.indexOf('{r}') >= 0; }).sort(function (a, b) { return b.length - a.length; })
    .map(function (k) { return [new RegExp('^' + k.split('{r}').map(function (x) { return x.replace(/[.*+?^$()|[\]\\]/g, '\\$&'); }).join('(.+)') + '$'), d[k]]; }) }; }
  function titleName(s) { s = s || ''; if (TT.d[s]) return TT.d[s];
    for (var i = 0; i < TT.re.length; i++) { var m = TT.re[i][0].exec(s); if (m) return TT.re[i][1].replace('{r}', (TXT.data && TXT.data[m[1]]) || m[1]); }
    return s; }
  function t(k, v) { var s = TXT.dict[k] || TXT.fallback[k] || k; return s.replace(/\{(\w+)\}/g, function (m, x) { return v && v[x] != null ? String(v[x]) : m; }); }
  function d(s) { return (s && TXT.data[s]) || s || ''; }
  // 직업 코드 → 지금 이름(자료 묶음 role_names.json). 판 넘겨 보기 사건이 코드로 저장돼, 이름이 바뀌면 옛 장도 따라간다(0308)
  var ROLES = {};
  function setRoles(m) { ROLES = m || {}; }
  function roleName(o) { return d((o && o.r && ROLES[o.r]) || (o && o.rn) || ''); }
  function who(o) { var r = roleName(o); return (o && o.n || '') + (r ? '(' + r + ')' : ''); }
  /** 사건 하나 → 줄 하나(보는 사람 언어). hot = 처형·죽음 강조 */
  function evLine(e) {
    var b = e.b || {}, s;
    if (e.t === 'pick') s = t('story.ev.pick', { a: who(e.a), b: (Array.isArray(b) ? b : [b]).map(function (x) { return x.n || ''; }).join(', ') || '—' });
    else if (e.t === 'nom') s = t('story.ev.nom', { a: (e.a || {}).n || '', b: b.n || '' });
    else if (e.t === 'vote') s = t('story.ev.vote', { b: b.n || '', c: e.c || 0 });
    else if (e.t === 'exec') s = e.saved ? t('story.ev.saved', { b: who(b), why: d(e.saved) }) : t('story.ev.exec', { b: who(b) });
    else if (e.t === 'death') s = t('story.ev.death', { b: who(b) });
    else if (e.t === 'revive') s = t('story.ev.revive', { b: b.n || '' });
    else if (e.t === 'succ') s = t('story.ev.succ', { b: b.n || '', r: d(e.to || '') });
    else return null;   // 모르는 사건은 건너뛴다(옛 앱이 새 사건을 만나도 안 깨지게)
    return { s: s, hot: e.t === 'exec' || e.t === 'death' };
  }
  /** 이야기 장 줄 — 사건(ev, 0308)이면 엔진이 만들고, 옛 장(lines, 문장)이면 그대로 */
  function storyLines(x) { return x.ev ? x.ev.map(evLine).filter(Boolean) : (x.lines || []).map(function (l) { return { s: l, hot: /^[☠⚖]/.test(l) }; }); }
  var KO_ORD = ['첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째', '일곱째', '여덟째', '아홉째', '열째'];
  function ord(n) { return KO_ORD[n - 1] || n + '번째'; }
  var WD = { ko: ['일', '월', '화', '수', '목', '금', '토'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], ja: ['日', '月', '火', '水', '木', '金', '土'] };
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  /** 날짜 글 — 한국 시각 기준, 언어별 한 꼴(플랫폼 날짜 꼴에 맡기지 않는다) */
  function day(iso) {
    var ms = Date.parse(iso || ''); if (isNaN(ms)) return String(iso || '').slice(0, 10);
    var k = new Date(ms + 9 * 3600e3), m = k.getUTCMonth(), dd = k.getUTCDate(), w = k.getUTCDay();
    if (TXT.lang === 'ko') return (m + 1) + '월 ' + dd + '일 (' + WD.ko[w] + ')';
    if (TXT.lang === 'ja') return (m + 1) + '月' + dd + '日 (' + WD.ja[w] + ')';
    return WD.en[w] + ', ' + MON[m] + ' ' + dd;
  }

  // ── 배색표: 24색상 + 회색 줄 × 밝기 12 = 300칸(p0~p299). 칸 = 줄 × 12 + 밝기 ──
  function hsl(i) { i = Math.max(0, Math.min(299, i | 0)); var r = Math.floor(i / 12), k = i % 12; return [r >= 24 ? 0 : r * 15, r >= 24 ? 0 : (k < 2 || k > 9 ? 0.45 : 0.6), 0.10 + k * 0.07]; }
  function rgb(i) {
    var a = hsl(i), h = a[0], s = a[1], l = a[2], c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2, v;
    v = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [r3(v[0] + m), r3(v[1] + m), r3(v[2] + m)];
  }
  function r3(n) { return Math.round(n * 1000) / 1000; }
  function split(key) { var p = String(key || 'night').split('.'); return [p[0] || 'night', p[1] || '']; }
  function light(key) { var b = split(key)[0]; return /^p\d+$/.test(b) && hsl(+b.slice(1))[2] > 0.58; }
  function ink(key) { return light(key) ? DARK : CREAM; }
  function gold(key) { return light(key) ? GOLD_L : GOLD; }
  function withA(c, a) { return [c[0], c[1], c[2], a]; }

  /** 배경 — base(그림 night 또는 rgb) + layers(효과 그리기 목록) */
  function bg(key) {
    var s = split(key), b = s[0], f = FX.indexOf(s[1]) > 0 ? s[1] : '', L = light(key), ln = L ? [0, 0, 0] : [1, 1, 1], out = [];
    var base = b === 'night' ? { kind: 'image', name: 'night', rgb: OLD.night } : /^p\d+$/.test(b) ? { kind: 'color', rgb: rgb(+b.slice(1)) } : { kind: 'color', rgb: OLD[b] || OLD.night };
    var k, x, y;
    if (f === 'grad') out.push({ t: 'grad', stops: [[0, [1, 1, 1, L ? 0.35 : 0.18]], [0.45, [0, 0, 0, 0]], [1, [0, 0, 0, 0.45]]] });
    if (f === 'wave') for (k = 0; k < 9; k++) { var pts = [], y0 = H * (k + 0.5) / 9; for (x = 0; x <= W; x += 25) pts.push([x, r3(y0 + Math.sin(x / W * Math.PI * 3 + k) * H * 0.025)]); out.push({ t: 'poly', pts: pts, w: 12, c: withA(ln, 0.12) }); }
    if (f === 'focus') { var R = Math.hypot(W, H); for (k = 0; k < 120; k++) { var a = k / 120 * 2 * Math.PI + (k % 3 === 0 ? 0.01 : 0), r0 = R * (0.30 + 0.12 * ((k * 37) % 5) / 5);
      out.push({ t: 'line', x1: r3(W / 2 + Math.cos(a) * r0), y1: r3(H / 2 + Math.sin(a) * r0), x2: r3(W / 2 + Math.cos(a) * R), y2: r3(H / 2 + Math.sin(a) * R), w: k % 4 === 0 ? 5 : 2, c: withA(ln, 0.22) }); } }
    if (f === 'dots') { var g = W / 22; for (y = g / 2; y <= H; y += g) for (x = (Math.floor(y / g) % 2 === 0 ? g / 2 : g); x <= W; x += g) out.push({ t: 'circle', x: r3(x), y: r3(y), r: r3(g * 0.12 + g * 0.2 * y / H), c: withA(ln, 0.14) }); }
    if (f === 'stripe') { var g2 = W / 10; for (x = -H; x <= W; x += g2) out.push({ t: 'line', x1: x, y1: H, x2: x + H, y2: 0, w: g2 * 0.4, c: withA(ln, 0.08) }); }
    if (TEX.indexOf(f) >= 0) out.push({ t: 'tex', name: f, tile: 600, a: 0.75, blend: 'overlay' });
    return { key: b + (f ? '.' + f : ''), base: base, light: L, layers: out };
  }

  // ── 장 순서 — 꾸민 장(pages)이면 그대로(없는 판·빈 글은 뺀다), 옛 장이면 같이 한 사람 → 판 → 칭호 ──
  function specs(p) {
    var gs = p.games || [], ids = {}, hasT = (p.earned || []).length > 0, hasP = (p.people || []).length > 0;
    gs.forEach(function (g) { ids[g.game] = 1; });
    var ok = function (s) { return ((s.k === 'game' || s.k === 'story') && ids[s.id]) || (s.k === 'titles' && hasT) || (s.k === 'people' && hasP) || (s.k === 'text' && String(s.tx || '').trim()); };
    if (p.pages && p.pages.length) return normalize(p.pages).map(function (s) {
      if (s.k !== 'group') return ok(s) ? s : null;
      var parts = (s.parts || []).filter(function (x) { return x && MERGE.indexOf(x.k) >= 0 && ok(x); }).slice(0, 4);   // 묶음 — 2~4장, 줄여 넣을 수 있는 장만(같이 한 사람은 늘 혼자)
      return parts.length >= 2 ? { k: 'group', parts: parts, em: s.em, cap: s.cap, fill: s.fill } : parts[0] || null;
    }).filter(Boolean);
    var out = []; if (p.cover && hasP) out.push({ k: 'people' });
    gs.forEach(function (g) { out.push({ k: 'game', id: g.game }); }); if (hasT) out.push({ k: 'titles' });
    return out;
  }

  // ── 글자 폭 표·줄바꿈(D, 2026-10-07) — 엔진이 줄을 나누고, 그리는 쪽은 나뉜 줄을 찍기만 ──
  // 글꼴: 장마다 하나(post.font: pre 프리텐다드 기본 · noto 본고딕 · suit SUIT · gowun 고운바탕). 고운바탕은 제목·강조만 바탕체, 본문은 프리텐다드.
  // 굵기: 본문 보통 400 · 제목 중간 600 · 강조 굵게 700(햇살님 시안 3 ③). 고운바탕은 400·700 두 벌뿐 — 600→400, 800→700 파일로 그린다.
  var METRICS = {}, FONT = 'pre', FONTS = ['pre', 'noto', 'suit', 'gowun'];
  function setMetrics(m) { METRICS = m || {}; }
  function roleOf(weight) { return weight >= 800 ? 'em' : weight >= 700 ? 'title' : 'body'; }
  function faceOf(weight) {
    var role = roleOf(weight), fam = FONT === 'gowun' && role === 'body' ? 'pre' : FONT;
    var w = role === 'em' ? 700 : role === 'title' ? 600 : weight >= 600 ? 600 : 400;
    var fileW = fam === 'gowun' ? (w >= 700 ? 700 : 400) : w;
    return { family: fam, weight: w, key: fam + '-' + fileW, ps: (METRICS[fam + '-' + fileW] || {}).name || null };   // ps = 아이폰 글꼴 이름
  }
  function adv(cp, m) {   // 1000 = 1em
    if (!m) return cp >= 0xAC00 && cp <= 0xD7A3 ? 900 : cp < 0x2E80 ? 560 : 1000;
    if (cp >= 0xAC00 && cp <= 0xD7A3) { var h = m.hangul; return typeof h === 'number' ? h : (h[cp - 0xAC00] || 900); }
    var v = m.w[cp.toString(16)]; if (v != null) return v;
    if ((cp >= 0x2E80 && cp <= 0x9FFF) || (cp >= 0xF900 && cp <= 0xFAFF) || cp >= 0x1F000) return m.cjk || 1000;
    return 600;
  }
  var NOSTART = '.,!?)]}»」』、。・:;%…~·';   // 줄 첫머리에 오면 안 되는 것(간단 금칙)
  /** 조각(runs)을 너비 w 안에서 줄로 — 어절 우선, 너무 긴 낱말만 글자 단위, \n 은 강제 줄바꿈. 글자 = 코드포인트(이모지 결합은 미확인) */
  function wrap(runs, size, wt, w) {
    var m = METRICS[faceOf(wt).key], ch = [];
    runs.forEach(function (r, ri) { Array.from(String(r.s || '')).forEach(function (c) { ch.push({ c: c, r: ri, a: c === '\n' ? 0 : adv(c.codePointAt(0), m) * size / 1000 }); }); });
    var lines = [], cur = [], curW = 0, i = 0, sum = function (l) { return l.reduce(function (s, x) { return s + x.a; }, 0); };
    function push() { var t = cur; while (t.length && t[t.length - 1].c === ' ') t = t.slice(0, -1); lines.push({ ch: t, w: sum(t) }); cur = []; curW = 0; }
    while (i < ch.length) {
      if (ch[i].c === '\n') { push(); i++; continue; }
      var j = i; while (j < ch.length && ch[j].c !== ' ' && ch[j].c !== '\n') j++;
      var k = j; while (k < ch.length && ch[k].c === ' ') k++;
      var word = ch.slice(i, j), ww = sum(word), sp = ch.slice(j, k);
      if (curW + ww <= w + 0.01) { cur = cur.concat(word, sp); curW += ww + sum(sp); i = k; continue; }
      if (cur.length && ww <= w) { push(); continue; }
      for (var q = 0; q < word.length; q++) {   // 너무 긴 낱말 — 글자 단위(다음 글자가 줄 첫머리 금지면 하나 덜)
        if (curW + word[q].a > w + 0.01 && cur.length) { if (NOSTART.indexOf(word[q].c) >= 0 && cur.length > 1) { var back = cur.pop(); push(); cur.push(back); curW = back.a; } else push(); }
        cur.push(word[q]); curW += word[q].a;
      }
      cur = cur.concat(sp); curW += sum(sp); i = k;
    }
    if (cur.length || !lines.length) push();
    return lines;
  }
  /** 글 하나 배치 — 읽기 좋은 크기까지만 줄이고, 그래도 넘치면 «…»(그 글이 full 이면 «전체 보기»가 붙는다, 시안 5 B) */
  function layout(it) {
    if (it.t !== 'text') return it;
    var fc = faceOf(it.weight), m = METRICS[fc.key], maxL = Math.max(1, it.lines || 1), size = it.size, minS = it.fit ? Math.max(26, size * (maxL > 1 ? 0.75 : 0.6)) : size;
    var w = it.bg ? it.w - it.pad * 2 : it.w, ls, lh;
    for (;;) { ls = wrap(it.runs, size, it.weight, w); lh = size * (maxL > 1 || ls.length > 1 ? 1.6 : 1.25); if (ls.length <= maxL || size <= minS) break; size = Math.max(minS, size - 2); }
    var more = false;
    if (ls.length > maxL) {
      more = true; ls = ls.slice(0, maxL); var last = ls[maxL - 1], dot = adv(0x2026, m) * size / 1000;
      while (last.ch.length && last.w + dot > w) { var x = last.ch.pop(); last.w -= x.a; }
      last.ch.push({ c: '…', r: last.ch.length ? last.ch[last.ch.length - 1].r : 0, a: dot }); last.w += dot;
    }
    var asc = (m ? m.asc : 950) * size / 1000, desc = (m ? m.desc : 250) * size / 1000, half = (lh - asc - desc) / 2;
    it.size = r3(size); it.face = fc; it.lh = r3(lh); it.asc = r3(asc); it.dsc = r3(desc); it.more = more;
    it.L = ls.map(function (ln, n) {   // 줄마다 시작 x(정렬 반영)·기준선 y·조각
      var runs = [], lastR = -1;
      ln.ch.forEach(function (c) { if (c.r !== lastR) { var src = it.runs[c.r] || {}; runs.push({ s: '', color: src.color, link: src.link }); lastR = c.r; } runs[runs.length - 1].s += c.c; });
      var bx = it.x + (it.bg ? it.pad : 0), x = it.align === 'center' ? bx + (w - ln.w) / 2 : it.align === 'right' ? bx + w - ln.w : bx;
      return { x: r3(x), by: r3(it.y + (it.bg ? it.pad * 0.5 : 0) + n * lh + half + asc), w: r3(ln.w), runs: runs };
    });
    it.h = r3(ls.length * lh + (it.bg ? it.pad : 0));
    return it;
  }
  function lineCount(s, size, weight, w) { return wrap([{ s: s }], size, weight, w).length; }
  /** 설명 띠 높이 — 3줄까지, 넘치면 «전체 보기» 자리까지 */
  function capHeight(cap) { var cn = lineCount(cap, 38, 400, 920); return 50 + Math.min(3, cn) * 61 + (cn > 3 ? 40 : 0); }

  /** 판 넘겨 보기는 시간이 있는 장 — 같은 판의 밤·낮은 순서를 못 바꾼다(빼기만, 2026-10-07 햇살님 «시간 개념이 있어 순서가 있는 건 순서를 바꿀 수 없게»).
      그 판의 이야기 장이 놓인 자리는 그대로 두고, 내용만 시간 순서(밤1 → 낮1 → 밤2 …)로 다시 채운다. 묶음 안도 같다 */
  function phKey(ph) { ph = String(ph || 'n1'); return (+ph.slice(1) || 1) * 2 + (ph[0] === 'd' ? 1 : 0); }
  function storyKey(s) { return s.days ? phKey(s.days[0].ph) : phKey(s.ph); }
  function chrono(list) {
    var by = {}, out = list.slice();
    out.forEach(function (s, i) { if (s && s.k === 'story') (by[s.id] = by[s.id] || []).push(i); });
    Object.keys(by).forEach(function (id) {
      var slots = by[id], sorted = slots.map(function (i) { return out[i]; }).sort(function (a, b) { return storyKey(a) - storyKey(b); });
      slots.forEach(function (i, j) { out[i] = sorted[j]; });
    });
    return out;
  }
  function normalize(pages) {
    return chrono((pages || []).map(function (s) { return s && s.k === 'group' ? Object.assign({}, s, { parts: chrono(s.parts || []) }) : s; }));
  }
  /** 글 → 조각들. #태그·@아이디는 link 를 단다(누르면 태그 모아 보기·프로필) */
  function tokens(s) {
    // #태그는 글자·숫자·밑줄만(서버 태그와 같게, 0307), @아이디는 영문·숫자·밑줄·점(아이디 규칙)
    var out = [], re = /#([\p{L}\p{N}_]{1,30})|@([A-Za-z0-9_.]{2,30})/gu, last = 0, m; s = String(s || '');
    while ((m = re.exec(s))) { if (m.index > last) out.push({ s: s.slice(last, m.index) }); out.push({ s: m[0], link: m[1] ? { kind: 'tag', v: m[1] } : { kind: 'user', v: m[2] } }); last = m.index + m[0].length; }
    if (last < s.length) out.push({ s: s.slice(last) });
    return out;
  }

  // ── 그리기 목록 조각 ──
  function text(x, y, w, size, runs, o) { o = o || {}; var rr = typeof runs === 'string' ? [{ s: runs }] : runs;
    return { t: 'text', x: x, y: y, w: w, size: size, weight: o.weight || 400, align: o.align || 'left', color: o.color || CREAM, runs: rr, lines: o.lines || 1, fit: !!o.fit, bg: o.bg || null, pad: o.pad || 0, radius: o.radius || 0, link: o.link || null,
             full: o.full ? rr.map(function (r) { return r.s; }).join('') : null }; }
  function linked(runs, link) { return runs.map(function (r) { return r.link ? { s: r.s, link: r.link, color: link } : r; }); }
  function counter(i, n, c) { return n > 1 ? [text(W - 60 - 120, 52, 120, 34, (i + 1) + '/' + n, { weight: 600, align: 'center', color: c, bg: [0, 0, 0, 0.35], pad: 10, radius: 28 })] : []; }
  function brand(y, c) { var egg = { kind: 'egg', v: 'tap_1ndc' };   // 일곱 번 누르면 숨은 칭호 «문을 두드린»
    return text(0, y, W, 34, [{ s: '1', color: RED, link: egg }, { s: 'ndc', color: withA(c, 0.6), link: egg }], { weight: 800, align: 'center' }); }   // 하단 표시 «1ndc»(2026-10-07 햇살님)
  function plazaLine(p) { return t('plaza.host_place', { host: p.host || '', place: t('place.plaza') }) + (p.title ? ' · ' + p.title : ''); }
  function estLines(s, size, w, weight) { return lineCount(s, size, weight || 400, w); }

  /** 그리기 목록 판본(E) — 조각 종류·뜻을 바꾸거나 더하면 올린다. 그리는 쪽은 모르는 조각·아이콘을 건너뛰고 나머지를 그린다 */
  var V = 1;
  /** 한 장의 그리기 목록. i·n = 몇 번째 장/모두 몇 장(오른쪽 위 번호) */
  function page(p, sp, i, n) {
    var keepFont = FONT; FONT = FONTS.indexOf(p.font) >= 0 ? p.font : 'pre';
    try { return layoutPage(pageRaw(p, sp, i, n)); } finally { FONT = keepFont; }
  }
  /** 마지막에 한 번 — 글마다 줄을 나누고, 넘친 글(full)엔 «전체 보기» 링크를 붙인다 */
  function layoutPage(pg) {
    var more = [];
    pg.items = pg.items.map(function (it) {
      if (it.t === 'sub') { it.page = layoutPage(it.page); return it; }
      var o = layout(it);
      if (o.more && o.full) more.push(text(o.x, r3(Math.min(H - 50, o.y + o.h + 4)), o.w, 30, [{ s: t('feed.more'), link: { kind: 'more', v: o.full } }], { weight: 600, align: o.align, color: [0.56, 0.76, 1, 1] }));
      return o;
    });
    pg.items = pg.items.concat(more.map(layout)); pg.font = FONT; pg.v = V;
    return pg;
  }
  function pageRaw(p, sp, i, n) {
    var B = bg(p.bg), c = ink(p.bg), gd = gold(p.bg), items = [], L = B.light, k = sp.k, gs = p.games || [];
    var shade = function (a0, a1) { if (!L) items.push({ t: 'grad', stops: [[0, [0, 0, 0, a0]], [1, [0, 0, 0, a1]]] }); };
    var capH = sp.cap ? capHeight(sp.cap) : 0, lift = capH ? Math.max(0, 1125 - (H - capH)) : 0;   // 설명 띠가 있으면 아래 줄(광장·날짜)을 띠 위로
    if (k === 'group') {   // 묶음 — 한 장 안에 내용을 차례로 밀어 넣는다(2026-10-07 «여러 장 올리는 게 아니고 한 장에 밀어 넣는 개념»)
      shade(0.25, 0.35);
      items = items.concat(counter(i, n, c));
      var top0 = 60;
      if (sp.em) { items.push(text(60, 50, W - 300, 64, sp.em, { weight: 800, color: gd, fit: true })); top0 = 150; }
      var qs = mergeStory(sp.parts || []), blocks = qs.map(function (q) { return block(p, q, c, gd, L); }), total = 0, avail = 1110 - top0;
      blocks.forEach(function (b, j) { total += b.h + (j ? 50 : 0); });
      // 자리가 남으면 판 덩이의 직업 그림을 «옆에 작게» 대신 «가운데 크게 하나»로(2026-10-07 햇살님) — 꽉 채우기일 때, 남는 만큼만
      if (sp.fill !== false) qs.forEach(function (q, j) {
        if (q.k !== 'game') return; var big = block(p, q, c, gd, L, true), more = big.h - blocks[j].h;
        if (total + more <= avail) { blocks[j] = big; total += more; }
      });
      var sc = Math.min(sp.fill === false ? 1 : 1.6, avail / Math.max(1, total)), yy = top0 + Math.max(0, (avail - total * sc) / 2);   // 꽉 채우기면 적을 때 키운다(최대 1.6배)
      blocks.forEach(function (b, j) {
        if (j) { items.push({ t: 'rect', x: r3(500 - 380 * sc), y: r3(yy + 24 * sc), w: r3(760 * sc), h: 2, c: withA(c, 0.25) }); yy += 50 * sc; }
        b.items.forEach(function (it) { items.push(scaleItem(it, sc, yy)); });
        yy += b.h * sc;
      });
      items.push(brand(1160, c));
        } else if (k === 'people') {
      var ps = p.people || [], cnt = Math.max(1, ps.length), cols = Math.max(2, Math.ceil(Math.sqrt(cnt * 0.9))), rows = Math.ceil(cnt / cols);
      var dd = Math.min(W * 0.88 / (cols + 0.4), 700 / (rows * 1.2)), rowH = dd * 1.2, top = 270 + (700 - rows * rowH) / 2, gap = dd * 0.04;
      shade(0.25, 0.25);
      items.push(text(0, 80, W, 70, t('feed.people_n', { n: ps.length }), { weight: 700, align: 'center', color: c }));
      if (sp.em) items.push(text(60, 175, W - 120, 60, sp.em, { weight: 800, align: 'center', color: gd, fit: true }));
      for (var r = 0; r < rows; r++) {
        var row = ps.slice(r * cols, r * cols + cols), rowW = row.length * dd + (row.length - 1) * gap, x0 = (W - rowW) / 2 + (r % 2 ? dd / 4 : -dd / 4);
        row.forEach(function (x, j) {
          items.push({ t: 'face', x: r3(x0 + j * (dd + gap) + dd * 0.1), y: r3(top + r * rowH), d: r3(dd * 0.8), ring: r3(Math.max(3, dd * 0.03)), color: c, host: !!x.host,
                       nick: x.nick || '', handle: x.handle || null, photo: x.photo || null, avatar: x.avatar || null });
          items.push(text(r3(x0 + j * (dd + gap)), r3(top + r * rowH + dd * 0.86), r3(dd), r3(Math.max(22, dd * 0.17)), x.nick || '', { weight: 600, align: 'center', color: c, fit: true }));
        });
      }
      items.push(text(60, 1065 - lift, W - 120, 38, plazaLine(p), { weight: 600, align: 'center', color: c }));
      items.push(text(60, 1112 - lift, W - 120, 34, day(p.played || p.at), { align: 'center', color: withA(c, 0.7) }));
    } else if (k === 'titles') {
      shade(0.45, 0.45);
      items.push(text(0, 250, W, 150, '🎖', { align: 'center' }));
      items.push(text(0, 450, W, 60, t('title.earned'), { weight: 700, align: 'center', color: c }));
      (p.earned || []).slice(0, 6).forEach(function (e, j) { items.push(text(60, 560 + j * 82, W - 120, 50, titleName(e.name), { weight: 600, align: 'center', color: TIER[e.tier || 1] || c, fit: true })); });
    } else if (k === 'story') {
      var ph = String(sp.ph || 'n1'), night = ph[0] === 'n', nn = +ph.slice(1) || 1, y = 175;
      shade(0.3, 0.3);
      items.push(text(60, 50, 700, 58, (night ? '☾ ' : '☀ ') + t(night ? 'story.n' : 'story.d', { n: nn, o: ord(nn) }), { weight: 700, color: c }));
      items = items.concat(counter(i, n, c));
      if (sp.em) { items.push(text(60, y, W - 120, 75, sp.em, { weight: 800, color: gd, fit: true })); y += 120; }
      // 꽉 채우기(기본 켬, 2026-10-07 햇살님 «하단이 비었어, 적으면 키우던가») — 줄이 적으면 글자를 키워 아래(1100)까지
      var sl = storyLines(sp).slice(0, 12), fs = 45, step = 64;
      if (sp.fill !== false && sl.length) { fs = Math.max(45, Math.min(110, (1100 - y) / (sl.length * 1.42))); step = (1100 - y) / sl.length; step = Math.min(step, fs * 1.8); }   // 줄 간격도 넓혀 아래까지
      sl.forEach(function (ln) { items.push(text(60, r3(y), W - 120, r3(fs), ln.s, { weight: ln.hot ? 700 : 400, color: ln.hot ? gd : c, fit: true })); y += step; });
      items.push(brand(1160, c));
    } else if (k === 'text') {
      var tx = String(sp.tx || ''), size = tx.length < 20 ? 100 : tx.length < 60 ? 75 : tx.length < 140 ? 55 : 45, lines, h, room = H - 300;
      // 장 안에 들어올 때까지 글자를 줄인다(읽기 좋은 크기 34까지) — 그래도 넘치면 «…» + 전체 보기(시안 5 B)
      for (;;) { lines = estLines(tx, size, 820, 600); h = lines * size * (lines > 1 ? 1.6 : 1.25); if (h <= room || size <= 34) break; size -= 3; }
      var maxL = Math.max(1, Math.floor(room / (size * 1.6))), ty = Math.max(130, (H - Math.min(h, room)) / 2);
      if (sp.em) { items.push(text(60, ty - 100, W - 120, 50, sp.em, { weight: 800, align: 'center', color: gd, fit: true })); }
      items.push(text(90, r3(ty), 820, size, linked(tokens(tx), L ? [0, 0.35, 0.8, 1] : [0.45, 0.7, 1, 1]), { weight: 600, align: 'center', color: c, lines: maxL, full: true }));
    } else {   // 판 한 장
      var g = gs.filter(function (x) { return x.game === sp.id; })[0] || {}, host = !!g.host;
      shade(0.15, 0.55);
      items.push(text(60, 52, 700, 42, d(g.mode), { weight: 600, color: withA(c, 0.85) }));
      items = items.concat(counter(i, n, c));
      if (host) items.push({ t: 'icon', name: 'theater', x: 370, y: 330, size: 260, color: c });
      else items.push({ t: 'art', role: g.role || '', x: 290, y: 270, size: 420, color: c });
      items.push(text(60, 730, W - 120, 85, host ? t('space.host') : d(g.role), { weight: 700, align: 'center', color: c, fit: true }));
      if (!host && g.won != null) items.push(text(60, 845, W - 120, 60, g.won ? t('game.won') : t('game.lost'), { weight: 800, align: 'center', color: g.won ? gd : withA(c, 0.6) }));
      items.push(text(60, 1010 - lift, W - 120, 38, plazaLine(p), { weight: 600, align: 'center', color: c }));
      items.push(text(60, 1058 - lift, W - 120, 34, day(p.played || p.at) + (g.nights ? ' · ' + t('feed.nights', { n: g.nights }) : ''), { align: 'center', color: withA(c, 0.7) }));
      items.push(brand(1140, c));
    }
    // 장마다 글 — 강조(위 띠)·설명(아래 띠). 사람·이야기·글 장의 강조는 제 자리에 이미 넣었다
    if (sp.em && ['people', 'story', 'text', 'group'].indexOf(k) < 0) items.push(text(150, 165, W - 300, 75, sp.em, { weight: 800, align: 'center', color: GOLD, bg: [0, 0, 0, 0.55], pad: 16, radius: 8, fit: true }));
    if (sp.cap) { var chh = capH;
      items.push({ t: 'rect', x: 0, y: H - chh, w: W, h: chh, c: [0.05, 0.05, 0.07, 1] });
      items.push(text(40, H - chh + 22, W - 80, 38, linked(tokens(sp.cap), [0.45, 0.7, 1, 1]), { color: [1, 1, 1, 1], lines: 3, full: true })); }
    return { w: W, h: H, bg: B, items: items };
  }
  /** 같은 판의 밤 n · 낮 n 이야기 장이 이어 있으면 «n째 날» 하나로 */
  function mergeStory(parts) {
    var out = [];
    parts.forEach(function (q) {
      var last = out[out.length - 1];
      if (q.k === 'story' && last && last.k === 'story' && last.id === q.id) {
        var a = String(last.ph || (last.days && last.days[last.days.length - 1].ph) || ''), b = String(q.ph || '');
        var days = last.days || [{ ph: last.ph, lines: last.lines, ev: last.ev }];
        if (+a.slice(1) === +b.slice(1) || +b.slice(1) === +a.slice(1) + (a[0] === 'd' && b[0] === 'n' ? 1 : 0)) {
          out[out.length - 1] = { k: 'story', id: q.id, days: days.concat([{ ph: q.ph, lines: q.lines, ev: q.ev }]), em: last.em || q.em }; return; }
      }
      out.push(q);
    });
    return out;
  }
  /** 묶음 안 한 덩이 — 줄인 꼴. 좌표는 덩이 맨 위가 0, 가로는 장 그대로(60~940) */
  function block(p, q, c, gd, L, big) {
    var it = [], y = 0, gs = p.games || [];
    if (q.k === 'story') {
      var days = q.days || [{ ph: q.ph, lines: q.lines, ev: q.ev }], first = String(days[0].ph || 'n1'), nn = +first.slice(1) || 1, one = days.length > 1;
      it.push(text(60, y, W - 120, 52, one ? t('story.day', { n: nn, o: ord(nn) }) : (first[0] === 'n' ? '☾ ' : '☀ ') + t(first[0] === 'n' ? 'story.n' : 'story.d', { n: nn, o: ord(nn) }), { weight: 700, color: c })); y += 72;
      if (q.em) { it.push(text(60, y, W - 120, 48, q.em, { weight: 800, color: gd, fit: true })); y += 64; }
      days.forEach(function (dd) {
        var ph = String(dd.ph || 'n1');
        if (one) { it.push(text(60, y, W - 120, 34, (ph[0] === 'n' ? '☾ ' : '☀ ') + t(ph[0] === 'n' ? 'story.n' : 'story.d', { n: +ph.slice(1) || 1, o: ord(+ph.slice(1) || 1) }), { weight: 600, color: withA(c, 0.7) })); y += 48; }
        storyLines(dd).slice(0, 10).forEach(function (ln) { it.push(text(80, y, W - 140, 38, ln.s, { weight: ln.hot ? 700 : 400, color: ln.hot ? gd : c, fit: true })); y += 52; });
      });
      return { h: y, items: it };
    }
    if (q.k === 'game') {
      var g = gs.filter(function (x) { return x.game === q.id; })[0] || {}, host = !!g.host;
      if (big) {   // 크게 하나 — 그림 가운데, 아래에 모드·직업·승패
        if (host) it.push({ t: 'icon', name: 'theater', x: 360, y: 20, size: 280, color: c }); else it.push({ t: 'art', role: g.role || '', x: 330, y: 0, size: 340, color: c });
        it.push(text(60, 360, W - 120, 32, d(g.mode), { weight: 600, align: 'center', color: withA(c, 0.8) }));
        it.push(text(60, 402, W - 120, 72, host ? t('space.host') : d(g.role), { weight: 700, align: 'center', color: c, fit: true }));
        if (!host && g.won != null) it.push(text(60, 490, W - 120, 50, g.won ? t('game.won') : t('game.lost'), { weight: 800, align: 'center', color: g.won ? gd : withA(c, 0.6) }));
        return { h: 560, items: it };
      }
      if (host) it.push({ t: 'icon', name: 'theater', x: 80, y: 20, size: 150, color: c }); else it.push({ t: 'art', role: g.role || '', x: 60, y: 0, size: 190, color: c });
      it.push(text(290, 14, 650, 30, d(g.mode), { weight: 600, color: withA(c, 0.8) }));
      it.push(text(290, 54, 650, 64, host ? t('space.host') : d(g.role), { weight: 700, color: c, fit: true }));
      if (!host && g.won != null) it.push(text(290, 130, 650, 44, g.won ? t('game.won') : t('game.lost'), { weight: 800, color: g.won ? gd : withA(c, 0.6) }));
      return { h: 190, items: it };
    }
    if (q.k === 'people') {
      var ps = p.people || [], per = 7, dd2 = 96, gap = 18, rowsN = Math.ceil(ps.length / per);
      it.push(text(60, 0, W - 120, 44, t('feed.people_n', { n: ps.length }), { weight: 700, align: 'center', color: c })); y = 64;
      for (var r = 0; r < rowsN; r++) {
        var row = ps.slice(r * per, r * per + per), rw = row.length * dd2 + (row.length - 1) * gap, x0 = (W - rw) / 2;
        row.forEach(function (x, j) {
          it.push({ t: 'face', x: r3(x0 + j * (dd2 + gap)), y: y, d: dd2, ring: 3, color: c, host: !!x.host, nick: x.nick || '', handle: x.handle || null, photo: x.photo || null, avatar: x.avatar || null });
          it.push(text(r3(x0 + j * (dd2 + gap) - 10), y + dd2 + 4, dd2 + 20, 22, x.nick || '', { weight: 600, align: 'center', color: c, fit: true }));
        });
        y += dd2 + 40;
      }
      return { h: y, items: it };
    }
    if (q.k === 'titles') {
      it.push(text(60, 0, W - 120, 40, '🎖 ' + t('title.earned'), { weight: 700, align: 'center', color: c })); y = 60;
      (p.earned || []).slice(0, 6).forEach(function (e) { it.push(text(60, y, W - 120, 36, titleName(e.name), { weight: 600, align: 'center', color: TIER[e.tier || 1] || c, fit: true })); y += 48; });
      return { h: y, items: it };
    }
    var tx = String(q.tx || ''), lines = Math.min(8, estLines(tx, 52, 820, 600));
    if (q.em) { it.push(text(60, 0, W - 120, 40, q.em, { weight: 800, align: 'center', color: gd, fit: true })); y = 56; }
    it.push(text(90, y, 820, 52, linked(tokens(tx), L ? [0, 0.35, 0.8, 1] : [0.45, 0.7, 1, 1]), { weight: 600, align: 'center', color: c, lines: 8, full: true }));
    return { h: y + lines * 52 * 1.6, items: it };
  }
  /** 덩이를 장에 놓기 — 가운데(500) 기준으로 같은 비율로 줄이고 y 를 내린다 */
  function scaleItem(it, s, y0) {
    // 줄일 때(s<1)는 가운데 기준으로 전체를, 키울 때(꽉 채우기, s>1)는 글자 크기와 세로만 — 가로 자리·그림 크기는 그대로(장 밖으로 안 나가게)
    var o = JSON.parse(JSON.stringify(it)), hs = Math.min(1, s), X = function (x) { return r3(500 + (x - 500) * hs); };
    if (o.t === 'text') { o.x = X(o.x); o.y = r3(y0 + o.y * s); o.w = r3(o.w * hs); o.size = r3(o.size * s); o.pad = r3(o.pad * hs); o.radius = r3(o.radius * hs); o.fit = true; return o; }
    if (s > 1) { o.x = X(o.x); o.y = r3(y0 + o.y * s); return o; }
    else if (o.t === 'face') { o.x = X(o.x); o.y = r3(y0 + o.y * s); o.d = r3(o.d * s); o.ring = r3(Math.max(1, o.ring * s)); }
    else if (o.t === 'art' || o.t === 'icon') { o.x = X(o.x); o.y = r3(y0 + o.y * s); o.size = r3(o.size * s); }
    return o;
  }
  /** 묶음 칸 — [x, y, w, h], 칸은 늘 4:5(작은 장이 그대로 들어가게) */
  function groupRects(m, top) {
    var y0 = top ? 130 : 60, G = 24, out = [], w, h, x;
    if (m === 2) { h = (H - y0 - 60 - G) / 2; w = h * 0.8; x = (W - w) / 2; return [[x, y0, w, h], [x, y0 + h + G, w, h]].map(rr); }
    w = (W - 60 * 2 - G) / 2; h = w * 1.25;
    var rowsN = m <= 2 ? 1 : 2, total = rowsN * h + (rowsN - 1) * G, ys = y0 + Math.max(0, (H - y0 - 40 - total) / 2);
    if (h * 2 + G > H - y0 - 40) { h = (H - y0 - 40 - G) / 2; w = h * 0.8; ys = y0; }
    var xs = [(W - (w * 2 + G)) / 2, (W - (w * 2 + G)) / 2 + w + G];
    out.push([xs[0], ys, w, h], [xs[1], ys, w, h]);
    if (m === 3) out.push([(W - w) / 2, ys + h + G, w, h]);
    if (m === 4) out.push([xs[0], ys + h + G, w, h], [xs[1], ys + h + G, w, h]);
    return out.map(rr);
  }
  function rr(a) { return a.map(r3); }
  /** 배경만(배색표·효과 고르는 작은 칸) */
  function swatch(key) { return { w: W, h: H, bg: bg(key), items: [] }; }

  var api = { V: V, setTitles: setTitles, titleName: titleName, W: W, H: H, FX: FX, MERGE: MERGE, FONTS: FONTS, normalize: normalize, setRoles: setRoles, storyLines: storyLines, setMetrics: setMetrics, wrap: wrap, setText: setText, specs: specs, tokens: tokens, page: page, swatch: swatch, bg: bg, day: day, ord: ord,
              palette: { count: 300, steps: 12, rgb: rgb, hsl: hsl, all: function () { var o = []; for (var i = 0; i < 300; i++) o.push(rgb(i)); return o; }, light: function (i) { return hsl(i)[2] > 0.58; } }, light: light, ink: ink };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Postcard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
