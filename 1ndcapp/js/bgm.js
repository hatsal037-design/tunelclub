// 배경 음악 — 계열 × 과정 곡(폰 앱 BgmPlayer 와 같음, 2026-10-04). 곡 이름은 코어 bgm.slot, 처형·판 끝 짧은 소리는 효과 sting. 기본 꺼짐.
import { settings } from './settings.js';
let cur = null, curName = null;
const vol = () => { const v = settings.get('bgmVolume'); return v == null ? 0.5 : v; };
function fade(a, to, ms, done) { const from = a.volume, t0 = performance.now(); const step = t => { const k = Math.min(1, (t - t0) / ms); a.volume = Math.max(0, Math.min(1, from + (to - from) * k)); if (k < 1) requestAnimationFrame(step); else if (done) done(); }; requestAnimationFrame(step); }
export function bgmSync(slot) {
  if (!settings.get('bgm') || !slot) { bgmStop(); return; }
  const name = `${slot.hub}_${slot.slot}`; if (name === curName) return;
  const a = new Audio(`bgm/${name}.m4a`); a.loop = true; a.volume = 0; const prev = curName; curName = name;
  // 곡이 실제로 울릴 때만 바꾼다 — 아직 안 만든 곡(투표 등)이면 지금 곡을 그대로 둔다(첫 지명에 음악이 끊기던 것, 2026-10-04)
  a.play().then(() => { if (curName !== name) { a.pause(); return; } if (cur) { const old = cur; fade(old, 0, 1200, () => old.pause()); } cur = a; fade(a, vol(), 1200); }).catch(() => { if (curName === name) curName = prev; });
}
export function bgmEffects(fx) {
  if (!settings.get('bgm')) return;
  fx.filter(e => e.kind === 'sting').forEach(e => { const s = new Audio(`bgm/${e.hub}_${e.name}.m4a`); s.volume = Math.min(1, vol() * 1.2);
    if (cur) fade(cur, vol() * 0.35, 250); s.onended = () => { if (cur) fade(cur, vol(), 400); }; s.play().catch(() => {}); });
}
export function bgmVolume() { if (cur) cur.volume = vol(); }
export function bgmStop() { if (cur) { const old = cur; fade(old, 0, 600, () => old.pause()); } cur = null; curName = null; }
