// 복기 — 끝난 판의 요약 · 밤낮 넘겨보기 · 참가자 공유판 (30차 시안 2026-10-01 햇살님 «이대로 화면 만들기»)
// 계산은 전부 코어 GameReplay(game.replay) — 화면은 그리기만. 정보만으로 좁힌 후보는 무거워서 그린 뒤 따로(game.replayNarrow)
import { html, useState, useEffect } from '../../lib/preact-htm.js';
import { store } from '../store.js';
import { Page, Section, Row, Cover, NavButton } from '../ui.js';
import { useNav, Back } from '../nav.js';

const EVIL = { minion: 1, demon: 1, mafia: 1 };
const WIN = { good: '선 승리', evil: '악 승리' };
const kcls = k => /악을 잡음|킬을 막음|승부/.test(k) ? 'rp-good' : /잃음|흐려짐|선을 처형|계승/.test(k) ? 'rp-evil' : 'sec';

/** 요약 — host 면 사람별(진행자만)과 넘겨보기·공유 단추 */
function Summary({ r, host, narrow }) {
  const st = r.통계, pct = (a, b) => b ? ` ${Math.round(100 * a / b)}%` : '';
  const nw = (narrow || []).filter(x => x.좁힘);
  return html`
    <div class="rp-hero"><div class="rp-w">${WIN[r.승자] || '판 끝'}</div><div class="rp-m">${r.모드} · ${r.인원}명 · 밤 ${r.밤.length}</div></div>
    ${r.주요장면.length > 0 && html`<${Section} header="주요 장면">${r.주요장면.map(s => html`<div class="row rp-scene"><span class="rp-when">${s.때}</span><div><div class=${'rp-kind ' + kcls(s.종류)}>${s.종류}</div><div>${s.글}</div></div></div>`)}<//>`}
    <${Section} header="통계">
      <div class="row rp-stat"><span>처형 적중</span><b>${st.처형.악}/${st.처형.수}<small>${pct(st.처형.악, st.처형.수)}</small></b></div>
      <div class="row rp-stat"><span>선의 지명 적중</span><b>${st.지명.악}/${st.지명.수}<small>${pct(st.지명.악, st.지명.수)}</small></b></div>
      ${st.정보.수 > 0 && html`<div class="row rp-stat"><span>받은 정보 중 참</span><b>${st.정보.참}/${st.정보.수}</b></div>`}
      ${st.정보.악을짚음 > 0 && html`<div class="row rp-stat"><span>악을 짚은 정보 → 지명·처형</span><b>${st.정보.이어짐}/${st.정보.악을짚음}</b></div>`}
      ${nw.map(x => html`<div class="row rp-stat"><span>낮 ${x.낮} 정보만으로 좁힌 흉수 후보</span><b>${x.후보수}명<small> ${x.누구}</small></b></div>`)}
    <//>
    ${st.좋은장면.length > 0 && html`<${Section} header="좋은 장면">${st.좋은장면.map(g => html`<div class="row"><div><div class="rp-kind rp-good">${g.종류}</div><div>${g.이름}${g.대상 ? ' → ' + g.대상 : ''}</div></div></div>`)}<//>`}
    ${host && st.사람별 && html`<${Section} header="사람별 (진행자만)">${st.사람별.filter(p => !EVIL[p.편]).sort((a, b) => b.악지명 - a.악지명 || b.악에찬성 - a.악에찬성).map(p => html`<div class="row rp-stat"><span>${p.이름}</span><small class="sec">악 지명 ${p.악지명} · 악에 찬성 ${p.악에찬성}/${p.찬성}</small></div>`)}<//>`}`;
}

/** 자리표 위에 그 밤·낮 — 빨강 악의 행동, 초록 선의 행동, 파란 점선 받은 정보, 빨간 자리 그때 죽음 */
function Board({ r, step, dead }) {
  const P = r.사람, N = P.length, W = 340, H = 300, cx = W / 2, cy = H / 2, rx = 142, ry = 120, pos = {};
  P.forEach((p, i) => { const a = (-90 + i * 360 / N) * Math.PI / 180; pos[p.자리] = [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; });
  const lines = [], ln = (a, b, cls) => { if (pos[a] && pos[b] && a !== b) lines.push({ a: pos[a], b: pos[b], cls }); };
  const d = step.d, died = new Set((d.죽음 || []).map(x => x.자리).concat((d.처형 || []).map(x => x.자리)));
  if (step.t === 'n') { d.악행동.forEach(x => x.대상.forEach(t => ln(x.자리, t, 'evil'))); d.선행동.forEach(x => x.대상.forEach(t => ln(x.자리, t, 'good'))); d.정보.forEach(x => (x.짚은 || []).forEach(t => ln(x.자리, t, x.거짓 ? 'info false' : 'info'))); }
  else d.지명.forEach(x => x.지명자 && ln(x.지명자, x.대상, x.악 ? 'good' : 'evil'));
  return html`<div class="rp-board"><svg viewBox=${`0 0 ${W} ${H}`} aria-hidden="true">
      <defs><marker id="rpa" markerWidth="8" markerHeight="8" refX="15" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="context-stroke" /></marker></defs>
      ${lines.map(l => html`<line class=${'rp-ln ' + l.cls} x1=${l.a[0]} y1=${l.a[1]} x2=${l.b[0]} y2=${l.b[1]} marker-end="url(#rpa)" />`)}</svg>
    ${P.map(p => html`<div class=${'rp-st' + (EVIL[p.편] ? ' evil' : '') + (dead.has(p.자리) ? ' dead' : '') + (died.has(p.자리) ? ' died' : '')} style=${`left:${pos[p.자리][0]}px;top:${pos[p.자리][1]}px`}><i>${p.자리}</i><em>${p.이름}</em></div>`)}
  </div>`;
}

function Steps({ r }) {
  const steps = []; r.밤.forEach(n => { steps.push({ t: 'n', d: n }); const dd = r.낮.find(x => x.밤 === n.밤); if (dd) steps.push({ t: 'd', d: dd }); });
  const [k, setK] = useState(0), s = steps[k];
  if (!s) return html`<${Page} title="밤낮 넘겨보기" left=${html`<${Back} />`} />`;
  const nameOf = n => (r.사람.find(p => p.자리 === n) || {}).이름 || n + '번';
  const dead = new Set(); steps.slice(0, k).forEach(x => { (x.d.죽음 || []).forEach(y => dead.add(y.자리)); (x.d.처형 || []).forEach(y => dead.add(y.자리)); });
  const rows = [];
  if (s.t === 'n') {
    s.d.악행동.forEach(x => rows.push(['악', `${x.이름}(${x.직업}) → ${x.대상.map(nameOf).join(', ')}`, 'rp-evil']));
    s.d.선행동.forEach(x => rows.push(['선', `${x.이름}(${x.직업}) → ${x.대상.map(nameOf).join(', ')}`, 'rp-good']));
    s.d.죽음.forEach(x => rows.push(['죽음', `${x.이름}(${x.직업})`, 'rp-evil']));
    s.d.막힘.forEach(x => rows.push(['막음', `${x.이름}${x.막은 ? ' — ' + x.막은 + '의 보호' : ''}`, 'rp-good']));
    s.d.정보.forEach(x => rows.push(['정보', `${x.이름}(${x.직업}) ${x.답}${x.거짓 ? ' · 거짓' : ''}`, 'rp-info']));
  } else {
    s.d.지명.forEach(x => { const v = s.d.투표.find(y => y.대상 === x.대상); rows.push(['지명', `${nameOf(x.지명자)} → ${nameOf(x.대상)}${x.악 ? ' · 악' : ''}${v ? ` · ${v.표}표` : ''}`, x.악 ? 'rp-good' : '']); });
    s.d.처형.forEach(x => rows.push(['처형', `${x.이름}(${x.직업})${x.흉수 ? ' — 흉수' : ''}`, x.악 ? 'rp-good' : 'rp-evil']));
    if (!s.d.처형.length) rows.push(['처형', '없음', 'sec']);
  }
  return html`<${Page} title="밤낮 넘겨보기" left=${html`<${Back} />`}>
    <div class="rp-tabs" role="tablist">${steps.map((x, j) => html`<button role="tab" aria-selected=${j === k} class=${'rp-tab' + (j === k ? ' on' : '')} onClick=${() => setK(j)}>${x.t === 'n' ? '밤' : '낮'} ${x.d.밤}</button>`)}</div>
    <${Board} r=${r} step=${s} dead=${dead} />
    <div class="rp-legend">${s.t === 'n' ? html`<span class="evil">악의 행동</span><span class="good">선의 행동</span><span class="info">받은 정보</span>` : html`<span class="good">악을 겨눈 지명</span><span class="evil">선을 겨눈 지명</span>`}</div>
    <${Section}>${rows.length ? rows.map(x => html`<div class="row rp-scene"><span class=${'rp-when ' + x[2]}>${x[0]}</span><div>${x[1]}</div></div>`) : html`<div class="row sec">기록된 행동 없음</div>`}<//>
  <//>`;
}

