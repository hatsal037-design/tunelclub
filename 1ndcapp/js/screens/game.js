// 진행 전면 — 밤 시작 · 밤 카드(G01)와 반 접힘(G02) · 새벽 · 낮 · 결과. 뒤로(‹)는 판을 끝내지 않고 오늘로
import { html, useState, useEffect, useRef, useLayoutEffect } from '../../lib/preact-htm.js';
import { store } from '../store.js';
import { Icon } from '../icons.js';
import { Page, Section, Row, RowLabel, Labeled, Primary, Secondary, Sheet, Cover, ActionSheet, Alert, Menu, NavButton, RoleArt, HoldCover, DoubleTap, Disclosure, Empty, Warn, Segmented, useRun, cx } from '../ui.js';
import { NavStack, useNav, Back } from '../nav.js';
import { SeatBoard, RevealBoard, BluffBoard, HostBoard } from '../seatboard.js';
import { NightIntroView, DawnView, SuccessionSection, ProcessSheet, ReferenceSheet } from './stages.js';
import { DayView, FinishSheet, ResultView, timer } from './day.js';
import { SeatDetailView } from './seatdetail.js';
import { AnswerComposer } from './composer.js';

const nextPayload = nx => { const p = {}; if (nx.k !== undefined && nx.k !== null) p.k = nx.k; if (nx.how) p.how = nx.how; return p; };
const emptyDraft = () => ({ targets: [], role: null, answers: {}, guesses: [] });

