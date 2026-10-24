/* 이번 판 안내 그리기(2026-10-24) — 코어 game.briefing / display.public.briefing 하나를 받아 그린다. 규칙은 다시 계산하지 않는다.
   큰 화면 룰 설명(A) · 큰 화면 넘기기 옆 «이번 판»(panel) · 공유 장 4:5(K 다섯 종) · 참가 웹이 같이 쓴다.
   디자인 원본: 시안/이번판안내_20261024/시안_v5_틀.html(햇살님 «이야 아주 맘에 들어») — CSS·wire()·장 나누기·넘치면 본문만 zoom 을 그대로 옮겼다.
   앱 CSS 와 섞이지 않게 그림은 섀도 루트 안에 그린다(글꼴 선언만 문서 머리에). */
import { ICON_PATHS } from './icons.js';

const BASE = new URL('../', import.meta.url).href;
const SRC = { tex: BASE + 'tex/tex-suede.png', serif: BASE + 'fonts/gowun-700.woff2', sans: BASE + 'fonts/pre-400.woff2', sansB: BASE + 'fonts/pre-700.woff2' };
const art = id => BASE + 'art/' + id + '.webp';
const face = s => `@font-face{font-family:"bf-serif";src:url(${s.serif}) format("woff2");font-weight:100 900;font-display:block}
@font-face{font-family:"bf-sans";src:url(${s.sans}) format("woff2");font-weight:100 550;font-display:block}
@font-face{font-family:"bf-sans";src:url(${s.sansB}) format("woff2");font-weight:551 900;font-display:block}`;
let faced = false;
function fonts() { if (faced) return; faced = true; const st = document.createElement('style'); st.textContent = face(SRC); document.head.appendChild(st); }

