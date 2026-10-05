// G03 낮 · 지명 · 투표 · 수동 마감 · 결과 · 이야기 시간 타이머. 규칙은 전부 코어 명령
import { html, useState, useEffect, useRef } from '../../lib/preact-htm.js';
import { store } from '../store.js';
import { settings } from '../settings.js';
import { Icon } from '../icons.js';
import { Page, Section, Row, CheckRow, ActionSheet, Menu, NavButton, RoleArt, Sheet, Cover, Toggle, cx } from '../ui.js';
import { SeatBoard } from '../seatboard.js';
import { useNav } from '../nav.js';
import { speak } from '../narrator.js';
import { ReplayView } from './replay.js';

/** 코어 항목 묶음 — 글은 글로, 버튼은 명령(day.call). 죽이거나 보호를 뚫는 단추는 한 번 더 묻는다 */
export function CoreItems({ items, call }) {
  const [ask, setAsk] = useState(null);
  return html`${items.map(it => it.kind === 'text' && it.text ? html`<div class="row sub" style="white-space:pre-line">${it.text}</div>`
    : it.label ? html`<${Row} danger=${it.danger} disabled=${!it.call} sel=${it.on} onClick=${() => it.danger ? setAsk(it) : call(it.call)}>
        <span class="grow">${it.label}</span>${it.on && html`<span class="blue"><${Icon} name="check" size=${20} stroke=${2.4} /></span>`}<//>` : null)}
    <${ActionSheet} open=${!!ask} title=${ask && ask.label} message="바로 기록돼요." onClose=${() => setAsk(null)} actions=${[{ label: ask ? ask.label : '처리', role: 'destructive', onClick: () => call(ask.call) }]} />`;
}

export function DayView({ m, run, finish }) {
  const [nominating, setNom] = useState(false), [voting, setVoting] = useState(null);
  useEffect(() => { if (m.ended) timer.reset(); }, [m.ended]);
  return html`<div>
    ${m.ended && html`<${Section} header="판이 끝날 조건이 됐어요">${m.verdict.filter(v => v.level === 'end').map(v => html`<div class="row headline"><${Icon} name="flag" size=${20} />${v.text}</div>`)}<//>`}
    ${!m.ended && m.endIfExecuted && html`<${Section} header="이대로 처형하면 판이 끝나요"><div class="row headline"><${Icon} name="flag" size=${20} />${m.endIfExecuted.text}</div>
      <div class="row"><button class="btn-p" onClick=${() => run('day.executeAndFinish', { k: m.endIfExecuted.k })}>처형하고 마감 — ${m.endIfExecuted.winnerKo}</button></div><//>`}
    <${Section} header=${html`<span class="grow">아침 발표</span><button class="blink" style="min-height:24px;font-weight:600" onClick=${() => speak((m.script || []).join(' '), m.scriptPlan || [])}><${Icon} name="speaker" size=${16} /> 읽어 주기</button>`}>
      <div class="row" style="font-size:19px;line-height:1.45;flex-direction:column;align-items:stretch;gap:6px;padding:16px">${(m.script || []).map(t => html`<div>${t}</div>`)}</div>
      <div class="row" style="padding:12px 16px"><button class=${cx('pill-act', m.announced && 'done')} aria-pressed=${m.announced} onClick=${() => run('day.announce', {})}>${m.announced ? '발표했어요 ✓' : '발표했어요'}</button></div>
    <//>
    ${!m.ended && html`<div style=${m.announced ? '' : 'opacity:.4;pointer-events:none'} aria-disabled=${!m.announced}><${TalkTimerSection} whisper=${!m.mafia} /></div>`}
    ${m.notes.length > 0 && html`<${Section} header="알림"><${CoreItems} items=${m.notes} call=${c => run('day.call', { call: c })} /><//>`}
    ${m.mafia ? html`<${MafiaDay} m=${m} run=${run} />` : html`<${Section} header="지명 · 투표 · 처형" footer=${[`생존 ${m.alive}명 · 처형 문턱 ${m.need}표`, m.noExecReason].filter(Boolean).join('\n')}>
      ${m.noms.map(n => {   /* 2026-10-04 햇살님 시안 A — 투표(회색)·처형(빨강) 두 알약을 한 줄에 반씩 */
        const finish = n.canExecute && m.endIfExecuted && m.endIfExecuted.k === n.k, ready = !!n.canExecute;
        return html`<div class="row"><div class="nom grow">
          <div class="top"><span class="headline grow">${n.target.number}번 ${n.target.name}</span>
            ${n.tag && html`<span class=${cx('tag', n.tag === '동수' && 'orange')}>${n.tag}</span>`}
            <span class=${cx('num', n.votes >= m.need ? 'blue' : 'sec')}>${n.votes}표 / ${m.need}</span></div>
          <div class="sub">${n.by ? `${n.by.number}번 ${n.by.name} 지명` : '지명자 기록 안 함'}</div>
          ${n.done ? html`<div class="hstack sub" style="color:var(--label)"><${Icon} name="seal" size=${18} /><span class="grow">${n.blocked ? `처형됐지만 살아남음 · ${n.blocked}` : n.dead ? '처형됨' : '처형 처리됨'}</span>
              <button class="blink" onClick=${() => run('day.executeUndo', { k: n.k })}>되돌리기</button></div>`
            : html`${n.preview && html`<div class="hstack sub orange"><${Icon} name="flag" size=${16} />${n.preview}</div>`}
              ${!m.ended && html`<div class="hstack" style="justify-content:flex-end"><button class="blink danger" onClick=${() => run('day.nomRemove', { k: n.k })}>지우기</button></div>`}
              <div class="hstack" style="gap:10px;margin-top:4px"><button class="pill-act gray" onClick=${() => setVoting(n)}>투표</button>
                <button class=${cx('pill-act', ready ? 'red' : 'off')} disabled=${m.ended || !ready} onClick=${() => run(finish ? 'day.executeAndFinish' : 'day.execute', { k: n.k })}>${finish ? '처형하고 마감' : '처형'}</button></div>
`}
        </div></div>`; })}
      ${m.tie && (m.tie.state === 'none'
        ? html`<div class="row"><span class="orange grow" style="font-weight:600">= 동수 — 오늘은 처형 없음</span><button class="blink" onClick=${() => run('day.tie', { how: 'undo' })}>되돌리기</button></div>`
        : html`<div class="row" style="flex-direction:column;align-items:stretch;gap:10px">
            <div class="orange" style="font-weight:600;font-size:15px">= 동수 — ${(m.tie.names || []).map(p => `${p.number}번 ${p.name}`).join(' · ')}</div>
            <button class="pill-act" onClick=${() => run('day.tie', { how: 'none' })}>처형 없음 (규칙)</button>
            <div class="hstack" style="gap:10px"><button class="pill-act gray" onClick=${() => run('day.tie', { how: 'revote' })}>결선 투표</button><button class="pill-act gray" onClick=${() => run('day.tie', { how: 'renominate' })}>다시 지명</button></div>
          </div>`)}
      <${Row} tint disabled=${!m.targets.length || m.ended} onClick=${() => setNom(true)}><${Icon} name="plus" size=${20} />새 지명<//>
    <//>`}
    ${m.special.length > 0 && html`<${Section} header="특수 승리 확인"><${CoreItems} items=${m.special} call=${c => run('day.call', { call: c })} /><//>`}
    ${!m.ended && html`<${Section}><${Row} tint onClick=${finish}>판 끝내기<//><//>`}
    <${TalkTimerBanner} />
    <${Sheet} open=${nominating} onClose=${() => setNom(false)}>${nominating && html`<${NominateSheet} m=${m} close=${() => setNom(false)} done=${(by, t) => run('day.nominate', by === null ? { target: t } : { by, target: t })} />`}<//>
    <${Cover} open=${!!voting} clear>${voting && html`<${VotePopup} nom=${voting} need=${m.need} close=${() => setVoting(null)} done=${vs => run('day.vote', { k: voting.k, voters: vs })} />`}<//>
  </div>`;
}

/** 오리지널 마피아 낮(2026-10-03 햇살님 «이렇게 확정», 시안/오리지널마피아_낮_20261003 v5) — 지목은 기록 안 함.
    가장 많이 지목받은 사람만 누르고 살린다·죽인다. 둘을 누르면 동수 → 무효(룰)·둘 다 찬반·다시 지목 */
function MafiaDay({ m, run }) {
  const [picking, setPicking] = useState(false), [queue, setQueue] = useState([]);
  const nm = p => `${p.number}번 ${p.name}`;
  const closed = m.ended || m.executed || !!m.tieVoid;
  const next = () => setQueue(q => q.slice(1));
  return html`<${Section} header="지목 · 처형" footer=${`생존 ${m.alive}명`}>
      ${m.noms.map(n => html`<div class="row"><div class="grow"><div class="headline">${nm(n.target)}</div>
        <div class="sub">${n.done ? (n.blocked ? `처형됐지만 살아남음 · ${n.blocked}` : '처형됨') : n.saved ? '살림' : ''}</div></div>
        <button class="blink" onClick=${() => run(n.done ? 'day.executeUndo' : 'day.verdictUndo', { k: n.k })}>되돌리기</button></div>`)}
      ${m.tieVoid && html`<div class="row"><div class="grow"><div class="headline">처형 없음</div><div class="sub">동수</div></div>
        <button class="blink" onClick=${() => run('day.tieVoidUndo', {})}>되돌리기</button></div>`}
      <${Row} tint disabled=${!m.targets.length || closed} onClick=${() => setPicking(true)}><${Icon} name="plus" size=${20} />지목받은 사람<//>
    <//>
    <${Sheet} open=${picking} onClose=${() => setPicking(false)}>${picking && html`<${MafiaPickSheet} m=${m} close=${() => setPicking(false)}
      verdict=${ts => { setPicking(false); setQueue(ts); }} tie=${ts => { setPicking(false); run('day.tieVoid', { targets: ts }); }} />`}<//>
    <${Cover} open=${queue.length > 0} clear>${queue.length > 0 && html`<${VerdictPopup} seat=${store.board.seats.find(s => s.index === queue[0])} close=${() => setQueue([])}
      done=${kill => { const t = queue[0]; next(); run('day.verdict', { target: t, kill }); }} />`}<//>`;
}

