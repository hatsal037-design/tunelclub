// L01 · 자료실 — 계열별 모드·직업 열람(검색). 열람은 진행 중 게임을 바꾸지 않는다
import { html, useState } from '../../lib/preact-htm.js';
import { store } from '../store.js';
import { Page, Section, Row, Search, Empty, Disclosure, RoleArt, LargeTitle } from '../ui.js';
import { useNav, Back } from '../nav.js';

const matches = (m, q) => !q || m.name.includes(q) || (m.roleNames || []).some(n => n.includes(q));

export function LibraryView() {
  const nav = useNav();
  const [m] = useState(() => store.get('library'));
  const [q, setQ] = useState('');
  const hubs = (m ? m.hubs : []).map(h => ({ ...h, modes: h.modes.filter(x => matches(x, q)) })).filter(h => h.modes.length);
  return html`<${Page} title="">
    <${LargeTitle}>자료실<//>
    <${Search} value=${q} onInput=${setQ} placeholder="모드·직업 검색" />
    ${hubs.map(h => html`<${Section} header=${h.name}>${h.modes.map(mode => {
      const hit = q && !mode.name.includes(q) ? (mode.roleNames || []).find(n => n.includes(q)) : null;
      return html`<${Row} chevron onClick=${() => nav.push(html`<${LibraryMode} id=${mode.id} />`)}><div class="grow"><div>${mode.name}</div>
        <div class="sub">${[mode.players, '직업 ' + mode.roles].filter(Boolean).join(' · ')}</div>${hit && html`<div class="sub blue">${hit} 나옴</div>`}</div><//>`;
    })}<//>`)}
    ${m && !hubs.length && html`<${Empty} icon="search" title=${`«${q}» 결과 없음`} text="철자를 확인하거나 다른 말로 찾아보세요." />`}
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