export function GameFlow({ close, toRoles, toPrep }) {
  const R = useRun();
  const [bluff, setBluff] = useState(false), [confirm, setConfirm] = useState(null), [finishing, setFinishing] = useState(false);
  const [discard, setDiscard] = useState(false), [folded, setFolded] = useState(false), [aux, setAux] = useState(null);
  /* 판 보기 → 펼치기 복귀: 같은 카드면 읽던 스크롤 위치로(2026-10-01 위치 보존 기준). 다른 카드로 넘어가면 복원하지 않는다 */
  const foldScroll = useRef(null);
  const fold = v => { const sc = document.querySelector('.page > .body'); if (v) foldScroll.current = { key: cardKey, top: sc ? sc.scrollTop : 0 }; setFolded(v); };
  useLayoutEffect(() => { if (folded) return; const f = foldScroll.current; if (!f || f.key !== cardKey) return; const sc = document.querySelector('.page > .body'); if (sc) sc.scrollTop = f.top; foldScroll.current = null; }, [folded]);
  const [draft, setDraft] = useState(emptyDraft), [picking, setPicking] = useState(false), [revealing, setRevealing] = useState(false), [selfPicking, setSelfPicking] = useState(false);   // selfPicking — 참가자가 직접 찍는 전면(A안, 2026-11-03)
  const [answerSeen, setAnswerSeen] = useState(null), [againAsk, setAgainAsk] = useState(false), [endAsk, setEndAsk] = useState(false);
  const st = store.stage, card = store.night, kind = st ? st.stage : 'card';
  const cardKey = card ? `${card.phaseTitle}|${card.stepKey || ''}|${card.index}` : '';
  const shown = answerSeen === cardKey;
  const blockSleep = kind === 'card' && card && card.mustShow && !card.needsTargetsFirst && !shown;
  const commitInSheet = card && !card.roleOptions && !card.askDie && !card.either && !card.guessMax;
  const idx = id => { const t = card && card.targets.find(t => t.id === id); return t ? t.index : undefined; };
  const canAct = (() => {
    if (!card || !card.supported) return false;
    if (!card.needsTargetsFirst || card.selfPick) return true;
    if (card.guessMax > 0) return draft.guesses.length > 0;
    const n = draft.targets.length; if (n < card.minPick || n > Math.max(card.minPick, card.pickCount)) return false;
    if (card.roleOptions && !draft.role) return false;
    if (card.askDie && draft.targets.some(id => { const i = idx(id); return i === undefined || !draft.answers[i]; })) return false;
    return true;
  })();
  // 카드가 바뀌면 고르던 대상·접힘을 버린다
  const prevKey = useRef(cardKey);
  useEffect(() => { if (prevKey.current !== cardKey) { prevKey.current = cardKey; setDraft(emptyDraft()); setFolded(false); } }, [cardKey]);
  const okIds = card ? card.targets.filter(t => !t.disabledReason).map(t => t.id).join('|') : '';
  useEffect(() => { setDraft(d => ({ ...d, targets: d.targets.filter(id => okIds.split('|').includes(id)) })); }, [okIds]);
  const prevStage = useRef(kind);
  useEffect(() => { if (prevStage.current === 'day' && kind !== 'day') timer.reset(); prevStage.current = kind; }, [kind]);
  useEffect(() => { const k = () => { if (!document.hidden && 'wakeLock' in navigator) navigator.wakeLock.request('screen').catch(() => {}); }; k(); document.addEventListener('visibilitychange', k); return () => document.removeEventListener('visibilitychange', k); }, []);

  const run = async (type, payload) => {
    const r = await R.run(type, payload);
    if (r.confirm) setConfirm({ type, payload, text: r.choices[0] || '계속할까요?', token: r.token });
    return r;
  };
  const endGame = async () => { const r = await store.dispatch('game.finish'); if (r.rejected) { if (r.code === 'invalidSelection') setFinishing(true); else R.setReply(r); } };
  const commit = selfTarget => {
    const p = { targets: draft.targets.map(idx).filter(i => i !== undefined) };
    if (selfTarget) p.self = true;
    if (draft.role) p.role = draft.role;
    if (card.askDie) p.answers = Object.fromEntries(Object.entries(draft.answers).map(([k, v]) => [String(k), v]));
    if (card.guessMax > 0) p.guesses = draft.guesses.map(g => ({ seat: g.seat, char: g.char }));
    run('night.commitTargets', p);
  };
  const act = () => {
    if (kind === 'day') { const d = store.day; if (d && d.ended) endGame(); else if (d && d.next) run(d.next.cmd, nextPayload(d.next)); else run('phase.enterNight', {}); return; }   // 낮의 다음 할 일(코어 day.next, 2026-11-02 B-2) — 발표·처형·결과 발표·동수 규칙·밤
    if (kind === 'done') { R.run('game.again', {}, toRoles); return; }
    if (kind === 'intro' || kind === 'dawn') { run(kind === 'intro' && (st.order || []).length ? 'night.start' : 'phase.enterDay', {}); return; }
    if (card.selfPick && card.needsTargetsFirst) { setSelfPicking(true); return; }
    if (card.needsTargetsFirst) { commit(false); return; }
    R.run('night.advance', {}, () => { setDraft(emptyDraft()); setFolded(false); });
  };
  const primaryTitle = kind === 'intro' ? ((st.order || []).length ? '깨우기 시작' : st.nextNight ? '둘째 밤으로' : '낮으로')
    : kind === 'dawn' ? (st.nextNight ? '둘째 밤으로' : '낮으로')
    : kind === 'day' ? (store.day && store.day.ended ? '결과 확인하고 저장' : (store.day && store.day.next && store.day.next.title) || '밤으로')
    : kind === 'done' ? '새 판 — 자리 그대로' : card ? (card.selfPick && card.needsTargetsFirst ? '폰 넘기기' : card.primaryTitle) : '';

  let body;
  if (st && kind === 'intro') body = html`<${NightIntroView} m=${st} revealBluffs=${() => setBluff(true)} />`;
  else if (st && kind === 'dawn') body = html`<${DawnView} m=${st} />`;
  else if (st && kind === 'day' && store.day) body = html`<${DayView} m=${store.day} run=${run} finish=${() => setFinishing(true)} />`;
  else if (st && kind === 'done' && store.result) body = html`<${ResultView} m=${store.result} call=${c => run('day.call', { call: c })} />`;
  else if (!card) body = html`<${Empty} icon="moonZzz" title="지금 깨울 차례가 없어요" />`;
  else if (folded) body = html`<${FoldedCard} card=${card} unfold=${() => fold(false)} />`;
  else body = html`<${NightCardView} card=${card} draft=${draft} setDraft=${setDraft} pick=${() => setPicking(true)} skip=${() => run('night.advance', { skip: true })}
    shown=${shown} reveal=${() => setRevealing(true)} setShown=${v => setAnswerSeen(v ? cardKey : null)} />`;

  /* 오른쪽 위는 «⋯» 하나 — 보기·진행·끝내기(2026-11-02 햇살님 C안 «필요에 따라 열어서 누르게»). 이전 차례는 주 행동 옆 ‹ */
  const dn = kind === 'day' && store.day && !store.day.ended ? store.day.next : null;
  const menuItems = [
    !folded && kind === 'card' && { label: '판 보기', onClick: () => fold(true) },
    kind === 'intro' && st.night !== 1 && { label: '낮으로 되돌리기', onClick: () => run('phase.undoNight', {}) },
    dn && dn.kind !== 'night' && dn.kind !== 'announce' && { label: dn.kind === 'announceExec' ? '발표 없이 밤으로' : '처형 없이 밤으로', onClick: () => run('phase.enterNight', {}) },   // 주 버튼이 처형·결과 발표일 때 다른 길(방 규칙)
    { label: store.home.practice ? '연습 끝' : '판 끝내기', onClick: () => setEndAsk(true) },   // 판을 닫는 것은 한 번 더 묻는다
    { label: '이 판 버리고 역할 다시', role: 'destructive', onClick: () => setDiscard(true) },
  ].filter(Boolean);
  const succ = st && st.succession && st.succession.length ? st.succession : null;
  const confirmLabel = { execGate: '예외로 처형', exec2: '한 번 더 처형', night: '밤으로', clearRoles: '역할 다시 나누기' };
  return html`<div class="page" style="position:absolute;inset:0"><${Page}
    title=${html`${(st && st.title) || (card && card.phaseTitle) || ''}${store.home.subHost && html`<span class="nb-sub">대신 진행 · ${store.home.subHost}</span>`}`}
    left=${html`<${NavButton} icon="chevronLeft" label="오늘로 돌아가기" onClick=${close} />`}
    right=${kind !== 'done' && html`<${Menu} aria="판 메뉴" disabled=${R.busy} label=${html`<${Icon} name="ellipsisCircle" size=${24} />`} items=${menuItems} />`}
    bottom=${html`
      ${kind !== 'done' && html`<div class="toolbar"><button onClick=${() => setAux('seats')}><${Icon} name="person2" size=${20} />좌석</button>
        <button onClick=${() => setAux('process')}><${Icon} name="listBullet" size=${20} />과정</button><button onClick=${() => setAux('reference')}><${Icon} name="book" size=${20} />참고</button></div>`}
      ${kind === 'done' && html`<div class="brow"><${Secondary} title="오늘로 돌아가기" onClick=${close} /><${Secondary} title="바꿔서 한 판 더" onClick=${() => setAgainAsk(true)} /></div>`}
      ${kind === 'card' && card && card.either && card.needsTargetsFirst && html`<${Secondary} title="본인에게 붙이기" enabled=${canAct} onClick=${() => commit(true)} />`}
      <div class="brow">${(kind === 'card' || kind === 'dawn') && html`<button class="bprev" aria-label="이전 차례" disabled=${R.busy} onClick=${() => run('night.previous', {})}><${Icon} name="chevronLeft" size=${22} stroke=${2.4} /></button>`}
        <${Primary} title=${primaryTitle} cls=${dn && dn.danger ? 'red' : ''} enabled=${kind === 'card' ? canAct && !blockSleep : true} loading=${R.busy} onClick=${act} /></div>
      ${card && !card.supported && card.unsupportedNote ? html`<div class="foot">${card.unsupportedNote}</div>`
        : kind === 'card' && card && card.needsTargetsFirst && !canAct && !card.selfPick && html`<div class="foot">필요한 것을 고르면 다음으로 진행할 수 있어요.</div>`}`}>
    <div style=${R.busy ? 'pointer-events:none' : ''}>
      ${succ && html`<${SuccessionSection} items=${succ} apply=${(id, seat) => R.run('succession.apply', { id, seat })} />`}
      ${body}
    </div>
  <//>
  <${Sheet} open=${picking} onClose=${() => setPicking(false)}>${picking && card && html`<${TargetPicker} card=${card} confirmed=${draft.targets} close=${() => setPicking(false)}
    done=${ids => setDraft(d => ({ ...d, targets: ids }))} commit=${commitInSheet ? async ids => { const p = { targets: ids.map(idx).filter(i => i !== undefined) }; const r = await R.run('night.commitTargets', p); return !!r.ok; } : null}
    markShown=${() => { setAnswerSeen(cardKey); store.dispatch('night.markShown', {}); }} />`}<//>
  <${Sheet} open=${!!aux} onClose=${() => setAux(null)}>${aux === 'seats' ? html`<${SeatSheet} close=${() => setAux(null)} />`
    : aux === 'process' ? html`<${ProcessSheet} close=${() => setAux(null)} discarded=${toRoles} />` : aux === 'reference' ? html`<${ReferenceSheet} close=${() => setAux(null)} />` : null}<//>
  <${Cover} open=${bluff}>${bluff && html`<${AnswerReveal} name=${store.home.demonKo || '흉수'} answer=${((st && st.bluffs) || []).join(', ')} bluff=${(st && st.bluffs) || []} done=${() => setBluff(false)} />`}<//>
  <${Cover} open=${selfPicking}>${selfPicking && html`<${SelfPick} done=${() => { setAnswerSeen(cardKey); setSelfPicking(false); }} />`}<//>
  <${Cover} open=${revealing}>${revealing && card && html`<${AnswerReveal} name=${card.name} answer=${card.answer || ''} board=${card.ansBoard} pic=${card.ansPic} me=${card.seatNumber - 1} done=${async () => { const r = await R.run('night.markShown', {}); if (r.rejected && r.code !== 'notAllowedInPhase') return; setAnswerSeen(cardKey); setRevealing(false); }} />`}<//>
  <${Sheet} open=${finishing} detent="medium" onClose=${() => setFinishing(false)}>${finishing && html`<${FinishSheet} close=${() => setFinishing(false)} done=${p => run('game.finish', p)} />`}<//>
  <${ActionSheet} open=${!!confirm} title=${confirm && confirm.text} onClose=${() => setConfirm(null)} actions=${!confirm ? [] : confirm.token === 'shield'
    ? [{ label: '그래도 사망 처리', role: 'destructive', onClick: () => run(confirm.type, { ...confirm.payload, ok_shield: true }) }, { label: '살아남음으로 기록', onClick: () => run(confirm.type, { ...confirm.payload, decline_shield: true }) }]
    : [{ label: confirmLabel[confirm.token] || '계속', role: 'destructive', onClick: () => run(confirm.type, { ...confirm.payload, force: true, ['ok_' + confirm.token]: true }) }]} />
  <${ActionSheet} open=${endAsk} title=${store.home.practice ? '연습을 끝낼까요?' : '이 판을 끝낼까요?'} message=${store.home.practice ? '기록은 남지 않아요.' : '승자를 정해 기록하고 판을 닫아요.'} onClose=${() => setEndAsk(false)}
    actions=${[{ label: store.home.practice ? '연습 끝' : '판 끝내기', role: 'destructive', onClick: endGame }]} />
  <${ActionSheet} open=${discard} title="이 판을 버릴까요?" message="기록 없이 버려요. 사람·자리는 그대로예요." onClose=${() => setDiscard(false)}
    actions=${[{ label: '버리고 역할 다시', role: 'destructive', onClick: () => R.run('game.discardToRoles', {}, toRoles) }]} />
  <${ActionSheet} open=${againAsk} title="바꿔서 한 판 더" onClose=${() => setAgainAsk(false)}
    actions=${[{ label: '인원부터 다시', onClick: () => R.run('game.again', { fresh: true }, () => toPrep('people')) }, { label: '자리부터 다시', onClick: () => R.run('game.again', { fresh: true }, () => toPrep('seats')) }, { label: '자리 섞어서 다시', onClick: () => R.run('game.again', { fresh: true, shuffle: true }, () => toPrep('roles')) }]} />
  <${Alert} open=${!!store.notice} title="알림" message=${store.notice} onClose=${() => { store.notice = null; store.emit(); }} />
  ${R.alert}
  </div>`;
}

