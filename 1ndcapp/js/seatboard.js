// 자리판 — 폰 앱 SeatBoard 그대로. 원형·사각 칸 좌표에 사람을 놓고(규칙 계산 없음 — 사각 칸 배치는 코어가 준다),
// 준비 중엔 끌어서 «사이로 끼워 넣기»(놓을 때만 코어 명령 한 번), 투표는 문질러 고르기, 지명은 화살표.
import { html, useState, useEffect, useRef, useLayoutEffect } from '../lib/preact-htm.js';
import { Icon } from './icons.js';
import { store } from './store.js';
import { settings } from './settings.js';
import { RoleArt, cx } from './ui.js';

const buzz = ms => { if (settings.get('haptics') && navigator.vibrate) try { navigator.vibrate(ms); } catch {} };
const hyp = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function evenOnEllipse(n, c, rx, ry) {   // 타원은 둘레 길이로 고르게 — 각도로 나누면 위·아래 끝에 몰린다
  const m = 720, pt = k => { const a = -Math.PI / 2 + k / m * 2 * Math.PI; return { x: c.x + rx * Math.cos(a), y: c.y + ry * Math.sin(a) }; };
  const cum = [0]; for (let k = 1; k <= m; k++) cum.push(cum[k - 1] + hyp(pt(k), pt(k - 1)));
  return Array.from({ length: n }, (_, i) => { const t = cum[m] * i / n; const k = cum.findIndex(v => v >= t); return pt(Math.max(0, k)); });
}
/** 끼워 넣기 순열 — 코어 seat.move 와 같은 규칙 */
export function moved(k, a, b, n, dir) {
  if (!n || a === b) return k;
  if (k === a) return b;
  const d = (b - a + n) % n, fwd = dir ?? (d <= n - d), x = (k - a + n) % n;
  const between = fwd ? (x > 0 && x <= d) : (x >= d && x < n);
  return between ? (fwd ? (k - 1 + n) % n : (k + 1) % n) : k;
}
function boardHeight(board, w, maxH) {
  const roundH = w > 0 ? Math.max(300, Math.min(w - 16, 460)) : 300, n = board.seats.length;
  const nat = board.shape === 'round' ? (n > 12 ? Math.min(680, Math.max(roundH, 300 + (n - 12) * 46)) : roundH) : Math.max(board.rows, 1) * 88 + 24;
  return Math.min(nat, maxH || Infinity);
}
function layout(board, w, h) {
  const n = board.seats.length;
  if (board.shape === 'round' || !board.cells.length) {
    const c = { x: w / 2, y: h / 2 }, big = n > 12;
    const rx = big ? w / 2 - 38 : Math.min(w, h) / 2 - 44, ry = big ? h / 2 - 44 : rx;
    const pts = big ? evenOnEllipse(n, c, rx, ry) : Array.from({ length: n }, (_, i) => { const a = -Math.PI / 2 + i / Math.max(n, 1) * 2 * Math.PI; return { x: c.x + rx * Math.cos(a), y: c.y + ry * Math.sin(a) }; });
    return { slots: pts, gaps: [], center: c, rx, ry, w, h, round: true };
  }
  const cw = Math.min(80, (w - 24) / Math.max(board.cols, 1)), ch = 88;
  const x0 = (w - cw * board.cols) / 2 + cw / 2, y0 = 12 + ch / 2;
  const pt = c => ({ x: x0 + c.col * cw, y: y0 + c.row * ch });
  const slots = board.seats.map(s => { const c = board.cells.find(c => c.seatID === s.id); return c ? pt(c) : { x: 0, y: 0 }; });
  const gaps = board.cells.filter(c => !c.seatID).map(c => ({ cell: c.id, p: pt(c) }));
  return { slots, gaps, center: { x: w / 2, y: h / 2 }, w, h, round: false };
}

export function boardLayout(board, w) { const h = boardHeight(board, w); return { h, L: layout(board, w, h) }; }

/**
 * props: board, picked[], enabled(Set|null), me, numbered, tints{id:'gray'|'red'}, publicView, allies(Set), rings{id:'blue'|'red'},
 * shownOnly(Set|null), center(vnode), centerHint, arrow{from,to}, maxHeight, draggable, move(from,to,dir), moveGap(cell,mine), sweep(id,on), onTap(id)
 */
