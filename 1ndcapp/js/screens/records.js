// R01 · 기록 — 날짜별 목록 · 사람별 통계(코어 statsOf 결과만) · 상세(과정·참가자·승자 정정·지우기)
import { html, useState, useEffect } from '../../lib/preact-htm.js';
import { store } from '../store.js';
import { Icon } from '../icons.js';
import { Page, Section, Row, Labeled, Empty, ActionSheet, Menu, useRun, LargeTitle } from '../ui.js';
import { useNav, Back } from '../nav.js';
import { ReplayView } from './replay.js';

const day = s => String(s || '').slice(0, 16).replace('T', ' ');

export function RecordsView({ embedded }) {
  const nav = useNav();
  const [m, setM] = useState(null);
  const load = () => setM(store.get('records'));
  useEffect(load, [store.seen]);
  const body = m && m.rows.length ? html`
    <${Section} header="판">${m.rows.map(r => html`<${Row} key=${r.id} chevron onClick=${() => nav.push(html`<${RecordDetail} id=${r.id} reload=${load} />`)}>
      <div class="grow"><div class="hstack"><span class="headline grow">${r.winnerKo}</span><span class="sub">${day(r.date)}</span></div>
      <div class="sub">${r.mode} · ${r.count}명</div></div><//>`)}<//>
    ${m.people.length > 0 && html`<${Section} header="사람별">${m.people.map(p => html`<div class="row"><${Labeled} label=${p.name} value=${`${p.games}판 · ${p.wins}승 · 선${p.good} 악${p.evil}`} /></div>`)}<//>`}`
    : html`<${Empty} icon="clock" title="아직 완료한 판이 없어요" text="판을 끝내면 여기에 결과와 과정이 쌓여요." />`;
  return html`<${Page} title=${embedded ? '기록' : ''} left=${embedded ? html`<${Back} />` : null}>${!embedded && html`<${LargeTitle}>기록<//>`}
    ${body}<//>`;
}

function RecordDetail({ id, reload }) {
  const nav = useNav(), R = useRun();
  const [r, setR] = useState(() => store.get('record', id));
  const [del, setDel] = useState(false);
  const after = () => { setR(store.get('record', id)); reload(); };
  if (!r) return html`<${Page} title="판 기록" left=${html`<${Back} />`} />`;
  return html`<${Page} title="판 기록" left=${html`<${Back} />`}>
    <${Section}>
      <div class="row" style="display:block"><div class="title2">${r.winnerKo}</div>
        <div class="sub" style="margin-top:6px">${day(r.date)} · ${r.mode} · ${r.count}명 · 밤 ${r.nights}</div>
        ${r.note && html`<div class="sub" style="margin-top:6px;color:var(--label)">${r.note}</div>`}</div>
      <div class="row"><${Menu} cls="blink" label=${html`<${Icon} name="pencil" size=${20} />승자 정정`}
        items=${[['good', '선 승리'], ['evil', '악 승리'], ['other', '중립 승리'], ['void', '무효']].map(([w, l]) => ({ label: l, onClick: () => R.run('record.setWinner', { id, winner: w }, after) }))} /></div>
    <//>
    <${Section}><${Row} chevron onClick=${() => nav.push(html`<${ReplayView} id=${id} />`)}>복기<//><//>
    ${r.events.length > 0 && html`<${Section} header="과정">${r.events.map(e => html`<div class="row sub" style="color:var(--label)">${e}</div>`)}<//>`}
    <${Section} header="참가자">${r.players.map(p => html`<div class="row"><span>${p.number}번 ${p.name}</span><span class="sub grow">${p.role}</span>${p.won && html`<span class="blue" aria-label="이김"><${Icon} name="checkCircle" size=${20} /></span>`}</div>`)}<//>
    <${Section}><${Row} danger onClick=${() => setDel(true)}>이 기록 지우기<//><//>
    <${ActionSheet} open=${del} title="이 판 기록을 지울까요?" message="통계에서도 빠져요. 되돌릴 수 없어요." onClose=${() => setDel(false)}
      actions=${[{ label: '지우기', role: 'destructive', onClick: () => R.run('record.delete', { id }, () => { reload(); nav.pop(); }) }]} />
    ${R.alert}
  <//>`;
}