/** 답 그림 — 데이터 꼴에 맞는 레이아웃 하나(판 전체·블러프·자리+직업·기호·글). 답 보여주기·직접 찍기가 같이 쓴다(iOS AnswerBody) */
export function AnswerBody({ answer = '', rows = [], bluff, bluffs, board, pic, me, big }) {
  return rows.length ? html`<${HostBoard} board=${store.board} rows=${rows} bluffs=${bluffs} me=${me} meTint=${true} />`   // 세작·스파이 — 진행자 판과 같은 구성, 보는 사람 자리는 틴트(2026-10-01)
    : bluff ? html`<${BluffBoard} bluffs=${bluff} />`
    : board ? html`<${RevealBoard} roles=${board.roles} shown=${board.seats} me=${me} meTint=${true} title=${board.head || null} side=${board.side} />`
    : pic ? html`<${RevealBoard} roles=${[]} me=${me} meTint=${true} pic=${pic} picSize=${big ? 140 : null} />`
    : html`<div class="big-ans">${answer}</div>`;
}

/** 답 공개 — 공용 틀(HoldCover) + 답 그림. 한 번 보여 주고 가린 뒤에 «보여 줬어요» */
export function AnswerReveal({ name, done, ...a }) {
  const [on, setOn] = useState(false), [seen, setSeen] = useState(false), [far, setFar] = useState(false);   // far — 멀리서(폰을 들어 보여 주는 전체 화면)
  useEffect(() => { const h = () => { if (document.hidden) setFar(false); }; document.addEventListener('visibilitychange', h); return () => document.removeEventListener('visibilitychange', h); }, []);
  return html`<${HoldCover} title=${`${name}님에게 보여 주세요`} far=${() => setFar(true)} reveal=${v => { setOn(v); if (!v) setSeen(true); }}
      content=${() => html`<${AnswerBody} ...${a} />`} footer=${html`<${Primary} title="보여 줬어요" enabled=${seen && !on} onClick=${done} />`} />
    ${far && html`<div class="far-ans" role="button" aria-label=${a.answer} onClick=${() => { setFar(false); setSeen(true); }}><${AnswerBody} ...${a} big /></div>`}`;
}

