// 낭독 — 코어가 명령 응답 effects 로 넘긴 «모두 들어도 되는 말»만(폰 앱 Narrator 와 같음). 기본 꺼짐.
import { settings } from './settings.js';
import { bgmDuck } from './bgm.js';
const spoken = new Set();
const MOODS = { night: [0.88, 0.85], day: [1, 1], exec: [0.92, 0.8], end: [0.95, 0.9] };
export function speakEffects(fx) {
  if (!settings.get('sound')) return;
  const list = fx.filter(e => e.kind === 'speak' && e.text && !spoken.has(e.effectId)); list.forEach(e => spoken.add(e.effectId));
  if (list.length) speakAll(list);
}
/* 한 응답 안의 낭독은 이어서 — 처형 낭독이 승패 낭독에 바로 끊기던 것(2026-10-05). 새 응답은 앞 응답을 끊는다. 읽는 동안 배경 음악은 줄인다 */
async function speakAll(list) {
  const my = ++gen; stopSpeaking(); bgmDuck(true);
  try { for (const e of list) { if (my !== gen) return; await speakOne(e.text, e.plan, e.mood, my); } }
  finally { if (my === gen) bgmDuck(false); }
}
/* 진행 목소리(2026-10-04) — 맥에서 미리 뽑은 문장(voice/<목소리>__<id>.m4a)과 «N번 자리 참가자». 하나라도 못 받으면 기기 음성으로 글 전체를 */
export const VOICES = [['system', '기기 음성'], ['mujin', '백무진'], ['haessal', '햇살'], ['taeo', '최태오'], ['sangeun', '이상은'], ['hyeongyeong', '류현경'], ['sujeong', '한수정'], ['cheongha', '이청하'], ['seyeong', '장세영'], ['jangmi', '윤장미']];   // 아홉(2026-10-05 햇살님 «서다온·차강혁·오하람은 빼자»)
let cur = null, gen = 0;
export async function speak(text, plan, mood = 'day') { const my = ++gen; stopSpeaking(); return speakOne(text, plan, mood, my); }
async function speakOne(text, plan, mood, my) {
  const v = settings.get('voice') || 'mujin';
  if (v !== 'system' && plan && plan.length) {
    const urls = plan.filter(p => p.clip).map(p => `voice/${v}__${p.clip}.m4a`);   // 문장 조각만(«N번 자리» 소리는 2026-10-04 뺐다)
    if (urls.every(Boolean)) {
      try {
        for (const u of urls) {
          if (my !== gen) return;
          await new Promise((ok, bad) => { const a = new Audio(u); cur = a; a.onended = ok; a.onerror = bad; a.play().catch(bad); });
        }
        return;
      } catch { return; }   // 못 받은 소리(아직 녹음 안 된 새 줄)는 기계 음성으로 섞지 않고 조용히 — 폰 앱과 같게(2026-10-04)
    }
    return;
  }
  return say(text, mood, true);
}
export function say(text, mood = 'day', keep = false) {
  const S = window.speechSynthesis; if (!S) return;
  if (!keep) S.cancel();
  const u = new SpeechSynthesisUtterance(text), m = MOODS[mood] || MOODS.day;
  u.lang = 'ko-KR'; u.rate = m[0]; u.pitch = m[1];
  const v = S.getVoices().filter(x => x.lang && x.lang.startsWith('ko'));
  if (v.length) u.voice = v.find(x => /premium|enhanced|natural/i.test(x.name)) || v[0];
  return new Promise(ok => { u.onend = ok; u.onerror = ok; S.speak(u); });   // 다 읽을 때까지 기다릴 수 있게
}
export function stopSpeaking() { try { window.speechSynthesis && window.speechSynthesis.cancel(); if (cur) { cur.pause(); cur = null; } } catch {} }