/* 오리지널 마피아 결 — 먹색 스웨이드 천 · 놋쇠 · 크림(오리지널_컨셉_v1.md) */
const css = tex => `
:host{display:block;line-height:normal;letter-spacing:normal;text-align:left;font-size:16px}
.felt{--bg:#1a1a1d;--txt:#eeeae2;--txt2:#bdb8ae;--dim:#85817a;--gold:#b89a62;--gold-lit:#d9ba7e;--good:#8fb6dd;--evil:#e07a64;--neu:#b7a0d6;
  --hair:rgba(238,234,226,.14);--hairg:rgba(184,154,98,.5);--serif:"bf-serif","Gowun Batang",serif;--sans:"bf-sans","Pretendard",-apple-system,system-ui,sans-serif}
*{box-sizing:border-box;margin:0;padding:0}
.felt{background:url(${tex}) center/360px,var(--bg);background-blend-mode:soft-light;color:var(--txt);font-family:var(--sans);position:relative;overflow:hidden;container-type:inline-size;word-break:keep-all;overflow-wrap:anywhere}
.bfc{width:400px;height:500px;flex:none;padding:26px 24px 18px;display:flex;flex-direction:column}
svg.i{width:1em;height:1em;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;vertical-align:-.14em;flex:none}
img.c{width:1em;height:1em;border-radius:50%;flex:none;display:inline-block;vertical-align:-.18em;padding:.06em;box-shadow:inset 0 0 0 1px rgba(238,234,226,.1),0 .04em .14em rgba(0,0,0,.45)}
.coin{position:relative;display:inline-flex;flex:none}
.coin .x{position:absolute;right:-.3em;bottom:-.15em;font-family:var(--sans);font-size:.36em;font-weight:700;color:var(--txt);background:#2a2a2e;border:1px solid var(--hairg);border-radius:1em;padding:0 .35em;line-height:1.35}
.g{color:var(--good)} .e{color:var(--evil)} .n{color:var(--neu)} .au{color:var(--gold-lit)}
.coins{display:inline-flex;flex-wrap:wrap;gap:.3em}
svg.wire{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}
svg.wire line{stroke:var(--hairg);stroke-width:1;vector-effect:non-scaling-stroke}
svg.wire line.enemy{stroke:rgba(224,122,100,.75)}
svg.wire line.unk{stroke:rgba(238,234,226,.35);stroke-dasharray:4 5}
.wtag{position:absolute;transform:translate(-50%,-50%);white-space:nowrap;background:rgba(26,26,29,.94);padding:0 .5em;display:flex;gap:.3em;align-items:center}
/* 가 · 큰 화면 룰 설명 — 영화 크레딧처럼 가운데, 세리프, 가는 놋쇠 선 */
.A{position:absolute;inset:0}
.A .kick{position:absolute;left:0;right:0;top:3.2cqw;display:flex;justify-content:center;align-items:center;gap:1.4cqw;font-size:1.15cqw;letter-spacing:.35em;color:var(--gold)}
.A .kick::before,.A .kick::after{content:'';width:7cqw;border-top:1px solid var(--hairg)}
.A .hd{position:absolute;left:0;right:0;top:5.6cqw;text-align:center}
.A .hd b{display:block;font-family:var(--serif);font-weight:700;font-size:3.6cqw;letter-spacing:-.01em}
.A .hd>span{display:block;font-size:1.55cqw;margin-top:.5cqw;color:var(--txt2)}
.A .body{position:absolute;left:4.5cqw;right:3.5cqw;top:14.6cqw;bottom:2.4cqw;display:grid;grid-template-columns:27cqw 1px 1fr;gap:3cqw}
.A .vr{background:var(--hairg)}
.A .fl h3{font-family:var(--serif);font-weight:700;font-size:2cqw;color:var(--gold-lit);margin:0 0 .6cqw;display:flex;align-items:center;gap:.6cqw}
.A .fl h3 svg.i{font-size:1.6cqw}
.A .fl .bs+.bs{margin-top:1.6cqw;padding-top:1.4cqw;border-top:1px solid var(--hair)}
.A .fl .it{font-size:1.65cqw;line-height:1.35;margin:.35cqw 0;display:flex;align-items:center;gap:.6cqw;color:var(--txt)}
.A .fl .it .pic{font-size:3cqw;display:inline-flex;gap:.2cqw;align-items:center;flex:none}
.A .fl .it .pic svg.i{font-size:1.5cqw;color:var(--txt2)}
.A .rel{position:relative}
.A .grp{position:absolute;transform:translateX(-50%);text-align:center;white-space:nowrap}
.A .grp .gl{font-family:var(--serif);font-weight:700;font-size:1.85cqw}
.A .grp .gs{font-size:1.3cqw;color:var(--txt2);margin-top:.15cqw}
.A .grp .coins{flex-wrap:nowrap;font-size:4.6cqw;margin:.7cqw 0 .5cqw;justify-content:center}
.A.xl .fl{zoom:.84}.A.xl .grp{transform:translateX(-50%) scale(.84);transform-origin:50% 0}   /* 다른 말 — 한국어보다 길어 넘친다(2026-10-24, 아이폰과 같은 0.84) */
.A .grp .gw{font-size:1.05cqw;letter-spacing:.2em;color:var(--gold);display:flex;flex-direction:column;align-items:center;gap:.15cqw;margin-top:.2cqw}
.A .grp .gw b{font-family:var(--serif);font-weight:700;font-size:1.8cqw;letter-spacing:0;color:var(--txt);white-space:normal;max-width:25cqw;line-height:1.25;text-align:center;word-break:keep-all}
.A .grp .gw svg.i{color:var(--gold)}
.A .wtag{font-size:1.35cqw}
.A.dense .fl .it{font-size:1.4cqw;margin:.2cqw 0} .A.dense .fl .it .pic{font-size:2.4cqw} .A.dense .fl h3{font-size:1.7cqw;margin-bottom:.3cqw} .A.dense .fl .bs+.bs{margin-top:1cqw;padding-top:.9cqw} .A.dense .grp .coins{font-size:3.5cqw;margin:.35cqw 0 .25cqw} .A.dense .grp .gs{font-size:1.2cqw} .A.dense .grp .gl{font-size:1.6cqw} .A.dense .grp .gw b{font-size:1.5cqw} .A.dense .grp .gw{font-size:.95cqw}
/* 큰 화면 넘기기 옆 «이번 판» — 같은 천을 오른쪽에 세로로 깐다(상자 없이, 화면 끝까지) */
.Pn{position:absolute;inset:0;padding:5cqw 6cqw;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center}
.Pn .pin{width:100%}
.Pn .kick{display:flex;justify-content:center;align-items:center;gap:3cqw;font-size:3.4cqw;letter-spacing:.35em;color:var(--gold)}
.Pn .kick::before,.Pn .kick::after{content:'';width:12cqw;border-top:1px solid var(--hairg)}
.Pn .hd b{display:block;font-family:var(--serif);font-weight:700;font-size:9.5cqw;margin-top:2cqw}
.Pn .hd>span{display:block;font-size:4.2cqw;margin-top:1.4cqw;color:var(--txt2)}
.Pn .pl{margin-top:5cqw}
.Pn .pgr{padding:4cqw 0 4.2cqw}
.Pn .pgr+.pgr{border-top:1px solid var(--hair)}
.Pn .gl{font-family:var(--serif);font-weight:700;font-size:6.4cqw}
.Pn .gl .gs{font-family:var(--sans);font-weight:400;font-size:4.2cqw;color:var(--txt2)}
.Pn .coins{font-size:15cqw;flex-wrap:nowrap;justify-content:center;margin:2cqw 0 1.6cqw}
.Pn .gw{font-family:var(--serif);font-weight:700;font-size:6.2cqw;line-height:1.3;word-break:keep-all}
.Pn .gw svg.i{color:var(--gold);font-size:.8em;margin-right:.3em}
/* 넘기기 옆 패널은 아이폰 큰 화면(원본)처럼 밝은 바탕 위에 — 천 없이(2026-10-24 햇살님 «앱 화면은 그대로») */
.Pn.light{background:none;--txt:#1c1c1e;--txt2:#6e6e73;--dim:#8e8e93;--gold:#9a7a3e;--hair:rgba(0,0,0,.1);--hairg:rgba(154,122,62,.45);--good:#2f6db5;--evil:#c2412f;--neu:#7d5fb0;color:var(--txt);text-align:left;align-items:stretch}
.Pn.light .kick{justify-content:flex-start}.Pn.light .kick::before{display:none}
.Pn.light .pgr{display:grid;grid-template-columns:auto 1fr;gap:1cqw 5cqw;align-items:center}
.Pn.light .pgr .gl{grid-column:1/-1}.Pn.light .coins{justify-content:flex-start;margin:0;font-size:9.6cqw;gap:1.2cqw}
.Pn.light .gw{font-size:5.4cqw;min-width:34cqw;word-break:keep-all}.Pn.light .gw svg.i{display:block;margin:0 0 .6cqw}   /* 아이폰처럼 «승리» 표시 위 · 결론 아래, 결론 칸 폭 확보 */
/* 공유 장 4:5 */
.K .kick{font-size:11px;letter-spacing:.3em;color:var(--gold);text-align:center}
.K .tt{font-family:var(--serif);font-weight:700;font-size:27px;text-align:center;margin:6px 0 4px}
.K .rule{width:44px;border-top:1px solid var(--hairg);margin:10px auto 16px}
.K .sub{text-align:center;font-size:14px;color:var(--txt2);margin-top:4px}
.K .grp{text-align:center;margin-bottom:14px}
.K .grp .gl{font-family:var(--serif);font-weight:700;font-size:17px}
.K .grp .gs{font-size:13px;color:var(--txt2);margin-top:2px}
.K .grp .coins{font-size:50px;gap:8px;flex-wrap:nowrap;margin:7px 0 5px;justify-content:center}
.K .grp .gw{font-size:13px;color:var(--txt2);line-height:1.4;word-break:keep-all} .K .grp .gw svg.i{color:var(--gold)}
.K .lk{font-size:12px;display:flex;flex-direction:column;align-items:center;margin:2px 0 8px}
.K .lk::before,.K .lk::after{content:'';height:7px;border-left:1px solid rgba(224,122,100,.75)}
.K .lk.unk::before,.K .lk.unk::after{border-left:1px dashed rgba(238,234,226,.4)}
.K .two{display:grid;grid-template-columns:1fr 64px 1fr;align-items:start}
.K .two .mid{font-size:12px;padding-top:40px;display:flex;flex-direction:column;align-items:center;gap:3px;text-align:center;line-height:1.3}
.K .two .mid::before{content:'';width:34px;border-top:1px solid rgba(224,122,100,.75)}
.K .two .grp .coins{font-size:46px}
.K .bs{padding:8px 0 9px} .K .bs+.bs{border-top:1px solid var(--hair)}
.K .bs h3{font-family:var(--serif);font-weight:700;font-size:17px;color:var(--gold-lit);display:flex;gap:7px;align-items:center;margin-bottom:6px}
.K .bs .it{display:flex;gap:9px;align-items:center;font-size:13.5px;margin:4px 0}
.K .bs .it .pic{font-size:25px;display:inline-flex;gap:3px;align-items:center} .K .bs .it .pic svg.i{font-size:19px;color:var(--txt2)}
.K .role{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;padding:10px 0} .K .role+.role{border-top:1px solid var(--hair)}
.K .role .ci{font-size:46px;grid-row:span 2} .K .role b{font-family:var(--serif);font-size:16px} .K .role b span{font-family:var(--sans);font-weight:400;font-size:12px;color:var(--txt2);margin-left:6px}
.K .role .tx{font-size:12.5px;line-height:1.5;color:var(--txt2)}
.K .solo1{display:flex;gap:8px;align-items:center;justify-content:center;font-size:13px;color:var(--txt2);margin-top:4px} .K .solo1 .coins{font-size:38px}
.K .win{padding:11px 0 12px;text-align:center} .K .win+.win{border-top:1px solid var(--hair)}
.K .win .wh{font-size:12px;letter-spacing:.12em;display:flex;justify-content:center;align-items:center;gap:6px}
.K .win .wh .coins{font-size:22px;gap:3px;letter-spacing:0}
.K .win .wb{font-family:var(--serif);font-weight:700;font-size:23px;line-height:1.3;margin:5px 0 3px;word-break:keep-all}
.K .win .wd{font-size:11.5px;color:var(--txt2);line-height:1.45;word-break:keep-all}
.K.dense .win{padding:7px 0 8px} .K.dense .win .wb{font-size:18px;margin:3px 0 2px} .K.dense .win .wd{font-size:10.5px} .K.dense .win .wh .coins{font-size:18px}
.pg{position:absolute;right:18px;bottom:14px;font-size:10.5px;color:var(--dim)}
.stack{display:flex;flex-direction:column;align-items:center;gap:12px;transform-origin:top left}
.stack.seam{gap:0}.stack.seam .bfc+.bfc{border-top:1px solid rgba(184,154,98,.32)}   /* 참가 웹 — 장 사이 틈 없이 한 장의 천으로 이어 보기(2026-10-24 햇살님 «참가자가 볼 때는 큰 화면과 같은 무드») */
`;

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const ic = k => ICON_PATHS[k] ? `<svg class="i" viewBox="0 0 24 24"><path d="${ICON_PATHS[k]}"/></svg>` : '';
/* 코인 바닥 색 — 앱 COIN_BAND 를 먹색 천에 맞게 누른 값(구현약속 «코인») */
export const BAND = { om_citizen: '#3a5f6f', om_detective: '#3a6f43', om_doctor: '#3a6f43', om_immortal: '#3a6f43', om_judge: '#3a6f43', om_sheriff: '#3a6f43', om_mafia: '#514f57', om_godfather: '#514f57', om_yakuza: '#6d3f3c', om_ninja: '#6d3f3c', om_lawyer: '#6e6a65', om_badjudge: '#6e6a65', om_lunatic: '#675b79', om_werewolf: '#675b79' };
export const tone = g => ({ '선': 'g', '악': 'e' })[g.side] || 'n';
const coin = (id, cnt, name) => `<span class="coin" title="${esc(name || '')}"><img class="c" alt="" style="background:${BAND[id] || '#555'}" src="${art(id)}">${cnt > 1 ? `<span class="x">×${cnt}</span>` : ''}</span>`;
const coins = (g, cnt = true) => `<span class="coins">${g.roles.map(r => coin(r.id, cnt ? r.count : 1, r.name)).join('')}</span>`;
const nameOf = g => esc(g.name) + (g.key === 'solo' ? '' : ` (${esc(g.side)})`);
const sideLine = b => `<span class="g">시민 편 (선) ${b.sides.good}</span> · <span class="e">범죄 조직 (악) ${b.sides.evil}</span>` + (b.sides.other ? ` · <span class="n">중립 ${b.sides.other}</span>` : '');
const G = b => Object.fromEntries(b.groups.map(g => [g.key, g]));
const flow = b => b.flow.map(f => `<div class="bs"><h3>${ic(f.icon)}${esc(f.title)}</h3>${f.items.map(it =>
  `<div class="it"><span class="pic">${it.roles && it.roles.length ? (f.key === 'first' ? `<span class="coins">${it.roles.map(i => coin(i, 1)).join('')}</span>` : it.roles.map(i => coin(i, 1)).join('')) : ic(it.icon)}</span><span>${esc(it.text)}</span></div>`).join('')}</div>`).join('');