/** 참가자가 직접 찍고 답 보기(2026-11-03 햇살님 A안) — 진행자 카드의 경고·거짓·진짜 답·재량 띠·막힌 까닭은 한 줄도 비치지 않는다(막힌 자리는 흐리게만) */
function SelfPick({ done }) {
  const c0 = store.night;
  const [head] = useState(() => c0 ? [c0.seatNumber, c0.name, c0.roleName] : [0, '', '']);   // 넘긴 순간의 자리·이름·직업
  const [picked, setPicked] = useState([]), [step, setStep] = useState(0), [busy, setBusy] = useState(false), [failed, setFailed] = useState(false), [ans, setAns] = useState(null);   // step 0 찍기 · 1 답 · 2 가림
  const card = store.night || c0, cap = Math.max((card && card.pickCount) || 1, 1), ok = picked.length >= Math.max((card && card.minPick) || 1, 1) && picked.length <= cap;
  const ts = card ? card.targets.filter(t => t.number > 0) : [], b = store.board;
  const toggle = id => { const t = ts.find(t => t.id === id); if (!t) return; const i = t.index; setFailed(false);
    setPicked(p => p.includes(i) ? p.filter(x => x !== i) : cap === 1 ? [i] : p.length < cap ? [...p, i] : p); };
  const reveal = async () => {
    setBusy(true);
    const r = await store.dispatch('night.commitTargets', { targets: picked });
    if (r.ok) { await store.dispatch('night.markShown', {}); const c = store.night || {}; setAns({ answer: c.answer || '', board: c.ansBoard, pic: c.ansPic, me: c.seatNumber - 1 }); setStep(1); }
    else { setFailed(true); setPicked([]); }
    setBusy(false);
  };
  if (step === 2) return html`<div class="reveal-page selfpick back" role="button" tabindex="0" aria-label="진행자에게 돌려주기" onClick=${done} onKeyDown=${e => e.key === 'Enter' && done()}>
    <${Icon} name="hand" size=${44} /><b>진행자에게 돌려주세요</b></div>`;
  const meId = head[0] > 0 ? (b.seats.find(s => s.index === head[0] - 1) || {}).id : null;
  return html`<div class="reveal-page selfpick">
    <div class="head"><div class="sub">${head[0]}번 ${head[1]}</div><div class="rn">${head[2]}</div>${step === 0 && html`<div class="sub">${cap > 1 ? `${cap}명을 고르세요` : '한 명을 고르세요'}</div>`}</div>
    <div class="mid">${step === 0 ? html`<${SeatBoard} board=${b} picked=${picked.map(i => (ts.find(t => t.index === i) || {}).id).filter(Boolean)} enabled=${new Set(ts.filter(t => !t.disabledReason).map(t => t.id))}
        me=${meId} publicView=${true} onTap=${toggle} />` : ans && html`<div aria-label=${ans.answer}><${AnswerBody} ...${ans} /></div>`}</div>
    <div class="acts">${failed && html`<div class="foot">다시 골라 주세요</div>`}
      ${step === 0 ? html`<${Primary} title="답 보기" enabled=${ok && !busy} loading=${busy} onClick=${reveal} />` : html`<${Primary} title="다 봤어요" onClick=${() => setStep(2)} />`}</div>
  </div>`;
}

