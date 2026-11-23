// 화면 쌓기 — NavigationStack 과 같은 몫. push 한 화면은 «‹ 뒤로»로 돌아온다
import { html, createContext, useContext, useState, useRef } from '../lib/preact-htm.js';
import { Icon } from './icons.js';
const Ctx = createContext(null);
/* 브라우저 뒤로 가기(안드로이드 단추·옆으로 밀기)를 화면 안 «뒤로»에 잇는다(2026-11-24 다듬기).
   전엔 쌓은 화면이 브라우저 기록에 없어, 뒤로를 누르면 카카오 로그인 쪽으로 나가거나 인앱 브라우저가 닫혔다.
   연 화면마다 기록 한 칸 + 닫는 함수 하나. 화면 단추로 닫으면 그 칸을 우리가 되감고(skip), 브라우저 뒤로면 맨 위 것을 닫는다. */
const BK = []; let skip = 0;
if (typeof window !== 'undefined') window.addEventListener('popstate', () => { if (skip > 0) { skip--; return; } const f = BK.pop(); if (f) f(); });
export function backPush(f) { BK.push(f); try { history.pushState({ nav: BK.length }, ''); } catch (e) { globalThis.드러냄?.('nav.backPush', e); } }   // 기록을 못 쓰는 곳이면 예전처럼(화면 단추로만)
export function backDrop(f) { const i = BK.lastIndexOf(f); if (i < 0) return; BK.splice(i, 1); skip++; try { history.back(); } catch (e) { skip--; globalThis.드러냄?.('nav.backDrop', e); } }
export const useNav = () => useContext(Ctx);
export function NavStack({ root }) {
  const [stack, setStack] = useState([]), cl = useRef([]).current;
  const api = { depth: stack.length,
    push: el => { const c = () => { const i = cl.indexOf(c); if (i >= 0) cl.splice(i, 1); setStack(s => s.slice(0, -1)); }; cl.push(c); backPush(c); setStack(s => [...s, el]); },
    pop: () => { const c = cl[cl.length - 1]; if (c) { c(); backDrop(c); } else setStack(s => s.slice(0, -1)); },
    reset: () => { cl.splice(0).forEach(backDrop); setStack([]); } };
  return html`<${Ctx.Provider} value=${api}>
    <div style=${stack.length ? 'display:none' : ''}>${root}</div>
    ${stack.map((el, i) => html`<div key=${i} style=${i === stack.length - 1 ? '' : 'display:none'}>${el}</div>`)}
  <//>`;
}
export function Back({ label = '뒤로' }) {
  const nav = useNav();
  return html`<button class="nbtn" onClick=${() => nav.pop()} aria-label=${label}><${Icon} name="chevronLeft" size=${24} stroke=${2.4} /></button>`;
}