const roleCount = b => b.groups.reduce((a, g) => a + g.roles.length, 0);

/* 다른 말 — 섀도 루트 안은 화면 번역기(i18n_dom)가 못 닿는다. 그린 직후 글자 마디만 사전으로 바꾼다(코어 값·열쇠는 그대로).
   진행 웹은 i18n_dom, 참가 웹은 me.js 가 setBriefTr 로 넣는다. 한국어면 null (2026-10-24) */
let TR = null;
export function setBriefTr(f) { TR = f || null; }
const T = s => (TR && s ? TR(s) : s);
function trRoot(r) {
  if (!TR) return;
  const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) { const v = n.nodeValue, t = v.trim().replace(/^·\s*|\s*·$/g, ''); if (/[가-힣]/.test(t)) { const x = TR(t); if (x !== t) n.nodeValue = v.replace(t, x); } }   // 그림 사이에 낀 « · » 는 떼고 찾는다
}

/* 섀도 루트 — 앱 CSS(.card·.row·.st…)와 안 섞이게 */
function shadow(host, tex) {
  fonts();
  const r = host.shadowRoot || host.attachShadow({ mode: 'open' });
  return { r, set: h => { r.innerHTML = `<style>${css(tex || SRC.tex)}</style>` + h; trRoot(r); } };
}

