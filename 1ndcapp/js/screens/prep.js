// 준비 전면 — 인원 → 자리 → 역할 → 넘기기(01 P01~P04). 닫기는 초안을 버리지 않는다
import { html, useState, useEffect, useRef } from '../../lib/preact-htm.js';
import { store } from '../store.js';
import { Icon } from '../icons.js';
import { Page, Section, Row, RowLabel, CheckRow, Labeled, Primary, Stepper, Segmented, Sheet, Cover, ActionSheet, Menu, NavButton, RoleArt, HoldButton, Disclosure, useRun, LargeTitle, Empty, cx } from '../ui.js';
import { NavStack, useNav, Back } from '../nav.js';
import { SeatBoard, boardLayout } from '../seatboard.js';
import { account } from '../account.js';
import { Search } from '../ui.js';

/** 투넬 회원 고르기 — 오늘 참석 → 최근 → 모든 회원. 이미 넣은 회원은 체크된 채 */
function MemberPicker({ taken, close, done }) {
  const [rows, setRows] = useState(undefined), [sel, setSel] = useState(() => new Set()), [q, setQ] = useState('');
  useEffect(() => { account.members().then(setRows); }, []);
  const list = (rows || []).filter(r => !q || String(r.nick || '').toLowerCase().includes(q.toLowerCase()));
  const row = r => { const on = sel.has(r.member_id) || taken.includes(r.member_id);
    return html`<${Row} disabled=${taken.includes(r.member_id)} sel=${on} onClick=${() => setSel(s => { const n = new Set(s); n.has(r.member_id) ? n.delete(r.member_id) : n.add(r.member_id); return n; })}>
      <span class="grow">${r.nick}</span>${on && html`<span class="blue"><${Icon} name="check" size=${20} stroke=${2.4} /></span>`}<//>`; };
  const grp = (t, l) => l.length ? html`<${Section} header=${t}>${l.map(row)}<//>` : null;
  return html`<${Page} title="투넬 회원" left=${html`<${NavButton} label="취소" onClick=${close} />`}
    right=${html`<${NavButton} label=${sel.size ? sel.size + '명 넣기' : '넣기'} bold disabled=${!sel.size} onClick=${() => { done((rows || []).filter(r => sel.has(r.member_id))); close(); }} />`}>
    <${Search} value=${q} onInput=${setQ} placeholder="닉네임 검색" />
    ${rows === undefined ? html`<${Empty} title="명단 받는 중…" />` : rows === null ? html`<${Empty} icon="warn" title="명단을 못 받았어요" text="로그인·연결을 확인해 주세요." />`
      : html`${grp('오늘 참석', list.filter(r => r.today))}${grp('최근', list.filter(r => !r.today && r.recent))}${grp(q ? '찾은 회원' : '모든 회원', list.filter(r => !r.today && !r.recent))}
        ${!list.length && html`<${Empty} title="해당하는 회원이 없어요" />`}`}
  <//>`;
}

const STEPS = [['people', '인원'], ['seats', '자리'], ['roles', '역할'], ['handoff', '넘기기']];

export function PreparationFlow({ step, go, close }) {
  const k = STEPS.findIndex(s => s[0] === step), prev = STEPS[k - 1];
  const title = store.home.practice ? '연습판 준비' : '새 판 준비';
  const header = html`<div class="steps">${STEPS.map(([id, t]) => html`<span class=${id === step ? 'on' : ''}>${t}</span>`)}</div>
    <div class="prog"><i style=${`width:${(k + 1) / 4 * 100}%`}></i></div>`;
  const common = { title, header, left: prev ? html`<${NavButton} icon="chevronLeft" label="이전 단계" onClick=${() => go({ prep: prev[0] })} />` : null, right: html`<${NavButton} label="닫기" onClick=${close} />` };
  return html`<${NavStack} root=${
    step === 'people' ? html`<${PeopleView} c=${common} next=${() => go({ prep: 'seats' })} />`
    : step === 'seats' ? html`<${SeatsView} c=${common} next=${() => go({ prep: 'roles' })} editNames=${() => go({ prep: 'people' })} />`
    : step === 'roles' ? html`<${RolesView} c=${common} next=${() => go({ prep: 'handoff' })} />`
    : html`<${HandoffView} c=${common} start=${() => go({ game: true })} />`} />`;
}
const PrepPage = ({ c, children, bottom }) => html`<${Page} title=${c.title} left=${c.left} right=${c.right} top=${c.header} bottom=${bottom}>${children}<//>`;

