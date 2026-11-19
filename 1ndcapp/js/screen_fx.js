/* 큰 화면 결과 연출(2026-11-20, 아이폰 ResultShow.swift 를 웹으로 — 같은 시간표·같은 사건 찾기). 받은 공개 정보만 본다, 처음 받은 판은 지난 일이라 안 튼다.
   자리표(v5 진짜 자리판)에서 그 자리를 확대 → 어두워지며 자리 동그라미가 연출로 → 큰 이름 → 자리표로 → 밝아지며 가운데 결과 글자.
   사인별: 밤 = 피 · 처형 = 불 · 낮(특수 규칙) = 숨(넋) · 여러 명 = 죽은 자리만 들어 올려 엇갈려 피 · 처형했는데 안 죽음 = 막음 · 돌아온 사람 = 되살아남 · 판 끝 = 이긴 편 글자(어둡게 안 함)
   쏘기 — 진행자 폰이 보낸 fx {k:'slay', by, target, hit}(screen_slay.js 가 넘김): 쏜 사람 → 맞는 사람, 맞으면 숨·명중, 빗나가면 비껴감·빗나감.
   판은 drawV5 가 그린 것을 그대로 쓰고(#bw 에 카메라 변형만 얹음), 연출 원·글자는 위 캔버스에 그린다. 소리는 큰 화면 소리를 켰을 때만(웹 오디오로 합성) */
import { narrTr, appTr } from './i18n_dom.js';
const T = w => { const a = appTr(w); return a !== w ? a : narrTr(w); };   // 결과 글자는 아이폰 카탈로그 말 먼저, 없으면 진행·코어 말

