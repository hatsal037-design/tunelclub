// 세 층: 앱 탭(오늘·기록·자료실) · 준비/진행 전면 · 시트. 전면 공간이 탭을 덮는다(폰 앱 AppRoot 와 같다)
import { html, render, useState, useEffect } from '../lib/preact-htm.js';
import { store, bootStore } from './store.js';
import { applyAppearance } from './settings.js';
import { stopSpeaking } from './narrator.js';
import { Icon } from './icons.js';
import { NavStack } from './nav.js';
import { TodayView } from './screens/today.js';
import { RecordsView } from './screens/records.js';
import { LibraryView } from './screens/library.js';
import { PreparationFlow } from './screens/prep.js';
import { GameFlow } from './screens/game.js';

function useStore() { const [, f] = useState(0); useEffect(() => store.subscribe(() => f(x => x + 1)), []); }

function App() {
  useStore();
  const [tab, setTab] = useState('today');
  const [space, setSpace] = useState(null);   // {prep:'people'|'seats'|'roles'|'handoff'} | {game:true}
  const close = () => { setSpace(null); stopSpeaking(); store.refresh(); };
  useEffect(() => { history.replaceState(null, ''); }, []);
  if (space) {
    const go = s => setSpace(s);
    return html`<div class="shell">${space.game
      ? html`<${NavStack} key="game" root=${html`<${GameFlow} close=${close} toRoles=${() => go({ prep: 'roles' })} toPrep=${step => go({ prep: step })} />`} />`
      : html`<${PreparationFlow} key=${'prep-' + space.prep} step=${space.prep} go=${go} close=${close} />`}</div>`;
  }
  const tabs = [['today', '오늘', 'house'], ['records', '기록', 'clock'], ['library', '자료실', 'books']];
  return html`<div class="shell">
    ${tabs.map(([id]) => html`<div class="tabpage" key=${id} style=${tab === id ? '' : 'display:none'}>
      ${id === 'today' ? html`<${NavStack} root=${html`<${TodayView} openSpace=${setSpace} />`} />`
        : id === 'records' ? html`<${NavStack} root=${html`<${RecordsView} />`} />` : html`<${NavStack} root=${html`<${LibraryView} />`} />`}</div>`)}
    <nav class="tabs">${tabs.map(([id, t, ic]) => html`<button class=${tab === id ? 'on' : ''} aria-current=${tab === id ? 'page' : undefined} onClick=${() => setTab(id)}><${Icon} name=${ic} size=${24} />${t}</button>`)}</nav>
  </div>`;
}

applyAppearance();
bootStore().then(() => render(html`<${App} />`, document.getElementById('app')))
  .catch(e => { document.getElementById('app').innerHTML = '<div class="boot">불러오지 못했어요. 새로고침해 주세요.</div>'; console.error(e); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
