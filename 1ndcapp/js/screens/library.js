// L01 · 자료실 — 계열별 모드·직업 열람(검색). 열람은 진행 중 게임을 바꾸지 않는다
import { html, useState } from '../../lib/preact-htm.js';
import { store } from '../store.js';
import { Page, Section, Row, Search, Empty, Disclosure, RoleArt, LargeTitle } from '../ui.js';
import { useNav, Back } from '../nav.js';

import { ThemeMenu, currentTheme } from './today.js';

const matches = (m, q) => !q || m.name.includes(q) || (m.roleNames || []).some(n => n.includes(q));

/* 위 가운데 테마 버튼(오늘 화면과 같은 것)으로 계열을 골라 그 계열 모드만 본다 — 구경만이라 새 판의 계열은 안 바뀐다(2026-10-02 햇살님).
   같은 제목의 확장판(코어가 parent 를 붙인다)은 원래 모드 밑에 접어 두고 «변형 N» 으로 편다. 검색 중엔 다 편다 */
export function LibraryView() {
  const nav = useNav();
  const [m] = useState(() => store.get('library'));
  const [q, setQ] = useState(''), [theme, setTheme] = useState(currentTheme), [open, setOpen] = useState({});
  const hub = (m ? m.hubs : []).find(h => h.name === theme.hub), all = hub ? hub.modes : [];
  const kids = id => all.filter(x => x.parent === id);
  const shown = q ? all.filter(x => matches(x, q)) : all.filter(x => !x.parent).flatMap(x => [x, ...(open[x.id] ? kids(x.id) : [])]);
  const row = mode => { const n = !q && !mode.parent ? kids(mode.id).length : 0, sub = !q && mode.parent;
    const hit = q && !mode.name.includes(q) ? (mode.roleNames || []).find(x => x.includes(q)) : null;
    return html`<${Row} chevron cls=${sub ? 'kid' : ''} onClick=${() => nav.push(html`<${LibraryMode} id=${mode.id} />`)}><div class="grow"><div>${sub ? mode.short : mode.name}</div>
      <div class="sub">${[mode.players, '직업 ' + mode.roles].filter(Boolean).join(' · ')}</div>${hit && html`<div class="sub blue">${hit} 나옴</div>`}</div>
      ${n > 0 && html`<span class="more blue" role="button" tabindex="0" aria-expanded=${!!open[mode.id]} onClick=${e => { e.stopPropagation(); setOpen(o => ({ ...o, [mode.id]: !o[mode.id] })); }}
        onKeyDown=${e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setOpen(o => ({ ...o, [mode.id]: !o[mode.id] })); } }}>${open[mode.id] ? '접기' : '변형 ' + n}</span>`}<//>`; };
  return html`<${Page} title=${html`<${ThemeMenu} theme=${theme} onPick=${t => { setTheme(t); setQ(''); }} />`}>
    <${LargeTitle}>자료실<//>
    <${Search} value=${q} onInput=${setQ} placeholder=${theme.id + ' 모드·직업 검색'} />
    ${shown.length > 0 && html`<${Section} header=${theme.hub}>${shown.map(row)}<//>`}
    ${m && !shown.length && html`<${Empty} icon="search" title=${`«${q}» 결과 없음`} text="철자를 확인하거나 다른 테마에서 찾아보세요." />`}
  <//>`;
}

export function RoleList({ roles, q }) {
  return roles.filter(r => !q || r.ko.includes(q) || r.ab.includes(q)).map(r => html`<div class=${'row' + (r.dead ? ' dim' : '')}><div class="role-row">
    <${RoleArt} r=${r} size=${40} /><div class="grow"><div class="hstack"><span class="headline">${r.ko}</span><span class="sub">${r.teamKo}</span></div>
      ${r.holders && r.holders.length > 0 && html`<div class="holders">${r.holders.map(h => html`<span class=${h.dead ? 'dead' : ''}>${h.number}번 ${h.name}</span>`)}</div>`}
      <div class="ab3">${r.ab}</div></div></div></div>`);   // holders — 지금 판에서 누가 그 직업인지, 죽은 사람은 회색·취소선(2026-10-01 햇살님)
}

function LibraryMode({ id }) {
  const [m] = useState(() => store.get('library.mode', id));
  const [q, setQ] = useState('');
  return html`<${Page} title=${m ? m.name : '모드'} left=${html`<${Back} />`}>
    <${Search} value=${q} onInput=${setQ} placeholder="직업·능력 검색" />
    ${m && m.guide && !q && html`<${Section}><${Disclosure} label="안내">${m.guide}<//><//>`}
    ${m && html`<${Section} header="직업"><${RoleList} roles=${m.roles} q=${q} /><//>`}
  <//>`;
}