/* 관계 선 — 무리의 실제 자리를 재서 가는 선을 긋는다(시안 wire 그대로). 위아래 무리는 아래 가장자리 → 위 가장자리, 옆 무리는 코인 줄 옆끼리 */
function wire(root, links) {
  const R = root.getBoundingClientRect(); let svg = '', tags = '';
  const box = (g, sel) => { const e = root.querySelector(`[data-g="${g}"]${sel}`); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left - R.left, r: r.right - R.left, t: r.top - R.top, b: r.bottom - R.top, cx: (r.left + r.right) / 2 - R.left, cy: (r.top + r.bottom) / 2 - R.top }; };
  for (const [a, b, type, tag] of links) {
    const ga = box(a, ''), gb = box(b, ''); if (!ga || !gb) continue;
    const cls = type === 'enemy' ? 'enemy' : 'unk'; let x1, y1, x2, y2;
    if (gb.t > ga.b || ga.t > gb.b) { const [u, d] = gb.t > ga.b ? [ga, gb] : [gb, ga]; x1 = u.cx; y1 = u.b + 6; x2 = d.cx; y2 = d.t - 6; }
    else { const ca = box(a, ' .coins'), cb = box(b, ' .coins'); const [L, Rr] = ca.cx < cb.cx ? [ca, cb] : [cb, ca]; x1 = L.r + 12; y1 = L.cy; x2 = Rr.l - 12; y2 = Rr.cy; }
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${cls}"/>`;
    if (tag && type === 'enemy') tags += `<div class="wtag e" style="left:${(x1 + x2) / 2}px;top:${(y1 + y2) / 2}px">${ic('swords')}${esc(T(tag))}</div>`;   /* 시안대로 — 점선(같은 편·서로 모름)엔 꼬리표 없이 */
  }
  root.insertAdjacentHTML('beforeend', `<svg class="wire">${svg}</svg>${tags}`);
}

