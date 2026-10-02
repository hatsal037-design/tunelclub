// T01 · 오늘 — 설정(왼쪽) · 테마(가운데, 작은 창) · 계정(오른쪽), 큰 상자 안 3:2 사진 + 유리 아이콘 + 판 상태 + 큰 행동, 바로 가기 두 행 (27차 시안 2026-10-01 햇살님 «맞아 이거야»)
import { html, useState, useEffect, useRef } from '../../lib/preact-htm.js';
import { store } from '../store.js';
import { Icon } from '../icons.js';
import { Page, Section, Row, Primary, NavButton, LargeTitle, RoleArt, ActionSheet, cx } from '../ui.js';
import { settings } from '../settings.js';
import { useNav } from '../nav.js';
import { SettingsView } from './settingsView.js';
import { RecordsView } from './records.js';

/* 테마 = 계열(2026-10-01 햇살님 «버튼으로 계열 고르기», 29차 시안) — 고르면 사진·색과 새 판 준비의 «게임 계열»(roles.setFamily)이 같이 바뀐다.
   hub 는 모드 데이터의 계열 이름. soon 은 아직 게임이 없는 빈깡통 계열(«준비 중», 고를 수 없음). 사진은 web/theme/<테마>/ 에 두고 photos 에 적는다 */
export const THEMES = [
  { id: '오리지널', hub: '오리지널 마피아', color: '#3a3a3c', art: '마피아', photos: [] },
  { id: '클래식', hub: '클래식', color: '#5a1f1f', art: '임프', photos: [] },
  { id: '당산나무', hub: '당산나무', color: '#6b4a24', art: '객귀', photos: [] },
  { id: '판타지', soon: true, color: '#3d2f6b' },
  { id: '우주', soon: true, color: '#1f3a5a' },
  { id: '스팀펑크', soon: true, color: '#6b5326' },
  { id: '사이버펑크', soon: true, color: '#5a1f4f' },
];
export function currentTheme() { const f = store.home && store.home.ruleFamily; return THEMES.find(x => x.hub && x.hub === f) || THEMES[2]; }

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
/* 가운데 테마 버튼 — 누르면 버튼 밑 작은 창(아래서 올라오는 시트 아님). 오늘 화면과 자료실이 같이 쓴다: 고르면 onPick(테마), locked 면 흐리게(못 바꿈) */
export function ThemeMenu({ theme, onPick, locked }) {
  const [open, setOpen] = useState(false), box = useRef(null);
  useEffect(() => { if (!open) return; const h = e => { if (!box.current || !box.current.contains(e.target)) setOpen(false); }; document.addEventListener('pointerdown', h); return () => document.removeEventListener('pointerdown', h); }, [open]);
  return html`<div class="tpill-wrap" ref=${box}>
    <button class="tpill" aria-haspopup="menu" aria-expanded=${open} onClick=${() => setOpen(o => !o)}><i style=${`background:${theme.color}`}></i>${theme.id}<${Icon} name="chevronDown" size=${12} stroke=${2.4} /></button>
    ${open && html`<div class="tpop" role="menu">${THEMES.map((t, k) => html`${k > 0 && t.soon && !THEMES[k - 1].soon && html`<div class="tsep"></div>`}<button class=${cx('tpi', t.id === theme.id && 'on', (t.soon || locked) && 'off')} role="menuitemradio" aria-checked=${t.id === theme.id} aria-disabled=${!!(t.soon || locked)}
      onClick=${() => { setOpen(false); if (!t.soon && !locked && t.id !== theme.id) onPick(t); }}>
      <i style=${`background:${t.color}`}></i><span>${t.id}</span>${t.soon ? html`<span class="soon">준비 중</span>` : t.id === theme.id && html`<span class="blue"><${Icon} name="check" size=${18} stroke=${2.4} /></span>`}</button>`)}</div>`}
  </div>`;
}
/* 오늘 화면 — 고르면 새 판 준비의 계열이 바뀐다. 판이 진행 중이면 못 바꾼다 */
function ThemePill({ theme }) {
  const [ask, setAsk] = useState(null);
  const locked = store.home && store.home.destination === 'resumeGame';
  const pick = async (t, force) => { const r = await store.dispatch('roles.setFamily', force ? { family: t.hub, force: true } : { family: t.hub }); if (r.confirm) setAsk(t); else store.refresh(); };
  return html`<${ThemeMenu} theme=${theme} locked=${locked} onPick=${t => pick(t, false)} />
    <${ActionSheet} open=${!!ask} title=${ask ? `준비하던 판의 역할을 비우고 ${ask.id}로 바꿀까요?` : ''} onClose=${() => setAsk(null)} actions=${[{ label: '역할 비우고 변경', role: 'destructive', onClick: () => { const t = ask; setAsk(null); pick(t, true); } }]} />`;
}
const Shortcut = ({ icon, title, text }) => html`<div class="hstack shortcut" style="gap:12px;padding:4px 0">
  <span class="sym"><${Icon} name=${icon} size=${18} /></span><div><div class="shortcut-t">${title}</div><div class="sub">${text}</div></div></div>`;
