// 낭독 — 코어가 명령 응답 effects 로 넘긴 «모두 들어도 되는 말»만(폰 앱 Narrator 와 같음). 기본 꺼짐.
import { settings } from './settings.js';
import { bgmDuck } from './bgm.js';
import { narrLang, narrTr } from './i18n_dom.js';
import { soundOut } from './soundbus.js';
const REC = ['ko', 'en', 'ja', 'zh-Hans', 'zh-Hant', 'es', 'pt-BR'];   // 녹음된 진행 목소리가 있는 말 — 다른 언어는 voice/<목소리>__<언어>__<문장>, 류현경만(2026-10-12). 그 밖(태국어 등)은 기기 음성
const spoken = new Set();
const MOODS = { night: [0.88, 0.85], day: [1, 1], exec: [0.92, 0.8], end: [0.95, 0.9] };
export function speakEffects(fx) {
  if (!settings.get('sound')) return;
  const list = fx.filter(e => e.kind === 'speak' && e.text && !spoken.has(e.effectId)); list.forEach(e => spoken.add(e.effectId));
  if (list.length && !(soundOut.send && soundOut.send(list.map(e => toScreen(e.text, e.plan, e.mood))))) speakAll(list);
}
/* 큰 화면으로 보낼 낭독 한 줄 — 목소리·말은 진행자 폰 것, 글은 기기 음성용으로 미리 옮겨 둔다 */
export const toScreen = (text, plan, mood) => ({ k: 'speak', text: narrTr(text), plan: plan || null, mood: mood || 'day', v: settings.get('voice') || 'mujin', L: narrLang });
/* 한 응답 안의 낭독은 이어서 — 처형 낭독이 승패 낭독에 바로 끊기던 것(2026-10-05). 새 응답은 앞 응답을 끊는다. 읽는 동안 배경 음악은 줄인다 */
async function speakAll(list) {
  const my = ++gen; stopSpeaking(); bgmDuck(true);
  try { for (const e of list) { if (my !== gen) return; await speakOne(e.text, e.plan, e.mood, my); } }
  finally { if (my === gen) bgmDuck(false); }
}
/* 진행 목소리(2026-10-04) — 맥에서 미리 뽑은 문장(voice/<목소리>__<id>.m4a)과 «N번 자리 참가자». 하나라도 못 받으면 기기 음성으로 글 전체를 */
export const VOICES = [['system', '기기 음성'], ['mujin', '백무진'], ['haessal', '햇살'], ['taeo', '최태오'], ['hyeongyeong', '류현경'], ['seyeong', '장세영']];   // 여섯(2026-10-05 «서다온·차강혁·오하람은 빼자» · 2026-10-06 «이상은·한수정·윤장미 빼 줘»·«이청하도 빼 줘»)
let cur = null, gen = 0;
/* 소리 하나를 계속 쓴다 — 아이폰·아이패드 사파리는 누른 순간에 튼 소리만 허락해서, 명령이 끝난 뒤 새로 만든 소리는 막힌다(2026-10-25 햇살님 «웹앱에서 진행 사운드 나오게»).
   처음 누를 때 빈 소리를 한 번 틀어 열어 두고 문장마다 src 만 바꾼다. 기기 음성도 그때 한 번 깨운다 */
const player = new Audio();
const unlock = () => {
  removeEventListener('pointerdown', unlock, true); removeEventListener('keydown', unlock, true);
  player.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='; player.play().catch(() => {});
  try { const S = window.speechSynthesis; if (S) S.speak(Object.assign(new SpeechSynthesisUtterance(' '), { volume: 0 })); } catch {}
};
addEventListener('pointerdown', unlock, true); addEventListener('keydown', unlock, true);
export async function speak(text, plan, mood = 'day') { const my = ++gen; stopSpeaking(); return speakOne(text, plan, mood, my); }
async function speakOne(text, plan, mood, my) {
  const v0 = settings.get('voice') || 'mujin', v = VOICES.some(x => x[0] === v0) ? v0 : 'mujin';   // 목록에서 뺀 목소리를 골라 뒀으면 기본으로(2026-10-06)
  const L = narrLang;
  if (v !== 'system' && plan && plan.length && REC.includes(L)) {
    const pre = L === 'ko' ? `${v}__` : `hyeongyeong__${L}__`;
    const urls = plan.filter(p => p.clip).map(p => `voice/${pre}${p.clip}.m4a`);   // 문장 조각만(«N번 자리» 소리는 2026-10-04 뺐다)
    if (urls.every(Boolean)) {
      try {
        for (const u of urls) {
          if (my !== gen) return;
          await new Promise((ok, bad) => { cur = player; player.onended = ok; player.onerror = bad; player.src = u; player.play().catch(bad); });
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
  const tag = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', 'zh-Hans': 'zh-CN', 'zh-Hant': 'zh-TW', es: 'es-ES', 'pt-BR': 'pt-BR', th: 'th-TH', vi: 'vi-VN', id: 'id-ID' }[narrLang] || 'en-US';
  const u = new SpeechSynthesisUtterance(narrTr(text)), m = MOODS[mood] || MOODS.day;
  u.lang = tag; u.rate = m[0]; u.pitch = m[1];
  const v = S.getVoices().filter(x => x.lang && x.lang.replace('_', '-') === tag);
  if (v.length) u.voice = v.find(x => /premium|enhanced|natural/i.test(x.name)) || v[0];
  return new Promise(ok => { u.onend = ok; u.onerror = ok; S.speak(u); });   // 다 읽을 때까지 기다릴 수 있게
}
export function stopSpeaking() { try { window.speechSynthesis && window.speechSynthesis.cancel(); if (cur) { cur.pause(); cur = null; } } catch {} }