function MafiaPickSheet({ m, close, verdict, tie }) {
  const [sel, setSel] = useState([]);
  const b = store.board, idOf = i => { const s = b.seats.find(s => s.index === i); return s ? s.id : null; };
  const enabled = new Set(m.targets.map(x => idOf(x.index)).filter(Boolean));
  const tap = sid => { const s = b.seats.find(x => x.id === sid); if (!s) return; const i = s.index;
    setSel(p => p.includes(i) ? p.filter(x => x !== i) : p.length < 2 ? p.concat(i) : p); };   // 둘째를 누르면 그게 동수 · 다시 누르면 풀림
  return html`<${Page} title="지목받은 사람" left=${html`<${NavButton} label="취소" onClick=${close} />`}>
    <${Section} plain><div class="boardwrap"><${SeatBoard} board=${b} enabled=${enabled} picked=${sel.map(idOf).filter(Boolean)} tints=${Object.fromEntries(sel.map(i => [idOf(i), 'red']))} publicView=${true} onTap=${tap} /></div><//>
    <div style="padding:0 16px;display:flex;flex-direction:column;gap:10px">
      ${sel.length === 1 && html`<button class="bprim" onClick=${() => verdict(sel)}>살릴까 죽일까</button>`}
      ${sel.length === 2 && html`<button class="bprim" onClick=${() => tie(sel)}>무효 — 처형 없음</button>
        <div class="brow"><button class="bsec" onClick=${() => verdict(sel)}>둘 다 찬반</button><button class="bsec" onClick=${() => setSel([])}>다시 지목</button></div>`}
    </div>
  <//>`;
}

