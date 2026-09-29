// 기준 부품 — 폰 앱 NativeUI(주 행동·보조·목록·시트·확인창)를 웹으로. 모양은 iOS 기본 목록(insetGrouped)을 따른다.
import { html, useState, useEffect, useRef } from '../lib/preact-htm.js';
import { Icon } from './icons.js';
import { store } from './store.js';

export const cx = (...a) => a.filter(Boolean).join(' ');

/** 화면 뼈대 — 위 막대(가운데 제목·좌우 단추) · 본문 스크롤 · 아래 막대(주 행동) */
export function Page({ title, left, right, top, bottom, children, bg = 'grouped', scrollRef, noScroll }) {
  return html`<div class=${'page bg-' + bg}>
    ${(title !== undefined || left || right) && html`<header class="navbar"><div class="nb-l">${left}</div><div class="nb-t">${title}</div><div class="nb-r">${right}</div></header>`}
    ${top && html`<div class="bar top">${top}</div>`}
    <main class=${noScroll ? 'body noscroll' : 'body'} ref=${scrollRef}>${children}</main>
    ${bottom && html`<footer class="bar bottom">${bottom}</footer>`}
  </div>`;
}
export const NavButton = ({ onClick, label, icon, disabled, bold }) => html`<button class=${cx('nbtn', bold && 'bold')} onClick=${onClick} disabled=${disabled} aria-label=${label}>${icon ? html`<${Icon} name=${icon} size=${24} />` : label}</button>`;

export const LargeTitle = ({ children, sub }) => html`<div class="ltitle"><h1>${children}</h1>${sub && html`<p class="sec">${sub}</p>`}</div>`;

export function Section({ header, footer, children, plain, cls }) {
  return html`<section class=${cx('sect', plain && 'plain', cls)}>
    ${header && html`<div class="sh">${header}</div>`}
    ${plain ? children : html`<div class="card">${children}</div>`}
    ${footer && html`<div class="sf">${footer}</div>`}
  </section>`;
}

/** 목록 한 줄 — onClick 이 있으면 버튼. chevron 은 밀어 들어가는 행 */
export function Row({ children, onClick, chevron, disabled, danger, tint, cls, sel }) {
  const inner = html`<div class="rc">${children}</div>${chevron && html`<span class="chev"><${Icon} name="chevronRight" size=${16} stroke=${2.4} /></span>`}`;
  if (!onClick) return html`<div class=${cx('row', cls)}>${inner}</div>`;
  return html`<button class=${cx('row', 'tap', danger && 'danger', tint && 'tint', cls)} onClick=${onClick} disabled=${disabled} aria-pressed=${sel === undefined ? undefined : !!sel}>${inner}</button>`;
}
export const RowLabel = ({ title, text }) => html`<div class="rl"><div>${title}</div>${text && html`<div class="sub">${text}</div>`}</div>`;
export const Labeled = ({ label, value, strong }) => html`<div class="lab"><span>${label}</span><span class=${strong ? 'lv strong' : 'lv'}>${value}</span></div>`;
export function CheckRow({ title, sub, on, onClick, art, disabled }) {
  return html`<${Row} onClick=${onClick} disabled=${disabled} sel=${on}>
    ${art !== undefined && html`<${RoleArt} r=${art} size=${28} />`}
    <div class="grow"><div>${title}</div>${sub && html`<div class="sub">${sub}</div>`}</div>
    ${on && html`<span class="blue"><${Icon} name="check" size=${20} stroke=${2.4} /></span>`}
  <//>`;
}

export function Primary({ title, enabled = true, loading, onClick, cls }) {
  return html`<button class=${cx('bprim', cls)} disabled=${!enabled || loading} onClick=${onClick} aria-label=${loading ? '저장 중' : title}>
    ${loading && html`<span class="spin"></span>`}<span>${loading ? '저장 중…' : title}</span></button>`;
}
export const Secondary = ({ title, enabled = true, onClick, danger }) => html`<button class=${cx('bsec', danger && 'danger')} disabled=${!enabled} onClick=${onClick}>${title}</button>`;
export const Link = ({ children, onClick, danger, disabled, icon }) => html`<button class=${cx('blink', danger && 'danger')} onClick=${onClick} disabled=${disabled}>${icon && html`<${Icon} name=${icon} size=${20} />`}${children}</button>`;

