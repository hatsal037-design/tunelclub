/* 큰 화면 연출 — 슬레이어 쏘기 «숨 멈춤»(2026-11-14 햇살님 시안 C 확정). 앱 SlayCinema.swift 와 같은 그림·같은 시간표.
   공개 정보의 fx 칸 {k:'slay', id, by, target, hit} — 처음 받을 때 이미 있던 것은 지난 것이라 안 튼다(소리와 같은 규칙). */
let seen = null, layer = null, raf = 0;
const BR = 3.4, LEN = 7.2;
const seg = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a))), ease = x => { const c = Math.max(0, Math.min(1, x)); return 1 - Math.pow(1 - c, 3); };
const FONT = '"Pretendard","Apple SD Gothic Neo",sans-serif';

export function screenFx(fx, fresh) {
  if (fresh) seen = null;
  if (!fx) { if (seen === null) seen = 0; return; }
  if (seen === null) { seen = fx.id; return; }
  if (fx.id <= seen) return;
  seen = fx.id;
  if (fx.k === 'slay') play(fx);
}

function play(fx) {
  stop();
  layer = document.createElement('canvas');
  layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: '9999', background: '#000' });
  document.body.appendChild(layer);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, t0 = performance.now();
  const step = now => {
    const t = reduce ? LEN : (now - t0) / 1000;
    const dpr = window.devicePixelRatio || 1, W = innerWidth, H = innerHeight;
    if (layer.width !== W * dpr) { layer.width = W * dpr; layer.height = H * dpr; }
    const g = layer.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); draw(g, W, H, t, fx);
    if (t < LEN) raf = requestAnimationFrame(step); else stop();
  };
  raf = requestAnimationFrame(step);
}
function stop() { cancelAnimationFrame(raf); if (layer) layer.remove(); layer = null; }

function txt(g, s, x, y, size, weight, color, alpha) { if (alpha <= 0.001) return; g.globalAlpha = alpha; g.fillStyle = color; g.font = `${weight} ${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, x, y); g.globalAlpha = 1; }

function draw(g, W, H, t, fx) {
  const u = Math.min(W / 760, H / 720), cx = W / 2, cy = H / 2, gold = '#f3c95a', soft = '#ffe9a8';
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const a1 = ease(seg(t, 0.3, 0.9)) * (1 - ease(seg(t, BR - 0.2, BR)));
  txt(g, '쏘는 사람', cx, cy - 230 * u, 22 * u, 400, 'rgba(255,255,255,.55)', a1);
  txt(g, fx.by, cx, cy - 188 * u, 32 * u, 700, gold, a1);
  const z = 1 + 0.25 * ease(seg(t, 0.9, BR)), fit = W * 0.86 / Math.max(1, String(fx.target).length * 0.92), size = Math.min(120 * u * z, fit * z / 1.25), ny = cy + 40 * u;
  if (!(fx.hit && t > BR)) txt(g, fx.target, cx, ny, size, 800, '#fff', ease(seg(t, 0.9, 1.4)) * (!fx.hit && t > BR + 1.2 ? 0.35 : 1));
  else {   // 성공 — 이름이 위아래로 갈라진다
    const k = ease(seg(t, BR, BR + 1.2));
    g.save(); g.beginPath(); g.rect(0, 0, W, ny); g.clip(); g.translate(-k * 40 * u, -k * 30 * u); g.translate(cx, ny); g.rotate(-k * 0.06); g.translate(-cx, -ny); txt(g, fx.target, cx, ny, size, 800, '#fff', 1 - k * 0.8); g.restore();
    g.save(); g.beginPath(); g.rect(0, ny, W, H - ny); g.clip(); g.translate(k * 40 * u, k * 40 * u); g.translate(cx, ny); g.rotate(k * 0.06); g.translate(-cx, -ny); txt(g, fx.target, cx, ny, size, 800, '#ff6a5a', 1 - k * 0.8); g.restore();
  }
  for (let b = 0; b < 3; b++) { const bt = 1.4 + b * 0.6, k = seg(t, bt, bt + 0.5); if (k > 0 && k < 1) { g.beginPath(); g.arc(cx, ny, (90 + k * 260) * u, 0, 7); g.strokeStyle = `rgba(235,80,70,${0.5 * (1 - k)})`; g.lineWidth = 3 * u; g.stroke(); } }
  if (t > BR - 0.15) {
    const k = ease(seg(t, BR - 0.15, BR + 0.15)), fade = 1 - seg(t, BR + 0.3, BR + 1.0), y0 = fx.hit ? ny - 10 * u : ny - 210 * u, y1 = fx.hit ? ny + 10 * u : ny - 170 * u;
    g.strokeStyle = `rgba(255,240,200,${fade})`; g.lineWidth = (fx.hit ? 6 : 3) * u; g.shadowColor = soft; g.shadowBlur = 24 * u;
    g.beginPath(); g.moveTo(-50, y0); g.lineTo(-50 + (W + 100) * k, y0 + (y1 - y0) * k); g.stroke(); g.shadowBlur = 0;
  }
  if (fx.hit) {
    const f = seg(t, BR, BR + 0.35); if (f > 0 && f < 1) { g.fillStyle = `rgba(255,250,235,${0.85 * (1 - f)})`; g.fillRect(0, 0, W, H); }
    txt(g, '악마였다', cx, cy + 200 * u, 40 * u, 700, soft, ease(seg(t, BR + 1.0, BR + 1.5)));
  } else txt(g, '빗나갔다', cx, cy + 200 * u, 40 * u, 700, '#fff', 0.75 * ease(seg(t, BR + 0.8, BR + 1.3)));
}