/** 큰 화면 룰 설명(시안 A) — host 는 TV 전체를 덮는 칸 */
export function drawA(host, b) {
  const { r, set } = shadow(host), g = G(b), tri = !!g.triad, solo = !!g.solo, cr3 = !!g.crook && tri;
  const P = { good: [solo ? 38 : 50, 0], solo: [88, 0], mafia: [22, cr3 ? 37 : 46], triad: [78, cr3 ? 37 : 46], crook: [50, 72] };
  if (!tri) { P.mafia = [27, 50]; P.crook = [73, 50]; }
  const grp = x => `<div class="grp" data-g="${x.key}" style="left:${P[x.key][0]}%;top:${P[x.key][1]}%"><div class="gl ${tone(x)}">${nameOf(x)}</div><div class="gs">${ic(x.knows.icon)} ${esc(x.knows.text)}${x.note ? '<br>' + esc(x.note) : ''}</div><div class="coins">${coins(x)}</div><div class="gw"><span>${ic('trophy')} 승리</span><b>${esc(x.win.short)}</b></div></div>`;
  set(`<div class="felt A${roleCount(b) > 10 ? ' dense' : ''}${TR ? ' xl' : ''}"><div class="kick">${esc(b.hub)} · 룰 설명</div><div class="hd"><b>${esc(b.title)} · ${b.n}명</b><span>${sideLine(b)}</span></div>
    <div class="body"><div class="fl">${flow(b)}</div><div class="vr"></div><div class="rel">${b.groups.filter(x => P[x.key]).map(grp).join('')}</div></div></div>`);
  wire(r.querySelector('.rel'), b.links || []);
}