function VerdictPopup({ seat, close, done }) {
  return html`<div class="sheet-wrap on center" style="z-index:61"><div class="scrim"></div>
    <div class="popup" style="width:calc(100% - 24px);max-width:420px">
      <div class="headline">${seat ? `${seat.number}번 ${seat.name}` : ''}</div>
      <div class="brow" style="width:100%"><button class="bsec" onClick=${() => done(false)}>살린다</button><button class="bprim red" style="flex:1" onClick=${() => done(true)}>죽인다</button></div>
      <button class="blink" onClick=${close}>취소</button>
    </div></div>`;
}

/** 지명 — 지명한 사람(회색) → 지명당한 사람(빨강), 둘 사이에 화살표 */
function NominateSheet({ m, close, done }) {
  const [by, setBy] = useState(null), [noBy, setNoBy] = useState(false), [target, setTarget] = useState(null);
  const b = store.board, id = i => { const s = b.seats.find(s => s.index === i); return s ? s.id : null; };
  const name = i => { const s = b.seats.find(s => s.index === i); return s ? `${s.number}번 ${s.name}` : ''; };
  const pickingBy = by === null && !noBy;
  const enabled = new Set((pickingBy ? m.nominators.map(x => x.index) : m.targets.map(x => x.index).filter(i => i !== by).concat(by === null ? [] : [by])).map(id).filter(Boolean));
  const tints = {}; if (by !== null && id(by)) tints[id(by)] = 'gray'; if (target !== null && id(target)) tints[id(target)] = 'red';
  const tap = sid => {
    const s = b.seats.find(x => x.id === sid); if (!s) return; const i = s.index;
    if (i === target) { setTarget(null); return; }
    if (i === by) { setBy(null); setTarget(null); return; }
    if (pickingBy) setBy(i); else { setTarget(i); if (settings.get('haptics') && navigator.vibrate) navigator.vibrate(12); }
  };
  return html`<${Page} title="새 지명" left=${html`<${NavButton} label="취소" onClick=${close} />`}
    right=${html`<${NavButton} label="지명" bold disabled=${target === null} onClick=${() => { done(noBy ? null : by, target); close(); }} />`}
    top=${html`<div class="hstack headline" style="justify-content:center"><span class=${by === null ? 'sec' : ''}>${by !== null ? name(by) : noBy ? '기록 안 함' : '지명한 사람'}</span>
      <span class=${target === null ? 'sec' : 'red'}><${Icon} name="arrowRight" size=${18} /></span><span class=${target === null ? 'sec' : 'red'}>${target !== null ? name(target) : '지명당한 사람'}</span></div>`}>
    <${Section} plain header=${pickingBy ? '지명한 사람을 누르세요' : target === null ? '지명당한 사람을 누르세요' : '지명 확인'}>
      <div class="boardwrap"><${SeatBoard} board=${b} enabled=${enabled} tints=${tints} publicView=${true} onTap=${tap}
        arrow=${by !== null && target !== null ? { from: id(by), to: id(target) } : null} /></div>
    <//>
    ${pickingBy && html`<${Section}><${Row} tint onClick=${() => setNoBy(true)}>지명한 사람 없이<//><//>`}
  <//>`;
}