/** P01 · 인원 — 인원 스테퍼 + 닉네임 입력 + 투넬 회원에서 고르기. «자리 정하기»가 명단을 코어에 확정한다 */
function PeopleView({ c, next }) {
  const [names, setNames] = useState(() => { const n = store.board.seats.map(s => s.name); while (n.length < 5) n.push(''); return n; });
  const [members, setMembers] = useState(() => { const m = store.board.seats.map(s => s.member || null); while (m.length < 5) m.push(null); return m; });   // 칸마다 투넬 회원 번호(없으면 이름만)
  const [picking, setPicking] = useState(false);
  const addMembers = rows => {   // 빈 칸부터 채우고 모자라면 늘린다 — 이미 있는 회원은 건너뛴다
    const n = names.slice(), m = members.slice();
    rows.filter(r => !m.includes(r.member_id)).forEach(r => { let k = n.findIndex(x => !x.trim()); if (k < 0) { if (n.length >= 20) return; n.push(''); m.push(null); k = n.length - 1; } n[k] = r.nick; m[k] = r.member_id; });
    setNames(n); setMembers(m);
  };
  const [ask, setAsk] = useState(null);
  const R = useRun();
  const valid = names.length >= 5 && names.every(n => n.trim());
  const setCount = n => { setNames(a => n > a.length ? a.concat(Array(n - a.length).fill('')) : a.slice(0, n)); setMembers(a => n > a.length ? a.concat(Array(n - a.length).fill(null)) : a.slice(0, n)); };
  const commit = async force => {
    const p = { people: names.map((n, i) => members[i] ? { name: n.trim(), member: members[i] } : { name: n.trim() }) }; if (force) p.force = true;
    const r = await R.run('preparation.commitPeople', p);
    if (r.ok) next(); else if (r.confirm) setAsk(r.choices[0] || '역할을 다시 나눠요.');
  };
  const inputs = useRef([]);
  return html`<${PrepPage} c=${c} bottom=${html`<${Primary} title="자리 정하기" enabled=${valid} loading=${R.busy} onClick=${() => commit(false)} />`}>
    <${LargeTitle}>인원<//>
    <${Section}><${Stepper} value=${names.length} min=${5} max=${20} onChange=${setCount}>참가 인원 ${names.length}명<//><//>
    <${Section}><${Row} tint onClick=${() => account.user ? setPicking(true) : account.login()}><${Icon} name="person2" size=${20} />${account.user ? '투넬 회원에서 고르기' : '투넬 회원에서 고르기 · 로그인'}<//><//>
    <${Section} header="닉네임">${names.map((n, i) => html`<div class="row" key=${i}><span class="sec num" style="width:28px">${i + 1}</span>
      <input class="textin" ref=${el => inputs.current[i] = el} value=${n} placeholder="닉네임" enterkeyhint=${i + 1 < names.length ? 'next' : 'done'}
        onInput=${e => { const v = e.currentTarget.value; setNames(a => a.map((x, j) => j === i ? v : x)); if (members[i]) setMembers(a => a.map((x, j) => j === i ? null : x)); }}
        onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); const nx = inputs.current[i + 1]; if (nx) nx.focus(); else e.currentTarget.blur(); } }} />${members[i] && html`<span class="tag">회원</span>`}</div>`)}<//>
    <${Sheet} open=${picking} onClose=${() => setPicking(false)}>${picking && html`<${MemberPicker} taken=${members.filter(Boolean)} close=${() => setPicking(false)} done=${addMembers} />`}<//>
    <${ActionSheet} open=${!!ask} title=${ask} onClose=${() => setAsk(null)} actions=${[{ label: '역할 비우고 변경', role: 'destructive', onClick: () => commit(true) }]} />
    ${R.alert}
  <//>`;
}

