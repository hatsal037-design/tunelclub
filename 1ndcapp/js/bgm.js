// 배경 음악 — 계열 × 과정 곡(폰 앱 BgmPlayer 와 같음, 2026-10-04). 곡 이름은 코어 bgm.slot, 처형·판 끝 짧은 소리는 효과 sting. 기본 꺼짐.
import { settings } from './settings.js';
import { soundOut } from './soundbus.js';
let cur = null, curName = null;
/* 소리 셋을 돌려 쓴다 — 아이폰·아이패드 사파리는 누른 순간에 튼 소리만 허락해서, 명령 뒤에 새로 만든 소리는 막힌다(2026-10-26, 진행 소리와 같은 까닭).
   첫 터치에 빈 소리로 열어 두고 곡은 둘을 번갈아(바꿀 때 겹쳐 흐리기), 짧은 소리는 하나 */
const POOL = [new Audio(), new Audio()], STING = new Audio(); let pi = 0;
const unlock = () => { removeEventListener('pointerdown', unlock, true); removeEventListener('keydown', unlock, true);
  [...POOL, STING].forEach(a => { if (a.src) return; a.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='; a.play().catch(() => {}); }); };
addEventListener('pointerdown', unlock, true); addEventListener('keydown', unlock, true);
const vol = () => { const v = settings.get('bgmVolume'); return v == null ? 0.5 : v; };
function fade(a, to, ms, done) { const id = a._fid = (a._fid || 0) + 1, from = a.volume, t0 = performance.now(); const step = t => { if (a._fid !== id) return; /* 같은 소리에 새 흐리기가 오면 앞 것(과 그 멈춤)은 버린다 — 돌려 쓰는 소리라 */ const k = Math.min(1, (t - t0) / ms); a.volume = Math.max(0, Math.min(1, from + (to - from) * k)); if (k < 1) requestAnimationFrame(step); else if (done) done(); }; requestAnimationFrame(step); }
let lastSlot = null;
export function bgmSync(slot) {
  lastSlot = slot || null;
  if (soundOut.bgm && soundOut.bgm(settings.get('bgm') && slot ? { name: `${slot.hub}_${slot.slot}`, vol: vol() } : null)) { bgmStop(); return; }   // 큰 화면에서 틀면 폰은 멈춘다
  if (!settings.get('bgm') || !slot) { bgmStop(); return; }
  const name = `${slot.hub}_${slot.slot}`; if (name === curName) return;
  pi = 1 - pi; let a = POOL[pi]; if (a === cur) { pi = 1 - pi; a = POOL[pi]; }   // 지금 울리는 쪽은 건드리지 않는다
  a.pause(); a.src = `bgm/${name}.m4a`; a.loop = true; a.volume = 0; const prev = curName; curName = name;
  // 곡이 실제로 울릴 때만 바꾼다 — 아직 안 만든 곡(투표 등)이면 지금 곡을 그대로 둔다(첫 지명에 음악이 끊기던 것, 2026-10-04)
  a.play().then(() => { if (curName !== name) { a.pause(); return; } if (cur) { const old = cur; fade(old, 0, 1200, () => old.pause()); } cur = a; fade(a, vol(), 1200); }).catch(() => { if (curName === name) curName = prev; });
}
export function bgmEffects(fx) {
  if (!settings.get('bgm')) return;
  /* 한 응답의 짧은 소리 여럿(처형 → 승패)은 차례로(2026-10-05) */
  const list = fx.filter(e => e.kind === 'sting').map(e => `bgm/${e.hub}_${e.name}.m4a`);
  if (list.length && soundOut.send && soundOut.send(list.map(u => ({ k: 'sting', u: u.slice(4), vol: vol() })))) return;
  const next = () => { const u = list.shift(); if (!u) { if (cur && !ducked) fade(cur, vol(), 400); return; }
    const s = STING; s.onended = next; s.onerror = next; s.src = u; s.volume = Math.min(1, vol() * 1.2); if (cur) fade(cur, vol() * 0.35, 250); s.play().catch(next); };
  if (list.length) next();
}
/* 낭독하는 동안 줄이기 — narrator.js 가 부른다 */
let ducked = false;
export function bgmDuck(on) { ducked = on; if (cur) fade(cur, on ? vol() * 0.35 : vol(), on ? 250 : 400); }
export function bgmVolume() { if (cur) cur.volume = vol(); else bgmSync(lastSlot); }   // 큰 화면에서 트는 중이면 크기만 다시 보낸다
export function bgmStop() { if (cur) { const old = cur; fade(old, 0, 600, () => old.pause()); } cur = null; curName = null; }
