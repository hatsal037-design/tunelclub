// 밤 시작 카드 · 새벽 · 계승 · 과정 시트 · 참고 시트
import { html, useState, useEffect, useRef } from '../../lib/preact-htm.js';
import { store } from '../store.js';
import { Icon } from '../icons.js';
import { Page, Section, Row, RowLabel, Labeled, ActionSheet, Menu, NavButton, RoleArt, Disclosure, Search, Warn, useRun, LargeTitle } from '../ui.js';
import { CoreItems } from './day.js';
import { RoleList } from './library.js';

export function NightIntroView({ m, revealBluffs }) {
  const R = useRun();
  const [reroll, setReroll] = useState(false);
  const notes = m.notes || [], acts = m.actions || [];
  return html`<div>
    <${LargeTitle}>${m.title === '첫밤' ? '첫날밤이 왔어요' : '밤이 왔어요'}<//>
    <${Section}><div class="row">『모두 눈을 감아 주세요. 밤이 되었습니다.』</div><//>
    ${notes.length + acts.length > 0 && html`<${Section}>${notes.map(t => html`<div class="row"><${Warn}>${t}<//></div>`)}
      <${CoreItems} items=${acts} call=${c => R.run('day.call', { call: c })} /><//>`}
    ${m.meet && html`<${Section} header="악팀 알려주기">
      ${m.meet.warn.map(t => html`<div class="row sub">${t}</div>`)}
      ${m.meet.steps.map(t => html`<div class="row">${t}</div>`)}
      ${m.bluffs && m.bluffs.length > 0 && html`
        <div class="row"><${Labeled} label="블러프" value=${m.bluffs.join(' · ')} /></div>
        <${Row} tint onClick=${revealBluffs}>블러프 보여주기<//>
        <${Row} tint onClick=${() => setReroll(true)}>블러프 다시 뽑기<//>`}
    <//>`}
    <${Section} header=${`깨울 순서 ${(m.order || []).length}명`}>
      ${(m.order || []).map((p, k) => html`<div class="row"><span class="sec num" style="width:24px">${k + 1}</span><${RoleArt} r=${p.role} size=${24} /><span class="grow">${p.role || ''}</span><span class="sub">${p.number}번 ${p.name}</span></div>`)}
      ${(m.skipped || []).map(p => html`<div class="row sec"><span style="width:24px"><${Icon} name="minus" size=${18} /></span><${RoleArt} r=${p.role} size=${24} /><span>${p.role || ''}</span><span class="sub grow">${p.why || ''}</span><span class="sub">${p.number}번 ${p.name}</span></div>`)}
    <//>
    <${ActionSheet} open=${reroll} title="블러프를 다시 뽑을까요?" message="이미 보여줬다면 받은 사람이 본 것과 달라져요." onClose=${() => setReroll(false)}
      actions=${[{ label: '다시 뽑기', role: 'destructive', onClick: () => R.run('bluff.reroll') }]} />
    ${R.alert}
  </div>`;
}

export function DawnView({ m }) {
  return html`<div>
    <${LargeTitle}>${m.nextNight ? '첫밤이 끝났어요' : '밤이 끝났어요'}<//>
    ${m.nextNight ? html`<${Section}><div class="row">『눈을 계속 감아 주세요. 둘째 밤입니다.』</div><//>` : html`
      <${Section}><div class="row">『날이 밝았습니다. 모두 눈을 뜨세요.』</div><//>
      <${Section} header="밤사이 죽은 사람">${(m.deaths || []).length ? m.deaths.map(p => html`<div class="row">${p.number}번 ${p.name}</div>`) : html`<div class="row sec">없어요</div>`}<//>`}
  </div>`;
}

export function SuccessionSection({ items, apply }) {
  return html`<${Section} header=${html`<${Icon} name="cycle" size=${14} />계승부터 처리하세요`}>
    ${items.map(s => html`<${Menu} cls="row tap" label=${html`<div class="rc"><${RowLabel} title=${s.name} text=${s.note} /></div>`}
      items=${s.candidates.map(c => ({ label: `${c.number}번 ${c.name}`, onClick: () => apply(s.id, c.index) }))} />`)}
  <//>`;
}

/** A02 · 과정 — 완료·지금·예정·빠짐. 맨 아래: 1.2초 누르기로 «이 판 버리고 역할 다시» */
export function ProcessSheet({ close, discarded }) {
  useEffect(() => { store.refresh(); }, []);
  const p = store.process, R = useRun();
  const [holding, setHolding] = useState(false);
  const t = useRef(null);
  const discard = () => { setHolding(false); R.run('game.discardToRoles', {}, () => { close(); discarded(); }); };
  const down = () => { setHolding(true); t.current = setTimeout(discard, 1200); };
  const up = () => { clearTimeout(t.current); setHolding(false); };
  return html`<${Page} title="과정" left=${html`<${NavButton} label="닫기" onClick=${close} />`}>
    ${p && html`<${Section} header=${p.title}>
      ${p.steps.map(s => html`<div class="row"><span class=${s.status === 'upcoming' ? 'sec' : 'blue'}><${Icon} name=${s.status === 'done' ? 'checkCircle' : s.status === 'current' ? 'dotCircle' : 'circle'} size=${22} /></span>
        <${RoleArt} r=${s.role} size=${24} /><span class="grow">${s.role || ''}</span><span class="sub">${s.number}번 ${s.name}</span></div>`)}
      ${p.skipped.map(s => html`<div class="row sec"><${Icon} name="minusCircle" size=${22} /><${RoleArt} r=${s.role} size=${24} /><span>${s.role || ''}</span><span class="sub grow">${s.why || ''}</span><span class="sub">${s.number}번 ${s.name}</span></div>`)}
    <//>`}
    ${p && p.canDiscard && html`<${Section} footer="1.2초 누르면 기록 없이 이 판을 버리고, 사람·자리는 그대로 역할 단계로 돌아가요.">
      <button class="row tap danger holdbar" style=${`background:linear-gradient(90deg, color-mix(in srgb, var(--red) 15%, transparent) ${holding ? 100 : 0}%, var(--card) 0); transition:background ${holding ? '1.2s linear' : '.15s'}`}
        onPointerDown=${down} onPointerUp=${up} onPointerLeave=${up} onPointerCancel=${up} onContextMenu=${e => e.preventDefault()}>
        <span class="rc">${holding ? '계속 누르고 있어요…' : '이 판 버리고 역할 다시'}</span></button>
    <//>`}
    ${R.alert}
  <//>`;
}

/** A03 · 참고 — 지금 직업, 모드 안내, 직업 목록(검색). 열람은 진행 상태를 바꾸지 않는다 */
export function ReferenceSheet({ close }) {
  useEffect(() => { store.refresh(); }, []);
  const r = store.reference;
  const [q, setQ] = useState('');
  return html`<${Page} title="참고" left=${html`<${NavButton} label="닫기" onClick=${close} />`}>
    <${Search} value=${q} onInput=${setQ} placeholder="직업·능력 검색" />
    ${r && r.current && !q && html`<${Section} header=${`지금 차례 · ${r.current.roleName}`}><div class="row" style="white-space:pre-line">${r.current.detail}</div><//>`}
    ${r && !q && r.guide && html`<${Section}><${Disclosure} label=${`${r.modeName} 안내`}>${r.guide}<//><//>`}
    ${r && (r.groups || []).map(g => html`<${Section} header=${`지금 판 · ${g.ko}`}><${RoleList} roles=${g.roles} q=${q} /><//>`)}
    ${r && (r.bluffs || []).length > 0 && html`<${Section} header="블러프"><${RoleList} roles=${r.bluffs} q=${q} /><//>`}
    ${r && html`<${Section} header=${(r.groups || []).length ? '그 밖의 직업' : '직업'}><${RoleList} roles=${r.roles} q=${q} /><//>`}
  <//>`;
}