/** P02 · 자리 — 원형|사각, 자리판(끌어서 끼워 넣기), 1번 자리, 배치 설정, 이름과 자리 편집, 자리표 이미지 공유 */
function SeatsView({ c, next, editNames }) {
  const b = store.board, R = useRun();
  const [grid, setGrid] = useState(false);
  const run = (t, p) => R.run(t, p);
  const origin = b.seats.find(s => s.number === 1);
  return html`<${PrepPage} c=${c} bottom=${html`<${Primary} title="역할 정하기" onClick=${next} />`}>
    <div class="ltitle"><h1>자리</h1><p class="sec">실제로 앉은 순서대로 맞춰주세요.</p></div>
    <div style="padding:8px 20px"><${Segmented} value=${b.shape} disabled=${!b.canRearrange} onChange=${v => run('board.setLayout', { layout: v === 'rect' ? 'rect' : 'circle' })} options=${[['round', '원형'], ['rect', '사각']]} /></div>
    <div class="boardwrap"><${SeatBoard} board=${b} draggable=${true}
      move=${(from, to, fwd) => run('seat.move', fwd === undefined ? { from, to } : { from, to, dir: fwd ? 'fwd' : 'back' })}
      moveGap=${(from, to) => run('board.moveGap', { from, to })} /></div>
    <${Section} footer="끌어서 사이에 놓으면 그 자리로 들어가요.">
      <${Menu} cls="row tap" disabled=${!b.canRearrange} label=${html`<div class="rc"><${RowLabel} title="1번 자리" text=${`${origin ? origin.name : ''} · 시계 방향`} /></div><span class="chev"><${Icon} name="chevronRight" size=${16} stroke=${2.4} /></span>`}
        items=${b.seats.filter(s => s.number !== 1).map(s => ({ label: s.name, onClick: () => run('seat.setOrigin', { seat: s.index }) }))} />
      ${b.shape === 'rect' && html`<${Row} chevron onClick=${() => setGrid(true)}><${RowLabel} title="배치 설정" text=${`${b.cols}×${b.rows} · 빈자리 ${b.cells.filter(x => !x.seatID).length}`} /><//>`}
      <${Row} chevron onClick=${editNames}><${RowLabel} title="이름과 자리 편집" /><//>
      <${Row} chevron onClick=${() => shareSeatMap(b)}><${RowLabel} title="자리표 이미지 공유" /><//>
    <//>
    <${Sheet} open=${grid} onClose=${() => setGrid(false)}><${GridSheet} run=${run} close=${() => setGrid(false)} /><//>
    ${R.alert}
  <//>`;
}

function GridSheet({ run, close }) {
  const b = store.board, gaps = b.cells.filter(x => !x.seatID).length;
  return html`<${Page} title="배치 설정" right=${html`<${NavButton} label="완료" bold onClick=${close} />`}>
    <${Section} footer=${`둘레 ${b.cells.length}칸 · 사람 ${b.seats.length}명 · 빈자리 ${gaps}`}>
      <${Stepper} value=${b.cols} min=${1} max=${10} onChange=${v => run('board.changeGrid', { axis: 'cols', delta: v - b.cols })}><${Labeled} label="가로" value=${b.cols + '칸'} /><//>
      <${Stepper} value=${b.rows} min=${1} max=${10} onChange=${v => run('board.changeGrid', { axis: 'rows', delta: v - b.rows })}><${Labeled} label="세로" value=${b.rows + '칸'} /><//>
    <//>
    ${gaps > 0 && html`<${Section}><${Row} tint onClick=${() => run('board.closeGaps', {})}>빈자리 없애기<//><${Row} tint onClick=${() => run('board.spreadGaps', {})}>빈자리 고르게 퍼뜨리기<//><//>`}
    <div class="boardwrap nohit"><${SeatBoard} board=${b} /></div>
  <//>`;
}