/** 투표 — 가운데 팝업. 자리표를 문지르면 지나간 사람이 바로 골라진다 */
function VotePopup({ nom, need, close, done }) {
  const [voters] = useState(() => store.voters(nom.k));
  const [sel, setSel] = useState(() => new Set(nom.voters));
  const b = store.board, id = i => { const s = b.seats.find(s => s.index === i); return s ? s.id : null; };
  const total = voters.filter(v => sel.has(v.index)).reduce((a, v) => a + (v.weight || 1), 0);
  const notes = voters.filter(v => v.ghost || (v.weight || 1) > 1);
  const H = typeof innerHeight === 'number' ? innerHeight : 700;
  return html`<div class="sheet-wrap on center" style="z-index:61"><div class="scrim"></div>
    <div class="popup" style="width:calc(100% - 24px);max-width:560px">
      <div class="headline">${nom.target.number}번 ${nom.target.name} 투표</div>
      <div class=${cx('vt', total >= need && 'blue')}>${total}표 / 문턱 ${need}표</div>
      <div style="width:100%"><${SeatBoard} board=${b} picked=${voters.filter(v => sel.has(v.index)).map(v => id(v.index)).filter(Boolean)}
        enabled=${new Set(voters.map(v => id(v.index)).filter(Boolean))} numbered=${false} publicView=${true} maxHeight=${Math.max(260, H - 300)}
        sweep=${(sid, on) => { const s = b.seats.find(x => x.id === sid); if (!s) return; setSel(p => { const n = new Set(p); on ? n.add(s.index) : n.delete(s.index); return n; }); }} /></div>
      ${notes.length > 0 && html`<div class="foot">${notes.map(v => `${v.number}번 ${v.ghost ? '유령표' : (v.weight || 1) + '표'}`).join(' · ')}</div>`}
      <div class="brow" style="width:100%"><button class="bsec" onClick=${close}>취소</button><button class="bprim" style="flex:1" onClick=${() => { done([...sel]); close(); }}>투표 확정</button></div>
    </div></div>`;
}

