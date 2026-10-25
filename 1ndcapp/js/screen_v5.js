/* 큰 화면 v5 — 애플 결(2026-10-25 햇살님 확정, 시안 시안/자리판_20261025/v2/큰화면_v5m). 받은 공개 정보(display.public)만으로 그린다 — 판정하지 않는다.
   · 자리: 경우마다 손으로 맞춘 배치표(screen_table.js) · 산 자리 흰 동그라미, 죽으면 번호 자리에 죽은 까닭 기호(밤 = 달 · 처형 = ✕), 공개된 편은 얇은 색 테, 지명은 투표 색 고리
   · 오른쪽 정보 칸: 순환 표시(링 | 카드 — 진행자 설정 p.cycle) + 숫자 셋(살아 있음·죽음·유령표) + 판 흐름(최근 낮·밤부터, 남는 높이에 맞춰 오래된 것부터 접음)
   · 가운데: 토론은 «잠금 화면» 결 시계(작은 머리글 + 큰 숫자 + 남은 시간 막대), 그 밖 장면은 머리글 + 큰 이름 + 한 줄
   · 무대는 1080 점 높이 · 폭 = 창 비율(4:3~21:9) × 1080, 통째로 줄여 맞춘다. 안전 여백 위아래 60 · 양옆 80
   같은 그림을 아이폰 AirPlay(ExternalPublicView.swift)가 SwiftUI 로 그린다 — 이 파일을 고치면 거기도 */
import { TABLE } from './screen_table.js';
import { narrTr } from './i18n_dom.js';   // 다른 말이면 순환 표시 글을 재기 전에 바꾼다(반증 검토 2026-10-25 — 영어 «Morning announcement» 가 칸 밖으로)

const PH = ['밤', '아침', '토론', '지명', '투표', '처형'];
const PHK = i => PH[i] === '아침' ? '아침 발표' : PH[i];
const APC = { day: ['#5856D6', '#FF9500', '#32ADE6', '#007AFF', '#30B0C7', '#AF52DE'], night: ['#5E5CE6', '#FF9F0A', '#64D2FF', '#0A84FF', '#40C8E0', '#BF5AF2'] };
const APF = [.2, .08, .34, .13, .14, .11], APCUM = APF.reduce((a, f) => (a.push(a[a.length - 1] + f), a), [0]);
const TEAL = '#30B0C7', RED = '#ff3b30', BLUE = '#007aff';
const josa = (w, a, b) => { w = String(w || ''); const c = w.charCodeAt(w.length - 1); return w + (c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 ? a : b); };   // 받침 있으면 «이»
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ctx = document.createElement('canvas').getContext('2d');
const tw = (t, fs, wt = 500) => { ctx.font = wt + ' ' + fs + 'px -apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif'; return ctx.measureText(t).width; };

/* 장면 → 순환 칸(밤 0 · 아침 1 · 토론 2 · 지명 3 · 투표 4 · 처형 5), 순환이 없는 장면은 null */
const CUR = { night: 0, dawn: 1, discussion: 2, nomination: 3, voting: 4, confirmed: 4, execution: 5 };
/* 이 파일이 그리는 장면 — 대기·직업 공개·복기·이번 판 안내 룰 설명·안내 천이 있는 준비는 옛 그림(따로 확정한 디자인) */
export function usesV5(p) {
  if (!p || !p.seats || !p.seats.length) return false;
  if (p.scene === 'waiting') return false;
  if (p.scene === 'ended') return !(p.endReveal && p.endReveal.length) && !p.endReplay;
  if (p.scene === 'prep') return !p.briefing;
  return p.scene in CUR;
}

