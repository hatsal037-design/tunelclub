// 낭독 — 코어가 명령 응답 effects 로 넘긴 «모두 들어도 되는 말»만(폰 앱 Narrator 와 같음). 기본 꺼짐.
import { settings } from './settings.js';
const spoken = new Set();
const MOODS = { night: [0.88, 0.85], day: [1, 1], exec: [0.92, 0.8], end: [0.95, 0.9] };
export function speakEffects(fx) {
  if (!settings.get('sound')) return;
  fx.filter(e => e.kind === 'speak' && e.text && !spoken.has(e.effectId)).forEach(e => { spoken.add(e.effectId); speak(e.text, e.plan, e.mood); });
}
/* 진행 목소리(2026-10-04) — 맥에서 미리 뽑은 문장(voice/<목소리>__<id>.m4a)과 «N번 자리 참가자». 하나라도 못 받으면 기기 음성으로 글 전체를 */
export const VOICES = [['system', '기기 음성'], ['mujin', '백무진'], ['haessal', '햇살'], ['daon', '서다온'], ['ganghyuk', '차강혁']];   // 다 뽑힌 넷(2026-10-04). 최태오·오하람은 뽑는 중 — 다 되면 여기 더한다
let cur = null, gen = 0;
export async function speak(text, plan, mood = 'day') {
  const v = settings.get('voice') || 'mujin', my = ++gen;
  stopSpeaking();
  if (v !== 'system' && plan && plan.length) {
    const urls = plan.filter(p => p.clip).map(p => `voice/${v}__${p.clip}.m4a`);   // 문장 조각만(«N번 자리» 소리는 2026-10-04 뺐다)
    if (urls.every(Boolean)) {
      try {
        for (const u of urls) {
          if (my !== gen) return;
          await new Promise((ok, bad) => { const a = new Audio(u); cur = a; a.onended = ok; a.onerror = bad; a.play().catch(bad); });
        }
        return;
      } catch { if (my !== gen) return; }   // 못 받은 소리가 있으면 기기 음성으로
    }
  }
  say(text, mood);
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
export function stopSpeaking() { try { window.speechSynthesis && window.speechSynthesis.cancel(); if (cur) { cur.pause(); cur = null; } } catch {} }
