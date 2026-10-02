// A01 사람 상세 — 직업·상태(사망/부활)·여행자 편·판에서 빼기·표식. 보호·면역이면 코어가 묻는다
import { html, useState } from '../../lib/preact-htm.js';
import { store } from '../store.js';
import { Page, Section, Row, CheckRow, Labeled, ActionSheet, Alert, RoleArt, useRun } from '../ui.js';
import { Back, useNav } from '../nav.js';

export function SeatDetailView({ index, title }) {
  const nav = useNav(), R = useRun();
  const [m, setM] = useState(() => store.get('seat.detail', String(index)));
  const [ask, setAsk] = useState(null);   // 'day' | 'cause' | 'remove' | {confirm}
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
        ${m.ability && html`<div class="row sub" style="white-space:pre-line">${m.ability}</div>`}<//>
      <${Section}>${m.dead ? html`<div class="row"><${Labeled} label="상태" value=${`사망 · ${m.cause || ''}`} /></div><${Row} tint onClick=${() => run('seat.revive', { seat: index })}>부활<//>`
        : html`<div class="row"><${Labeled} label="상태" value="생존" /></div><${Row} danger onClick=${kill}>사망 처리<//>`}<//>
      ${m.sideKind && html`<${Section} header=${m.sideKind === 'traveler' ? '여행자 편' : '편들기(기록용)'}>${[['good', '선팀'], ['evil', '악팀']].map(([sd, l]) => html`<${CheckRow} title=${l} on=${m.side === sd} onClick=${() => run('seat.setSide', { seat: index, side: sd })} />`)}<//>`}
      ${m.canRemove && html`<${Section}><${Row} danger onClick=${() => setAsk('remove')}>판에서 빼기<//><//>`}
      <${Section} header="표식">${m.tokens.map(t => html`<${CheckRow} title=${t.label} on=${t.on} onClick=${() => run('seat.toggleToken', { seat: index, token: t.id })} />`)}<//>`}
    <${ActionSheet} open=${!!conf} ...${conf || {}} onClose=${() => setAsk(null)} />
    <${Alert} open=${!!store.notice} title="알림" message=${store.notice} onClose=${() => { store.notice = null; store.emit(); }} />
    ${R.alert}
  <//>`;
}