export function SeatBoard(p) {
  const { board } = p;
  const box = useRef(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(e => setW(Math.round(e[0].contentRect.width))); ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const h = boardHeight(board, w, p.maxHeight);
  const L = w ? layout(board, w, h) : null;
  const canDrag = !!p.draggable && board.canRearrange;
  const [drag, setDrag] = useState(null);     // {from, dx, dy, target, outside, steps}
  const [pending, setPending] = useState(null);
  const [landed, setLanded] = useState(null);
  const sweepRef = useRef({ mode: null, seen: new Set() });
  const ids = board.seats.map(s => s.id).join('|');
  useEffect(() => { setPending(null); setDrag(null); }, [ids]);   // 코어가 새 순서를 주는 순간 걷는다
  useEffect(() => { const h = () => setDrag(null); document.addEventListener('visibilitychange', h); return () => document.removeEventListener('visibilitychange', h); }, []);

  const n = board.seats.length;
  const preview = k => {
    if (drag) return moved(k, drag.from, drag.target, n, drag.steps === 0 ? undefined : drag.steps > 0);
    if (pending) { const i = pending.indexOf(board.seats[k].id); if (i >= 0) return i; }
    return k;
  };
  const inside = q => q.x > -16 && q.y > -16 && q.x < L.w + 16 && q.y < L.h + 16;
  const target = (q, from, last) => {
    if (!inside(q)) return from;
    const cur = last ?? from; let best = cur, bd = Infinity;
    L.slots.forEach((s, i) => { const d = hyp(s, q); if (d < bd) { bd = d; best = i; } });
    return bd + 18 < hyp(L.slots[cur], q) ? best : cur;   // 흔들림 방지 — 새 칸이 확실히 가까울 때만
  };
  const local = e => { const r = box.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  // 끌기 — 누르는 즉시 반응, 6px 넘게 움직이면 들어 올림
  const dragStart = (k, e) => {
    if (!canDrag || pending) return;
    e.preventDefault();
    const el = e.currentTarget; el.setPointerCapture && el.setPointerCapture(e.pointerId);
    const o = local(e); let d = null;
    const mv = ev => {
      const q = local(ev), dx = q.x - o.x, dy = q.y - o.y;
      if (!d && Math.hypot(dx, dy) <= 6) return;
      const pos = { x: L.slots[k].x + dx, y: L.slots[k].y + dy };
      const t = target(pos, k, d && d.target);
      let steps = d ? d.steps : 0;
      if (d && t !== d.target) { const f = (t - d.target + n) % n; steps += f <= n - f ? f : -(n - f); if (t !== k) buzz(5); }
      if (t === k) steps = 0;
      if (!d) buzz(10);
      d = { from: k, dx, dy, target: t, outside: !inside(pos), steps }; setDrag(d);
    };
    const up = ev => {
      el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', cancel);
      if (!d) { if (p.onTap) p.onTap(board.seats[k].id); return; }
      const q = local(ev), pos = { x: L.slots[k].x + (q.x - o.x), y: L.slots[k].y + (q.y - o.y) };
      const gap = L.gaps.find(g => hyp(g.p, pos) < 30), mine = board.cells.find(c => c.seatID === board.seats[k].id);
      if (gap && mine) { setDrag(null); p.moveGap && p.moveGap(gap.cell, mine.id); return; }
      const t = d.outside ? k : d.target, dir = d.steps === 0 ? undefined : d.steps > 0;
      if (t !== k) {
        const order = board.seats.map(s => s.id), next = order.slice();
        order.forEach((id, j) => { next[moved(j, k, t, n, dir)] = id; });
        setPending(next); buzz(8); p.move && p.move(k, t, dir);
        setTimeout(() => setPending(null), 3000);   // 거부됐을 때만 쓰이는 안전망
      }
      setLanded(board.seats[k].id); setTimeout(() => setLanded(null), 200);
      setDrag(null);
    };
    const cancel = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', cancel); setDrag(null); };
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', cancel);
  };

  // 문질러 고르기 — 처음 닿은 사람이 고르기/풀기를 정하고, 같은 문지르기에서 한 번씩만
  const sweepAt = e => {
    if (!p.sweep || !L) return;
    const q = local(e); let k = -1, bd = Infinity;
    L.slots.forEach((s, i) => { const d = hyp(s, q); if (d < bd) { bd = d; k = i; } });
    if (k < 0 || bd >= 34) return;
    const s = board.seats[k], S = sweepRef.current; if (!s || S.seen.has(s.id)) return;
    if (p.enabled && !p.enabled.has(s.id)) return;
    const picked = (p.picked || []).includes(s.id);
    if (S.mode === null) S.mode = !picked;
    S.seen.add(s.id);
    if (picked !== S.mode) { p.sweep(s.id, S.mode); buzz(4); }
  };
  const sweepHandlers = p.sweep ? {
    onPointerDown: e => { e.preventDefault(); e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId); sweepRef.current = { mode: null, seen: new Set() }; sweepAt(e); },
    onPointerMove: e => { if (sweepRef.current.mode !== null || e.buttons) sweepAt(e); },
    onPointerUp: () => { sweepRef.current = { mode: null, seen: new Set() }; },
    onPointerCancel: () => { sweepRef.current = { mode: null, seen: new Set() }; },
  } : {};

  const seat = (s, k) => {
    const lifted = drag && drag.from === k;
    const base = L.slots[preview(k)] || L.slots[k];
    const pos = lifted ? { x: L.slots[k].x + drag.dx, y: L.slots[k].y + drag.dy } : base;
    const number = (drag || pending) ? preview(k) + 1 : s.number;
    const tint = p.tints && p.tints[s.id];
    const on = (p.picked || []).includes(s.id) || !!tint;
    const off = p.enabled ? !p.enabled.has(s.id) : false;
    const order = p.numbered !== false && (p.picked || []).length > 1 ? (p.picked.indexOf(s.id) + 1 || null) : null;
    const mine = p.me === s.id, ally = p.allies && p.allies.has(s.id);
    const dead = s.dead && !(p.publicView && s.tonight), tk = s.tokens || [];
    const bare = p.shownOnly ? !p.shownOnly.has(s.id) : false;
    const edge = lifted && !drag.outside ? 'blue' : ally ? 'red' : on ? (tint || 'blue') : mine ? 'orange' : (p.rings && p.rings[s.id]) || null;
    const faceCls = cx('face', on && 'on', on && tint && 'tint-' + tint, (dead || bare) && !on && 'dim', edge && 'edge-' + edge);
    const label = [`${number}번 ${s.name}`, mine && '내 자리', ally && '같은 편', p.publicView ? (dead ? '사망' : null) : (s.status && s.status !== '생존' ? s.status : null)].filter(Boolean).join(', ');
    const interactive = canDrag ? { onPointerDown: e => dragStart(k, e) }
      : p.sweep ? {} : { onClick: () => { if (off) return; p.onTap && p.onTap(s.id); } };
    const Tag = p.sweep ? 'div' : 'button';
    return html`<${Tag} key=${s.id} class=${cx('seat', lifted && 'lifted', landed === s.id && 'landed', lifted && drag.outside && 'outside', off && !mine && 'off', canDrag && 'grab')}
      style=${`transform:translate(${pos.x - 32}px,${pos.y - 32}px)`} aria-label=${label} aria-pressed=${on} disabled=${Tag === 'button' && off && !mine && !canDrag}
      ...${interactive}>
      <span class=${faceCls}>${p.roles && s.role && !bare ? html`<span class="face-art"><${RoleArt} r=${store.artOf ? store.artOf(s.role) : s.role} size=${44} /></span><span class="no-b">${number}</span>` : bare ? '' : number}
        ${dead && html`<span class="dead-b"><${Icon} name=${s.ghost ? 'hand' : 'xmark'} size=${9} stroke=${3.2} /></span>`}
        ${mine && html`<span class="me-b"><${Icon} name="person" size=${10} fill=${true} stroke=${0} /></span>`}
        ${order ? html`<span class="ord-b">${order}</span>` : on && !tint && html`<span class="chk-b"><${Icon} name="checkCircle" size=${17} /></span>`}
      </span>
      ${!bare && html`<span class=${cx('nm', mine && 'mine', dead && 'dead', p.roles && s.evil && 'evil')}>${p.roles && s.role ? html`${s.role}<small>${s.name}</small>${tk.length > 0 && html`<small class="tk2">${tk.length > 1 ? `${tk[0]} +${tk.length - 1}` : tk[0]}</small>`}` : s.name}</span>`}
      ${!bare && !p.roles && !p.publicView && tk.length > 0 && html`<span class="tk">${tk.length > 1 ? `${tk[0]} +${tk.length - 1}` : tk[0]}</span>`}
    </${Tag}>`;
  };

  let arrow = null;
  if (L && p.arrow) {
    const i = board.seats.findIndex(s => s.id === p.arrow.from), j = board.seats.findIndex(s => s.id === p.arrow.to);
    if (i >= 0 && j >= 0 && i !== j) arrow = html`<${NomArrow} key=${p.arrow.from + '>' + p.arrow.to} from=${L.slots[i]} to=${L.slots[j]} hub=${L.center} w=${L.w} h=${L.h} />`;
  }
  return html`<div class=${cx('board', p.sweep && 'sweep')} ref=${box} style=${`height:${h}px`} ...${sweepHandlers}>
    ${L && L.round && html`<div class="ring" style=${`left:${L.center.x - L.rx}px;top:${L.center.y - L.ry}px;width:${L.rx * 2}px;height:${L.ry * 2}px`}></div>`}
    ${L && html`<div class="bcenter" style=${`left:${L.center.x}px;top:${L.center.y}px`}>${p.center !== undefined ? p.center : (L.round ? html`<b class="count">${n}명</b>${p.centerHint && html`<span class="sub">${p.centerHint}</span>`}` : null)}</div>`}
    ${L && L.gaps.map(g => html`<span class="gap" key=${'g' + g.cell} style=${`transform:translate(${g.p.x - 22}px,${g.p.y - 22}px)`} aria-label="빈자리"></span>`)}
    ${L && board.seats.map(seat)}
    ${arrow}
  </div>`;
}

/** 지명 화살표 — 지명한 사람 원에서 빛이 판 가운데 쪽으로 휘어 날아가고, 닿으면 빨간 파문·화살촉 */
function NomArrow({ from, to, hub, w, h }) {
  const len = hyp(from, to), m = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  let nx = -(to.y - from.y) / Math.max(len, 1), ny = (to.x - from.x) / Math.max(len, 1);
  const close = len < 170;
  if (close ? ny > 0 : (hub.x - m.x) * nx + (hub.y - m.y) * ny < 0) { nx = -nx; ny = -ny; }
  const k = len * 0.22 + 150 * Math.exp(-len / 140), c = { x: m.x + nx * k, y: m.y + ny * k };
  const P = t => { const u = 1 - t; return { x: u * u * from.x + 2 * u * t * c.x + t * t * to.x, y: u * u * from.y + 2 * u * t * c.y + t * t * to.y }; };
  const edgeT = (r, atEnd) => { const o = atEnd ? to : from; let lo = 0, hi = 1; for (let i = 0; i < 20; i++) { const mid = (lo + hi) / 2, far = hyp(P(mid), o) > r; if (atEnd === far) lo = mid; else hi = mid; } return atEnd ? lo : hi; };
  const tail = edgeT(24, false), head = edgeT(28, true);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [t, setT] = useState(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) return;
    let raf, t0 = performance.now();
    const ease = x => { const a = 1 - x; return 1 - a * a * a; };   // 튀어나가 빠르게, 닿을 때 부드럽게
    const step = now => { const x = Math.min(1, (now - t0) / 550); setT(ease(x)); if (x < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  }, []);
  const seg = [], N = 40, a = tail, b = Math.max(tail, Math.min(t, head));
  for (let i = 0; i <= N; i++) { const q = P(a + (b - a) * i / N); seg.push(`${i ? 'L' : 'M'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`); }
  const landed = t >= 1;
  const hp = P(head), hq = P(Math.max(0, head - 0.02)), dx = hp.x - hq.x, dy = hp.y - hq.y, l = Math.max(Math.hypot(dx, dy), 0.001), ux = dx / l, uy = dy / l;
  const back = { x: hp.x - ux * 13, y: hp.y - uy * 13 };
  const comet = P(t), r = 5 + 3 * Math.sin(Math.PI * t);
  return html`<svg class="arrow" width=${w} height=${h} aria-hidden="true">
    <defs><linearGradient id="nomg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="rgba(142,142,147,.7)" /><stop offset="1" stop-color="var(--red)" /></linearGradient></defs>
    <path d=${seg.join('')} fill="none" stroke="url(#nomg)" stroke-width="3.5" stroke-linecap="round" />
    ${!landed && html`<circle cx=${comet.x} cy=${comet.y} r=${r} fill="var(--red)" class="comet" />`}
    ${landed && html`<circle cx=${to.x} cy=${to.y} r="22" class="ripple" />`}
    ${landed && html`<path class="head" d=${`M${hp.x} ${hp.y}L${back.x - uy * 7.5} ${back.y + ux * 7.5}L${back.x + uy * 7.5} ${back.y - ux * 7.5}Z`} fill="var(--red)" />`}
  </svg>`;
}

/** 자리+직업 알려 주기 — 블러프·«이 사람은 이 직업» 답. 보여 줄 자리만 번호·이름, 나머지는 옅은 회색 동그라미 */
/** 직업 그림 묶음(블러프·답 직업) — 판 가운데에 */
export function RolesCluster({ roles, big }) {
  const rows = []; for (let i = 0; i < roles.length; i += 2) rows.push(roles.slice(i, i + 2));
  return html`<div class="rv-cluster">${rows.map(r => html`<div class="rv-row">${r.map(n => html`<div class=${cx('rv-item', big && 'big')}><${RoleArt} r=${n} size=${big ? 46 : 36} /><span>${n}</span></div>`)}</div>`)}</div>`;
}
/** 진행자 전체 판(2026-10-01 햇살님) — 자리마다 직업·표식, 가운데 블러프. 스파이 공개도 같은 판(참가자 몫만 담은 rows 로) */
export function HostBoard({ board, rows, bluffs, me, meTint, onTap }) {
  const b = rows ? { ...board, seats: board.seats.map(s => { const r = rows.find(x => x.number === s.number); return r ? { ...s, role: r.role, evil: r.evil, dead: r.dead, tokens: r.tokens } : { ...s, role: null, tokens: [] }; }) } : board;
  const bl = bluffs || b.bluffs || [];
  const id = i => { const x = b.seats.find(s => s.index === i); return x ? x.id : null; };
  return html`<div class=${cx('reveal', meTint && 'me-tint')}><div class=${onTap ? '' : 'nohit'}><${SeatBoard} board=${b} roles=${true} me=${id(me)} onTap=${onTap}
    center=${bl.length ? html`<div class="bluff-c"><div class="sub">블러프</div><${RolesCluster} roles=${bl} big=${false} /></div>` : undefined} /></div></div>`;
}
export function RevealBoard({ roles, shown = [], me, allies = [], title, side, meTint }) {
  const b = store.board;
  const id = i => { const s = b.seats.find(s => s.index === i); return s ? s.id : null; };
  const round = b.shape === 'round' || !b.cells.length;
  const inCenter = round || (b.rows - 2 >= 2 && b.cols - 2 >= 2);
  const big = round && inCenter;
  const rows = []; for (let i = 0; i < roles.length; i += 2) rows.push(roles.slice(i, i + 2));
  const cluster = html`<div class="rv-cluster">${rows.map(r => html`<div class="rv-row">${r.map(n => html`<div class=${cx('rv-item', big && 'big')}><${RoleArt} r=${n} size=${big ? 46 : 36} /><span>${n}</span></div>`)}</div>`)}</div>`;
  const shownIds = new Set(shown.map(id).filter(Boolean)); if (meTint && id(me)) shownIds.add(id(me));   // 보는 사람 자리는 번호·이름도 같이
  const rings = {}; if (side) shownIds.forEach(x => { rings[x] = side === 'evil' ? 'red' : 'blue'; });
  return html`<div class=${cx('reveal', meTint && 'me-tint')}>
    ${title && html`<div class="rv-title">${title}</div>`}
    ${!inCenter && roles.length > 0 && cluster}
    <div class="nohit"><${SeatBoard} board=${b} me=${id(me)} publicView=${true} allies=${new Set(allies.map(id).filter(Boolean))} rings=${rings}
      shownOnly=${shownIds} center=${inCenter && roles.length ? cluster : undefined} /></div>
  </div>`;
}
export function BluffBoard({ bluffs }) {
  const st = store.stage || {}, d = st.bluffDemon, al = st.bluffAllies || [];
  return html`<${RevealBoard} roles=${bluffs} shown=${[d].filter(x => x !== null && x !== undefined).concat(al)} me=${d} allies=${al} title="블러프" />`;
}
