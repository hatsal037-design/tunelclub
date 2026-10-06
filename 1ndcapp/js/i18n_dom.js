/* 웹 진행 화면 영어(2026-10-06) — 앱 CoreText 와 같은 생각: 화면에 «그려진 글자»만 바꾼다. 코어 값·열쇠는 그대로.
   사전: 앱 화면 말(i18n/data/앱_en_전체.json) + 코어 글 틀(코어_en.json) + 게임 자료(en.json). 영어가 아니면 아무것도 안 한다.
   언어: 이 기기에서 정한 것(localStorage 1ndc_lang) → 기기 언어 → 한국어·영어 아니면 영어. */
const BASE = new URL('../', import.meta.url).href;   /* 큰 화면(screen/)에서 불러도 같은 자리 */
const LANGS = ['ko', 'en', 'ja', 'es', 'zh-Hans', 'zh-Hant', 'th', 'vi', 'id', 'pt-BR'];   /* participant.js LANGS 와 같게 */
const pick = () => { let a = null; try { a = localStorage.getItem('1ndc_lang'); } catch {} if (a && LANGS.includes(a)) return a;
  const d = navigator.language || 'ko', l = d.slice(0, 2).toLowerCase();
  if (l === 'zh') return /Hant|TW|HK|MO/i.test(d) ? 'zh-Hant' : 'zh-Hans'; if (l === 'pt') return 'pt-BR'; if (l === 'in') return 'id';
  return LANGS.includes(l) ? l : 'en'; };
export const LANG_NAMES = { ko: '한국어', en: 'English', ja: '日本語', es: 'Español', 'zh-Hans': '简体中文', 'zh-Hant': '繁體中文', th: 'ไทย', vi: 'Tiếng Việt', id: 'Bahasa Indonesia', 'pt-BR': 'Português (Brasil)' };
export async function startDomI18n(root) {
  const lang = pick(); document.documentElement.lang = lang;
  if (lang === 'ko' || !root) return;
  if (!window.CoreText) await new Promise(r => { const s = document.createElement('script'); s.src = BASE + 'core/coretext.js'; s.onload = r; s.onerror = r; document.head.appendChild(s); });
  const get = f => fetch(BASE + 'i18n/data/' + f).then(r => r.ok ? r.json() : {}).catch(() => ({}));
  const [app, core, data] = await Promise.all([get(`앱_${lang}_전체.json`), get(`코어_${lang}.json`), get(`${lang}.json`)]);
  /* 앱 카탈로그의 %lld·%@ 열쇠도 틀로({n}·{p}) — 화면에 숫자가 끼워진 채 오므로 */
  const tm = {}; for (const k in app) tm[k.replace(/%(\d\$)?(lld|ld|d)/g, '{n}').replace(/%(\d\$)?@/g, '{p}')] = app[k].replace(/%(\d)\$(?:lld|ld|d|@)/g, '{#$1}').replace(/%(lld|ld|d)/g, '{n}').replace(/%@/g, '{p}');   // %2$lld → {#2}: 번역 어순이 바뀌어도 그 자리 값(2026-10-06 코덱스 재현 «Turn 10 of 2»)
  const tr = window.CoreText.make(Object.assign(tm, core), data);
  const HAN = /[가-힣]/, ATTR = ['placeholder', 'aria-label', 'title'];
  const fix = n => {
    if (n.nodeType === 3) { if (HAN.test(n.nodeValue)) { const t = tr(n.nodeValue.trim()); if (t !== n.nodeValue.trim()) n.nodeValue = n.nodeValue.replace(n.nodeValue.trim(), t); } return; }
    if (n.nodeType !== 1 || n.tagName === 'SCRIPT' || n.tagName === 'STYLE' || n.isContentEditable || n.tagName === 'TEXTAREA') return;
    ATTR.forEach(a => { const v = n.getAttribute && n.getAttribute(a); if (v && HAN.test(v)) n.setAttribute(a, tr(v)); });
    if (n.tagName === 'INPUT') return;
    n.childNodes.forEach(fix);
  };
  fix(root);
  new MutationObserver(ms => ms.forEach(m => { if (m.type === 'characterData') fix(m.target); else m.addedNodes.forEach(fix); }))
    .observe(root, { childList: true, subtree: true, characterData: true });
}
