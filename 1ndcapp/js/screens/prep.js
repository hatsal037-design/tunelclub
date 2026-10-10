// 준비 전면 — 인원 → 자리 → 역할 → 넘기기(01 P01~P04). 닫기는 초안을 버리지 않는다
import { html, useState, useEffect, useRef, useLayoutEffect, useMemo } from '../../lib/preact-htm.js';
import { store } from '../store.js';
import { Icon } from '../icons.js';
import { Page, Section, Row, RowLabel, CheckRow, Labeled, Primary, Stepper, Segmented, Toggle, Sheet, Cover, ActionSheet, Menu, NavButton, RoleArt, HoldButton, Disclosure, useRun, LargeTitle, Empty, cx } from '../ui.js';
import { NavStack, useNav, Back } from '../nav.js';
import { SeatBoard, boardLayout } from '../seatboard.js';
import { account } from '../account.js';
import { Search } from '../ui.js';

/** 사람에서 찾기 — 체크인 → 팔로잉 → 팔로워(2026-10-10 햇살님 «내가 팔로우한 사람이랑 나를 팔로우하는 사람 중에»). 열쇠는 회원 번호, 없으면 «a:계정번호». 이미 넣은 사람은 체크된 채 */
function MemberPicker({ taken, close, done }) {
  const [rows, setRows] = useState(undefined), [sel, setSel] = useState(() => new Set()), [q, setQ] = useState('');
  useEffect(() => { Promise.all([account.plaza('plaza_mine'), account.followRows('following'), account.followRows('followers')]).then(([pz, fo, fr]) => {
    const roster = ((pz && pz.roster) || []).filter(x => !x.left), inRoom = new Set(roster.map(x => x.account).filter(Boolean));
    const person = (x, g) => ({ member_id: x.member_id || ('a:' + x.account), nick: x.nick || ('@' + (x.handle || '')), handle: x.handle, g });
    const seen = new Set(), out = [];
    for (const [l, g] of [[roster, '체크인'], [(fo || []).filter(x => !inRoom.has(x.account)), '팔로잉'], [(fr || []).filter(x => !inRoom.has(x.account)), '팔로워']])
      for (const x of l) { if (!x.member_id && !x.account) continue; const p = person(x, g); if (!seen.has(p.member_id)) { seen.add(p.member_id); out.push(p); } }
    setRows(out); }); }, []);   // ponytail: 팔로우 목록은 서버 한 번(50명), 더 많아지면 이어 받기
  const k = q.replace(/^@/, '').toLowerCase();
  const list = (rows || []).filter(r => !k || [r.nick, r.handle].some(v => String(v || '').toLowerCase().includes(k)));
  const row = r => { const on = sel.has(r.member_id) || taken.includes(r.member_id);
    return html`<${Row} disabled=${taken.includes(r.member_id)} sel=${on} onClick=${() => setSel(s => { const n = new Set(s); n.has(r.member_id) ? n.delete(r.member_id) : n.add(r.member_id); return n; })}>
      <span class="avatar" aria-hidden="true"><${Icon} name="personCircle" size=${28} stroke=${1.5} /></span><span class="grow">${r.nick}${r.handle && html`<br/><span class="sub">@${r.handle}</span>`}</span>${on && html`<span class="blue"><${Icon} name="check" size=${20} stroke=${2.4} /></span>`}<//>`; };
  const grp = t => { const l = list.filter(r => r.g === t); return l.length ? html`<${Section} header=${t}>${l.map(row)}<//>` : null; };
  return html`<${Page} title="사람에서 찾기" left=${html`<${NavButton} label="취소" onClick=${close} />`}
    right=${html`<${NavButton} label=${sel.size ? sel.size + '명 넣기' : '넣기'} bold disabled=${!sel.size} onClick=${() => { done((rows || []).filter(r => sel.has(r.member_id))); close(); }} />`}>
    <${Search} value=${q} onInput=${setQ} placeholder="@아이디 또는 닉네임" />
    ${rows === undefined ? html`<${Empty} title="명단 받는 중…" />`
      : html`${grp('체크인')}${grp('팔로잉')}${grp('팔로워')}${!list.length && html`<${Empty} title="아직 사람이 없어요" text="체크인하거나 팔로우한 사람이 여기 모여요." />`}`}
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
const EXPERIENCE = [
  ['첫 플레이', '클래식을 처음 플레이하며, 기본 진행과 규칙 안내가 필요해요.'],
  ['입문 · 10판 미만', '몇 판 경험해 기본 흐름은 알지만, 직업과 상황에 따라 설명이 필요해요.'],
  ['게임 이해', '클래식이나 마피아류 게임에 대한 이해가 있고, 정보·추리·위장을 활용할 수 있어요.'],
  ['풍부한 경험', '게임 이해와 플레이 경험이 모두 충분하고, 다양한 직업과 상황에 익숙해요.'],
  ['깊은 이해', '직업 전반과 능력 간 상호작용을 잘 이해하며, 비공식 모드와 새로운 조합도 즐겨 플레이해요.'],
];

/** P01 · 인원 — 인원 스테퍼 + 닉네임 입력 + 투넬 회원에서 고르기. «자리 정하기»가 명단을 코어에 확정한다 */
/* 준비 «사람» 걸음의 확정 전 입력 — 닫았다 다시 열어도 남게(장부 2, 2026-10-10, 앱 PrepDraft 와 같은 규칙).
   «자리 정하기»로 확정하면 지운다. 같은 광장·같은 연습/실전이고 하루 안일 때만. 이 기기에만(localStorage) — 코어에는 확정 때만 보낸다. */
const DRAFT = 'prep.draft';
const draftLoad = () => { try { const d = JSON.parse(localStorage.getItem(DRAFT) || 'null'); const h = store.home || {};
  return d && d.pot === ((h.pot && h.pot.id) || null) && d.practice === !!h.practice && Date.now() - d.at < 864e5 ? d : null; } catch (e) { return null; } };
const draftSave = (names, members, levels) => { try { const h = store.home || {};
  if (!names.some(n => (n || '').trim())) { localStorage.removeItem(DRAFT); return; }
  localStorage.setItem(DRAFT, JSON.stringify({ names, members, levels, pot: (h.pot && h.pot.id) || null, practice: !!h.practice, at: Date.now() })); } catch (e) {} };
const draftClear = () => { try { localStorage.removeItem(DRAFT); } catch (e) {} };
function PeopleView({ c, next }) {
  const draft = useMemo(draftLoad, []);
  const [levels, setLevels] = useState(() => { if (draft) return draft.levels; const l = store.board.seats.map(s => s.manualExperience || 2); while (l.length < 5) l.push(2); return l; });   // 기본 2단계 — «적당히 몇 번 해본 사람»(2026-10-01 햇살님)
  const [experiencePick, setExperiencePick] = useState(null), [sources, setSources] = useState({});
  /* 조작 위치 고정(2026-10-01 햇살님 «다음 슬라이드 위치는 유지») — 손 댄 띠의 화면 Y를 기준점으로 잡고, 위 행이 접히고 이 행이 펼쳐진 뒤 그만큼 스크롤을 보정한다 */
  const anchorRef = useRef(null);
  const anchor = el => { anchorRef.current = { el, top: el.getBoundingClientRect().top }; };
  useLayoutEffect(() => {
    const a = anchorRef.current; if (!a || !a.el.isConnected) return;
    const d = a.el.getBoundingClientRect().top - a.top; if (!d) return;
    let sc = a.el.parentElement; while (sc && !(sc.scrollHeight > sc.clientHeight && /(auto|scroll)/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
    if (sc) sc.scrollTop += d;
  }, [experiencePick, levels.join('|')]);
  const [names, setNames] = useState(() => { if (draft) return draft.names; const n = store.board.seats.map(s => s.name); while (n.length < 5) n.push(''); return n; });
  const [members, setMembers] = useState(() => { if (draft) return draft.members; const m = store.board.seats.map(s => s.member || null); while (m.length < 5) m.push(null); return m; });
  useEffect(() => { draftSave(names, members, levels); }, [names, members, levels]);   // 칸마다 투넬 회원 번호(없으면 이름만)
  const [picking, setPicking] = useState(false), [clearAsk, setClearAsk] = useState(false);
  const pad = (n, m) => { while (n.length < 5) { n.push(''); m.push(null); } setNames(n); setMembers(m); };
  const removeAt = i => { setLevels(a => { const l = a.filter((_, j) => j !== i); while (l.length < 5) l.push(2); return l; }); pad(names.filter((_, j) => j !== i), members.filter((_, j) => j !== i)); };
  const clearAll = () => { setLevels([2, 2, 2, 2, 2]); pad([], []); };
  const skillOff = !!store.home.skillOff;   // 오리지널 마피아 — 경험 단계를 받지도 보여 주지도 않는다(2026-10-03 햇살님 «숙련도 적용하지 말자»)
  const source = m => skillOff ? 'off' : !m ? 'manual' : sources[m] || store.get('preparation.experience', m)?.source || 'unknown';
  const refreshExperience = async m => {
    if (m.startsWith('a:')) {   // 첫밤 계정(투넬 회원 아님) — 판 수는 모르니 손 단계, 등급은 계정 번호로 물어본다
      await store.dispatch('preparation.recordExperienced', { member: m, experienced: false });
      const gr = await account.grades([m.slice(2)]); const row = gr && gr.find(r => r.member_id === m.slice(2));
      if (row) await store.dispatch('preparation.recordGrade', { member: m, grade: row.enough && Number.isInteger(row.grade) ? row.grade : null, pct: null });
      setSources(a => ({ ...a, [m]: store.get('preparation.experience', m)?.source || 'manual' })); return;
    }
    const stats = await account.stats(m);
    if (stats?.member_id === m && Number.isInteger(stats.wins) && Number.isInteger(stats.losses)) {
      await store.dispatch('preparation.recordExperience', { member: m, games: stats.wins + stats.losses });
    } else {
      const e = await account.experienced(m);   // 친구가 아니면 전적 대신 «20판 이상인가»만
      if (typeof e === 'boolean') await store.dispatch('preparation.recordExperienced', { member: m, experienced: e });
      else await store.dispatch('preparation.experienceUnavailable', { member: m });
    }
    const gr = await account.grades([m]); const row = gr && gr.find(r => r.member_id === m);   // 20판 이상이면 서버 등급(손 입력 대신 배분이 읽는다)
    if (row) await store.dispatch('preparation.recordGrade', { member: m, grade: row.enough && Number.isInteger(row.grade) ? row.grade : null, pct: row.enough && typeof row.pct === 'number' ? row.pct : null });
    setSources(a => ({ ...a, [m]: store.get('preparation.experience', m)?.source || 'unknown' }));
  };
  useEffect(() => { if (!skillOff) members.filter(Boolean).forEach(refreshExperience); }, [members.join('|')]);
  const addMembers = rows => {   // 빈 칸부터 채우고 모자라면 늘린다 — 이미 있는 회원은 건너뛴다
    const n = names.slice(), m = members.slice(), l = levels.slice();
    rows.filter(r => !m.includes(r.member_id)).forEach(r => { let k = n.findIndex(x => !x.trim()); if (k < 0) { if (n.length >= 20) return; n.push(''); m.push(null); k = n.length - 1; } n[k] = r.nick; m[k] = r.member_id; l[k] = 2; });
    setNames(n); setMembers(m); setLevels(l);
  };
  const [ask, setAsk] = useState(null);
  const R = useRun();
  const valid = names.length >= 5 && names.every(n => n.trim());
  const setCount = n => { setLevels(a => n > a.length ? a.concat(Array(n - a.length).fill(2)) : a.slice(0, n)); setNames(a => n > a.length ? a.concat(Array(n - a.length).fill('')) : a.slice(0, n)); setMembers(a => n > a.length ? a.concat(Array(n - a.length).fill(null)) : a.slice(0, n)); };
  const commit = async force => {
    const p = { people: names.map((n, i) => ({ name: n.trim(), member: members[i] || null, manualExperience: source(members[i]) === 'manual' ? levels[i] || null : null })) }; if (force) p.force = true;
    const r = await R.run('preparation.commitPeople', p);
    if (r.ok) { draftClear(); next(); } else if (r.confirm) setAsk(r.choices[0] || '역할을 다시 나눠요.');
  };
  const inputs = useRef([]);
  return html`<${PrepPage} c=${c} bottom=${html`<${Primary} title="자리 정하기" enabled=${valid} loading=${R.busy} onClick=${() => commit(false)} />`}>
    <${LargeTitle}>인원<//>
    <${Section}><${Stepper} value=${names.length} min=${5} max=${20} onChange=${setCount}>참가 인원 ${names.length}명<//><//>
    <${Section}><${Row} tint onClick=${() => account.user ? setPicking(true) : account.login()}><${Icon} name="person2" size=${20} />${account.user ? '사람에서 찾기' : '사람에서 찾기 · 로그인'}<//>
      <${Row} danger disabled=${!names.some(n => n.trim())} onClick=${() => setClearAsk(true)}><${Icon} name="xmark" size=${20} />모두 비우기<//><//>
    <${Section} cls="experience-list" header="닉네임 · 오른쪽 띠를 끌어 경험 단계">${names.map((n, i) => html`<div class=${cx('row experience-row', experiencePick === i && 'open')} key=${i}>
      <div class="experience-main">
        <button class="rowx" disabled=${!n.trim() && names.length <= 5} aria-label=${`${i + 1}번 지우기`} onClick=${() => { setExperiencePick(null); removeAt(i); }}><${Icon} name="xmark" size=${12} stroke=${3} /></button>
        <input class="textin" ref=${el => inputs.current[i] = el} value=${n} placeholder="닉네임" enterkeyhint=${i + 1 < names.length ? 'next' : 'done'}
          aria-label=${`${i + 1}번 닉네임`}
          onInput=${e => { const v = e.currentTarget.value; setNames(a => a.map((x, j) => j === i ? v : x)); setLevels(a => { const l = a.slice(); l[i] = 2; return l; }); if (members[i]) setMembers(a => a.map((x, j) => j === i ? null : x)); }}
          onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); const nx = inputs.current[i + 1]; if (nx) nx.focus(); else e.currentTarget.blur(); } }} />
        ${skillOff ? null : source(members[i]) === 'manual' ? html`<${LevelSlider} value=${levels[i] || null} disabled=${!n.trim()} label=${`${n || (i + 1) + '번'} 경험 단계`}
            onBegin=${el => anchor(el)} onChange=${v => { setLevels(a => { const l = a.slice(); l[i] = v; return l; }); setExperiencePick(i); }} />`
          : html`<button class="experience-state" onClick=${e => { anchor(e.currentTarget); setExperiencePick(experiencePick === i ? null : i); }}>${source(members[i]) === 'records' ? '기록 기반 · 🔒' : '기록 확인 필요'}</button>`}
      </div>
      ${!skillOff && experiencePick === i && html`<div class="experience-note" role="status">${source(members[i]) === 'manual' && levels[i] ? html`<strong>${levels[i]} · ${EXPERIENCE[levels[i] - 1][0]}</strong><p>${EXPERIENCE[levels[i] - 1][1]}</p><button class="lnk" onClick=${() => { setLevels(a => { const l = a.slice(); l[i] = 2; return l; }); setExperiencePick(null); }}>기본(2)으로</button>`
        : html`<p>${source(members[i]) === 'records' ? '20판 이상 기록이 있어 수동 단계를 사용하지 않아요.' : '전적을 확인할 수 없어요. 로그인·친구 공개 범위와 연결을 확인해 주세요.'}</p>${source(members[i]) !== 'manual' && html`<button class="lnk" onClick=${() => refreshExperience(members[i])}>다시 확인</button>`}`}</div>`}
    </div>`)}<//>
    <${ActionSheet} open=${clearAsk} title="닉네임을 모두 비울까요?" onClose=${() => setClearAsk(false)} actions=${[{ label: '모두 비우기', role: 'destructive', onClick: clearAll }]} />
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

/** 새 자리 — 자리 섞기로 앱이 정한 자리(이름·번호만). 단톡에 올려 그대로 앉고 «다 앉았어요» (2026-10-01) */
function NewSeats({ done }) {
  const R = useRun(), b = store.board;
  return html`<${Page} title="새 자리" left=${html`<${NavButton} label="되돌리기" onClick=${() => R.run('seats.undoArrange', {})} />`} bottom=${html`<${Primary} title="다 앉았어요" onClick=${done} />`}>
    <div class="boardwrap nohit"><${SeatBoard} board=${b} /></div>
    <${Section}>
      <${Row} tint onClick=${() => shareSeatMap(b)}>자리표 이미지 공유<//>
      <${Row} tint onClick=${() => R.run('seats.rearrange', {})}>다시 정하기<//>
    <//>
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
  const [newSeats, setNewSeats] = useState(false);   // 자리 섞기 켜고 배정 → 새 자리 시트(2026-10-01)
  const [pinFor, setPinFor] = useState(null);   // 직업 정해 주기 — 받을 사람 고르는 직업
  const pinnable = !!(store.home && store.home.skillOff);   // 오리지널 마피아만(2026-10-03 햇살님 «가벼운 마피아게임»)
  const assign = async force => {
    const r = await R.run('roles.assign', force ? { force: true } : {});
    if (r.ok) { if (store.roles && store.roles.newSeats) setNewSeats(true); else next(); } else if (r.confirm) setAsk(r.choices[0] || '역할을 다시 나눌까요?');
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
      ${m.roles.filter(r => r.team === team).map(r => pinnable ? html`<${PinRow} r=${r} run=${run} open=${() => setPinFor(r)} />` : r.many || r.count > 1
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
    <${Section}><${Toggle} checked=${!!m.seatShuffle} onChange=${v => run('roles.setSeatShuffle', { on: v })}>자리 섞기<//><//>
    <${Sheet} open=${!!pinFor} onClose=${() => setPinFor(null)}>${pinFor && html`<${PinSheet} r=${pinFor} m=${m} close=${() => setPinFor(null)} done=${seats => run('roles.setPins', { id: pinFor.id, seats })} />`}<//>
    <${Sheet} open=${newSeats} onClose=${() => {}}>${newSeats && html`<${NewSeats} done=${async () => { await store.dispatch('seats.arrangeDone', {}); setNewSeats(false); next(); }} />`}<//>
    <${ActionSheet} open=${!!ask} title=${ask} onClose=${() => setAsk(null)} actions=${[{ label: '역할 다시 나누기', role: 'destructive', onClick: () => assign(true) }]} />
    <${ActionSheet} open=${!!confirm} title=${confirm && confirm.text} onClose=${() => setConfirm(null)} actions=${[{ label: '역할 비우고 변경', role: 'destructive', onClick: () => run(confirm.type, { ...confirm.payload, force: true }) }]} />
    ${R.alert}
  <//>`;
}
/** 직업 줄(오리지널 마피아) — 넣기·수 + 오른쪽 사람 단추로 받을 사람 정하기. 정해 두면 줄 아래 «7번 모카» (시안/마피아_직업정해주기_20261003) */
function PinRow({ r, run, open }) {
  const seats = store.board.seats, who = r.pinned.map(i => seats.find(s => s.index === i)).filter(Boolean).map(s => `${s.number}번 ${s.name}`).join(' · ');
  return html`<div class="row">
    <button class="grow hstack" style="gap:12px;text-align:left;min-height:44px" disabled=${r.many} onClick=${() => run('roles.toggle', { id: r.id })}>
      <${RoleArt} r=${r.ko} size=${28} /><div class="grow"><div>${r.ko}</div>${who && html`<div class="sub blue">${who}</div>`}</div>
      ${!r.many && r.count > 0 && html`<span class="blue"><${Icon} name="check" size=${20} stroke=${2.4} /></span>`}</button>
    ${r.many && html`<span class="sec num">${r.count}</span><div class="stepper"><button disabled=${r.count <= 0} onClick=${() => run('roles.step', { id: r.id, delta: -1 })} aria-label="줄이기"><${Icon} name="minus" size=${18} stroke=${2.2} /></button><i></i>
      <button disabled=${r.count >= 20} onClick=${() => run('roles.step', { id: r.id, delta: 1 })} aria-label="늘리기"><${Icon} name="plus" size=${18} stroke=${2.2} /></button></div>`}
    <button class=${cx('pin-b', r.pinned.length && 'on')} disabled=${!r.count} onClick=${open} aria-label=${`${r.ko} 받을 사람 정하기`}><${Icon} name="person" size=${20} /></button>
  </div>`;
}
function PinSheet({ r, m, close, done }) {
  const b = store.board, idOf = i => { const s = b.seats.find(s => s.index === i); return s ? s.id : null; };
  const [sel, setSel] = useState(r.pinned.slice());
  const other = new Set(); m.roles.forEach(x => { if (x.id !== r.id) x.pinned.forEach(i => other.add(i)); });   // 다른 직업을 정해 둔 사람은 못 고름
  const tap = sid => { const s = b.seats.find(x => x.id === sid); if (!s) return; const i = s.index;
    setSel(p => p.includes(i) ? p.filter(x => x !== i) : p.length < r.count ? p.concat(i) : r.count === 1 ? [i] : p); };   // 한 자리 직업이면 바꿔 끼우기
  return html`<${Page} title=${r.ko} left=${html`<${NavButton} label="취소" onClick=${close} />`}
    right=${html`<${NavButton} label="완료" bold onClick=${() => { done(sel); close(); }} />`}>
    <${Section} plain><div class="boardwrap"><${SeatBoard} board=${b} enabled=${new Set(b.seats.filter(s => !other.has(s.index)).map(s => s.id))}
      picked=${sel.map(idOf).filter(Boolean)} numbered=${false} publicView=${true} onTap=${tap} /></div><//>
    <div class="foot" style="text-align:center">${sel.length} / ${r.count}</div>
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
    ${m && m.composition && m.position < 0 && html`<${Section} header="구성 발표"><${Composition} c=${m.composition} /><//>`}
    ${m && m.notice && m.notice.length > 0 && m.position < 0 && html`<${Section} header="이번 판 공지">${m.notice.map((t, k) => html`<div class="row" style="align-items:baseline"><span class="sec num">${k + 1}</span><span class="grow" style="white-space:pre-line">${t}</span></div>`)}<//>`}
    ${m && html`<${Section} header=${`${m.position + 1} / ${m.order.length}`}>${m.order.map((p, k) => html`<${Row} onClick=${() => setTurn(k)}>
      <span class=${k <= m.position || (m.seen || []).includes(k) ? 'blue' : 'sec'}><${Icon} name=${k <= m.position || (m.seen || []).includes(k) ? 'checkCircle' : 'circle'} size=${22} /></span>
      <span class="grow">${p.number} · ${p.name}</span>${k === m.position + 1 && html`<span class="sub">다음 차례</span>`}<//>`)}<//>`}
    ${m && m.position >= 0 && html`<${Section}><${Row} tint onClick=${() => store.dispatch('handoff.seen', { position: -1 })}>처음부터 다시 넘기기<//><//>`}
    ${m && m.fakes.length > 0 && html`<${Section}><${Disclosure} label=${`진행자만 — 가짜 카드 ${m.fakes.length}`}>${m.fakes.map(f => `${f.number}번(${f.real})에겐 «${f.shown}» 카드`).join('\n')}<//><//>`}
    <${Cover} open=${turn !== null && m && turn < m.order.length}>${turn !== null && m && turn < m.order.length && html`<${PlayerTurn} key=${turn} m=${m} k=${turn} done=${(last, inOrder) => setTurn(last || !inOrder ? null : turn + 1)} close=${() => setTurn(null)} />`}<//>
    ${R.alert}
  <//>`;
}
/* 참가자 화면 — 왼쪽 위 닫기는 확인 없이 목록으로, 본 기록은 그대로(2026-10-05) */
function PlayerTurn({ m, k, done, close }) {
  const p = m.order[k], last = k === m.order.length - 1, R = useRun();
  const [shown, setShown] = useState(null), [seen, setSeen] = useState(false);
  const cur = useRef(null);
  const hold = on => { if (on) { cur.current = store.publicCard(p.index); setShown(cur.current); } else if (cur.current) { cur.current = null; setShown(null); setSeen(true); } };
  return html`<div class="reveal-page">
    <button class="blink" style="position:absolute;top:calc(4px + var(--safe-t));left:16px" onClick=${() => { setShown(null); close(); }}>닫기</button>
    <div class="who"><div class="title2">${p.name}님 차례</div><div class="sub">${k + 1} / ${m.order.length}</div></div>
    <div class="mid">${shown ? html`<div class="pcard"><${RoleArt} r=${shown.roleName} size=${96} /><div class="rn">${shown.roleName}</div>
        <div class=${cx('tn', shown.side === 'evil' ? 'red' : shown.side === 'good' ? 'blue' : 'sec')}>${shown.teamName}</div><div class="ab2">${shown.ability}</div></div>`
      : html`<span class="hid" aria-label="가려져 있어요"><${Icon} name="eyeSlash" size=${44} stroke=${1.5} /></span>`}</div>
    <div class="acts"><${HoldButton} onChange=${hold} />
      <${Primary} title=${last ? '확인했어요 · 반납' : '확인했어요 · 다음 사람'} enabled=${seen && !shown} loading=${R.busy}
        onClick=${() => { const inOrder = k === m.position + 1; setShown(null); R.run('handoff.seen', { position: k }, () => done(last, inOrder)); }} />   /* 차례대로면 다음 사람, 다시 보거나 건너뛰어 본 거면 목록으로(2026-10-05) */</div>
    ${R.alert}
  </div>`;
}

/** 숙련도 1~5 슬라이더(2026-10-01 햇살님 «우리 슬라이더 만든걸 거기 적용») — 재량 띠(26차 확정)와 같은 슬롯·알약·점 모양, 파란 틴트 하나. 추천·중간·선악 없음. 값 없음(미지정)이면 손잡이가 없다 */
export function LevelSlider({ value, onChange, onBegin, disabled, label }) {
  const n = 5, track = useRef(null);
  const stopAt = x => { const r = track.current.getBoundingClientRect(), p = (x - r.left - 19.5) / Math.max(r.width - 39, 1); return Math.max(1, Math.min(n, Math.round(p * (n - 1)) + 1)); };
  const left = k => `calc(19.5px + (100% - 39px) * ${(k - 1) / (n - 1)})`;
  const set = v => { if (!disabled && v !== value) onChange(v); };
  return html`<div class=${cx('disc lvl', disabled && 'off')} data-lv=${value || 0} role="group" aria-label=${label}>
    <div class="track" ref=${track} role="slider" tabindex=${disabled ? -1 : 0} aria-valuemin="1" aria-valuemax=${n} aria-valuenow=${value || 0} aria-valuetext=${value ? `${value}단계` : '미지정'} aria-disabled=${!!disabled}
      onPointerDown=${e => { if (disabled) return; onBegin && onBegin(e.currentTarget); e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.dataset.drag = '1'; set(stopAt(e.clientX)); }}
      onPointerMove=${e => { if (!e.currentTarget.dataset.drag) return; const v = stopAt(e.clientX); if (v !== value) set(v); }}
      onPointerUp=${e => { delete e.currentTarget.dataset.drag; }} onPointerCancel=${e => { delete e.currentTarget.dataset.drag; }}
      onKeyDown=${e => { if (e.key === 'ArrowLeft') set(Math.max(1, (value || 1) - 1)); if (e.key === 'ArrowRight') set(Math.min(n, (value || 0) + 1)); }}>
      <div class="line"></div>
      <div class="stops">${[1, 2, 3, 4, 5].map(k => html`<button type="button" class="stop" disabled=${disabled} tabindex="-1" aria-label=${`${k}단계`} onClick=${() => set(k)}><i></i></button>`)}</div>
      ${value && html`<div class="thumb" style=${`left:${left(value)}`}></div>`}
    </div>
    <span class="lvl-n">${value || '–'}</span>
  </div>`;
}

/** 구성 발표 — 넘기기 전에 모두에게 읽어 주는 숫자(2026-10-01 햇살님). 선·악 합계만 — 마을·외지인 나눔은 남작 같은 구성 변화를 드러내서 뺀다(햇살님 «선·악 합계만») */
function Composition({ c }) {
  const L = c.labels || {}, strip = t => String(t || '').replace(/\(.*\)/, '');
  return html`<div class="comp">
    <div class="comp-total"><b>${c.total}</b>명</div>
    <div class="comp-row good"><span class="k">선</span><b>${c.good}</b></div>
    <div class="comp-row evil"><span class="k">악</span><b>${c.evil}</b></div>
    ${c.other > 0 && html`<div class="comp-row"><span class="k">그 밖</span><b>${c.other}</b></div>`}
  </div>`;
}