/** 큰 화면 넘기기 옆 «이번 판» — 편별 수 · 무리별 코인 · 승리 결론. 넘치면 통째로 줄인다(위아래 가운데) */
export function drawPanel(host, b) {
  const { r, set } = shadow(host);
  set(`<div class="felt Pn light"><div class="pin"><div class="kick">이번 판</div><div class="hd"><b>${esc(b.title)} · ${b.n}명</b><span>${sideLine(b)}</span></div>
    <div class="pl">${b.groups.map(x => `<div class="pgr"><div class="gl ${tone(x)}">${nameOf(x)} <span class="gs">· ${esc(x.knows.text)}</span></div><div class="coins">${coins(x)}</div><div class="gw">${ic('trophy')}${esc(x.win.short)}</div></div>`).join('')}</div></div></div>`);
  const f = r.querySelector('.felt'), pin = r.querySelector('.pin'), cs = getComputedStyle(f), room = f.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom), need = pin.offsetHeight;
  if (need > room) pin.style.zoom = Math.max(0.45, room / need).toFixed(3);
}

/** 공유 장 K 다섯 종 — 구성 → 흐름 → 누가 누구를 아나 → 승리 조건 → 직업 능력(한 장에 셋까지) */
export function cardsHTML(b) {
  const g = G(b), head = `${esc(b.hub)} · ${esc(b.title)} ${b.n}명`, link = (a, c) => (b.links || []).find(l => (l[0] === a && l[1] === c) || (l[0] === c && l[1] === a));
  const grpK = x => `<div class="grp"><div class="gl ${tone(x)}">${nameOf(x)}</div><div class="gs">${ic(x.knows.icon)} ${esc(x.knows.text)}</div><div class="coins">${coins(x)}</div><div class="gw">${ic('trophy')} ${esc(x.win.short)}</div></div>`;
  const grpC = x => `<div class="grp"><div class="gl ${tone(x)}">${nameOf(x)}</div><div class="coins">${coins(x)}</div></div>`;
  let rel = (g.good ? grpK(g.good) : '') + `<div class="lk"><span class="e">${ic('swords')} ${esc((link('good', 'mafia') || [])[3] || '적')}</span></div>`;
  const mt = link('mafia', 'triad');
  rel += g.triad ? `<div class="two">${grpK(g.mafia)}<div class="mid e">${ic('swords')}${esc((mt && mt[3]) || '서로 모르는 적').replace(' ', '<br>')}</div>${grpK(g.triad)}</div>` : g.mafia ? grpK(g.mafia) : '';
  if (g.crook) rel += `<div class="lk unk"><span>${esc((link('crook', 'mafia') || [])[3] || '같은 편 · 서로 모름')}</span></div>` + grpK(g.crook);
  if (g.solo) rel += `<div class="solo1">${coins(g.solo, false)}<span class="n" style="font-family:var(--serif);font-weight:700">${esc(g.solo.name)}</span> ${esc(g.solo.knows.text)} · ${ic('trophy')} ${esc(g.solo.win.short.replace(/^각자\s*/, ''))}</div>`;
  const wins = b.groups.map(x => `<div class="win"><div class="wh ${tone(x)}">${coins(x, false)}${esc(x.name)}</div><div class="wb">${esc(x.win.short)}</div><div class="wd">${esc(x.win.long)}</div></div>`).join('');
  const pages = [
    ['구성', `<div class="sub" style="margin:-8px 0 18px">${sideLine(b)}</div>` + b.groups.map(grpC).join('')],
    ['흐름', flow(b)],
    ['누가 누구를 아나', rel],
    ['승리 조건', wins, b.groups.length > 3]];
  const roles = b.groups.flatMap(x => x.roles), per = Math.ceil(roles.length / Math.ceil(roles.length / 3));   // 한 장에 셋까지(글이 긴 직업이 있어서) — 고르게 나눈다
  for (let i = 0; i < roles.length; i += per) pages.push(['직업 능력', roles.slice(i, i + per).map(x => `<div class="role"><span class="ci">${coin(x.id, 1, x.name)}</span><b>${esc(x.name)}<span>${x.count}명</span></b><div class="tx">${esc(x.ability)}</div></div>`).join('')]);
  return pages.map(([t, body, dense], i) => `<div class="felt bfc K${dense ? ' dense' : ''}"><div class="kick">${head}</div><div class="tt">${t}</div><div class="rule"></div><div class="kb">${body}</div><div class="pg">${i + 1} / ${pages.length}</div></div>`).join('');
}
/* 장 안에 다 안 들어가면 그 장 본문만 줄인다(글 크기 비율 유지) — 바깥 zoom 을 걸기 전에 잰다 */
function fit(root) {
  for (const c of root.querySelectorAll('.bfc')) { const kb = c.querySelector('.kb'); kb.style.zoom = 1;
    const room = c.getBoundingClientRect().bottom - 26 - kb.getBoundingClientRect().top, need = kb.scrollHeight;
    if (need > room) kb.style.zoom = Math.max(0.6, room / need).toFixed(3); }
}
const ready = async root => { try { await document.fonts.ready; } catch (e) {}
  await Promise.all([...root.querySelectorAll('img')].map(i => i.complete ? 0 : new Promise(res => { i.onload = i.onerror = res; }))); };

