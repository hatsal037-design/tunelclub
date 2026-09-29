// 낭독 — 코어가 명령 응답 effects 로 넘긴 «모두 들어도 되는 말»만(폰 앱 Narrator 와 같음). 기본 꺼짐.
import { settings } from './settings.js';
const spoken = new Set();
const MOODS = { night: [0.88, 0.85], day: [1, 1], exec: [0.92, 0.8], end: [0.95, 0.9] };
export function speakEffects(fx) {
  if (!settings.get('sound')) return;
  fx.filter(e => e.kind === 'speak' && e.text && !spoken.has(e.effectId)).forEach(e => { spoken.add(e.effectId); say(e.text, e.mood); });
}
export function say(text, mood = 'day') {
  const S = window.speechSynthesis; if (!S) return;
  S.cancel();
  const u = new SpeechSynthesisUtterance(text), m = MOODS[mood] || MOODS.day;
  u.lang = 'ko-KR'; u.rate = m[0]; u.pitch = m[1];
  const v = S.getVoices().filter(x => x.lang && x.lang.startsWith('ko'));
  if (v.length) u.voice = v.find(x => /premium|enhanced|natural/i.test(x.name)) || v[0];
  S.speak(u);
}
export function stopSpeaking() { try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch {} }