/** 복기 — id 없으면 방금 끝난 판 */
export function ReplayView({ id }) {
  const nav = useNav();
  const [r] = useState(() => store.get('game.replay', id || ''));
  const [narrow, setNarrow] = useState(null), [share, setShare] = useState(false);
  useEffect(() => { const t = setTimeout(() => setNarrow(store.get('game.replayNarrow', id || '') || []), 30); return () => clearTimeout(t); }, [id]);
  if (!r) return html`<${Page} title="복기" left=${html`<${Back} />`}><div class="row sec">복기할 판을 찾지 못했어요.</div><//>`;
  return html`<${Page} title="복기" left=${html`<${Back} />`}>
    <${Summary} r=${r} host=${true} narrow=${narrow} />
    <${Section}>
      <${Row} chevron onClick=${() => nav.push(html`<${Steps} r=${r} />`)}>밤낮 넘겨보기<//>
      <${Row} chevron onClick=${() => setShare(true)}>참가자에게 보여 주기<//>
    <//>
    <${Cover} open=${share}>${share && html`<${Page} title="복기" right=${html`<${NavButton} label="닫기" bold onClick=${() => setShare(false)} />`}><${Summary} r=${store.get('game.replay', 'public:' + (id || ''))} host=${false} narrow=${narrow} /><//>`}<//>
  <//>`;
}
