// 기기 설정 — 폰 앱 @AppStorage 와 같은 몫(진동·진행 소리·외관·알림음·이야기 시간 분)
const KEY = '1ndc_settings';
const DEF = { haptics: true, sound: false, appearance: 'system', timerSound: true, talkMinutes: 5, voice: 'mujin', bgm: false, bgmVolume: 0.5 };
let cur = { ...DEF };
try { cur = { ...DEF, ...(JSON.parse(localStorage.getItem(KEY) || '{}')) }; } catch {}
const subs = new Set();
export const settings = {
  get: k => cur[k],
  set(k, v) { cur[k] = v; try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch {} subs.forEach(f => f()); applyAppearance(); },
  subscribe(f) { subs.add(f); return () => subs.delete(f); },
};
export function applyAppearance() {
  const a = cur.appearance, r = document.documentElement;
  if (a === 'light' || a === 'dark') r.dataset.theme = a; else delete r.dataset.theme;
}
