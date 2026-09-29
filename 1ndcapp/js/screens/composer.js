// 답 직접 고르기 — 공식 없는 능력·거짓을 직접 정할 때·재량 답(예·아니오·숫자·선악·직업·좌석·방향). 판 상태는 바꾸지 않는다
import { html, useState, useEffect } from '../../lib/preact-htm.js';
import { store } from '../store.js';
import { Page, Section, Row, CheckRow, Labeled, Stepper, NavButton, RoleArt, Search, Menu } from '../ui.js';
import { NavStack, useNav, Back } from '../nav.js';
import { SeatBoard } from '../seatboard.js';

const KINDS = [['ox', '예·아니오'], ['num', '숫자'], ['team', '선·악'], ['role', '직업'], ['seats', '좌석'], ['dir', '방향']];

export function AnswerComposer({ close, show }) {
  return html`<${NavStack} root=${html`<${Compose} close=${close} show=${show} />`} />`;
}
function Compose({ close, show }) {
  const nav = useNav();
  useEffect(() => { store.refresh(); }, []);
  const [kind, setKind] = useState('ox'), [yes, setYes] = useState(true), [num, setNum] = useState(0), [good, setGood] = useState(true), [cw, setCw] = useState(true);
  const [role, setRole] = useState(null), [seats, setSeats] = useState([]);
  const b = store.board;
  const text = { ox: yes ? 'O · 그렇다' : 'X · 아니다', num: String(num), team: good ? '선' : '악', dir: cw ? '↻ 시계 방향' : '↺ 반시계 방향', role,
    seats: seats.length ? seats.map(id => b.seats.find(s => s.id === id)).filter(Boolean).map(s => `${s.number}번 ${s.name}`).join(' · ') : null }[kind];
  return html`<${Page} title="답 직접 고르기" left=${html`<${NavButton} label="취소" onClick=${close} />`}
    right=${html`<${NavButton} label="보여 주기" bold disabled=${!text} onClick=${() => { close(); show(text); }} />`}
    top=${html`<div class=${text ? 'headline' : 'headline sec'}>${text || '답을 골라 주세요'}</div>`}>
    <${Section}><${Menu} cls="row tap" label=${html`<div class="rc"><${Labeled} label="답 종류" value=${KINDS.find(k => k[0] === kind)[1]} /></div>`}
      items=${KINDS.map(([k, l]) => ({ label: l, onClick: () => setKind(k) }))} /><//>
    ${kind === 'ox' && html`<${Section}><${CheckRow} title="O · 그렇다" on=${yes} onClick=${() => setYes(true)} /><${CheckRow} title="X · 아니다" on=${!yes} onClick=${() => setYes(false)} /><//>`}
    ${kind === 'num' && html`<${Section}><${Stepper} value=${num} min=${0} max=${20} onChange=${setNum}><span class="title1 num">${num}</span><//><//>`}
    ${kind === 'team' && html`<${Section}><${CheckRow} title="선" on=${good} onClick=${() => setGood(true)} /><${CheckRow} title="악" on=${!good} onClick=${() => setGood(false)} /><//>`}
    ${kind === 'dir' && html`<${Section}><${CheckRow} title="↻ 시계 방향" on=${cw} onClick=${() => setCw(true)} /><${CheckRow} title="↺ 반시계 방향" on=${!cw} onClick=${() => setCw(false)} /><//>`}
    ${kind === 'role' && html`<${Section}><${Row} chevron onClick=${() => nav.push(html`<${RolePick} cur=${role} pick=${r => { setRole(r); nav.pop(); }} />`)}><${Labeled} label="직업" value=${role || '고르기'} /><//><//>`}
    ${kind === 'seats' && html`<div class="boardwrap"><${SeatBoard} board=${b} picked=${seats} numbered=${false} onTap=${id => setSeats(a => a.includes(id) ? a.filter(x => x !== id) : [...a, id])} /></div>`}
  <//>`;
}
function RolePick({ cur, pick }) {
  const [q, setQ] = useState('');
  const roles = ((store.reference || {}).roles || []).filter(r => !q || r.ko.includes(q));
  return html`<${Page} title="직업" left=${html`<${Back} />`}>
    <${Search} value=${q} onInput=${setQ} placeholder="직업 검색" />
    <${Section}>${roles.map(r => html`<${Row} onClick=${() => pick(r.ko)}><${RoleArt} r=${r} size=${28} /><span>${r.ko}</span><span class="sub grow">${r.teamKo}</span>${cur === r.ko && html`<span class="blue">✓</span>`}<//>`)}<//>
  <//>`;
}