/** 참가 웹 — 장을 세로로 쌓고 폭에 맞춘다 */
export async function mountCards(host, b, opt) {
  const { r, set } = shadow(host);
  set(`<div class="stack${opt && opt.seam ? ' seam' : ''}">${cardsHTML(b)}</div>`);
  const st = r.querySelector('.stack'), lay = () => { st.style.zoom = 1; fit(r); st.style.zoom = Math.min(1.5, host.clientWidth / 400).toFixed(3); };
  lay(); await ready(r); lay();
  if (!host.__bfr) { host.__bfr = 1; addEventListener('resize', () => host.isConnected && lay()); }
}

/* ── 그림 저장 — 장을 SVG foreignObject 로 1080×1350 PNG. 그림·천·글꼴은 data URL 로 심는다(SVG 그림은 바깥 파일을 못 읽는다) ── */
const dataURL = async u => { const bl = await (await fetch(u)).blob(); return new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(bl); }); };
export async function pngs(b) {
  const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-20000px;top:0;width:400px'; document.body.appendChild(host);
  try {
    const { r, set } = shadow(host); set(cardsHTML(b)); await ready(r); fit(r);
    const srcs = [...new Set([...r.querySelectorAll('img')].map(i => i.getAttribute('src')))], D = {};
    const [tex, serif, sans, sansB] = await Promise.all([SRC.tex, SRC.serif, SRC.sans, SRC.sansB].map(dataURL));
    await Promise.all(srcs.map(async s => { D[s] = await dataURL(s); }));
    const style = face({ serif, sans, sansB }) + css(tex).replace(/:host\{[^}]*\}/, '');
    const out = [];
    for (const c of r.querySelectorAll('.bfc')) {
      const k = c.cloneNode(true); k.querySelectorAll('img').forEach(i => i.setAttribute('src', D[i.getAttribute('src')]));
      const w = document.createElement('div'), s = document.createElement('style'); s.textContent = style; w.append(s, k);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 400 500"><foreignObject x="0" y="0" width="400" height="500">${new XMLSerializer().serializeToString(w)}</foreignObject></svg>`;
      const im = new Image(); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); await im.decode();
      const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1350; cv.getContext('2d').drawImage(im, 0, 0, 1080, 1350);
      out.push(await new Promise(res => cv.toBlob(res, 'image/png')));
    }
    return out;
  } finally { host.remove(); }
}
/** 공유가 되면 공유 시트(카톡·에어드롭), 아니면 내려받기 — 노트북 진행자가 주로 쓴다 */
export async function share(b) {
  const files = (await pngs(b)).map((bl, i) => new File([bl], `이번판안내_${i + 1}.png`, { type: 'image/png' }));
  if (navigator.canShare && navigator.canShare({ files })) { try { await navigator.share({ files, title: '이번 판 안내' }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  for (const f of files) { const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); await new Promise(res => setTimeout(res, 250)); }
}
