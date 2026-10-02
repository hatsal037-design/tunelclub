// G03 낮 · 지명 · 투표 · 수동 마감 · 결과 · 이야기 시간 타이머. 규칙은 전부 코어 명령
import { html, useState, useEffect, useRef } from '../../lib/preact-htm.js';
import { store } from '../store.js';
import { settings } from '../settings.js';
import { Icon } from '../icons.js';
import { Page, Section, Row, CheckRow, ActionSheet, Menu, NavButton, RoleArt, Sheet, Cover, cx } from '../ui.js';
import { SeatBoard } from '../seatboard.js';
import { useNav } from '../nav.js';
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
    <${Section} header="아침 발표">
      ${m.deaths.length ? m.deaths.map(p => html`<div class="row">${p.number}번 ${p.name}</div>`) : html`<div class="row sec">밤사이 죽은 사람이 없어요</div>`}
      <${CheckRow} title="아침 발표를 했어요" on=${m.announced} onClick=${() => run('day.announce', {})} />
    <//>
    ${!m.ended && html`<${TalkTimerSection} />`}
    ${m.notes.length > 0 && html`<${Section} header="알림"><${CoreItems} items=${m.notes} call=${c => run('day.call', { call: c })} /><//>`}
    <${Section} header="지명 · 투표 · 처형" footer=${[`생존 ${m.alive}명 · 처형 문턱 ${m.need}표`, m.noExecReason].filter(Boolean).join('\n')}>
      ${m.noms.map(n => html`<div class="row"><div class="nom grow">
        <div class="top"><span class="headline grow">${n.target.number}번 ${n.target.name}</span>
          ${n.tag && html`<span class=${cx('tag', n.tag === '동수' && 'orange')}>${n.tag}</span>`}
          <span class=${cx('num', n.votes >= m.need ? 'blue' : 'sec')}>${n.votes}표 / ${m.need}</span></div>
        <div class="sub">${n.by ? `${n.by.number}번 ${n.by.name} 지명` : '지명자 기록 안 함'}</div>
        ${n.done ? html`<div class="hstack sub" style="color:var(--label)"><${Icon} name="seal" size=${18} /><span class="grow">${n.blocked ? `처형됐지만 살아남음 · ${n.blocked}` : n.dead ? '처형됨' : '처형 처리됨'}</span>
            <button class="blink" onClick=${() => run('day.executeUndo', { k: n.k })}>되돌리기</button></div>`
          : html`${n.preview && html`<div class="hstack sub orange"><${Icon} name="flag" size=${16} />${n.preview}</div>`}
            <div class="hstack" style="gap:12px"><button class="btn-s" onClick=${() => setVoting(n)}>투표</button>
            ${n.canExecute && m.endIfExecuted && m.endIfExecuted.k === n.k ? html`<button class="btn-s" disabled=${m.ended} onClick=${() => run('day.executeAndFinish', { k: n.k })}>처형하고 마감</button>`
              : n.canExecute ? html`<button class="btn-s danger" disabled=${m.ended} onClick=${() => run('day.execute', { k: n.k })}>처형</button>`
              : !m.ended && html`<${Menu} aria="더 보기" label=${html`<${Icon} name="ellipsisCircle" size=${24} />`} items=${[{ label: '예외로 처형', role: 'destructive', onClick: () => run('day.execute', { k: n.k }) }]} />`}</div>`}
      </div></div>`)}
      <${Row} tint disabled=${!m.targets.length || m.ended} onClick=${() => setNom(true)}><${Icon} name="plus" size=${20} />새 지명<//>
    <//>
    ${m.special.length > 0 && html`<${Section} header="특수 승리 확인"><${CoreItems} items=${m.special} call=${c => run('day.call', { call: c })} /><//>`}
    ${!m.ended && html`<${Section}><${Row} tint onClick=${finish}>판 끝내기<//><//>`}
    <${TalkTimerBanner} />
    <${Sheet} open=${nominating} onClose=${() => setNom(false)}>${nominating && html`<${NominateSheet} m=${m} close=${() => setNom(false)} done=${(by, t) => run('day.nominate', by === null ? { target: t } : { by, target: t })} />`}<//>
    <${Cover} open=${!!voting} clear>${voting && html`<${VotePopup} nom=${voting} need=${m.need} close=${() => setVoting(null)} done=${vs => run('day.vote', { k: voting.k, voters: vs })} />`}<//>
  </div>`;
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
    ${m.politician.length > 0 && html`<${Section} header="판 끝 질문"><${CoreItems} items=${m.politician} call=${call} /><//>`}
    ${m.players.length > 0 && html`<${Section} header="참가자">${m.players.map(p => html`<div class="row"><span>${p.number}번 ${p.name}</span><${RoleArt} r=${p.role} size=${24} />
      <span class="sub grow">${p.role}</span>${p.won && html`<span class="blue" aria-label="이김"><${Icon} name="checkCircle" size=${20} /></span>`}${p.dead && html`<span class="sec" aria-label="사망"><${Icon} name="xmark" size=${18} /></span>`}</div>`)}<//>`}
    <${Section}><div class="row sec"><${Icon} name=${m.recorded ? 'trayDown' : 'tray'} size=${20} />${m.recorded ? '기록됨' : m.practice ? '연습판 · 기록하지 않음' : '기록 없음'}</div><//>
  </div>`;
}

/* ── 이야기 시간 타이머 — 5분마다·2분 전·1분 전·끝에 알림. 끝 시각으로 재서 화면을 떠났다 와도 어긋나지 않는다 ── */
const subs = new Set();
export const timer = {
  total: 0, endAt: null, pausedLeft: null, shout: null, shouted: new Set(), tick: null,
  get running() { return this.total > 0; }, get paused() { return this.pausedLeft !== null; },
  left(now = Date.now()) { return this.pausedLeft ?? Math.max(0, ((this.endAt ?? now) - now) / 1000); },
  emit() { subs.forEach(f => f()); },
  start(min) { this.total = min * 60; this.endAt = Date.now() + this.total * 1000; this.pausedLeft = null; this.shouted = new Set(); this.shout = null;
    clearInterval(this.tick); this.tick = setInterval(() => this.poll(), 1000); this.emit(); },
  pause() { if (this.running && !this.paused) { this.pausedLeft = this.left(); this.emit(); } },
  resume() { if (this.paused) { this.endAt = Date.now() + this.pausedLeft * 1000; this.pausedLeft = null; this.emit(); } },
  add(min) { if (!this.running) return; this.shouted.delete('m1'); this.shouted.delete('m2'); this.total += min * 60; if (this.paused) this.pausedLeft += min * 60; else this.endAt += min * 60000; this.emit(); },
  reset() { clearInterval(this.tick); this.tick = null; this.total = 0; this.endAt = null; this.pausedLeft = null; this.shouted = new Set(); this.shout = null; this.emit(); },
  poll() {
    if (!this.running || this.paused) { this.emit(); return; }
    const l = this.left();
    if (l <= 0) { this.alert('끝', '이야기 시간이 끝났어요 — 지목을 받으세요', true); clearInterval(this.tick); this.tick = null; this.total = 0; this.endAt = null; this.emit(); return; }
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

function TalkTimerSection() {
  const t = useTimer(), [, re] = useState(0);
  const bell = settings.get('timerSound'), min = settings.get('talkMinutes');
  const wheel = useRef(null);
  useEffect(() => { if (!t.running && wheel.current) wheel.current.scrollTop = (min - 1) * 36; }, [t.running]);
  const onScroll = e => { const v = Math.min(60, Math.max(1, Math.round(e.currentTarget.scrollTop / 36) + 1)); if (v !== settings.get('talkMinutes')) { settings.set('talkMinutes', v); re(x => x + 1); } };
  const l = t.left();
  return html`<${Section} header=${html`<span class="grow">이야기 시간</span><button class="blink" style="min-height:24px" aria-label="이야기 시간 알림음" aria-pressed=${bell}
      onClick=${() => { settings.set('timerSound', !bell); re(x => x + 1); }}><${Icon} name=${bell ? 'bell' : 'bellSlash'} size=${18} /></button>`}>
    ${t.running ? html`<div class="row"><div class="timer" aria-label=${`남은 시간 ${Math.floor(l / 60)}분 ${Math.floor(l % 60)}초${t.paused ? ', 멈춤' : ''}`}>
        <div class=${cx('tt', l <= 60 && 'red')}>${fmt(l)}</div><div class=${cx('tbar', l <= 60 && 'red')}><i style=${`width:${(t.total - l) / Math.max(t.total, 1) * 100}%`}></i></div></div></div>
      <div class="row" style="justify-content:space-between"><button class="blink" onClick=${() => t.paused ? t.resume() : t.pause()}><${Icon} name=${t.paused ? 'play' : 'pause'} size=${18} />${t.paused ? '이어서' : '멈춤'}</button>
        <button class="blink" onClick=${() => t.add(1)}>+1분</button><button class="blink danger" onClick=${() => t.reset()}>그만</button></div>`
    : html`<div class="row" style="flex-direction:column;gap:12px"><div class="wheel-wrap"><div class="wheel" ref=${wheel} onScroll=${onScroll}><div class="pad"></div>
        ${Array.from({ length: 60 }, (_, i) => html`<div class=${i + 1 === min ? 'on' : ''}>${i + 1}분</div>`)}<div class="pad"></div></div></div>
      <button class="bprim green" onClick=${() => t.start(min)}><${Icon} name="play" size=${18} />시작</button></div>`}
  <//>`;
}
function TalkTimerBanner() {
  const t = useTimer();
  if (!t.shout) return null;
  return html`<button class="banner" onClick=${() => { t.shout = null; t.emit(); }}><b>${t.shout.time}</b><span>${t.shout.text}</span></button>`;
}