const FONT = '-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif';
const c01 = x => Math.min(Math.max(x, 0), 1), seg = (t, a, b) => c01((t - a) / (b - a));
const eio = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2, eout = x => 1 - Math.pow(1 - x, 3), ein = x => x * x * x;
const spr = x => x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.exp(-6 * x) * Math.cos(8 * x), lerp = (a, b, k) => a + (b - a) * k;
const lp = (a, b, k) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });
const hex = h => [(h >> 16) & 255, (h >> 8) & 255, h & 255], mix = (a, b, k) => hex(a).map((v, i) => Math.round(lerp(v, hex(b)[i], k)));
const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`, dark = c => c.map(v => Math.max(0, v - 71));   // SwiftUI brightness(-0.28) 와 같게
const ASH = 0x4A4D57, SEATC = 0xF2F3F5, FIRE = 0xFF7442, BLOOD = 0xE3263B, PINK = 0xFF4D6A, SHIELD = 0x5AA9FF, MINT = 0x7CE0B0, SHOT = 0xFFD66B, INK = 0x1C1C1E;

let epoch, seen = new Set(), lastDead = {}, last = null, queue = [], cur = null, layer = null, raf = 0, serial = 0, slayAt = 0;
const LEN = s => s.kind === 'shot' ? (s.hit ? 8 : 6.4) : 7.8;

/* ── 사건 찾기(아이폰 ResultShow.feed 와 같음) ── */
export function resultFeed(p) {
  if (!p) return;
  const fresh = p.gameEpoch !== epoch; if (fresh) { epoch = p.gameEpoch; seen = new Set(); lastDead = {}; queue = []; stop(); }
  last = p; const ep = p.gameEpoch || '', found = [], mk = (kind, targets, o = {}) => ({ id: ++serial, kind, targets, ...o });
  const m = p.morningAnnouncement;
  if (m) { if ((m.deaths || []).length) found.push(['m:' + ep + ':' + m.id, mk(m.deaths.length > 1 ? 'multi' : 'night', m.deaths)]);
    (m.revivals || []).forEach(r => found.push(['r:' + ep + ':' + m.id + ':' + r, mk('revive', [r])])); }
  let execT = null;
  if (p.scene === 'execution' && p.execution) { const e = p.execution; execT = e.targetId; const s = p.seats.find(x => x.id === e.targetId);
    found.push(['x:' + ep + ':' + (p.dayNumber || 0) + ':' + e.targetId, mk(e.died ? 'exec' : 'block', [e.targetId], { reveal: e.died && s ? s.reveal : null })]); }
  const slayRecent = Date.now() - slayAt < 25000;
  p.seats.forEach(s => { if (s.dead && s.cause === 'day' && lastDead[s.id] === false && s.id !== execT && !slayRecent) found.push(['d:' + ep + ':' + s.id, mk('special', [s.id])]); });
  if (p.scene === 'ended' && p.ending && p.ending.kind === 'completed' && p.ending.winnerLabel) found.push(['e:' + ep, mk('win', [], { label: p.ending.winnerLabel })]);
  p.seats.forEach(s => { lastDead[s.id] = !!s.dead; });
  const fresh2 = found.filter(f => !seen.has(f[0])); fresh2.forEach(f => seen.add(f[0]));
  if (fresh) return;
  queue.push(...fresh2.map(f => f[1])); next();
}
/* 쏘기 — 자리 글은 «번호  이름» 꼴이라 번호로 자리를 찾는다 */
export function resultShot(fx) {
  slayAt = Date.now(); const p = last; if (!p) return false;
  const sid = t => { const n = parseInt(String(t || '').trim(), 10); const s = p.seats.find(x => x.number === n); return s && s.id; };
  const b = sid(fx.by), t = sid(fx.target); if (!b || !t) return false;
  queue.push({ id: ++serial, kind: 'shot', targets: [t], by: b, hit: !!fx.hit }); next(); return true;
}
function next() {
  if (cur || !queue.length) return;
  cur = Object.assign(queue.shift(), { t0: performance.now() });
  sound(cur);
  if (!layer) { layer = document.createElement('canvas'); layer.setAttribute('aria-hidden', 'true'); Object.assign(layer.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: '9000', pointerEvents: 'none' }); document.body.appendChild(layer); }
  cancelAnimationFrame(raf); raf = requestAnimationFrame(step);
}
function stop() { cancelAnimationFrame(raf); restore(); if (layer) layer.remove(); layer = null; cur = null; }
function step(now) {
  const s = cur; if (!s) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, t = reduce ? 6 : (now - s.t0) / 1000;
  if (t >= LEN(s)) { restore(); cur = null; if (queue.length) next(); else { if (layer) layer.remove(); layer = null; } return; }
  try { frame(s, reduce ? Math.max(t, LEN(s) - 1.8) : t); } catch (e) { (globalThis.드러냄 || (() => {}))('screen_fx.frame', e); }
  raf = requestAnimationFrame(step);
}

/* ── 판 읽기 — drawV5 가 그린 자리(#bw 안 .st) 위치를 무대 좌표(1080 높이)로 ── */
let saved = null;   // { bw, tf, origin } — 카메라를 얹기 전 판 변형
function board() {
  const host = document.getElementById('v5'), tv = host && !host.hidden && host.querySelector('.v5tv'), bw = tv && tv.querySelector('#bw'); if (!bw) return null;
  if (!saved || saved.bw !== bw) { restore(); saved = { bw, tf: bw.style.transform || '', origin: bw.style.transformOrigin || '0px 0px' }; }
  const m = /translate\(([-\d.e]+)px,\s*([-\d.e]+)px\)\s*scale\(([-\d.e]+)\)/.exec(saved.tf), o = saved.origin.split(' ').map(parseFloat);
  const tx = m ? +m[1] : 0, ty = m ? +m[2] : 0, bk = m ? +m[3] : 1, O = { x: o[0] || 0, y: o[1] || 0 };
  const map0 = q => ({ x: O.x + (q.x - O.x) * bk + tx, y: O.y + (q.y - O.y) * bk + ty });
  const seats = [...bw.querySelectorAll('.st:not(.gp)')], labels = [...bw.querySelectorAll('.lb')];
  const pts = seats.map(e => map0({ x: parseFloat(e.style.left), y: parseFloat(e.style.top) }));
  const R = tv.getBoundingClientRect(), k = R.height / 1080, d = (seats[0] ? parseFloat(seats[0].style.width) : 80) * bk;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; pts.forEach(q => { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); });
  return { tv, bw, seats, labels, pts, O, tx, ty, bk, d, k, R, C: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, mid: bw.querySelector('.mid'), ld: [...bw.querySelectorAll('.ld')], W: R.width / k };
}
function restore() {
  if (!saved) return; const { bw } = saved; bw.style.transform = saved.tf; bw.style.transformOrigin = saved.origin;
  bw.querySelectorAll('.st,.lb,.ld,.mid').forEach(e => { e.style.opacity = ''; }); saved = null;
}
/* 카메라 — 판 점 q 가 무대 C + (q − Q)·z 로. #bw 변형을 원점 0 으로 바꿔 한 번에 */
function camera(B, Q, z) {
  const T = { x: B.C.x + (B.O.x + B.tx - Q.x) * z - B.O.x * B.bk * z, y: B.C.y + (B.O.y + B.ty - Q.y) * z - B.O.y * B.bk * z };
  B.bw.style.transformOrigin = '0px 0px'; B.bw.style.transform = `translate(${T.x}px,${T.y}px) scale(${B.bk * z})`;
}

/* ── 한 장면 ── */
function frame(s, t) {
  const B = board(), dpr = window.devicePixelRatio || 1, W = innerWidth, H = innerHeight;
  if (layer.width !== Math.round(W * dpr)) { layer.width = Math.round(W * dpr); layer.height = Math.round(H * dpr); }
  const g = layer.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  if (!B) return;   // v5 가 아닌 장면 — 그리지 않는다
  const p = last, idx = id => p.seats.findIndex(x => x.id === id), P = B.pts[idx(s.targets[0])] || B.C, S = s.by ? B.pts[idx(s.by)] || B.C : null, d = B.d;
  const toScr = q => ({ x: B.R.left + q.x * B.k, y: B.R.top + q.y * B.k }), U = 10.8 * B.k;   // 무대 → 화면
  let Q = B.C, z = 1, m = 0, darkK = eio(seg(t, .3, 1)) * (1 - eio(seg(t, 5, 5.6))), hide = new Set();
  const fin = s.hit ? 5.2 : 3.6;
  if (s.kind === 'shot') {
    const zb = Math.min(2.4, Math.max(1, 900 / (Math.hypot(P.x - S.x, P.y - S.y) + 2.6 * d))), a = eio(seg(t, .6, 1.4)), b = s.hit ? eio(seg(t, 2.5, 3.2)) : 0, o = eio(seg(t, fin, fin + .8));
    Q = lp(lp(lp(B.C, lp(S, P, .5), a), P, b), B.C, o); z = lerp(lerp(lerp(1, zb, a), 216 / d, b), 1, o); m = b * (1 - o);
    darkK = eio(seg(t, .3, 1)) * (1 - eio(seg(t, fin + .3, fin + .8)));
    if (t >= .3 && t < fin + .9) { hide.add(s.targets[0]); hide.add(s.by); } if (s.hit && t >= .3) hide.add(s.targets[0]);
  } else if (s.kind === 'multi') { if (t >= .6 && t < 4.6) s.targets.forEach(x => hide.add(x)); }
  else if (s.kind === 'win') darkK = 0;
  else { m = eio(seg(t, .6, 1.4)) * (1 - eio(seg(t, 4.7, 5.5))); z = lerp(1, 216 / d, m); Q = lp(B.C, P, m); if (t >= 1.4 && t < 4.7) hide.add(s.targets[0]); }
  camera(B, Q, z);
  const map = q => ({ x: B.C.x + (q.x - Q.x) * z, y: B.C.y + (q.y - Q.y) * z });
  B.seats.forEach((e, i) => { e.style.opacity = hide.has(p.seats[i] && p.seats[i].id) ? '0' : ''; });
  B.labels.forEach((e, i) => { e.style.opacity = hide.has(p.seats[i] && p.seats[i].id) ? '0' : String(1 - m); });
  B.ld.forEach(e => { e.style.opacity = String(1 - m); }); if (B.mid) B.mid.style.opacity = '0';
  // 어둠
  if (darkK > 0) { g.fillStyle = `rgba(0,0,0,${.9 * darkK})`; g.fillRect(0, 0, W, H); }
  const nameOf = id => { const x = p.seats.find(q => q.id === id); return x ? (x.name || String(x.number)) : ''; };
  const dying = ['night', 'exec', 'special'].includes(s.kind);
  if (s.kind === 'shot') shotLayer(g, s, t, B, P, S, z, map, toScr, U, nameOf, fin);
  else if (s.kind === 'multi') {
    const lift = lerp(1, multiLift(s.targets.map(id => B.pts[idx(id)]).filter(Boolean), d), spr(seg(t, .6, 1.3)) * (1 - eio(seg(t, 4.6, 5.3))));
    s.targets.forEach((id, o) => { const q = B.pts[idx(id)]; if (!q || t < .6 || t >= 4.6) return; const lt = t - 1.2 - o * .35, c = toScr(q), u = d * lift / 20 * B.k;
      if (lt < 0) slab(g, c.x, c.y, 10 * u, hex(SEATC), 1.4 * u); else { const ao = seg(lt, 2.4, 2.55); g.globalAlpha = 1 - ao; blood(g, c.x, c.y, u, lt); g.globalAlpha = ao; slab(g, c.x, c.y, 10 * u * lerp(.92, .6, spr(seg(lt, 2.4, 2.75))), hex(ASH), 1.4 * u); g.globalAlpha = 1; } });
  } else if (s.kind !== 'win' && t >= 1.4 && t < 4.7) {
    const lt = t - 1.4, c = toScr(map(P)), u = d * z / 20 * B.k, ao = dying ? seg(t, 4.4, 4.55) : 0;
    g.globalAlpha = 1 - ao;
    ({ night: blood, exec: fire, special: breath, block: block, revive: revive })[s.kind](g, c.x, c.y, u, lt);
    g.globalAlpha = 1;
    if (dying && ao > 0) { g.globalAlpha = ao; slab(g, c.x, c.y, 10 * u * lerp(s.kind === 'exec' ? .15 : s.kind === 'night' ? .92 : 1, .6, spr(seg(t, 4.4, 4.75))), hex(ASH), 1.4 * u); g.globalAlpha = 1; }
    const n = eout(seg(t, 3.5, 4)) * (1 - seg(t, 4.4, 4.7)), cc = toScr(B.C);
    text(g, nameOf(s.targets[0]), cc.x, cc.y + 27 * U + (1 - n) * 2 * U, 10 * U, 600, [255, 255, 255], .9 * n, W * .8);
  }
  endText(g, s, t, toScr(B.C), U, nameOf, darkK, fin, B);
}
function multiLift(q, d) { let m = Infinity; for (let i = 0; i < q.length; i++) for (let j = i + 1; j < q.length; j++) m = Math.min(m, Math.hypot(q[i].x - q[j].x, q[i].y - q[j].y)); return isFinite(m) ? Math.max(1.3, Math.min(2.4, m * .9 / Math.max(d, 1))) : 2.4; }

/* ── 그리기 조각(지름 20u 원 기준, 사건 순간 2.0) ── */
function slab(g, x, y, r, c, depth) { if (r <= 0) return; g.fillStyle = css(dark(c), g.globalAlpha); circle(g, x, y + depth, r); g.fillStyle = css(c, g.globalAlpha); circle(g, x, y, r); }
function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0, r), 0, Math.PI * 2); g.fill(); }
function ring(g, x, y, r, c, lw, a) { if (a <= .001 || r <= 0) return; g.strokeStyle = css(c, a * g.globalAlpha); g.lineWidth = lw; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); }
function shadow(g, x, y, w, u, k) { if (k <= 0) return; g.save(); g.filter = `blur(${1.2 * u}px)`; g.fillStyle = `rgba(0,0,0,${.5 * k * g.globalAlpha})`; g.beginPath(); g.ellipse(x, y, w / 2, w * .08, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
function glow(g, x, y, r, c, a, u) { if (a <= .001) return; g.save(); g.filter = `blur(${6 * u}px)`; g.fillStyle = css(c, a * g.globalAlpha); circle(g, x, y, r); g.restore(); }
function fire(g, x, y, u, t) { const warm = eio(seg(t, 0, .5)), s = lerp(1, .15, eio(seg(t, .7, 1.9))), gl = warm * (1 - seg(t, 1.2, 1.9)) * (.75 + .25 * Math.sin(t * 9));
  shadow(g, x, y + 12 * u, 20 * u * s, u, 1); glow(g, x, y, 15 * u * s, hex(FIRE), gl * .6, u);
  slab(g, x, y, 10 * u * s, seg(t, 1.4, 2) > 0 ? mix(FIRE, ASH, seg(t, 1.4, 2)) : mix(SEATC, FIRE, warm), 1.4 * u * s); }
function blood(g, x, y, u, t) { const f = ein(seg(t, .05, .5)), hit = t >= .5, red = eio(seg(t, .5, .7)), sq = hit ? Math.sin(Math.PI * seg(t, .5, .8)) * .1 : 0, r = eout(seg(t, .5, 1.6)), sc = lerp(1, .92, seg(t, 1.4, 2));
  shadow(g, x, y + 12 * u, 20 * u, u, 1);
  g.save(); g.translate(x, y + 10 * u * sc); g.scale((1 + sq) * sc, (1 - sq) * sc); slab(g, 0, -10 * u, 10 * u, seg(t, 1.4, 2) > 0 ? mix(BLOOD, ASH, seg(t, 1.4, 2)) : mix(SEATC, BLOOD, red), 1.4 * u); g.restore();
  if (hit) ring(g, x, y, 10 * u * (1 + r * 2.2), hex(BLOOD), .35 * u, 1 - r);
  if (!hit && t > 0) { g.save(); g.translate(x, y + lerp(-55 * u, -11 * u, f)); g.scale(1 - f * .15, 1 + f * .3); slab(g, 0, 0, 2 * u, hex(BLOOD), .5 * u); g.restore(); } }
function breath(g, x, y, u, t) { const beats = [[.3, 1], [.85, .6], [1.3, .3], [1.6, .12]], pulse = beats.reduce((a, b) => { const q = t - b[0]; return a + (q < 0 || q > .4 ? 0 : b[1] * Math.pow(Math.sin(Math.PI * q / .4), 2)); }, 0);
  const pink = eio(seg(t, 0, .3)), cool = eio(seg(t, 1.6, 2)), r = eio(seg(t, 1.9, 3.3));
  shadow(g, x, y + 12 * u, 20 * u, u, 1); slab(g, x, y, 10 * u * (1 + .14 * pulse), cool > 0 ? mix(PINK, ASH, cool) : mix(SEATC, PINK, pink), 1.4 * u);
  if (r > 0) ring(g, x, y - r * 34 * u, 10 * u * (1 + r * .25), [255, 255, 255], .35 * u, 1 - r); }
function block(g, x, y, u, t) { const warm = eio(seg(t, 0, .9)), back = eio(seg(t, 2, 2.6)), heat = warm * (1 - back), gl = heat * (.75 + .25 * Math.sin(t * 9)), sh = spr(seg(t, 1.2, 1.7)), fl = t >= 2 ? 1 - seg(t, 2, 2.5) : 0, gone = seg(t, 2.8, 3.4);
  shadow(g, x, y + 12 * u, 20 * u, u, 1); glow(g, x, y, 15 * u, hex(FIRE), gl * .55, u); slab(g, x, y, 10 * u, mix(SEATC, FIRE, heat * .9), 1.4 * u);
  g.fillStyle = css(hex(SHIELD), .12 * sh * (1 - gone) * g.globalAlpha); circle(g, x, y, 14 * u * sh); ring(g, x, y, 14 * u * sh * (1 + .06 * fl), hex(SHIELD), u * (.5 + .7 * fl), sh * (1 - gone)); }
function revive(g, x, y, u, t) { const k = eio(seg(t, .2, 1.9)), up = spr(seg(t, 2, 2.7)), warm = eio(seg(t, 2, 2.4)), pr = eout(seg(t, 2, 2.9));
  shadow(g, x, y + 12 * u, 20 * u * lerp(.6, 1, up), u, 1); slab(g, x, y, 10 * u * lerp(.6, 1, up), mix(ASH, SEATC, warm), 1.4 * u);
  if (t < 2) ring(g, x, y - (1 - k) * 34 * u, 10 * u * (1 + (1 - k) * .25), [255, 255, 255], .35 * u, k); else ring(g, x, y, 10 * u * (1 + pr * 1.2), hex(MINT), .35 * u, 1 - pr); }
function hitBreath(g, x, y, u, t) { const pink = eio(seg(t, 0, .15)), pulse = [[.45, .5], [.95, .22]].reduce((a, b) => { const q = t - b[0]; return a + (q < 0 || q > .4 ? 0 : b[1] * Math.pow(Math.sin(Math.PI * q / .4), 2)); }, 0);
  const kick = Math.sin(Math.PI * seg(t, 0, .25)) * .12, cool = eio(seg(t, 1.1, 1.5)), r = eio(seg(t, 1.4, 2.8)), burst = eout(seg(t, 0, .5));
  shadow(g, x, y + 12 * u, 20 * u, u, 1); slab(g, x, y, 10 * u * (1 - kick + .14 * pulse), cool > 0 ? mix(PINK, ASH, cool) : mix(SEATC, PINK, pink), 1.4 * u);
  if (t > 0) ring(g, x, y, 10 * u * (1 + burst * .8), hex(SHOT), .5 * u, 1 - burst); if (r > 0) ring(g, x, y - r * 34 * u, 10 * u * (1 + r * .25), [255, 255, 255], .35 * u, 1 - r); }
function token(g, x, y, d, num, name, nameA, ash) { g.fillStyle = ash ? css(hex(ASH)) : '#fff'; circle(g, x, y, d / 2 * (ash ? .6 : 1));
  if (!ash) text(g, String(num), x, y, d * .43, 600, hex(INK), 1); if (name) text(g, name, x, y + d * .95, d * .42, 600, [255, 255, 255], .9 * nameA); }
function text(g, s, x, y, size, wt, c, a, maxW) { if (a <= .001 || !s) return; s = narrTr(s); g.globalAlpha = a; g.fillStyle = css(c); g.textAlign = 'center'; g.textBaseline = 'middle';
  let fs = size; g.font = `${wt} ${fs}px ${FONT}`; if (maxW) { const w = g.measureText(s).width; if (w > maxW) { fs = Math.max(size * .4, size * maxW / w); g.font = `${wt} ${fs}px ${FONT}`; } }
  g.fillText(s, x, y); g.globalAlpha = 1; }

function shotLayer(g, s, t, B, P, S, z, map, toScr, U, nameOf, fin) {
  const p = last, d = B.d, dz = d * z * B.k, mS = toScr(map(S)), mT = toScr(map(P)), num = id => (p.seats.find(x => x.id === id) || {}).number;
  const tokK = seg(t, .3, .6), nameA = 1 - (s.hit ? eio(seg(t, 2.5, 3.2)) * (1 - eio(seg(t, fin, fin + .8))) : 0), aimR = eout(seg(t, 1.2, 1.8));
  const dx = P.x - S.x, dy = P.y - S.y, L = Math.max(Math.hypot(dx, dy), 1), aim = s.hit ? P : { x: P.x - dy / L * d * 1.1, y: P.y + dx / L * d * 1.1 };
  const k = ein(seg(t, 1.8, 2.4)), k2 = s.hit ? 0 : eout(seg(t, 2.4, 2.9)), bullet = t < 2.4 ? lp(S, aim, k) : lp(aim, { x: aim.x + (aim.x - S.x) * .5, y: aim.y + (aim.y - S.y) * .5 }, k2), trail = lp(S, bullet, seg(t, 1.95, 2.6));
  const wob = s.hit ? 0 : Math.sin(Math.PI * 6 * seg(t, 2.3, 2.9)) * (1 - seg(t, 2.3, 2.9)) * dz * .14, hidden = t >= .3 && t < fin + .9;
  g.globalAlpha = tokK;
  if (hidden) token(g, mS.x, mS.y, dz, num(s.by), nameOf(s.by), nameA);
  if (!s.hit || t < 2.4) { if (hidden) token(g, mT.x + wob, mT.y, dz, num(s.targets[0]), nameOf(s.targets[0]), nameA); }
  else if (t >= 4.9) token(g, mT.x, mT.y, dz, 0, nameOf(s.targets[0]), nameA, true);
  g.globalAlpha = 1;
  ring(g, mS.x, mS.y, dz / 2 * lerp(2.2, 1.3, aimR), hex(SHOT), dz * .06, aimR * (1 - seg(t, 2, 2.4)));
  if (t >= 1.8 && (s.hit ? t < 2.4 : t < 2.9)) { const a = toScr(map(trail)), b = toScr(map(bullet));
    g.strokeStyle = css(hex(SHOT), .55 * (1 - k2)); g.lineWidth = dz * .11; g.lineCap = 'round'; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    g.save(); g.shadowColor = css(hex(SHOT), .8); g.shadowBlur = dz * .4; g.fillStyle = css(hex(SHOT), 1 - k2); circle(g, b.x, b.y, dz * .19); g.restore(); }
  if (s.hit && t >= 2.4 && t < 5.05) { const u = dz / 20, ao = seg(t, 4.9, 5.05); g.globalAlpha = 1 - ao; hitBreath(g, mT.x, mT.y, u, t - 2.4); g.globalAlpha = ao; slab(g, mT.x, mT.y, 10 * u * .6, hex(ASH), 1.4 * u); g.globalAlpha = 1;
    const n = eout(seg(t, 4, 4.4)) * (1 - seg(t, 4.9, 5.2)), cc = toScr(B.C); text(g, nameOf(s.targets[0]), cc.x, cc.y + 27 * U + (1 - n) * 2 * U, 10 * U, 600, [255, 255, 255], .9 * n, innerWidth * .8); }
}
/* 끝 결과 글자 — 작게 «누구», 크게 «결과»(밝은 바탕에서 읽히는 색). 처형은 윗줄 «이름 · 처형» */
function endText(g, s, t, c, U, nameOf, darkK, fin, B) {
  const [a0, a1] = s.kind === 'win' ? [3.4, 7.3] : s.kind === 'shot' ? [fin + .9, LEN(s) - .4] : [5.6, 7.3], k = eout(seg(t, a0, a0 + .4)) * (1 - seg(t, a1, a1 + .4)); if (k <= .001) return;
  const nm = nameOf(s.targets[0]), ex = T('처형'), R = {
    night: [nm, T('사망'), BLOOD], special: [nm, T('사망'), 0xF0365A], block: [nm + '  ·  ' + ex, T('살아남음'), 0x2F7FE0], revive: [nm, T('되살아남'), 0x14A06A],
    exec: s.reveal === 'criminal' ? [nm + '  ·  ' + ex, T('범죄 조직'), BLOOD] : s.reveal === 'citizen' ? [nm + '  ·  ' + ex, T('시민'), 0x2F7FE0] : [nm + '  ·  ' + ex, T('사망'), 0xF0601F],
    multi: [s.targets.map(nameOf).join('  ·  '), T(s.targets.length + '명 사망'), BLOOD], win: ['', s.label || '', INK],
    shot: [nameOf(s.by) + '  →  ' + nm, s.hit ? T('명중') : T('빗나감'), s.hit ? 0xF0365A : INK] }[s.kind];
  const sc = lerp(.92, 1, spr(seg(t, a0, a0 + .7))), rin = Math.min(...B.pts.map(q => Math.hypot(q.x - B.C.x, q.y - B.C.y))), inner = Math.min(B.W * .6, Math.max(320, 2 * rin - 2.4 * B.d)) * B.k;
  const big = 12 * U * sc, small = 4.4 * U * sc, gap = 2.4 * U, h = (R[0] ? small + gap : 0) + big, y0 = c.y - h / 2 - 2 * U;
  if (R[0]) text(g, R[0], c.x, y0 + small / 2, small, 500, hex(INK), .55 * k, inner);
  text(g, R[1], c.x, y0 + (R[0] ? small + gap : 0) + big / 2, big, 700, hex(R[2]), k, inner);
}

/* ── 소리 — 큰 화면 소리를 켰을 때만(공개 정보 audio 칸). 파일 없이 합성(아이폰 rfx_* 와 같은 소리) ── */
let actx = null;
addEventListener('pointerdown', () => { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch (e) { (globalThis.드러냄 || (() => {}))('screen_fx.unlock', e); } }, true);   // 소리를 못 켜면 기록만(연출은 그대로)
function tone(at, f, dur, vol, decay, f2) { const o = actx.createOscillator(), v = actx.createGain(), t0 = actx.currentTime + at; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  v.gain.setValueAtTime(vol, t0); v.gain.exponentialRampToValueAtTime(.0001, t0 + Math.min(dur, 5 / decay)); o.connect(v).connect(actx.destination); o.start(t0); o.stop(t0 + dur); }
function noise(at, dur, vol) { const n = actx.sampleRate * dur, b = actx.createBuffer(1, n, actx.sampleRate), ch = b.getChannelData(0); for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / n);
  const s = actx.createBufferSource(), hp = actx.createBiquadFilter(), v = actx.createGain(); hp.type = 'highpass'; hp.frequency.value = 800; v.gain.value = vol; s.buffer = b; s.connect(hp).connect(v).connect(actx.destination); s.start(actx.currentTime + at); }
function thud(at) { tone(at, 58, 1.2, .9, 4); tone(at, 880, .1, .25, 40); }
function sound(s) {
  if (!actx || !last || !last.audio) return;
  try {
    if (['night', 'exec', 'special'].includes(s.kind)) thud(3.4);
    else if (s.kind === 'multi') s.targets.forEach((_, i) => thud(3.2 + i * .35));
    else if (s.kind === 'block') { tone(3.4, 1760, .7, .45, 9); tone(3.4, 2640, .7, .25, 13); }
    else if (s.kind === 'revive') { tone(3.4, 660, 1.2, .32, 4); tone(3.52, 990, 1.2, .32, 4); }
    else if (s.kind === 'win') [523, 659, 784].forEach(f => tone(3.4, f, 2.2, .18, 1.8));
    else if (s.kind === 'shot') { tone(1.8, 1400, .25, .35, 10, 300); if (s.hit) { tone(2.4, 900, .3, .5, 25); tone(2.4, 160, .3, .4, 18); thud(3.9); } else noise(2.4, .6, .25); }
  } catch (e) { (globalThis.드러냄 || (() => {}))('screen_fx.sound', e); }
}