/** G01 본문 — 지금 할 일 → 경고 → 대상(+직업·생사·추측) → 처리 결과 → 능력과 진행 안내 */
/* 취한 스파이 거짓 판에 얹은 조각 — «마을 맞바꿈 2·9번» (2026-10-01) */
const pieceText = ps => ps.map(p => `${p.종류.replace(/(맞바꿈|바꿈|옮김|숨김|심기)$/, ' $1')} ${p.자리.map(i => i + 1).join('·')}번`).join(' · ');
function NightCardView({ card, draft, setDraft, pick, skip, shown, reveal, setShown }) {
  const R = useRun();
  const [composing, setComposing] = useState(false), [manual, setManual] = useState(null), [manualPic, setManualPic] = useState(null), [grimAsk, setGrimAsk] = useState(false), [grimShow, setGrimShow] = useState(false);
  const label = t => t.number > 0 ? `${t.number}번 ${t.name}` : t.name;
  const art = store.artOf(card.roleName), hasArt = art && (art.icon || art.e);
  const chosen = card.chosenLabels && card.chosenLabels.length ? card.chosenLabels : card.chosen.map(i => card.targets.find(t => t.index === i)).filter(Boolean).map(label);
  const undoOnce = tok => R.run('seat.toggleToken', { seat: card.seatNumber - 1, token: tok });
  const other = () => R.run('night.setDiscretion', { 다른답: true });
  /* 답 보여주기(눈에 띄게) + 같은 줄 오른쪽 «⟳ 다른 답»(2026-11-02 햇살님 «답 직접 고르기와 똑같아 보인다») */
  const revealRow = html`<div class="row"><button class="bfill" onClick=${reveal}><${Icon} name="eye" size=${18} />답 보여주기</button><span class="grow"></span>
    ${card.discretion && !card.discretion.잠김 && html`<button class="blink" disabled=${!card.discretion.다른답} onClick=${other}><${Icon} name="cycle" size=${18} />다른 답</button>`}</div>`;
  return html`<div>
    <div class="cprog"><div class="sub">${card.index} / ${card.total} 차례</div><div class="prog" aria-label=${`${card.total}차례 중 ${card.index}번째`}><i style=${`width:${card.index / Math.max(card.total, 1) * 100}%`}></i></div></div>
    <div class="cardhead"><div class="bigcirc" aria-label=${`${card.seatNumber}번 자리`}>
        ${hasArt ? html`<span class="clip"><${RoleArt} r=${art} size=${64} /></span>` : html`<b class="title1 blue">${card.seatNumber}</b>`}
        <span class="seatb">${card.seatNumber}</span></div>
      <div style="min-width:0"><div class="who-n">${card.name}</div><div class="sec">${card.roleName} · ${card.teamName}</div></div></div>
    <div class="todo"><div class="sub">지금 할 일</div><div class="t">${card.instruction}</div></div>
    ${card.warns && card.warns.length > 0 && html`<${Section}>${card.warns.map(t => html`<div class="row"><${Warn}>${t}<//></div>`)}<//>`}
    ${card.grimoire && card.grimoire.length > 0 && html`<${Section}><${Row} tint onClick=${() => setGrimAsk(true)}><${Icon} name="grid" size=${20} />판 전체 보여주기<//><//>`}
    ${((card.actions || []).length > 0 || (card.onceUsed || []).length > 0) && html`<${Section}>
      ${(card.actions || []).map(it => it.label && html`<${Row} disabled=${!it.call} danger=${it.danger} onClick=${() => R.run('day.call', { call: it.call })}><span class="grow">${it.label}</span>${it.on && html`<span class="blue">✓</span>`}<//>`)}
      ${(card.onceUsed || []).map(t => html`<${DoubleTap} cls="row sec" onDouble=${() => undoOnce(t)}><${Icon} name="seal" size=${20} /><span>${t}</span><span class="grow"></span><span class="pill-note">두 번 눌러 되돌리기</span><//>`)}
    <//>`}
    ${card.resolved || ((card.answer || card.falseReason) && card.pickCount === 0) ? html`<${Section} header="처리 결과">
        ${card.chosen.length > 0 && html`<div class="row"><${Labeled} label="대상" value=${chosen.join(', ')} /></div>`}
        ${card.canUndoTargets && !shown && html`<${Row} tint onClick=${() => R.run('night.undoTargets', {})}>되돌리고 다시 고르기<//>`}
        ${card.falseReason ? html`
          <div class="row orange" style="font-size:15px"><${Icon} name="theater" size=${20} />거짓 답을 줘요 · ${card.falseReason}</div>
          ${card.discretion && html`<${DiscretionBand} card=${card} />`}
          ${card.answer ? html`<div class=${card.discretion ? 'row ans2' : 'row'}><${Labeled} label="보여줄 답" value=${card.answer} strong /></div>${revealRow}`
            : card.boardPieces ? html`${card.boardPieces.length > 0 && html`<div class="row"><${Labeled} label="바꾼 것" value=${pieceText(card.boardPieces)} /></div>`}${card.discretion && !card.discretion.잠김 && html`<${Row} tint disabled=${!card.discretion.다른답} onClick=${() => R.run('night.setDiscretion', { 다른답: true })}>다른 답<//>`}`
            : html`<div class="row sub">그럴듯한 거짓을 직접 정해 주세요.</div>`}
          ${card.trueAnswer && html`<${Disclosure} label="진짜 답">${card.trueAnswer}<//>`}
          ${!card.boardPieces && html`<${Row} tint onClick=${() => setComposing(true)}>답 직접 고르기<//>`}`
        : html`
          ${card.discretion && html`<${DiscretionBand} card=${card} />`}
          ${card.answer && html`<div class=${card.discretion ? 'row ans2' : 'row'}><${Labeled} label="답" value=${card.answer} strong /></div>`}
          ${card.result && html`<div class="row sub" style="white-space:pre-line">${card.result}</div>`}
          ${(card.answer || card.ansBoard) ? revealRow : card.discretion && !card.discretion.잠김 && html`<${Row} tint disabled=${!card.discretion.다른답} onClick=${other}><${Icon} name="cycle" size=${20} />다른 답<//>`}
          <${Row} tint onClick=${() => setComposing(true)}>답 직접 고르기<//>`}
        ${shown && html`<div class="row green"><${Icon} name="eye" size=${20} /><span class="grow">보여줌</span><button class="blink" onClick=${() => setShown(false)}><${Icon} name="undo" size=${18} />다시 보여 주기</button></div>`}
      <//>`
    : card.needsTargetsFirst ? (card.guessMax > 0 ? html`<${GuessEditor} card=${card} draft=${draft} setDraft=${setDraft} /><${Section}><${Row} onClick=${skip}><span class="sec">고르지 않고 넘기기</span><//><//>`
      : html`<${Section}>
          <${Row} chevron onClick=${pick}><${RowLabel} title="대상" text=${draft.targets.length ? draft.targets.map(id => card.targets.find(t => t.id === id)).filter(Boolean).map(label).join(', ') : '선택하지 않음'} /><//>
          <${Row} onClick=${skip}><span class="sec">고르지 않고 넘기기</span><//>
          ${card.roleOptions && html`<${RoleOptionRow} card=${card} draft=${draft} setDraft=${setDraft} />`}
        <//>
        ${card.askDie && draft.targets.length > 0 && html`<${Section} header="각자에게 따로 묻기">${draft.targets.map(id => { const t = card.targets.find(t => t.id === id); if (!t) return null;
          return html`<div class="row"><span class="grow">${label(t)}</span><div style="width:180px"><${Segmented} value=${draft.answers[t.index] || ''} onChange=${v => setDraft(d => ({ ...d, answers: { ...d.answers, [t.index]: v } }))} options=${[['live', '살겠다'], ['die', '죽겠다']]} /></div></div>`; })}<//>`}`)
    : null}
    <${Section}><${Disclosure} label="능력과 진행 안내">${card.detail}<//><//>
    <${ActionSheet} open=${grimAsk} title="판 전체(모든 좌석의 정체)를 보여줄까요?" onClose=${() => setGrimAsk(false)} actions=${[{ label: '보여 주기', onClick: () => setGrimShow(true) }]} />
    <${Cover} open=${grimShow}>${grimShow && html`<${AnswerReveal} name=${card.name} answer="판 전체" rows=${card.grimoire} bluffs=${card.bluffs} me=${card.seatNumber - 1} done=${async () => { const r = await R.run('night.markShown', {}); if (r.rejected && r.code !== 'notAllowedInPhase') return; setGrimShow(false); setShown(true); }} />`}<//>
    <${Sheet} open=${composing} onClose=${() => setComposing(false)}>${composing && html`<${AnswerComposer} close=${() => setComposing(false)} show=${(t, d) => { const { pic, ...rest } = d || {}; setManualPic(pic || null); setManual(t); store.dispatch('night.noteAnswer', { text: t, ...rest }); }} />`}<//>
    <${Cover} open=${manual !== null}>${manual !== null && html`<${AnswerReveal} name=${card.name} answer=${manual} pic=${manualPic} me=${card.seatNumber - 1} done=${() => { setManual(null); setShown(true); }} />`}<//>
    ${R.alert}
  </div>`;
}
/** 재량 슬라이드(2026-10-01 햇살님 확정 시안 26차) — 코어가 묶어 둔 칸(card.discretion)만 보고 고른다. 미리보기만 바뀌고 기록은 전달 때 */
function DiscretionBand({ card }) {
  const R = useRun(), D = card.discretion, n = D.칸수, track = useRef(null);
  const set = k => { if (!D.잠김 && k !== D.현재) R.run('night.setDiscretion', { 칸: k }); };
  const stopAt = x => { const r = track.current.getBoundingClientRect(), p = (x - r.left - 19.5) / Math.max(r.width - 39, 1); return Math.max(0, Math.min(n - 1, Math.round(p * (n - 1)))); };
  const left = k => `calc(19.5px + (100% - 39px) * ${n > 1 ? k / (n - 1) : .5})`;
  const cur = D.칸[D.현재], hint = D.잠김 ? '보여 준 답으로 확정됨' : [D.현재 === D.추천 ? '추천 칸' : '', cur.kind === 'mid' ? '중간 — 양옆 두 안 중 하나' : ''].filter(Boolean).join(' · ');
  return html`<div class=${'disc' + (D.잠김 ? ' locked' : '')} role="group" aria-label="답의 방향">
    <div class="ends"><span class="e">악</span><span class="g">선</span></div>
    <div class="track" ref=${track} role="slider" tabindex="0" aria-valuemin="1" aria-valuemax=${n} aria-valuenow=${D.현재 + 1} aria-disabled=${D.잠김}
      aria-valuetext=${`악에서 선까지 ${n}칸 중 ${D.현재 + 1}번째${D.현재 === D.추천 ? ' · 추천' : ''}${cur.kind === 'mid' ? ' · 중간' : ''}${D.잠김 ? ' · 확정됨' : ''}`}
      onPointerDown=${e => { if (D.잠김) return; e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.dataset.drag = '1'; set(stopAt(e.clientX)); }}
      onPointerMove=${e => { if (!e.currentTarget.dataset.drag) return; const k = stopAt(e.clientX); if (k !== D.현재) set(k); }}
      onPointerUp=${e => { delete e.currentTarget.dataset.drag; }}
      onKeyDown=${e => { if (e.key === 'ArrowLeft') set(Math.max(0, D.현재 - 1)); if (e.key === 'ArrowRight') set(Math.min(n - 1, D.현재 + 1)); }}>
      <div class="line"></div>
      <div class="stops">${D.칸.map((st, k) => html`<button class=${'stop' + (k === D.추천 ? ' rec' : '') + (st.kind === 'mid' ? ' mid' : '')} disabled=${D.잠김} aria-label=${`${k + 1}번째 칸${st.kind === 'mid' ? ' · 중간' : ''}`} onClick=${() => set(k)}><i></i></button>`)}</div>
      <div class="thumb" style=${`left:${left(D.현재)}`}></div>
    </div>
    <div class="hint">${hint}</div>
    ${R.alert}
  </div>`;
}
function RoleOptionRow({ card, draft, setDraft }) {
  const nav = useNav();
  const cur = card.roleOptions.find(o => o.id === draft.role);
  return html`<${Row} chevron onClick=${() => nav.push(html`<${Page} title=${card.roleTitle || '직업'} left=${html`<${Back} />`}><${Section}>${card.roleOptions.map(o => html`<${Row} onClick=${() => { setDraft(d => ({ ...d, role: o.id })); nav.pop(); }}>
      <${RoleArt} r=${o.ko} size=${28} /><span class="grow">${o.ko}</span>${draft.role === o.id && html`<span class="blue"><${Icon} name="check" size=${20} stroke=${2.4} /></span>`}<//>`)}<//><//>`)}>
    <${Labeled} label=${card.roleTitle || '직업'} value=${cur ? cur.ko : '선택하지 않음'} /><//>`;
}

/** 여러 명 맞히기(남사당·저글러) — (사람, 직업) 쌍을 최대 N개 */
function GuessEditor({ card, draft, setDraft }) {
  const [seat, setSeat] = useState(''), [role, setRole] = useState('');
  const seats = card.guessSeats || [], opts = card.roleOptions || [];
  const dup = draft.guesses.some(g => g.seat === +seat && g.char === role);
  return html`<${Section} header=${`추측 ${draft.guesses.length}/${card.guessMax}`}>
    ${draft.guesses.map((g, k) => { const s = seats.find(x => x.index === g.seat), o = opts.find(x => x.id === g.char);
      return html`<div class="row"><${Labeled} label=${`${k + 1}. ${s ? `${s.number}번 ${s.name}` : ''}`} value=${o ? o.ko : g.char} />
        <button class="blink danger" onClick=${() => setDraft(d => ({ ...d, guesses: d.guesses.filter((_, j) => j !== k) }))}>삭제</button></div>`; })}
    ${draft.guesses.length < card.guessMax && html`
      <label class="row"><span class="grow">사람</span><select value=${seat} onChange=${e => setSeat(e.currentTarget.value)}><option value="">고르기</option>${seats.map(s => html`<option value=${s.index}>${s.number}번 ${s.name}</option>`)}</select></label>
      <label class="row"><span class="grow">직업</span><select value=${role} onChange=${e => setRole(e.currentTarget.value)}><option value="">고르기</option>${opts.map(o => html`<option value=${o.id}>${o.ko}</option>`)}</select></label>
      <${Row} tint disabled=${seat === '' || !role || dup} onClick=${() => { setDraft(d => ({ ...d, guesses: [...d.guesses, { seat: +seat, char: role }] })); setSeat(''); setRole(''); }}>추측 추가<//>`}
  <//>`;
}

/** G02 — 현재 사람 한 줄 + 펼치기, 가운데 자리판 */
function FoldedCard({ card, unfold }) {
  return html`<div>
    <${Section}><${Row} onClick=${unfold}><${RoleArt} r=${card.roleName} size=${22} /><span class="grow">${card.seatNumber}번 ${card.name} · ${card.roleName}</span>
      <span class="blue hstack" style="font-size:15px">펼치기<${Icon} name="chevronDown" size=${16} stroke=${2.2} /></span><//><//>
    <div class="boardwrap nohit"><${SeatBoard} board=${store.board} /></div>
  </div>`;
}

/** 대상 선택 시트 — 자리표에서 고른다. 확정할 수 있는 카드면 바로 확정하고, 보여 줄 답이 있으면 답 단계로 이어 간다 */
function TargetPicker({ card, confirmed, close, done, commit, markShown }) {
  const [draft, setDraft] = useState(confirmed), [answering, setAnswering] = useState(false), [working, setWorking] = useState(false);
  const [revealing, setRevealing] = useState(false), [composing, setComposing] = useState(false), [manual, setManual] = useState(null), [manualPic, setManualPic] = useState(null);
  const seatT = card.targets.filter(t => t.number > 0), otherT = card.targets.filter(t => t.number === 0);
  const b = store.board, sid = i => { const s = b.seats.find(s => s.index === i); return s ? s.id : null; };
  const toggle = id => setDraft(d => d.includes(id) ? d.filter(x => x !== id) : card.pickCount === 1 ? [id] : d.length < card.pickCount ? [...d, id] : d);
  const okCount = draft.length >= card.minPick && draft.length <= Math.max(card.minPick, card.pickCount);
  const finish = async () => {
    done(draft);
    if (!commit) { close(); return; }
    setWorking(true); const ok = await commit(draft); setWorking(false);
    if (!ok) return;
    const c = store.night; if (c && c.resolved && c.mustShow) setAnswering(true); else close();
  };
  if (answering && store.night) {
    const c = store.night;
    return html`<${Page} title=${c.roleName} left=${html`<${NavButton} label="닫기" onClick=${close} />`}>
      <${Section} header="처리 결과">
        ${c.falseReason && html`<div class="row orange" style="font-size:15px"><${Icon} name="theater" size=${20} />거짓 답을 줘요 · ${c.falseReason}</div>`}
        ${c.answer && html`<div class="row"><${Labeled} label=${c.falseReason ? '보여줄 답' : '답'} value=${c.answer} strong /></div>`}
        ${c.result && html`<div class="row sub" style="white-space:pre-line">${c.result}</div>`}
        ${c.trueAnswer && html`<${Disclosure} label="진짜 답">${c.trueAnswer}<//>`}
      <//>
      <${Section}>
        ${(c.answer || c.ansBoard) && html`<${Row} tint onClick=${() => setRevealing(true)}><${Icon} name="eye" size=${20} />답 보여주기<//>`}
        <${Row} tint onClick=${() => setComposing(true)}><${Icon} name="compose" size=${20} />답 직접 고르기<//>
      <//>
      <${Cover} open=${revealing}>${revealing && html`<${AnswerReveal} name=${c.name} answer=${c.answer || ''} board=${c.ansBoard} pic=${c.ansPic} me=${c.seatNumber - 1} done=${async () => { const r = await store.dispatch('night.markShown', {}); if (r.rejected && r.code !== 'notAllowedInPhase') return; setRevealing(false); markShown(); close(); }} />`}<//>
      <${Sheet} open=${composing} onClose=${() => setComposing(false)}>${composing && html`<${AnswerComposer} close=${() => setComposing(false)} show=${(t, d) => { const { pic, ...rest } = d || {}; setManualPic(pic || null); setManual(t); store.dispatch('night.noteAnswer', { text: t, ...rest }); }} />`}<//>
      <${Cover} open=${manual !== null}>${manual !== null && html`<${AnswerReveal} name=${c.name} answer=${manual} pic=${manualPic} me=${c.seatNumber - 1} done=${() => { setManual(null); markShown(); close(); }} />`}<//>
    <//>`;
  }
  return html`<${Page} title=${card.roleName} left=${html`<${NavButton} label="취소" disabled=${working} onClick=${close} />`}
    right=${html`<${NavButton} label=${commit ? '확정' : '선택 완료'} bold disabled=${working || !okCount} onClick=${finish} />`}
    top=${html`<div class="pickcount num">${card.minPick === card.pickCount ? `${draft.length}/${card.pickCount}명 선택` : `${draft.length}명 선택 · ${card.minPick}~${card.pickCount}명 가능`}</div>`}>
    ${seatT.length > 0 && html`<div class="boardwrap"><${SeatBoard} board=${b} picked=${draft} enabled=${new Set(seatT.filter(t => !t.disabledReason).map(t => t.id))}
      me=${card.seatNumber > 0 ? sid(card.seatNumber - 1) : null} publicView=${true} allies=${new Set((card.allies || []).map(sid).filter(Boolean))} onTap=${toggle} /></div>`}
    ${otherT.length > 0 && html`<${Section}>${otherT.map(t => html`<${Row} disabled=${!!t.disabledReason} sel=${draft.includes(t.id)} onClick=${() => toggle(t.id)}>
      <${RoleArt} r=${t.name} size=${28} /><span class="grow">${t.name}</span>${draft.includes(t.id) && html`<span class="blue"><${Icon} name="check" size=${20} stroke=${2.4} /></span>`}<//>`)}<//>`}
  <//>`;
}

/** 좌석 시트 — 판|명단, 사람을 누르면 같은 시트 안 상세로 */
function SeatSheet({ close }) {
  return html`<${NavStack} root=${html`<${SeatRoot} close=${close} />`} />`;
}
function SeatRoot({ close }) {
  const nav = useNav(), [list, setList] = useState(false), b = store.board;
  const open = s => nav.push(html`<${SeatDetailView} index=${s.index} title=${`${s.number}번 ${s.name}`} />`);
  return html`<${Page} title="좌석" left=${html`<${NavButton} label="닫기" onClick=${close} />`}>
    <div style="padding:12px 16px"><${Segmented} value=${list} onChange=${setList} options=${[[false, '판'], [true, '명단']]} /></div>
    ${list ? html`<${Section}>${b.seats.map(s => html`<${Row} chevron onClick=${() => open(s)}><div class="grow"><div>${s.number}번 ${s.name}</div><div class="sub">${s.status || '생존'}</div></div><//>`)}<//>`
      : html`<div class="boardwrap"><${HostBoard} board=${b} onTap=${id => { const s = b.seats.find(x => x.id === id); if (s) open(s); }} /></div>`}
  <//>`;
}
