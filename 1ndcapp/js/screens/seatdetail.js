// A01 사람 상세 — 직업·상태(사망/부활)·여행자 편·판에서 빼기·표식. 보호·면역이면 코어가 묻는다
import { html, useState } from '../../lib/preact-htm.js';
import { store } from '../store.js';
import { Page, Section, Row, CheckRow, Labeled, ActionSheet, Alert, RoleArt, useRun, Cover, HoldCover, RoleCard } from '../ui.js';
import { AnswerReveal } from './game.js';
import { Back, useNav } from '../nav.js';
import { Icon } from '../icons.js';

export function SeatDetailView({ index, title }) {
  const nav = useNav(), R = useRun();
  const [m, setM] = useState(() => store.get('seat.detail', String(index)));
  const [ask, setAsk] = useState(null), [recheck, setRecheck] = useState(false), [bluffShow, setBluffShow] = useState(false);   // recheck — 역할 다시 보여주기(2026-10-05)   // 'day' | 'cause' | 'remove' | {confirm}
  const load = () => setM(store.get('seat.detail', String(index)));
  const run = async (t, p) => {
    const r = await store.dispatch(t, p);
    if (r.confirm) setAsk({ t, p, text: r.choices[0] || '계속할까요?', token: r.token });
    else if (r.rejected) R.setReply(r); else load();
  };
  const kill = () => m.isDay ? setAsk('day') : m.askCause ? setAsk('cause') : run('seat.kill', { seat: index, cause: 'night' });
  const sheets = {
    day: { title: '낮에 어떻게 죽었나요?', message: '지명·투표를 거치지 않는 진행자 기록이에요. 투표로 처형했다면 낮 화면에서 해 주세요.',
      actions: [{ label: '처형으로 기록', role: 'destructive', onClick: () => run('seat.kill', { seat: index, cause: 'exec' }) }, { label: '그 밖의 낮 사망', role: 'destructive', onClick: () => run('seat.kill', { seat: index, cause: 'day' }) }] },
    cause: { title: '어떻게 죽었나요?', message: (store.home.demonKo || '흉수') + ' 습격이면 사후 능력·계승이 열려요.',
      actions: [{ label: (store.home.demonKo || '흉수') + '의 습격', role: 'destructive', onClick: () => run('seat.kill', { seat: index, cause: 'demon' }) }, { label: '그 밖의 밤 사망', role: 'destructive', onClick: () => run('seat.kill', { seat: index, cause: 'night' }) }] },
    remove: { title: '이 자리를 판에서 뺄까요?', message: '퇴장한 손님용이에요. 사망 처리와 달라요.',
      actions: [{ label: '판에서 빼기', role: 'destructive', onClick: () => R.run('seat.remove', { seat: index }, () => nav.pop()) }] },
  };
  const conf = ask && typeof ask === 'object' ? { title: ask.text, actions: ask.token === 'shield'
    ? [{ label: '그래도 사망 처리', role: 'destructive', onClick: () => run(ask.t, { ...ask.p, ok_shield: true }) }, { label: '살아남음으로 기록', onClick: () => run(ask.t, { ...ask.p, decline_shield: true }) }]
    : [{ label: '그래도 처리', role: 'destructive', onClick: () => run(ask.t, { ...ask.p, force: true }) }] } : sheets[ask];
  return html`<${Page} title=${title} left=${html`<${Back} />`}>
    ${m && html`
      <${Section}><div class="row"><${Labeled} label="직업" value=${html`<span class="hstack" style="justify-content:flex-end">${m.role && html`<${RoleArt} r=${m.role} size=${24} />`}${m.role ? `${m.role} · ${m.teamKo}` : '없음'}</span>`} /></div>
        ${m.ability && html`<div class="row sub" style="white-space:pre-line">${m.ability}${m.revealRule && html`<br/><span>${m.revealRule}</span>`}</div>`}
        ${m.role && html`<${Row} tint onClick=${() => setRecheck(true)}><${Icon} name="eye" size=${20} />역할 다시 보여주기<//>`}
        ${((store.publicCard(index) || {}).bluffs || []).length > 0 && html`<${Row} tint onClick=${() => setBluffShow(true)}><${Icon} name="theater" size=${20} />블러프 보여주기<//>`}<//>
      <${Section}>${m.dead ? html`<div class="row"><${Labeled} label="상태" value=${`사망 · ${m.cause || ''}`} /></div><${Row} tint onClick=${() => run('seat.revive', { seat: index })}>부활<//>`
        : html`<div class="row"><${Labeled} label="상태" value="생존" /></div><${Row} danger onClick=${kill}>사망 처리<//>`}<//>
      ${m.sideKind && html`<${Section} header=${m.sideKind === 'traveler' ? '여행자 편' : '편들기(기록용)'}>${[['good', '선팀'], ['evil', '악팀']].map(([sd, l]) => html`<${CheckRow} title=${l} on=${m.side === sd} onClick=${() => run('seat.setSide', { seat: index, side: sd })} />`)}<//>`}
      ${m.canRemove && html`<${Section}><${Row} danger onClick=${() => setAsk('remove')}>판에서 빼기<//><//>`}
      <${Section} header="표식">${m.tokens.filter(t => t.on).map(t => html`<div class="row"><span class="grow">${t.label}</span>
          <button class="xbtn" aria-label=${`${t.label} 떼기`} onClick=${() => run('seat.toggleToken', { seat: index, token: t.id })}><${Icon} name="xmark" size=${16} stroke=${2.4} /></button></div>`)}
        ${m.tokens.some(t => !t.on) && html`<label class="row tap tint selrow"><${Icon} name="plus" size=${20} /><span class="grow">표식 붙이기</span><${Icon} name="chevronDown" size=${16} stroke=${2.4} />
          <select aria-label="표식 붙이기" value="" onChange=${e => { const v = e.currentTarget.value; e.currentTarget.value = ''; if (v) run('seat.toggleToken', { seat: index, token: v }); }}><option value="">고르기</option>${m.tokens.filter(t => !t.on).map(t => html`<option value=${t.id}>${t.label}</option>`)}</select></label>`}<//>`}
    <${ActionSheet} open=${!!conf} ...${conf || {}} onClose=${() => setAsk(null)} />
    <${Alert} open=${!!store.notice} title="알림" message=${store.notice} onClose=${() => { store.notice = null; store.emit(); }} />
    <${Cover} open=${recheck}>${recheck && html`<${RoleRecheck} index=${index} name=${m ? m.name : ''} close=${() => setRecheck(false)} />`}<//>
    <${Cover} open=${bluffShow}>${bluffShow && (b => html`<${AnswerReveal} name=${m ? m.name : ''} answer=${b.join(', ')} bluff=${b} done=${() => setBluffShow(false)} />`)((store.publicCard(index) || {}).bluffs || [])}<//>
    ${R.alert}
  <//>`;
}

/* 판 중 «역할 다시 보여주기» — 넘기기·답 보여주기와 같은 틀(HoldCover)·같은 역할 카드. 카드는 코어 handoff.public(취한 사람은 처음 받은 가짜 카드). 처음 누를 때 그 카드를 «본 카드»로 남긴다(handoff.reshown — 참가자 폰 «내 직업», 2026-10-25) */
function RoleRecheck({ index, name, close }) {
  const [shown, setShown] = useState(null), [marked, setMarked] = useState(false);
  return html`<${HoldCover} title=${`${name}님`} close=${close} scroll
    reveal=${on => { setShown(on ? store.publicCard(index) : null); if (on && !marked) { setMarked(true); store.dispatch('handoff.reshown', { index }); } }}
    content=${() => shown && html`<${RoleCard} c=${shown}>${(shown.history || []).map(h => html`<div class="rblock"><div class="hn">${h.n === 1 ? '첫밤' : `${h.n}번째 밤`}</div>${h.lines.map(l => html`<div>${l}</div>`)}</div>`)}<//>`} />`;
}
