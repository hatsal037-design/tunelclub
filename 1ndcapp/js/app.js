// 세 층: 앱 탭(오늘·기록·자료실·화면 연결) · 준비/진행 전면 · 시트. 전면 공간이 탭을 덮는다(폰 앱 AppRoot 와 같다)
import { html, render, useState, useEffect } from '../lib/preact-htm.js';
import { store, bootStore } from './store.js';
import { applyAppearance } from './settings.js';
import { stopSpeaking } from './narrator.js';
import { Icon } from './icons.js';
import { NavStack } from './nav.js';
import { startDomI18n } from './i18n_dom.js';
import { TodayView } from './screens/today.js';
import { RecordsView } from './screens/records.js';
import { LibraryView } from './screens/library.js';
import { PreparationFlow } from './screens/prep.js';
import { GameFlow } from './screens/game.js';
import { account } from './account.js';
import { DisplayConnectionView } from './screens/display.js';

import { screens } from './screenlink.js';

/* 큰 화면의 QR(…/1ndcapp/?screen=코드)로 들어왔으면 코드를 챙기고 주소에서 지운다. 카카오 로그인으로 나갔다 와도 남게 sessionStorage 에 */
const SCREEN_KEY = 'screen_pending';
{ const u = new URL(location.href), c = u.searchParams.get('screen');
  if (c) { try { sessionStorage.setItem(SCREEN_KEY, c); } catch {} u.searchParams.delete('screen'); history.replaceState(null, '', u.pathname + u.search + u.hash); }
  try { screens.pendingCode = sessionStorage.getItem(SCREEN_KEY) || ''; } catch {} }   // 연결에 성공하거나 코드를 고치면 지운다(screenlink.forget)
const cameFromQr = !!screens.pendingCode;
/* 광장 체크인 QR(…/1ndcapp/?j=코드) — 코드를 챙기고 주소에서 지운다. 로그인으로 나갔다 와도 남게 sessionStorage (2026-10-05 광장 체크인) */
{ const u = new URL(location.href), c = u.searchParams.get('j');
  if (c) { try { sessionStorage.setItem('plaza_join', c.toUpperCase()); } catch {} u.searchParams.delete('j'); history.replaceState(null, '', u.pathname + u.search + u.hash); }
  try { account.plazaJoin = sessionStorage.getItem('plaza_join') || ''; } catch {} }

function useStore() { const [, f] = useState(0); useEffect(() => store.subscribe(() => f(x => x + 1)), []); }

function App() {
  useStore();
  const [tab, setTab] = useState(cameFromQr ? 'display' : 'today');
  const [space, setSpace] = useState(null);   // {prep:'people'|'seats'|'roles'|'handoff'} | {game:true}
  const close = () => { setSpace(null); stopSpeaking(); store.refresh(); };
  if (space) {
    const go = s => setSpace(s);
    return html`<div class="shell">${space.game
      ? html`<${NavStack} key="game" root=${html`<${GameFlow} close=${close} toRoles=${() => go({ prep: 'roles' })} toPrep=${step => go({ prep: step })} />`} />`
      : html`<${PreparationFlow} key=${'prep-' + space.prep} step=${space.prep} go=${go} close=${close} />`}</div>`;
  }
  const tabs = [['today', '오늘', 'house'], ['records', '기록', 'clock'], ['library', '자료실', 'books'], ['display', '화면 연결', 'display']];   // 네 탭(2026-10-02 햇살님 확정)
  return html`<div class="shell">
    ${tabs.map(([id]) => html`<div class="tabpage" key=${id} style=${tab === id ? '' : 'display:none'}>
      ${id === 'today' ? html`<${NavStack} root=${html`<${TodayView} openSpace=${setSpace} />`} />`
        : id === 'records' ? html`<${NavStack} root=${html`<${RecordsView} />`} />`
        : id === 'display' ? html`<${NavStack} root=${html`<${DisplayConnectionView} />`} />` : html`<${NavStack} root=${html`<${LibraryView} />`} />`}</div>`)}
    <nav class="tabs">${tabs.map(([id, t, ic]) => html`<button class=${tab === id ? 'on' : ''} aria-current=${tab === id ? 'page' : undefined} onClick=${() => setTab(id)}><${Icon} name=${ic} size=${24} />${t}</button>`)}</nav>
  </div>`;
}

applyAppearance();
bootStore().then(() => { account.init(); account.autoClose(); }).then(() => render(html`<${App} />`, document.getElementById('app'))).then(() => startDomI18n(document.getElementById('app')))   /* 영어 기기면 그려진 글자를 영어로(2026-10-06) */
  .catch(e => { document.getElementById('app').innerHTML = '<div class="boot">불러오지 못했어요. 새로고침해 주세요.</div>'; console.error(e); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
