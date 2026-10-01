// T01 · 오늘 — 설정(왼쪽) · 테마(가운데, 작은 창) · 계정(오른쪽), 큰 상자 안 3:2 사진 + 유리 아이콘 + 판 상태 + 큰 행동, 바로 가기 두 행 (27차 시안 2026-10-01 햇살님 «맞아 이거야»)
import { html, useState, useEffect, useRef } from '../../lib/preact-htm.js';
import { store } from '../store.js';
import { Icon } from '../icons.js';
import { Page, Section, Row, Primary, NavButton, LargeTitle, RoleArt, cx } from '../ui.js';
import { settings } from '../settings.js';
import { useNav } from '../nav.js';
import { SettingsView } from './settingsView.js';
import { RecordsView } from './records.js';

/* 테마 — 모드와 별개. 사진 묶음과 색만 바꾼다(2026-10-01 햇살님: 오리지널 / 클래식 / 당산나무). 사진은 web/theme/<테마>/ 에 두고 아래 목록에 적는다(없으면 어두운 밤 바탕 + 직업 그림) */
export const THEMES = [
  { id: '오리지널', color: '#3a3a3c', art: '마피아', photos: [] },
  { id: '클래식', color: '#5a1f1f', art: '임프', photos: [] },
  { id: '당산나무', color: '#6b4a24', art: '객귀', photos: [] },
];
const hubTheme = fam => /클래식|시계탑/.test(fam || '') ? '클래식' : /오리지널|마피아/.test(fam || '') ? '오리지널' : '당산나무';
export function currentTheme() { const t = settings.get('theme'); return THEMES.find(x => x.id === t) || THEMES.find(x => x.id === hubTheme(store.home && store.home.ruleFamily)) || THEMES[1]; }

export function TodayView({ openSpace }) {
  const nav = useNav(), h = store.home;
  const step = h.prepStep === 'handoff' ? 'handoff' : h.prepStep === 'people' ? 'people' : 'seats';
  const hero = {
    newPreparation: ['plus', '새 판을 준비해 볼까요?', '사람을 모으고 자리를 정하면 차근차근 안내할게요', '새 판 준비', { prep: 'people' }],
    resumePreparation: ['listNumber', '준비하던 판이 있어요', h.summary || '', '준비 계속', { prep: step }],
    resumeGame: ['moon', '진행 중인 판이 있어요', h.summary || '', '이어 하기', { game: true }],
  }[h.destination] || [];
  const go = async () => {
    if (h.destination === 'newPreparation') { await store.dispatch('preparation.enter', { practice: false }); }   // 새 판은 실전
    openSpace(hero[4]);
  };
  const practice = async () => { const r = await store.dispatch('preparation.enter', { practice: true }); if (r.ok) openSpace({ prep: 'people' }); };
  const theme = currentTheme();
  const photo = theme.photos.length ? theme.photos[(h.summary || '').length % theme.photos.length] : null;   // 돌아가며 — 같은 판이면 같은 사진
  return html`<${Page} title=${html`<${ThemePill} theme=${theme} />`}
      left=${html`<${NavButton} icon="gear" label="설정" onClick=${() => nav.push(html`<${SettingsView} />`)} />`}
      right=${html`<${NavButton} icon="personCircle" label="계정" onClick=${() => nav.push(html`<${SettingsView} account />`)} />`}>
    <${LargeTitle}>오늘<//>
    <${Section} footer=${h.ruleFamily + (h.modeName ? ' · ' + h.modeName : '')}>
      <div class="hero2">
        <div class="tcover" style=${photo ? '' : `--tc:${theme.color}`}>
          ${photo ? html`<img class="bg" src=${photo} alt="" />` : html`<div class="ph"><${RoleArt} r=${store.artOf(theme.art) || theme.art} size=${220} /></div><div class="stars"></div>`}
          <span class="glass"><${Icon} name=${hero[0]} size=${26} /></span>
          <div class="info"><div class="t">${hero[1]}</div>${hero[2] && html`<div class="s">${hero[2]}</div>`}</div>
        </div>
        <${Primary} title=${hero[3]} onClick=${go} />
      </div>
    <//>
    <${Section} header="바로 가기">
      <${Row} onClick=${practice} disabled=${h.destination === 'resumeGame'}>
        <${Shortcut} icon="play" title="연습판" text=${h.destination === 'resumeGame' ? '진행 중인 판을 먼저 끝내요' : '기록 없이 흐름을 익혀요'} />
      <//>
      <${Row} chevron onClick=${() => nav.push(html`<${RecordsView} embedded />`)}>
        <${Shortcut} icon="clock" title="최근 기록" text=${h.hasRecords ? '지난 판을 다시 살펴봐요' : '아직 완료한 판이 없어요'} />
      <//>
    <//>
  <//>`;
}
/* 가운데 테마 버튼 — 누르면 버튼 밑 작은 창(아래서 올라오는 시트 아님) */
function ThemePill({ theme }) {
  const [open, setOpen] = useState(false), box = useRef(null);
  useEffect(() => { if (!open) return; const h = e => { if (!box.current || !box.current.contains(e.target)) setOpen(false); }; document.addEventListener('pointerdown', h); return () => document.removeEventListener('pointerdown', h); }, [open]);
  return html`<div class="tpill-wrap" ref=${box}>
    <button class="tpill" aria-haspopup="menu" aria-expanded=${open} onClick=${() => setOpen(o => !o)}><i style=${`background:${theme.color}`}></i>${theme.id}<${Icon} name="chevronDown" size=${12} stroke=${2.4} /></button>
    ${open && html`<div class="tpop" role="menu">${THEMES.map(t => html`<button class=${cx('tpi', t.id === theme.id && 'on')} role="menuitemradio" aria-checked=${t.id === theme.id} onClick=${() => { settings.set('theme', t.id); setOpen(false); store.refresh(); }}>
      <i style=${`background:${t.color}`}></i><span>${t.id}</span>${t.id === theme.id && html`<span class="blue"><${Icon} name="check" size=${18} stroke=${2.4} /></span>`}</button>`)}</div>`}
  </div>`;
}
const Shortcut = ({ icon, title, text }) => html`<div class="hstack shortcut" style="gap:12px;padding:4px 0">
  <span class="sym"><${Icon} name=${icon} size=${18} /></span><div><div class="shortcut-t">${title}</div><div class="sub">${text}</div></div></div>`;