/** 자리표 이미지 — 이름·번호만(직업·표식 없음). 공유가 되면 공유, 아니면 내려받기 */
async function shareSeatMap(board) {
  const W = 420, { h, L } = boardLayout(board, W - 48), S = 3, H = h + 120;
  const cv = document.createElement('canvas'); cv.width = W * S; cv.height = H * S;
  const g = cv.getContext('2d'); g.scale(S, S); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  const font = (w, px) => `${w} ${px}px -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
  g.fillStyle = '#000'; g.textAlign = 'center'; g.font = font(700, 22); g.fillText('자리표', W / 2, 48);
  g.translate(24, 68);
  if (L.round) { g.setLineDash([3, 4]); g.strokeStyle = 'rgba(60,60,67,.29)'; g.beginPath(); g.ellipse(L.center.x, L.center.y, L.rx, L.ry, 0, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#000'; g.font = font(700, 34); g.textBaseline = 'middle'; g.fillText(board.seats.length + '명', L.center.x, L.center.y); }
  board.seats.forEach((s, k) => { const p = L.slots[k];
    g.fillStyle = '#f2f2f7'; g.beginPath(); g.arc(p.x, p.y, 22, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(60,60,67,.29)'; g.stroke();
    g.fillStyle = '#000'; g.font = font(600, 17); g.textBaseline = 'middle'; g.fillText(String(s.number), p.x, p.y);
    g.font = font(400, 13); g.textBaseline = 'top'; g.fillText(s.name.length > 7 ? s.name.slice(0, 7) + '…' : s.name, p.x, p.y + 28); });
  g.setTransform(S, 0, 0, S, 0, 0); g.fillStyle = 'rgba(60,60,67,.6)'; g.font = font(400, 15); g.textBaseline = 'alphabetic'; g.fillText('1번부터 시계 방향', W / 2, H - 20);
  const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
  const file = new File([blob], '자리표.png', { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: '자리표' }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '자리표.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** P03 · 역할 — 게임 계열 · 모드 · 권장 구성 · 직접 구성 · 여행자 · 승리 조건 */
function RolesView({ c, next }) {
  const nav = useNav(), R = useRun();
  const [ask, setAsk] = useState(null);       // 다시 나누기
  const [confirm, setConfirm] = useState(null);
  const [winText, setWinText] = useState(null);
  const timer = useRef(null);
  useEffect(() => { store.refresh(); }, []);
  const m = store.roles;
  const run = async (type, payload = {}) => {
    const r = await store.dispatch(type, payload);
    if (r.rejected) R.setReply(r); else if (r.confirm) setConfirm({ type, payload, text: r.choices[0] || '계속할까요?' });
  };
  if (!m) return html`<${PrepPage} c=${c}><${Empty} icon="warn" title="역할을 불러오지 못했어요" /><//>`;
  const teams = []; m.roles.forEach(r => { if (!teams.includes(r.team)) teams.push(r.team); });
  const modeName = (m.modes.find(x => x.id === m.modeID) || {}).name || '';
  const assign = async force => {
    const r = await R.run('roles.assign', force ? { force: true } : {});
    if (r.ok) next(); else if (r.confirm) setAsk(r.choices[0] || '역할을 다시 나눌까요?');
  };
  const w = m.win;
  const saveWin = t => { clearTimeout(timer.current); timer.current = setTimeout(() => { if (t !== w.text) run('roles.setWin', { mode: 'custom', text: t }); }, 800); };
  return html`<${PrepPage} c=${c} bottom=${html`${m.disabledReason && html`<div class="foot">${m.disabledReason}</div>`}<${Primary} title="이 구성으로 배정" enabled=${m.canAssign} loading=${R.busy} onClick=${() => assign(false)} />`}>
    <${LargeTitle}>역할<//>
    <${Section} header="게임 계열">${m.families.map(f => html`<${CheckRow} title=${f} on=${f === m.family} onClick=${() => run('roles.setFamily', { family: f })} />`)}<//>
    <${Section}><${Row} chevron onClick=${() => nav.push(html`<${ModeList} run=${run} />`)}><${Labeled} label="모드" value=${modeName} /><//><//>
    <${Section} header="권장 구성" footer=${m.guide}>
      <${Row} tint onClick=${() => run('roles.auto')}>권장 구성으로 채우기<//>
      ${m.setups.map(su => html`<${Row} onClick=${() => run('roles.applySetup', { index: su.index })}><span class="grow">${su.name}</span><span class="sub">${su.diff}</span><//>`)}
    <//>
    ${teams.map(team => html`<${Section} header=${(m.roles.find(r => r.team === team) || {}).teamKo || team}>
      ${m.roles.filter(r => r.team === team).map(r => r.many || r.count > 1
        ? html`<${Stepper} value=${r.count} min=${0} max=${20} onChange=${v => run('roles.step', { id: r.id, delta: v - r.count })}><${RoleArt} r=${r.ko} size=${28} /><span class="grow">${r.ko}</span><span class="sec num">${r.count}</span><//>`
        : html`<${CheckRow} title=${r.ko} art=${r.ko} on=${r.count > 0} onClick=${() => run('roles.toggle', { id: r.id })} />`)}
    <//>`)}
    ${m.travelerNeed > 0 && html`<${Section} header=${`여행자 ${m.travelerSeats.length}/${m.travelerNeed}명`} footer=${`기본 15 · 여행자 ${m.travelerNeed} — 여행자가 될 사람을 고르세요.`}>
      ${m.seats.map(s => html`<${CheckRow} title=${`${s.number}번 ${s.name}`} on=${m.travelerSeats.includes(s.index)} onClick=${() => run('roles.toggleTraveler', { seat: s.index })} />`)}<//>`}
    ${w && html`<${Section} header="승리 조건">
      ${w.options.map(o => html`<${CheckRow} title=${o.label} on=${w.mode === o.id} onClick=${() => { clearTimeout(timer.current); run('roles.setWin', { mode: o.id, text: w.text }); }} />`)}
      ${w.mode === 'custom' && html`<div class="row"><input class="textin" placeholder="승리 조건을 직접 입력" value=${winText ?? w.text}
        onInput=${e => { const t = e.currentTarget.value; setWinText(t); saveWin(t); }}
        onKeyDown=${e => { if (e.key === 'Enter') { clearTimeout(timer.current); run('roles.setWin', { mode: 'custom', text: e.currentTarget.value }); } }} /></div>`}
    <//>`}
    <${Section} header=${`구성 ${m.total} / ${m.count}명`} footer=${m.notice}>
      <div class="row" style="font-size:15px">${m.summary}</div>
      ${m.total !== m.count && html`<${Row} tint onClick=${() => run('roles.fit')}>자리 수에 맞추기<//>`}
    <//>
    <${ActionSheet} open=${!!ask} title=${ask} onClose=${() => setAsk(null)} actions=${[{ label: '역할 다시 나누기', role: 'destructive', onClick: () => assign(true) }]} />
    <${ActionSheet} open=${!!confirm} title=${confirm && confirm.text} onClose=${() => setConfirm(null)} actions=${[{ label: '역할 비우고 변경', role: 'destructive', onClick: () => run(confirm.type, { ...confirm.payload, force: true }) }]} />
    ${R.alert}
  <//>`;
}
function ModeList({ run }) {
  const m = store.roles;
  return html`<${Page} title="모드" left=${html`<${Back} />`}>
    <${Section}>${(m ? m.modes : []).map(mode => html`<${CheckRow} title=${mode.name} sub=${mode.note} on=${mode.id === m.modeID} disabled=${!mode.playable} onClick=${() => run('roles.setMode', { id: mode.id })} />`)}<//>
  <//>`;
}