export function Stepper({ value, min = 0, max = 99, onChange, children }) {
  return html`<div class="row"><div class="rc">${children}</div>
    <div class="stepper"><button disabled=${value <= min} onClick=${() => onChange(value - 1)} aria-label="줄이기"><${Icon} name="minus" size=${18} stroke=${2.2} /></button><i></i>
    <button disabled=${value >= max} onClick=${() => onChange(value + 1)} aria-label="늘리기"><${Icon} name="plus" size=${18} stroke=${2.2} /></button></div></div>`;
}
export function Segmented({ options, value, onChange, disabled }) {
  return html`<div class=${cx('seg', disabled && 'dis')} role="tablist">${options.map(([v, t]) =>
    html`<button role="tab" aria-selected=${v === value} class=${v === value ? 'on' : ''} disabled=${disabled} onClick=${() => v !== value && onChange(v)}>${t}</button>`)}</div>`;
}
export function Toggle({ checked, onChange, children }) {
  return html`<label class="row"><div class="rc">${children}</div><input type="checkbox" class="switch" checked=${checked} onChange=${e => onChange(e.currentTarget.checked)} /></label>`;
}
export function Disclosure({ label, children, open: o0 = false }) {
  const [o, set] = useState(o0);
  return html`<button class="row tap disc" onClick=${() => set(!o)} aria-expanded=${o}><div class="rc">${label}</div><span class=${cx('dchev', o && 'open')}><${Icon} name="chevronRight" size=${16} stroke=${2.4} /></span></button>
    ${o && html`<div class="row dbody"><div class="rc">${children}</div></div>`}`;
}
export function Search({ value, onInput, placeholder }) {
  return html`<div class="search"><${Icon} name="search" size=${17} /><input type="search" value=${value} placeholder=${placeholder} onInput=${e => onInput(e.currentTarget.value)} />${value && html`<button onClick=${() => onInput('')} aria-label="지우기"><${Icon} name="xmark" size=${14} stroke=${2.4} /></button>`}</div>`;
}

/** 직업 그림 — job_* 는 검은 모양이라 글자색으로 칠하고(마스크), 코인·스킨은 그대로, 없으면 이모지 */
export function RoleArt({ r, size = 40 }) {
  const a = typeof r === 'string' ? store.artOf(r) : r;
  const st = `width:${size}px;height:${size}px`;
  if (a && a.icon) {
    const url = `art/${a.icon}.webp`;
    if (a.icon.startsWith('job_')) return html`<span class="art mask" style=${st + `;-webkit-mask-image:url(${url});mask-image:url(${url})`} aria-hidden="true"></span>`;
    return html`<img class="art" src=${url} style=${st} alt="" loading="lazy" />`;
  }
  if (a && a.e) return html`<span class="art emo" style=${st + `;font-size:${Math.round(size * 0.62)}px`} aria-hidden="true">${a.e}</span>`;
  return html`<span class="art" style=${st}></span>`;
}

