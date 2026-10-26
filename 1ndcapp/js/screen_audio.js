// 큰 화면 소리(2026-10-25) — 진행자가 설정 «큰 화면 소리»를 큰 화면으로 고르면 낭독·짧은 소리·알림음·배경 음악을 TV 가 튼다.
// 진행자 쪽은 screenlink.js(공개 정보의 audio 칸). 브라우저는 화면을 한 번 눌러야 소리를 허락해서, 그 전엔 «소리 켜기»를 띄운다.
const REC = ['ko', 'en', 'ja', 'zh-Hans', 'zh-Hant', 'es', 'pt-BR'];   // 녹음된 진행 목소리가 있는 말(narrator.js 와 같음)
const TAG = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', 'zh-Hans': 'zh-CN', 'zh-Hant': 'zh-TW', es: 'es-ES', 'pt-BR': 'pt-BR', th: 'th-TH', vi: 'vi-VN', id: 'id-ID' };
const MOODS = { night: [0.88, 0.85], day: [1, 1], exec: [0.92, 0.8], end: [0.95, 0.9] };
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
const voice = new Audio(), sting = new Audio(), music = new Audio(); music.loop = true;
let open = false, want = false, seen = null, bgm = null, bgmOn = '', talking = 0, vq = Promise.resolve(), sq = Promise.resolve(), actx = null, vgen = 0, lastG = null, cut = null;
const btn = document.getElementById('snd');
const show = () => { if (btn) btn.hidden = open || !want; };
function unlock() {
  if (open) return; open = true; show();
  [voice, sting, music].forEach(a => { a.src = SILENT; a.play().catch(() => {}); });
  try { speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance(' '), { volume: 0 })); } catch {}
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch {}
  bgmOn = ''; setBgm(bgm);
}
addEventListener('pointerdown', unlock, true); addEventListener('keydown', unlock, true);
const once = (a, u) => new Promise(ok => { if (a === voice) cut = () => ok(false); a.onended = () => ok(true); a.onerror = () => ok(false); a.src = u; a.play().catch(() => ok(false)); });   // false = 못 틂·끊김
const level = () => { if (bgm) music.volume = Math.min(1, bgm.vol * (talking ? 0.35 : 1)); };
async function speakOne(x, my) {
  if (my !== vgen) return; talking++; level();
  try {
    if (x.v !== 'system' && x.plan && x.plan.length && REC.includes(x.L)) {
      const pre = x.L === 'ko' ? `${x.v}__` : `hyeongyeong__${x.L}__`;
      for (const p of x.plan) if (p.clip && (my !== vgen || !(await once(voice, `../voice/${pre}${p.clip}.m4a`)))) break;   // 조각 하나라도 없으면 그 문장은 조용히(폰과 같게)
    } else if (window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance(x.text), m = MOODS[x.mood] || MOODS.day; u.lang = TAG[x.L] || 'ko-KR'; u.rate = m[0]; u.pitch = m[1];
      await new Promise(ok => { u.onend = ok; u.onerror = ok; speechSynthesis.speak(u); });
    }
  } finally { talking--; level(); }
}
function beep(strong) {   // 이야기 시간 알림음 — 진행자 폰(day.js beep)과 같은 소리
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); const n = strong ? 3 : 1;
    for (let i = 0; i < n; i++) { const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * 0.35;
      o.frequency.value = strong ? 880 : 1320; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.3); } } catch {}
}
function setBgm(b) {
  bgm = b || null;
  if (!bgm) { music.pause(); bgmOn = ''; return; }
  level(); if (!open || bgmOn === bgm.name) return;
  bgmOn = bgm.name; music.src = `../bgm/${bgm.name}.m4a`; music.play().catch(() => {});
}
/** 받은 공개 정보의 audio 칸 — 처음 받을 때 이미 있던 소리는 지난 것이라 안 튼다 */
export function screenSound(a, fresh) {
  if (fresh) { seen = null; lastG = null; }   // 연결이 끝났다 다시 짝지으면 처음처럼 — 쌓여 있던 지난 소리를 안 튼다
  want = !!a; show();
  if (!a) { setBgm(null); return; }
  const items = a.items || [];
  if (seen === null) seen = items.reduce((m, x) => Math.max(m, x.id), 0);
  for (const x of items) { if (x.id <= seen) continue; seen = x.id; if (!open) continue;
    if (x.k === 'speak') { if (x.g !== lastG) { lastG = x.g; vgen++; voice.pause(); if (cut) cut(); try { speechSynthesis.cancel(); } catch {} vq = Promise.resolve(); }   // 새 묶음은 앞 낭독을 끊는다
      const my = vgen; vq = vq.then(() => speakOne(x, my)); }
    else if (x.k === 'sting') sq = sq.then(() => { sting.volume = Math.min(1, (x.vol ?? 0.5) * 1.2); return once(sting, `../bgm/${x.u}`); });
    else if (x.k === 'beep') beep(x.strong); }
  setBgm(a.bgm);
}
btn && btn.addEventListener('click', unlock);