/** P04 · 넘기기 — 진행자 목록 → 한 사람씩 참가자 화면. 공개는 누르는 동안만 */
function HandoffView({ c, start }) {
  const R = useRun();
  const [turn, setTurn] = useState(null);
  useEffect(() => { store.dispatch('handoff.begin'); }, []);
  const m = store.handoff;
  const nextP = m && m.position + 1 < m.order.length ? m.order[m.position + 1] : null;
  return html`<${PrepPage} c=${c} bottom=${nextP
      ? html`<${Primary} title=${`${nextP.number} · ${nextP.name}에게 넘기기`} onClick=${() => setTurn(m.position + 1)} />`
      : html`<${Primary} title="첫밤 시작" loading=${R.busy} onClick=${() => R.run('game.beginFirstNight', {}, start)} />`}>
    <${LargeTitle}>넘기기<//>
    ${m && m.notice && m.notice.length > 0 && m.position < 0 && html`<${Section} header="이번 판 공지">${m.notice.map((t, k) => html`<div class="row" style="align-items:baseline"><span class="sec num">${k + 1}</span><span class="grow" style="white-space:pre-line">${t}</span></div>`)}<//>`}
    ${m && html`<${Section} header=${`${m.position + 1} / ${m.order.length}`}>${m.order.map((p, k) => html`<${Row} onClick=${() => setTurn(k)}>
      <span class=${k <= m.position ? 'blue' : 'sec'}><${Icon} name=${k <= m.position ? 'checkCircle' : 'circle'} size=${22} /></span>
      <span class="grow">${p.number} · ${p.name}</span>${k === m.position + 1 && html`<span class="sub">다음 차례</span>`}<//>`)}<//>`}
    ${m && m.position >= 0 && html`<${Section}><${Row} tint onClick=${() => store.dispatch('handoff.seen', { position: -1 })}>처음부터 다시 넘기기<//><//>`}
    ${m && m.fakes.length > 0 && html`<${Section}><${Disclosure} label=${`진행자만 — 가짜 카드 ${m.fakes.length}`}>${m.fakes.map(f => `${f.number}번(${f.real})에겐 «${f.shown}» 카드`).join('\n')}<//><//>`}
    <${Cover} open=${turn !== null && m && turn < m.order.length}>${turn !== null && m && turn < m.order.length && html`<${PlayerTurn} key=${turn} m=${m} k=${turn} done=${last => setTurn(last ? null : turn + 1)} />`}<//>
    ${R.alert}
  <//>`;
}
function PlayerTurn({ m, k, done }) {
  const p = m.order[k], last = k === m.order.length - 1, R = useRun();
  const [shown, setShown] = useState(null), [seen, setSeen] = useState(false);
  const cur = useRef(null);
  const hold = on => { if (on) { cur.current = store.publicCard(p.index); setShown(cur.current); } else if (cur.current) { cur.current = null; setShown(null); setSeen(true); } };
  return html`<div class="reveal-page">
    <div class="who"><div class="title2">${p.name}님 차례</div><div class="sub">${k + 1} / ${m.order.length}</div></div>
    <div class="mid">${shown ? html`<div class="pcard"><${RoleArt} r=${shown.roleName} size=${96} /><div class="rn">${shown.roleName}</div>
        <div class=${cx('tn', shown.side === 'evil' ? 'red' : shown.side === 'good' ? 'blue' : 'sec')}>${shown.teamName}</div><div class="ab2">${shown.ability}</div></div>`
      : html`<span class="hid" aria-label="가려져 있어요"><${Icon} name="eyeSlash" size=${44} stroke=${1.5} /></span>`}</div>
    <div class="acts"><${HoldButton} onChange=${hold} />
      <${Primary} title=${last ? '확인했어요 · 반납' : '확인했어요 · 다음 사람'} enabled=${seen && !shown} loading=${R.busy}
        onClick=${() => { setShown(null); R.run('handoff.seen', { position: k }, () => done(last)); }} /></div>
    ${R.alert}
  </div>`;
}