/** 아래서 올라오는 시트 — 위 막대(취소/제목/완료) + 본문. detent 'medium' 이면 반만 */
export function Sheet({ open, onClose, children, detent = 'large', lock }) {
  const [shown, setShown] = useState(false);
  useEffect(() => { if (open) requestAnimationFrame(() => setShown(true)); else setShown(false); }, [open]);
  if (!open) return null;
  return html`<div class=${cx('sheet-wrap', shown && 'on')}>
    <div class="scrim" onClick=${() => !lock && onClose && onClose()}></div>
    <div class=${cx('sheet', detent)} role="dialog" aria-modal="true">${children}</div></div>`;
}
/** 불투명 전면 — 참가자에게 보여 주는 화면(진행자 화면을 완전히 가린다) */
export function Cover({ open, children, clear }) {
  if (!open) return null;
  return html`<div class=${cx('cover', clear && 'clear')} role="dialog" aria-modal="true">${children}</div>`;
}
/** 확인창(액션 시트) — 제목·설명·단추들·취소 */
export function ActionSheet({ open, title, message, actions = [], onClose }) {
  if (!open) return null;
  return html`<div class="sheet-wrap on"><div class="scrim" onClick=${onClose}></div>
    <div class="asheet" role="alertdialog">
      <div class="ag">${(title || message) && html`<div class="ah">${title && html`<b>${title}</b>`}${message && html`<span>${message}</span>`}</div>`}
        ${actions.map(a => html`<button class=${cx('ab', a.role === 'destructive' && 'danger')} onClick=${() => { onClose(); a.onClick && a.onClick(); }}>${a.label}</button>`)}</div>
      <button class="ab cancel" onClick=${onClose}>취소</button></div></div>`;
}
export function Alert({ open, title, message, onClose }) {
  if (!open) return null;
  return html`<div class="sheet-wrap on center"><div class="scrim"></div>
    <div class="alert" role="alertdialog"><div class="ah"><b>${title}</b>${message && html`<span>${message}</span>`}</div>
    <button class="ab" onClick=${onClose}>확인</button></div></div>`;
}
/** 명령 응답 알림 — 거절만 표준 알림으로(낡은 화면에서 한 번 더 누른 것은 조용히 무시) */
export function ReplyAlert({ reply, clear }) {
  const show = reply && reply.rejected && reply.code !== 'staleRevision';
  return html`<${Alert} open=${show} title="처리하지 못했어요" message=${show ? reply.recovery : ''} onClose=${clear} />`;
}
/** 메뉴 — 누르면 항목 목록(액션 시트 모양) */
export function Menu({ label, items, cls, disabled, aria }) {
  const [o, set] = useState(false);
  return html`<button class=${cls || 'nbtn'} disabled=${disabled} aria-label=${aria} onClick=${() => set(true)}>${label}</button>
    <${ActionSheet} open=${o} actions=${items} onClose=${() => set(false)} />`;
}

/** 누르는 동안만 보기 — 손 떼기·단추 밖·탭 전환에서 즉시 가린다 */
export function HoldButton({ onChange, label = '누르는 동안 보기' }) {
  const on = useRef(false);
  const set = v => { if (on.current !== v) { on.current = v; onChange(v); } };
  useEffect(() => { const h = () => document.hidden && set(false); document.addEventListener('visibilitychange', h); window.addEventListener('blur', h); return () => { document.removeEventListener('visibilitychange', h); window.removeEventListener('blur', h); }; }, []);
  return html`<button class="hold" onPointerDown=${e => { e.preventDefault(); e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId); set(true); }}
    onPointerUp=${() => set(false)} onPointerCancel=${() => set(false)} onLostPointerCapture=${() => set(false)}
    onKeyDown=${e => (e.key === ' ' || e.key === 'Enter') && set(true)} onKeyUp=${() => set(false)} onBlur=${() => set(false)}
    onContextMenu=${e => e.preventDefault()}>${label}</button>`;
}

/** 한 번 누르면 되는 명령을 도는 동안 잠그는 도우미 */
export function useRun() {
  const [busy, setBusy] = useState(false), [reply, setReply] = useState(null);
  const run = async (type, payload, after) => {
    setBusy(true); const r = await store.dispatch(type, payload); setBusy(false);
    if (r.rejected) setReply(r); else if (after) after(r);
    return r;
  };
  return { busy, reply, setReply, run, alert: html`<${ReplyAlert} reply=${reply} clear=${() => setReply(null)} />` };
}

/** 두 번 톡 — 되돌리기 동작(사용함·보여줌) */
export function DoubleTap({ onDouble, children, cls }) {
  const last = useRef(0);
  return html`<div class=${cls} role="button" tabindex="0" onClick=${() => { const t = Date.now(); if (t - last.current < 350) { last.current = 0; onDouble(); } else last.current = t; }}
    onKeyDown=${e => e.key === 'Enter' && onDouble()}>${children}</div>`;
}

export function Empty({ icon, title, text }) {
  return html`<div class="empty">${icon && html`<${Icon} name=${icon} size=${44} stroke=${1.5} />`}<b>${title}</b>${text && html`<span>${text}</span>`}</div>`;
}
export const Warn = ({ children }) => html`<div class="warn"><span class="orange"><${Icon} name="warn" size=${18} /></span><span>${children}</span></div>`;