/* ── 기호(SF Symbols 를 닮게 — 24 격자) ── */
function apIc(i, x, y, sz, c, bg = 'var(--bg)') { let b = '';
  if (i === 0) b = `<path d="M14 2A10 10 0 1 0 22 15.5A8 8 0 0 1 14 2Z" fill="${c}"/>`;
  if (i === 1) b = `<path d="M5 16A7 7 0 0 1 19 16Z" fill="${c}"/><rect x="2" y="17.5" width="20" height="2.4" rx="1.2" fill="${c}"/><g stroke="${c}" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="3" x2="12" y2="6"/><line x1="4.6" y1="7.6" x2="6.7" y2="9.7"/><line x1="19.4" y1="7.6" x2="17.3" y2="9.7"/></g>`;
  if (i === 2) b = `<path d="M3 3h11a2.5 2.5 0 0 1 2.5 2.5v5A2.5 2.5 0 0 1 14 13H7l-3.5 3v-3A2.5 2.5 0 0 1 .5 10.5v-5A2.5 2.5 0 0 1 3 3Z" fill="${c}" opacity=".55"/><path d="M10 9h11a2.5 2.5 0 0 1 2.5 2.5v5A2.5 2.5 0 0 1 21 19h-.5v3L17 19h-7a2.5 2.5 0 0 1-2.5-2.5v-5A2.5 2.5 0 0 1 10 9Z" fill="${c}"/>`;
  if (i === 3) b = `<circle cx="12" cy="12" r="8.6" fill="none" stroke="${c}" stroke-width="2.6"/><circle cx="12" cy="12" r="3.4" fill="${c}"/><g stroke="${c}" stroke-width="2.6" stroke-linecap="round"><line x1="12" y1="1" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="23"/><line x1="1" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="23" y2="12"/></g>`;
  if (i === 4) b = `<rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="${c}"/><path d="M7 12.4l3.4 3.4L17.2 8.6" fill="none" stroke="${bg}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (i === 5) b = `<circle cx="12" cy="12" r="10.5" fill="${c}"/><path d="M8.2 8.2l7.6 7.6M15.8 8.2l-7.6 7.6" stroke="${bg}" stroke-width="2.6" stroke-linecap="round"/>`;
  if (i === 'flag') b = `<path d="M5 2.5v19" stroke="${c}" stroke-width="2.4" stroke-linecap="round"/><path d="M6 3.5h13l-3 4.5 3 4.5H6Z" fill="${c}"/>`;
  if (i === 'pause') b = `<rect x="5" y="4" width="5" height="16" rx="1.5" fill="${c}"/><rect x="14" y="4" width="5" height="16" rx="1.5" fill="${c}"/>`;
  return `<g transform="translate(${x - sz / 2},${y - sz / 2}) scale(${sz / 24})">${b}</g>`; }
const ico = (k, sz, c, bg) => `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" style="flex:none;overflow:visible">${apIc(k, 12, 12, 24, c, bg)}</svg>`;

/* ── 순환 표시 ── */
function stad(hw, r) { const q = Math.PI * r / 2, L = 4 * hw + 2 * Math.PI * r, d = `M${-hw - r},0 A${r},${r} 0 0 1 ${-hw},${-r} H${hw} A${r},${r} 0 0 1 ${hw},${r} H${-hw} A${r},${r} 0 0 1 ${-hw - r},0`;
  const pt = t => { t = ((t % L) + L) % L; let a; if (t < q) { a = Math.PI + t / r; return [-hw + r * Math.cos(a), r * Math.sin(a)]; } t -= q; if (t < 2 * hw) return [-hw + t, -r]; t -= 2 * hw;
    if (t < Math.PI * r) { a = -Math.PI / 2 + t / r; return [hw + r * Math.cos(a), r * Math.sin(a)]; } t -= Math.PI * r; if (t < 2 * hw) return [hw - t, r]; t -= 2 * hw; a = Math.PI / 2 + t / r; return [-hw + r * Math.cos(a), r * Math.sin(a)]; };
  const seg = (a, b, attr) => { if (b <= a) return ''; if (b <= 0) { a += L; b += L; } const dash = (s, e) => `<path d="${d}" fill="none" stroke-dasharray="${e - s} ${L * 2}" stroke-dashoffset="${-s}" ${attr}/>`; return a < 0 ? dash(L + a, L) + dash(0, b) : dash(a, b); };
  const nrm = (x, y) => { if (Math.abs(x) <= hw) return [0, Math.sign(y)]; const c = Math.sign(x) * hw, dd = Math.hypot(x - c, y); return [(x - c) / dd, y / dd]; };
  return { L, pt, seg, nrm }; }
/* g0 = 지금 칸 게이지(0~1, 잴 수 없는 구간은 null) */
function cycle(kind, cur, g0, night) { const C = APC[night ? 'night' : 'day'], nm = narrTr(PHK(cur));
  if (kind !== 'card') { const T = stad(106, 54), L = T.L, sA = x => (x - .1) * L, w = 18, gap = 13; let g = '';
    PH.forEach((p, i) => { if (i !== cur) g += T.seg(sA(APCUM[i]) + gap, sA(APCUM[i + 1]) - gap, `stroke="${i < cur ? 'var(--g2)' : 'var(--g5)'}" stroke-width="${w}" stroke-linecap="round"`); });
    const a = sA(APCUM[cur]) + gap, b = sA(APCUM[cur + 1]) - gap;
    g += g0 == null ? T.seg(a, b, `stroke="${C[cur]}" stroke-width="${w}" stroke-linecap="round"`) : T.seg(a, b, `stroke="${C[cur]}" stroke-opacity=".25" stroke-width="${w}" stroke-linecap="round"`) + T.seg(a, a + (b - a) * Math.max(.02, g0), `stroke="${C[cur]}" stroke-width="${w}" stroke-linecap="round"`);
    PH.forEach((p, i) => { const [x, y] = T.pt(sA(APCUM[i] + APF[i] / 2)), [nx, ny] = T.nrm(x, y); g += apIc(i, x + nx * 36, y + ny * 36, i === cur ? 32 : 26, i === cur ? C[cur] : i < cur ? 'var(--g2)' : 'var(--sec)'); });
    const t0 = tw(nm, 57, 700), fs = t0 > 240 ? 57 * 240 / t0 : 57, t = t0 * fs / 57, x0 = -(t + 56) / 2; g += apIc(cur, x0 + 22, 0, 44, C[cur]) + `<text x="${x0 + 56}" y="${fs * .35}" font-size="${fs}" font-weight="700" fill="var(--fg)">${esc(nm)}</text>`;   // 링 안쪽 폭을 넘는 말(영어)만 줄인다
    return `<svg class="cyc" width="440" height="224" viewBox="-220 -112 440 224">${g}</svg>`; }
  const W = 380, x0 = -190; let g = `<rect x="-218" y="-98" width="436" height="196" rx="34" fill="var(--mat)" stroke="var(--matl)" stroke-width="1.5"/>`;
  { const t0 = tw(nm, 57, 700), fs = t0 > 330 ? 57 * 330 / t0 : 57; g += apIc(cur, -170, -40, 48, C[cur]) + `<text x="-136" y="${-40 + fs * .37}" font-size="${fs}" font-weight="700" fill="var(--fg)">${esc(nm)}</text>`; }
  PH.forEach((p, i) => { const a = x0 + APCUM[i] * W + (i ? 2.5 : 0), b = x0 + APCUM[i + 1] * W - (i < 5 ? 2.5 : 0), w = b - a, y = 14, h = 14;
    if (i !== cur) g += `<rect x="${a}" y="${y}" width="${w}" height="${h}" rx="7" fill="${i < cur ? 'var(--g2)' : 'var(--g5)'}"/>`;
    else if (g0 == null) g += `<rect x="${a}" y="${y}" width="${w}" height="${h}" rx="7" fill="${C[i]}"/>`;
    else g += `<rect x="${a}" y="${y}" width="${w}" height="${h}" rx="7" fill="${C[i]}" opacity=".25"/><rect x="${a}" y="${y}" width="${Math.max(h, w * g0)}" height="${h}" rx="7" fill="${C[i]}"/>`; });
  const n = (cur + 1) % 6; g += `<text x="-190" y="72" font-size="27" fill="var(--sec)">다음</text>` + apIc(n, -120, 63, 26, 'var(--sec)', 'var(--mat)') + `<text x="-100" y="72" font-size="27" font-weight="600" fill="var(--sec)">${PHK(n)}</text>`;
  return `<svg class="cyc" width="440" height="210" viewBox="-220 -105 440 210" style="overflow:visible">${g}</svg>`; }

/* ── 시계(토론) — 남은 시간·막대는 tick 이 1초마다 고친다 ── */
export function timerLeft(tm, now = Date.now()) { if (!tm) return null; return tm.state === 'paused' ? (tm.leftMs || 0) : tm.state === 'elapsed' ? 0 : Math.max(0, (tm.endsAt || 0) - now); }
const mmss = ms => { const s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
function clockHtml(tm, k, night) { const C = APC[night ? 'night' : 'day'][2], W = 300;
  return `<div style="width:${300 * k}px;height:${210 * k}px"><div style="width:300px;transform:scale(${k});transform-origin:0 0">
    <div class="t25 v5hd" id="v5tlab" style="justify-content:center;font-weight:600"></div><div class="v5tm" id="v5time"></div>
    <svg width="${W}" height="10" viewBox="0 0 ${W} 10" style="display:block;margin:6px auto 0"><rect width="${W}" height="10" rx="5" fill="var(--g5)"/><rect id="v5bar" width="0" height="10" rx="5" fill="${C}"/></svg></div></div>`; }
export function tickV5(host, p, now = Date.now()) {
  const el = host && host.querySelector('#v5time'), tm = p && p.timer; if (!el || !tm) return;
  const left = timerLeft(tm, now), dur = tm.durationMs || 0, warn = left <= 60000, C = APC.day[2];
  el.textContent = mmss(left); el.style.color = warn ? RED : '';
  const bar = host.querySelector('#v5bar'); if (bar) { bar.setAttribute('width', dur ? Math.max(0, Math.min(1, left / dur)) * 300 : 0); bar.setAttribute('fill', warn ? RED : C); }
  const lab = host.querySelector('#v5tlab'); if (lab) lab.innerHTML = tm.state === 'paused' ? ico('pause', 24, 'var(--sec)') + '일시정지' : left <= 0 ? ico(2, 24, RED) + '토론 시간 끝' : ico(2, 24, C) + '토론';
  const g = dur ? 1 - left / dur : null, cy = host.querySelector('#v5cyc');   // 순환 표시의 토론 게이지도 같이(1초에 한 번이면 충분)
  if (cy && g != null && Math.abs((+cy.dataset.g || 0) - g) > .004) { cy.dataset.g = g; cy.innerHTML = cycle(p.cycle, 2, g, false); }
}

/* ── 자리 배치 — 원형 c<인원> · 사각 r<가로>x<세로>(진행자가 고른 칸 그대로) ── */
const CX = 720, CY = 545;   // 판을 그리는 상자 가운데(그린 뒤 짜임이 옮긴다)
function geo(p) { const n = p.seats.length, names = p.seats.map(s => s.name || s.number + '번');
  if (p.shape !== 'rect') { const keys = Object.keys(TABLE.circle).map(k => +k.slice(1)), nn = keys.reduce((a, b) => Math.abs(b - n) < Math.abs(a - n) ? b : a), h = TABLE.circle['c' + nn], seats = [], labels = [];
    for (let i = 0; i < n; i++) { const a = (-90 + i * 360 / n) * Math.PI / 180, co = Math.cos(a), si = Math.sin(a), x = CX + h.R * co, y = CY + h.R * si;
      seats.push({ x, y }); const mid = Math.abs(co) < .08 ? (si < 0 ? -1 : 1) : 0, side = co > 1e-6 || (Math.abs(co) <= 1e-6 && si < 0) ? 1 : -1, lead = h.d * .5 + 34;
      labels.push({ mid, side, ex: x + co * h.d * .5, ey: y + si * h.d * .5, kx: x + co * lead, ky: y + si * lead, x, y }); }
    const lh = h.fs * 1.2 + 34;
    [1, -1].forEach(sd => { const L = labels.filter(l => l.side === sd && !l.mid).sort((a, b) => a.ky - b.ky);
      for (let it = 0; it < 8; it++) for (let k = 1; k < L.length; k++) if (L[k].ky - L[k - 1].ky < lh) { const m = (lh - (L[k].ky - L[k - 1].ky)) / 2; L[k].ky += m; L[k - 1].ky -= m; } });
    labels.forEach(l => { l.tx = l.kx + l.side * 28; });
    return { kind: 'c', h, seats, labels, gaps: [], cx: CX, cy: CY + (h.midDy || 0), names }; }
  const b = p.board || {}, cells = b.cells || [];
  let c = b.cols, r = b.rows, at = p.seats.map(s => cells.find(k => k.seatId === s.id));
  if (!(c >= 1 && r >= 1) || at.some(x => !x)) {   // 칸 정보가 없으면 둘레에 차례로
    r = n <= 8 ? 2 : n <= 14 ? 3 : 4; c = Math.max(2, Math.ceil((n + 4) / 2) - r); const per = []; for (let i = 0; i < c; i++) per.push([i, 0]); for (let j = 1; j < r; j++) per.push([c - 1, j]); for (let i = c - 2; i >= 0; i--) per.push([i, r - 1]); for (let j = r - 2; j >= 1; j--) per.push([0, j]);
    at = p.seats.map((s, i) => ({ col: per[i % per.length][0], row: per[i % per.length][1] })); }
  const h = TABLE.rect['r' + c + 'x' + r] || (() => { const d = n > 14 ? 64 : 76; return { sx: Math.min(260, 1100 / Math.max(1, c - 1)), sy: Math.min(220, 760 / Math.max(1, r - 1)), d, fs: d > 70 ? 31 : 29, lay: r > c ? { mode: 'stack' } : c >= 7 && r <= 4 ? { mode: 'row' } : null }; })();
  const w = h.sx * (c - 1), hh = h.sy * (r - 1), x0 = CX + (h.dx || 0) - w / 2, y0 = CY + (h.dy || 0) - hh / 2;
  const NM = { top: 'above', bottom: 'below', left: 'left', right: 'right', ...(h.nm || {}) };
  const out = (i, j, dflt) => i === 0 ? 'left' : i === c - 1 ? 'right' : dflt;
  const side = (i, j) => { const v = j === 0 ? NM.top : j === r - 1 ? NM.bottom : i === 0 ? NM.left : i === c - 1 ? NM.right : 'below'; return v === 'out' ? out(i, j, j === 0 ? 'above' : 'below') : v; };
  const gaps = cells.filter(k => !k.seatId).map(k => ({ x: x0 + k.col * h.sx, y: y0 + k.row * h.sy }));
  return { kind: 'r', h, seats: at.map(k => ({ x: x0 + k.col * h.sx, y: y0 + k.row * h.sy, nm: side(k.col, k.row) })), gaps, cx: x0 + w / 2, cy: y0 + hh / 2, names }; }
const layOf = (h, p) => { const L = h.lay || {}; return { mode: L.mode || (p.shape !== 'rect' ? 'in' : 'in'), vy: L.vy || 550 }; };

/* ── 정보 칸(애플 스포츠 «경기 흐름» 결) ── */
function poll(name, votes, need, alive, by, big) { const W = 396, C = TEAL, mx = Math.max(alive, need || 1, votes || 0);
  return `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px"><span class="t31" style="font-weight:600">${esc(name)}</span><span style="white-space:nowrap">${votes == null ? '' : `<span class="${big ? 't48' : 't38'}" style="font-weight:600;color:${C}">${votes}</span>`}<span class="t25" style="color:var(--sec)"> ${votes == null ? '' : '/ '}필요 ${need}</span></span></div>
  <svg width="${W}" height="34" viewBox="0 0 ${W} 34" style="display:block;margin-top:6px"><rect x="0" y="6" width="${W}" height="14" rx="7" fill="var(--g5)"/>${votes ? `<rect x="0" y="6" width="${W * Math.min(1, votes / mx)}" height="14" rx="7" fill="${C}"/>` : ''}<line x1="${W * need / mx}" y1="0" x2="${W * need / mx}" y2="26" stroke="var(--fg)" stroke-width="2.5"/></svg>
  <div class="t23" style="color:var(--sec)">${by ? esc(josa(by, '이', '가')) + ' 지명 · ' : ''}${votes == null ? '투표 중' : '투표 확정'}</div>`; }
function infoBlock(p, nameOf) { const n = p.seats.length, alive = p.seats.filter(s => !s.dead).length, ghost = p.seats.filter(s => s.dead && s.ghost).length, inDay = /^(dawn|discussion|nomination|voting|confirmed|execution)$/.test(p.scene);
  const st = (v, l, c = 'var(--fg)') => `<div><span class="t76" style="font-weight:600;color:${c};line-height:80px">${v}</span><span class="t23" style="color:var(--sec)">${l}</span></div>`;
  const ev = (a, b, c) => `<div class="ev t29"><span>${a}</span><span class="t25" style="color:${c || 'var(--sec)'};white-space:nowrap">${b}</span></div>`;
  const rv = id => { const s = p.seats.find(x => x.id === id); return s && s.reveal ? (s.reveal === 'criminal' ? [' · 범죄 조직', RED] : [' · 시민', BLUE]) : ['', null]; };
  const voteT = p.nomination && /^(voting|confirmed)$/.test(p.scene) ? p.nomination.targetId : null;
  const F = (p.flow || []).slice().reverse();
  let g = '';
  F.forEach((f, k) => { const now = k === 0 && ((f.kind === 'day' && inDay && f.n === p.dayNumber) || (f.kind === 'night' && p.scene === 'night'));   // 아침(발표 전)의 맨 위는 지난 낮 — «지금» 아님
    let rows = '';
    if (now && voteT) { const r = (p.results || []).find(x => x.targetId === voteT), v = p.scene === 'confirmed' && r ? r.votes : null;
      rows += `<div style="margin-top:6px">${poll(nameOf(voteT), v, p.neededVotes, alive, p.nomination.byId ? nameOf(p.nomination.byId) : null, false)}</div>`; }
    f.events.forEach(e => {
      if (e.what === 'nom') { if (now && e.targetId === voteT) return; rows += ev((e.byId ? esc(nameOf(e.byId)) + ' → ' : '') + esc(nameOf(e.targetId)), e.votes == null ? '지명' : '지명 · ' + e.votes + '표' + (e.need != null && e.votes < e.need ? ' 미달' : '')); }
      else if (e.what === 'death') { const [t, c] = rv(e.targetId); rows += ev(esc(nameOf(e.targetId)), '사망' + t, c); }
      else if (e.what === 'exec') { const [t, c] = rv(e.targetId); rows += ev(esc(nameOf(e.targetId)), '처형' + t, c || RED); }
      else if (e.what === 'survived') rows += ev(esc(nameOf(e.targetId)), '처형 · 살았어요'); });
    if (!f.events.length && f.kind === 'night') rows += `<div class="ev t25" style="color:var(--sec)">아무도 죽지 않았어요</div>`;
    g += `<div class="pg"><div class="per${now ? ' now' : ''}">${f.kind === 'night' ? '밤 ' + f.n : '낮 ' + f.n}${now ? ' · 지금' : ''}</div>${rows}</div>`; });
  return `<div class="isec"><div class="sc">${st(alive, '살아 있음')}${st(n - alive, '죽음', 'var(--g2)')}${st(ghost, '유령표', 'var(--g2)')}</div></div>`
    + (g ? `<div class="isec"><div class="cap t25">판 흐름</div><div class="tl" style="--pc:${APC.day[CUR[p.scene] == null ? 2 : CUR[p.scene]]}">${g}</div></div>` : ''); }

/* ── 가운데 글 ── */
function midHtml(p, nameOf, night, clockK) { const alive = p.seats.filter(s => !s.dead).length, hd = (i, t, c = 'var(--sec)') => `<div class="t25 v5hd" style="color:var(--sec)">${i == null ? '' : ico(i, 24, c, 'var(--bg)')}${t}</div>`;
  const big = t => `<div class="v5name" style="font-size:${tw(t, 57, 700) > 560 ? 44 : 57}px">${esc(t)}</div>`, sub = t => `<div class="t25" style="color:var(--sec)">${t}</div>`;
  const s = p.scene;
  if (s === 'discussion') return p.timer ? clockHtml(p.timer, clockK, night) : hd(2, '토론', APC.day[2]) + big('자유롭게 이야기하세요');
  if ((s === 'nomination' || s === 'voting' || s === 'confirmed') && p.nomination) { const t = p.nomination.targetId, by = p.nomination.byId, r = (p.results || []).find(x => x.targetId === t);
    return hd(3, by ? esc(josa(nameOf(by), '이', '가')) + ' 지명' : '지명') + big(nameOf(t)) + sub(s === 'confirmed' && r ? r.votes + '표 · 필요 ' + p.neededVotes + '표 · ' + ({ leading: '유력', tied: '공동 최다', qualified: '기준 충족', below: '기준 미달' }[r.status] || '') : '필요 ' + p.neededVotes + '표 · 생존 ' + alive + '명'); }
  if (s === 'execution' && p.execution) { const t = p.execution.targetId, x = p.seats.find(q => q.id === t), rvT = x && x.reveal ? (x.reveal === 'criminal' ? `<span style="color:${RED}"> · 범죄 조직 (악)</span>` : `<span style="color:${BLUE}"> · 시민</span>`) : '';
    return hd(5, '처형', APC.day[5]) + big(nameOf(t)) + sub((p.execution.died ? '사망' : '살았어요') + rvT); }
  if (s === 'dawn') { const ds = (p.morningAnnouncement && p.morningAnnouncement.deaths) || [];
    return ds.length ? hd(0, '어젯밤', APC.day[0]) + big(ds.map(nameOf).join(' · ')) + sub('사망') : hd(1, '아침 발표', APC.day[1]) + big('아침이 밝았어요'); }
  if (s === 'prep') { const H = p.handoff; if (H) return H.seatId ? hd(null, '역할 확인 ' + H.seen + ' / ' + H.total) + big(nameOf(H.seatId)) + sub('차례예요') : hd(null, '역할 확인 ' + H.total + ' / ' + H.total) + big('모두 확인했어요');
    return big('자리 확인'); }
  if (s === 'ended') return hd('flag', '게임 종료') + big(p.ending && p.ending.winnerLabel ? p.ending.winnerLabel : '게임 종료');
  return ''; }

/* 지명 화살표 — 사각은 판 안쪽으로 휘는 곡선(직선이면 같은 줄 사람을 가로지른다, 2026-10-25 햇살님 «이전처럼 곡선»), 원형은 원 안으로만 지나가 직선 */
function nomArrow(a, b, L, d) { const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; let c = { x: mx, y: my };
  if (L.kind === 'r') { let nx = -dy / len, ny = dx / len; if ((L.cx - mx) * nx + (L.cy - my) * ny < 0) { nx = -nx; ny = -ny; } const bend = Math.max(d * 1.9, len * .32); c = { x: mx + nx * bend, y: my + ny * bend }; }
  const u = (p, q) => { const l = Math.hypot(q.x - p.x, q.y - p.y) || 1; return { x: (q.x - p.x) / l, y: (q.y - p.y) / l }; }, off = d * .62;
  const ua = u(a, c), ub = u(b, c), st = { x: a.x + ua.x * off, y: a.y + ua.y * off }, e = { x: b.x + ub.x * off, y: b.y + ub.y * off }, t = u(c, e), bx = e.x - t.x * 16, by = e.y - t.y * 16;
  return `<path d="M${st.x},${st.y} Q${c.x},${c.y} ${bx},${by}" fill="none" stroke="${TEAL}" stroke-width="3" stroke-opacity=".6" stroke-linecap="round"/><path d="M${e.x},${e.y} L${bx - t.y * 9},${by + t.x * 9} L${bx + t.y * 9},${by - t.x * 9}Z" fill="${TEAL}" fill-opacity=".85"/>`; }

/* ── 무대 그리기 ── */
export function stageW(vw, vh) { return Math.round(1080 * Math.min(21 / 9, Math.max(4 / 3, vw / vh))); }
export function drawV5(host, p, vw, vh) {
  const W = stageW(vw, vh), k = Math.min(vw / W, vh / 1080), night = p.scene === 'night', L = geo(p), h = L.h, lay = layOf(h, p);
  const nameOf = id => { const s = p.seats.find(x => x.id === id); return s ? s.name || s.number + '번' : ''; };
  const cur = CUR[p.scene], hasInfo = cur != null || p.scene === 'ended';
  let svg = '', bo = '';
  L.gaps.forEach(g => { bo += `<div class="st gp" style="left:${g.x}px;top:${g.y}px;width:${h.d * .55}px;height:${h.d * .55}px"></div>`; });
  const nomT = p.nomination && /^(nomination|voting|confirmed)$/.test(p.scene) ? p.nomination.targetId : null, turn = p.handoff && p.handoff.seatId;
  L.seats.forEach((pt, i) => { const s = p.seats[i], cs = s.dead ? (s.cause === 'night' ? 'm' : 'x') : '', rv = s.reveal === 'criminal' ? ' ring-e' : s.reveal === 'citizen' ? ' ring-c' : '';
    bo += `<div class="st${s.dead ? ' dead' : ''}${rv}${s.id === nomT ? ' nom' : s.id === turn ? ' turn' : ''}" data-k="${cs}" style="left:${pt.x}px;top:${pt.y}px;width:${h.d}px;height:${h.d}px;font-size:${Math.round(h.d * .43)}px">${s.dead ? '' : s.number}${s.dead && s.ghost ? '<span class="gh"></span>' : ''}</div>`;
    const cls = 'lb' + (s.dead ? ' dead' : ''), fs = h.fs; let pos, al;
    if (L.kind === 'c') { const l = L.labels[i];
      if (l.mid) { al = 'al-c'; pos = `left:${l.x}px;${l.mid < 0 ? `bottom:${1080 - (l.y - h.d / 2 - 18)}px` : `top:${l.y + h.d / 2 + 10}px`};transform:translateX(-50%)`; }
      else { svg += `<path class="ld" d="M${l.ex},${l.ey} L${l.kx},${l.ky} L${l.tx},${l.ky}"/>`; al = l.side > 0 ? 'al-l' : 'al-r'; pos = `top:${l.ky - fs * .6}px;` + (l.side > 0 ? `left:${l.tx + 8}px` : `right:${1920 - l.tx + 8}px`); } }
    else { const g = h.d / 2 + 12;
      if (pt.nm === 'above') { al = 'al-c'; pos = `left:${pt.x}px;bottom:${1080 - (pt.y - g - 8)}px;transform:translateX(-50%)`; }
      else if (pt.nm === 'below') { al = 'al-c'; pos = `left:${pt.x}px;top:${pt.y + g}px;transform:translateX(-50%)`; }
      else if (pt.nm === 'left') { al = 'al-r'; pos = `right:${1920 - (pt.x - g)}px;top:${pt.y - fs * .6}px`; }
      else { al = 'al-l'; pos = `left:${pt.x + g}px;top:${pt.y - fs * .6}px`; } }
    bo += `<div class="${cls} ${al}" style="font-size:${fs}px;line-height:${Math.round(fs * 1.24)}px;${pos}"><span class="nm">${esc(L.names[i])}</span></div>`; });
  if (nomT && p.nomination.byId) { const a = L.seats[p.seats.findIndex(s => s.id === p.nomination.byId)], b = L.seats[p.seats.findIndex(s => s.id === nomT)]; if (a && b) svg += nomArrow(a, b, L, h.d); }
  const inB = lay.mode === 'in' || lay.mode === 'row', rin = Math.min(...L.seats.map(q => Math.hypot(q.x - L.cx, q.y - L.cy))) - h.d / 2 - 30, clockK = inB ? Math.max(.62, Math.min(1, rin / 183)) : 1;
  const midH = midHtml(p, nameOf, night, clockK), inMid = inB && midH;
  let o = `<div id="bw" style="position:absolute;left:0;top:0;width:1920px;height:1080px"><svg class="ov">${svg}</svg>${bo}${inMid ? `<div class="mid" style="left:${L.cx}px;top:${L.cy}px">${midH}</div>` : ''}</div>`;
  if (midH && !inMid) o += `<div id="ck" class="blk" style="position:absolute"><div class="mid" style="position:static;transform:none">${midH}</div></div>`;
  const g0 = cur === 0 ? (p.nightProgress == null ? null : p.nightProgress) : cur === 2 && p.timer && p.timer.durationMs ? 1 - timerLeft(p.timer) / p.timer.durationMs : null;
  if (hasInfo) o += `<div id="inf" class="blk${lay.mode === 'row' ? ' row' : ''}" style="position:absolute;width:440px">${cur != null ? `<div class="isec" id="v5cyc" style="text-align:center" data-g="${g0 == null ? '' : g0}">${cycle(p.cycle, cur, g0, night)}</div>` : ''}${night ? '' : infoBlock(p, nameOf)}</div>`;
  o += `<button class="v5leave t23" type="button">연결 끊기</button>`;
  host.innerHTML = `<div class="v5tv${night ? ' night' : ''}" style="width:${W}px;transform:translate(${(vw - W * k) / 2}px,${(vh - 1080 * k) / 2}px) scale(${k})">${o}</div>`;
  if (window.__i18nFix) window.__i18nFix(host);   // 재기 전에 바꾼다(재고 나서 바뀌면 폭이 어긋난다)
  place(host, lay, W, hasInfo);
  tickV5(host, p);
}
/* 판 흐름 접기 — 오래된 낮·밤 묶음부터, 하나만 남으면 그 안의 오래된 줄부터(한 낮에 지명이 많으면 묶음 하나가 칸보다 높다, 반증 검토 2026-10-25). 줄은 하나는 남긴다 */
function fold(inf, tooTall) { while (tooTall()) { const g = inf.querySelectorAll('.pg'); if (g.length > 1) { g[g.length - 1].remove(); continue; }
  const ev = g.length ? g[0].querySelectorAll('.ev') : []; if (ev.length > 1) ev[0].remove(); else break; } }
/* 짜임 — 자리판·시계·정보 칸을 실제 크기로 재서 안전 여백 안에 놓는다(시안 place 와 같은 규칙) */
function place(host, lay, W, hasInfo) {
  const tv = host.querySelector('.v5tv'), R = tv.getBoundingClientRect(), sc = R.height / 1080;
  const box = els => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; els.forEach(e => { const q = e.getBoundingClientRect(); if (!q.width) return; x0 = Math.min(x0, (q.left - R.left) / sc); y0 = Math.min(y0, (q.top - R.top) / sc); x1 = Math.max(x1, (q.right - R.left) / sc); y1 = Math.max(y1, (q.bottom - R.top) / sc); }); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
  const bw = tv.querySelector('#bw'), ck = tv.querySelector('#ck'), inf = tv.querySelector('#inf');
  const B = box([...bw.querySelectorAll('.st,.lb .nm,.mid')]), T = ck ? box([ck]) : null;
  if (!hasInfo) {   // 정보 칸 없는 장면(준비) — 판(과 시계)을 가운데로
    const ws = B.w + (T ? T.w + 80 : 0), bk = Math.min(1, (W - 160) / ws, 960 / B.h), x = (W - ws * bk) / 2;
    bw.style.transformOrigin = `${B.x}px ${B.y}px`; bw.style.transform = `translate(${x - B.x}px,${540 - B.h * bk / 2 - B.y}px) scale(${bk})`;
    if (ck) { ck.style.left = (x + B.w * bk + 80) + 'px'; ck.style.top = (540 - T.h / 2) + 'px'; } return; }
  let I = box([inf]);
  { const top0 = (60 + (lay.vy - B.h / 2)) / 2, maxH = lay.mode === 'row' ? 960 - B.h - 120 : lay.mode === 'stack' && T ? 975 - (top0 + T.h + 36) : 975 - top0;
    fold(inf, () => box([inf]).h > maxH); I = box([inf]); }
  if (lay.mode === 'row') {
    const rk = Math.min(1, (W - 160) / B.w), Bw = B.w * rk, Bh = B.h * rk, ik = Math.min(1, (W - 160) / I.w), Iw = I.w * ik, Ih = I.h * ik;
    const e = (960 - Bh - Ih) / 3, yB = 60 + e, yI = yB + Bh + e, M = W / 2;
    inf.style.transformOrigin = '0 0'; inf.style.transform = ik < 1 ? `scale(${ik})` : '';
    bw.style.transformOrigin = `${B.x}px ${B.y}px`; bw.style.transform = `translate(${M - Bw / 2 - B.x}px,${yB - B.y}px) scale(${rk})`; inf.style.left = (M - Iw / 2) + 'px'; inf.style.top = yI + 'px'; return; }
  let blocks = [{ k: 'B', w: B.w, h: B.h }];
  if (lay.mode === 'col' && T) blocks.push({ k: 'T', w: T.w, h: T.h });
  if (lay.mode === 'stack' && T) blocks.push({ k: 'S', w: Math.max(T.w, I.w), h: T.h + 36 + I.h }); else blocks.push({ k: 'I', w: I.w, h: I.h });
  let bk = 1; { const need = blocks.reduce((a, b) => a + b.w, 0) + 40 * (blocks.length + 1); if (need > W - 160 + 80) { bk = Math.max(.6, (W - 80 - 40 * (blocks.length + 1) - blocks.slice(1).reduce((a, b) => a + b.w, 0)) / B.w); blocks[0].w = B.w * bk; blocks[0].h = B.h * bk; } }
  const free = (W - 160) - blocks.reduce((a, b) => a + b.w, 0), k = blocks.length, RW = .4;   // 오른쪽 끝 여백 = 왼쪽의 40%(2026-10-25 햇살님 «우측 여백을 좀 줄이자»)
  let edge = free / (k + RW), gap = edge; if (edge < 40) { edge = 0; gap = free / (k - 1); }
  let x = 80 + edge; const pos = {}; blocks.forEach(b => { pos[b.k] = { x, w: b.w, h: b.h }; x += b.w + gap; });
  const vy = lay.vy, pb = pos.B; bw.style.transformOrigin = `${B.x}px ${B.y}px`; bw.style.transform = `translate(${pb.x - B.x}px,${vy - B.h * bk / 2 - B.y}px) scale(${bk})`;
  if (pos.T) { ck.style.left = pos.T.x + 'px'; ck.style.top = (vy - T.h / 2) + 'px'; }
  const topB = (60 + (vy - B.h * bk / 2)) / 2;   // 정보 칸 윗선 = 위 안전 여백과 판 윗선의 가운데
  if (pos.S) { const s = pos.S; ck.style.left = (s.x + (s.w - T.w) / 2) + 'px'; ck.style.top = topB + 'px'; inf.style.left = s.x + 'px'; inf.style.top = (topB + T.h + 36) + 'px'; }
  if (pos.I) { inf.style.left = pos.I.x + 'px'; inf.style.top = topB + 'px'; }
  { const it = parseFloat(inf.style.top); fold(inf, () => it + box([inf]).h > 975); }
}
