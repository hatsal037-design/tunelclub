// 화면 쌓기 — NavigationStack 과 같은 몫. push 한 화면은 «‹ 뒤로»로 돌아온다
import { html, createContext, useContext, useState } from '../lib/preact-htm.js';
import { Icon } from './icons.js';
const Ctx = createContext(null);
export const useNav = () => useContext(Ctx);
export function NavStack({ root }) {
  const [stack, setStack] = useState([]);
  const api = { push: el => setStack(s => [...s, el]), pop: () => setStack(s => s.slice(0, -1)), depth: stack.length, reset: () => setStack([]) };
  return html`<${Ctx.Provider} value=${api}>
    <div style=${stack.length ? 'display:none' : ''}>${root}</div>
    ${stack.map((el, i) => html`<div key=${i} style=${i === stack.length - 1 ? '' : 'display:none'}>${el}</div>`)}
  <//>`;
}
export function Back({ label = '뒤로' }) {
  const nav = useNav();
  return html`<button class="nbtn" onClick=${() => nav.pop()} aria-label=${label}><${Icon} name="chevronLeft" size=${24} stroke=${2.4} /></button>`;
}