/** G04 수동 마감 — 판정이 없을 때만 승자를 고른다 */
export function FinishSheet({ close, done }) {
  const [w, setW] = useState(null);
  return html`<${Page} title="판 끝내기" left=${html`<${NavButton} label="취소" onClick=${close} />`}
    right=${html`<${NavButton} label="결과 확인하고 저장" bold disabled=${!w} onClick=${() => { done(w); close(); }} />`}>
    <${Section} footer="판정이 나지 않은 판을 진행자가 끝낼 때 고릅니다.">
      ${[['good', '선 승리'], ['evil', '악 승리'], ['other', '중립 승리'], ['void', '무효 · 중단']].map(([k, l]) => html`<${CheckRow} title=${l} on=${w === k} onClick=${() => setW(k)} />`)}
    <//>
  <//>`;
}

/** G05 · 결과 — 제목·종료 근거·판 끝 질문·참가자 */
export function ResultView({ m, call }) {
  const nav = useNav();
  return html`<div>
    <div class="ltitle"><h1>${m.title}</h1><p class="sec" style="white-space:pre-line">${m.why}</p></div>
    ${!m.practice && html`<${Section}><${Row} chevron onClick=${() => nav.push(html`<${ReplayView} />`)}>복기<//><//>`}
    <${Section} header="큰 화면">
      <${Toggle} checked=${!!m.tvReveal} onChange=${v => store.dispatch('display.endReveal', { on: v })}>직업 공개<//>
      ${m.replayDays != null && html`<div class="row"><span class="grow">복기</span>
        <button class="btn-s rp-arrow" aria-label="앞 날" disabled=${m.tvReplay == null} onClick=${() => store.dispatch('display.endReplay', m.tvReplay > 0 ? { day: m.tvReplay - 1 } : {})}><${Icon} name="chevronLeft" size=${28} stroke=${2.4} /></button>
        <span class="num" style="min-width:86px;text-align:center">${m.tvReplay != null ? (m.tvReplay === 0 ? '정보의 밤' : `${m.tvReplay}일차 / ${m.replayDays}`) : '끔'}</span>
        <button class="btn-s rp-arrow" aria-label="다음 날" disabled=${(m.tvReplay ?? -1) >= m.replayDays} onClick=${() => store.dispatch('display.endReplay', { day: Math.min(m.replayDays, (m.tvReplay ?? -1) + 1) })}><${Icon} name="chevronRight" size=${28} stroke=${2.4} /></button></div>`}
    <//>
    ${m.politician.length > 0 && html`<${Section} header="판 끝 질문"><${CoreItems} items=${m.politician} call=${call} /><//>`}
    ${m.players.length > 0 && html`<${Section} header="참가자">${m.players.map(p => html`<div class="row"><span>${p.number}번 ${p.name}</span><${RoleArt} r=${p.role} size=${24} />
      <span class="sub grow">${p.role}</span>${p.won && html`<span class="blue" aria-label="이김"><${Icon} name="checkCircle" size=${20} /></span>`}${p.dead && html`<span class="sec" aria-label="사망"><${Icon} name="xmark" size=${18} /></span>`}</div>`)}<//>`}
    <${Section}><div class="row sec"><${Icon} name=${m.recorded ? 'trayDown' : 'tray'} size=${20} />${m.recorded ? '기록됨' : m.practice ? '연습판 · 기록하지 않음' : '기록 없음'}</div><//>
  </div>`;
}

/* ── 이야기 시간 타이머 — 5분마다·2분 전·1분 전·끝에 알림. 끝 시각으로 재서 화면을 떠났다 와도 어긋나지 않는다 ── */
const subs = new Set();
export const timer = {
  total: 0, endAt: null, pausedLeft: null, shout: null, shouted: new Set(), tick: null, kind: 'whisper', place: '광장',   // place — 다 같이 이야기하는 자리의 계열 말(마당·광장·구역, 화면이 home.potKo 로 채움 — 2026-10-05 «낮에도 테마 따라»). kind — 밀담(whisper)·광장(square) 두 줄(2026-10-05, 폰 앱 TalkTimer 와 같음)
  get running() { return this.total > 0; }, get paused() { return this.pausedLeft !== null; },
  left(now = Date.now()) { return this.pausedLeft ?? Math.max(0, ((this.endAt ?? now) - now) / 1000); },
  emit() { subs.forEach(f => f()); },
  /* 큰 화면에 타이머 상태를 알린다 — 바뀔 때만(매초 아님). 저절로 끝나면 00:00 으로 남기고, 지우면 없앤다 */
  tell(done) { const ms = x => Math.round(x * 1000);
    const k = this.kind;
    store.dispatch('display.setTimer', done ? { state: 'elapsed', endsAt: Date.now(), durationMs: ms(done), kind: k }
      : !this.running ? { state: null } : this.paused ? { state: 'paused', leftMs: ms(this.pausedLeft), durationMs: ms(this.total), kind: k } : { state: 'running', endsAt: this.endAt, durationMs: ms(this.total), kind: k }); },
  start(min, kind = 'whisper') { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch {}   // 누른 순간에 소리를 깨워 둔다 — 사파리는 터치 밖에서 만든 소리를 막는다(2026-10-05)
    this.kind = kind; this.total = min * 60; this.endAt = Date.now() + this.total * 1000; this.pausedLeft = null; this.shouted = new Set(); this.shout = null;
    clearInterval(this.tick); this.tick = setInterval(() => this.poll(), 1000); this.emit(); this.tell(); },
  pause() { if (this.running && !this.paused) { this.pausedLeft = this.left(); this.emit(); this.tell(); } },
  resume() { if (this.paused) { this.endAt = Date.now() + this.pausedLeft * 1000; this.pausedLeft = null; this.emit(); this.tell(); } },
  add(min) { if (!this.running) return; this.shouted.delete('m1'); this.shouted.delete('m2'); this.total += min * 60; if (this.paused) this.pausedLeft += min * 60; else this.endAt += min * 60000; this.emit(); this.tell(); },
  reset() { const was = this.running; clearInterval(this.tick); this.tick = null; this.total = 0; this.endAt = null; this.pausedLeft = null; this.shouted = new Set(); this.shout = null; this.emit(); if (was) this.tell(); },
  poll() {
    if (!this.running || this.paused) { this.emit(); return; }
    const l = this.left();
    if (l <= 0) { this.alert('끝', this.kind === 'whisper' ? '밀담 끝 — ' + this.place + '으로 모여 주세요' : '이야기 시간이 끝났어요 — 지목을 받으세요', true); clearInterval(this.tick); this.tick = null; const dur = this.total; this.total = 0; this.endAt = null; this.emit(); this.tell(dur); return; }
    const passed = this.total - l, marks = [];
    for (let m = 5; m * 60 < this.total; m += 5) marks.push(['p' + m, m * 60, `${m}분 지났어요`]);
    marks.push(['m2', this.total - 120, '2분 남았어요'], ['m1', this.total - 60, '1분 남았어요']);
    marks.forEach(([k, at, t]) => { if (at > 0 && passed >= at && !this.shouted.has(k)) { this.shouted.add(k); this.alert(fmt(l), t, false); } });
    this.emit();
  },
  alert(time, text, strong) {
    this.shout = { time, text };
    if (settings.get('haptics') && navigator.vibrate) try { navigator.vibrate(strong ? [200, 100, 200] : 80); } catch {}
    if (settings.get('timerSound')) beep(strong);
    setTimeout(() => { if (this.shout && this.shout.text === text) { this.shout = null; this.emit(); } }, 4000);
    this.emit();
  },
};
const fmt = t => { const s = Math.ceil(t); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
let actx = null;
function beep(strong) {
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); const n = strong ? 3 : 1;
    for (let i = 0; i < n; i++) { const o = actx.createOscillator(), g = actx.createGain(), t0 = actx.currentTime + i * 0.35;
      o.frequency.value = strong ? 880 : 1320; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
      o.connect(g).connect(actx.destination); o.start(t0); o.stop(t0 + 0.3); } } catch {}
}
function useTimer() { const [, f] = useState(0); useEffect(() => { const h = () => f(x => x + 1); subs.add(h); return () => subs.delete(h); }, []); return timer; }

/* 분은 바퀴로 돌려 고르고(2026-10-05 «타이머 버튼은 돌리는 게 나아»), 시작은 밀담·광장 두 단추. 도는 동안엔 그 줄 이름 + 큰 시계. 마피아는 광장만 */
function TalkTimerSection({ whisper = true }) {
  const t = useTimer(), [, re] = useState(0);
  t.place = (store.home && store.home.potKo) || '광장';   // 계열 말(마당·광장·구역)
  const bell = settings.get('timerSound'), min = settings.get('talkMinutes');
  const wheel = useRef(null);
  useEffect(() => { if (!t.running && wheel.current) wheel.current.scrollTop = (min - 1) * 36; }, [t.running]);
  const onScroll = e => { const v = Math.min(60, Math.max(1, Math.round(e.currentTarget.scrollTop / 36) + 1)); if (v !== settings.get('talkMinutes')) { settings.set('talkMinutes', v); re(x => x + 1); } };
  const l = t.left(), title = t.kind === 'whisper' ? '밀담' : t.place;
  return html`<${Section} header=${html`<span class="grow">이야기 시간</span><button class="blink" style="min-height:24px" aria-label="이야기 시간 알림음" aria-pressed=${bell}
      onClick=${() => { settings.set('timerSound', !bell); re(x => x + 1); }}><${Icon} name=${bell ? 'bell' : 'bellSlash'} size=${18} /></button>`}>
    ${t.running ? html`<div class="row"><div class="timer" aria-label=${`${title} 남은 시간 ${Math.floor(l / 60)}분 ${Math.floor(l % 60)}초${t.paused ? ', 멈춤' : ''}`}>
        <b>${title}${t.kind === 'whisper' && html` <span class="sec" aria-label="음악">♪</span>`}</b>
        <div class=${cx('tt', l <= 60 && 'red')}>${fmt(l)}</div><div class=${cx('tbar', l <= 60 && 'red')}><i style=${`width:${(t.total - l) / Math.max(t.total, 1) * 100}%`}></i></div></div></div>
      <div class="row" style="justify-content:space-between"><button class="blink" onClick=${() => t.paused ? t.resume() : t.pause()}><${Icon} name=${t.paused ? 'play' : 'pause'} size=${18} />${t.paused ? '이어서' : '멈춤'}</button>
        <button class="blink" onClick=${() => t.add(1)}>+1분</button><button class="blink danger" onClick=${() => t.reset()}>그만</button></div>`
    : html`<div class="row" style="flex-direction:column;gap:12px"><div class="wheel-wrap"><div class="wheel" ref=${wheel} onScroll=${onScroll}><div class="pad"></div>
        ${Array.from({ length: 60 }, (_, i) => html`<div class=${i + 1 === min ? 'on' : ''}>${i + 1}분</div>`)}<div class="pad"></div></div></div>
      <div class="row" style="padding:0;gap:12px;width:100%">${whisper && html`<button class="bprim green grow" onClick=${() => t.start(min, 'whisper')}>♪ 밀담</button>`}
        <button class="bprim grow" onClick=${() => t.start(min, 'square')}><${Icon} name="play" size=${18} />${t.place}</button></div></div>`}
  <//>`;
}
function TalkTimerBanner() {
  const t = useTimer();
  if (!t.shout) return null;
  return html`<button class="banner" onClick=${() => { t.shout = null; t.emit(); }}><b>${t.shout.time}</b><span>${t.shout.text}</span></button>`;
}
