/* 참가자 웹 tunel.kr/1ndcapp/me/ — 참가만 하는 가벼운 사람용(2026-10-06 단계 8). 앱 참가 공간(ios/1NDCAPP/Screens/Play)을 떼어 온 판.
   서버는 공통 참가자 모듈(core/participant.js)로만 부른다. 진행 코어(1.5MB)는 올리지 않는다 — 자료는 library/(빌드 때 뽑은 JSON).
   결은 시안 v2(iOS 기본 부품) — 웹 진행 화면과 같은 app.css·ui.js 부품. 광고 칸은 자리만(애드센스 연결 뒤 채움). */
import { html, render, useState, useEffect, useContext, createContext } from '../lib/preact-htm.js';
import { Icon } from '../js/icons.js';
import { NavStack, useNav, Back } from '../js/nav.js';
import { Page, LargeTitle, Section, Row, RowLabel, Labeled, Primary, Segmented, Toggle, Search, RoleArt, ActionSheet, Alert, Empty, NavButton, Sheet } from '../js/ui.js';

const URL_ = 'https://yguvfogtzazoawtclqvf.supabase.co', KEY = 'sb_publishable_KeezD9hmEnxSTEWA_w8x-A_Tgk3roUf';
const sb = window.supabase.createClient(URL_, KEY);
const P = window.Participant.create({ net: async (fn, args) => { const { data, error } = await sb.schema('dangsan').rpc(fn, args || {}); if (error) throw error; return data; } });
let ko = {}, dict = {}, DATA = null;   /* DATA — 게임 자료 영어(한국어 원문 → 영어, i18n/data/en.json). 없으면 한국어 그대로 */
const T = (k, v) => window.Participant.text(dict, k, v, ko);
const D = t => (DATA && t && DATA[t]) || t;
const tr = t => !!(DATA && t && DATA[t]);
const rows = r => (r && (r.rows || r.value)) || [];
const msgOf = r => r && !r.ok ? (r.code === 'legacy' ? r.legacy : T('err.' + r.code)) : null;
const photoURL = p => URL_ + '/storage/v1/object/public/' + p;
const LANGS = [['ko', '한국어'], ['en', 'English'], ['ja', '日本語'], ['es', 'Español'], ['zh-Hans', '简体中文'], ['zh-Hant', '繁體中文'], ['th', 'ไทย'], ['vi', 'Tiếng Việt'], ['id', 'Bahasa Indonesia'], ['pt-BR', 'Português (Brasil)']];
const DEMO = /[?&]demo=1/.test(location.search);   /* 시안 확인용 — 로그인 없이 화면만 */

const auth = { user: null, subs: new Set(),
  async init() { const { data } = await sb.auth.getSession(); this.user = data?.session?.user || null;
    sb.auth.onAuthStateChange((_e, s) => { const u = s?.user || null; if ((u && u.id) !== (this.user && this.user.id)) { this.user = u; this.subs.forEach(f => f()); } }); },
  login(provider = 'kakao') { const back = location.origin + location.pathname + location.search; sb.auth.signInWithOAuth({ provider, options: { redirectTo: back } }); },
  async logout() { await sb.auth.signOut(); this.user = null; this.subs.forEach(f => f()); },
};
function useAuth() { const [, f] = useState(0); useEffect(() => { const g = () => f(x => x + 1); auth.subs.add(g); return () => auth.subs.delete(g); }, []); return DEMO || !!auth.user; }
const PROVIDERS = ['kakao'];   /* 구글·애플은 키 연결 뒤 ['apple','google','kakao'] — 앱 Account.providers 와 같이 */
const LoginRows = () => html`<${Section}>${PROVIDERS.map(p => html`<${Row} onClick=${() => auth.login(p)} tint>${T('login.' + p)}<//>`)}<//>`;

function Avatar({ r = {}, size = 40 }) {
  const st = `width:${size}px;height:${size}px`;
  if (r.photo) return html`<img class="avatar" src=${photoURL(r.photo)} style=${st} alt="" />`;
  if ((r.avatar || '').startsWith('icon:')) return html`<span class="avatar" style=${st}><${RoleArt} r=${{ icon: r.avatar.slice(5) }} size=${Math.round(size * 0.7)} /></span>`;
  return html`<span class="avatar sec" style=${st}><${Icon} name="personCircle" size=${size} /></span>`;
}
const PersonRow = ({ r, onClick }) => html`<${Row} onClick=${onClick} chevron><${Avatar} r=${r} size=${36} /><${RowLabel} title=${r.nick} text=${r.handle && '@' + r.handle} /><//>`;
const Ad = () => null;   // 광고 당분간 없음(정함 6, 2026-10-06) — 붙일 때 옛 칸: html`<div class="ad" aria-label=${T('ad.label')}>${T('ad.label')}</div>`
function Stats({ s }) {
  const w = s.wins || 0, l = s.losses || 0;
  return html`<div class="stats"><div><span>${T('profile.games')}</span><b>${s.games || 0}</b></div>
    <div><span>${T('profile.rate')}</span><b>${w + l ? (w * 100 / (w + l)).toFixed(1) + '%' : '—'}</b></div>
    <div><span>${T('profile.grade')}</span><b>${s.grade ? T('tier', { n: s.grade }) : '—'}</b></div></div>`;
}
function Loading({ v, children }) { return v === undefined ? html`<div class="boot">…</div>` : children; }

/* ── 광장 ── */
function PlazaTab() {
  const on = useAuth(), nav = useNav();
  const [joined, setJoined] = useState([]), [people, setPeople] = useState([]), [code, setCode] = useState(''), [msg, setMsg] = useState(null), [status, setStatus] = useState({});
  const load = async () => { if (!on || DEMO) return; const j = rows(await P.joined()); setJoined(j); setPeople(j[0] ? rows(await P.plazaPeople(j[0].plaza)) : []);
    const st = {}; for (const x of j) { const r = await P.plazaStatus(x.plaza); if (r && r.ok && r.state) st[x.plaza] = r.state; } setStatus(st); };   // 광장 공개 현황 — «이번 판 자료»(장부 4, 2026-10-10)
  const checkin = async c => { const r = await P.checkin(c); setMsg(msgOf(r) || T('plaza.entered', { host: r.host || '', place: T('place.plaza') })); await load(); };
  useEffect(() => { load(); }, [on]);
  useEffect(() => { const c = window.Participant.codeFrom(location.href); if (c && on && !DEMO) { history.replaceState(null, '', location.pathname); checkin(c); } }, [on]);
  return html`<${Page} ...${useShell()}>
    <${LargeTitle}>${T('tab.plaza')}<//>
    ${!on ? html`<${LoginRows} />` : html`
      ${!joined.length && html`<${Section}><${Row}><span class="sec">${T('empty.plaza')}</span><//><//>`}
      ${joined.map(j => html`<${Section} header=${T('plaza.joined')}>
        <${Row}><${Icon} name="house" size=${22} /><${RowLabel} title=${T('plaza.host_place', { host: j.host, place: T('place.plaza') })} text=${T('plaza.until', { t: (j.ends_at || '').slice(0, 16).replace('T', ' ') })} /><//>
        ${people.length > 0 && html`<${Row} chevron onClick=${() => nav.push(html`<${PeopleList} title=${T('plaza.people')} load=${async () => rows(await P.plazaPeople(j.plaza))} />`)}>
          <span style="display:flex;gap:4px">${people.slice(0, 5).map(r => html`<${Avatar} r=${r} size=${28} />`)}</span><span class="sec">${T('plaza.count', { n: people.length })}</span><//>`}
        ${status[j.plaza] && status[j.plaza].modeId && html`<${Row} chevron onClick=${() => nav.push(html`<${ModeView} id=${status[j.plaza].modeId} />`)}><${RowLabel} title=${T('plaza.game_info')} /><span class="sec">${status[j.plaza].mode || ''}</span><//>`}
        <${Row} danger onClick=${async () => { await P.leave(j.plaza); load(); }}>${T('plaza.leave')}<//><//>`)}
      <${Section} header=${T('plaza.code')}>
        <div class="row"><input class="textin grow" id="me-code" value=${code} placeholder=${T('plaza.code_ph')} autocapitalize="characters" onInput=${e => setCode(e.currentTarget.value.trim())} />
        <button class="blink" disabled=${!window.Participant.codeFrom(code)} onClick=${() => checkin(window.Participant.codeFrom(code))}>${T('plaza.join')}</button></div><//>`}
    <${Alert} open=${!!msg} title=${msg} onClose=${() => setMsg(null)} />
  <//>`;
}

/* ── 자료실 ── */
let LIB = null;
async function lib() { if (!LIB) { const v = await (await fetch('library/index.json')).json(); LIB = v; } return LIB; }
function LibraryTab() {
  const nav = useNav();
  const [L, setL] = useState(), [hub, setHub] = useState('당산나무'), [q, setQ] = useState('');
  useEffect(() => { lib().then(setL); }, []);
  const H = L && L.hubs.find(h => h.name === hub), modes = H ? H.modes.filter(m => !q || (m.name + D(m.name)).toLowerCase().includes(q.toLowerCase()) || (m.roleNames || []).some(n => (n + D(n)).toLowerCase().includes(q.toLowerCase()))) : [];
  const hubKo = { '당산나무': 'family.dangsan', '클래식': 'family.classic', '오리지널 마피아': 'family.mafia' };
  return html`<${Page} ...${useShell()}>
    <${LargeTitle}>${T('tab.library')}<//>
    <${Loading} v=${L}>${L && html`
      <div style="padding:0 16px 12px"><${Segmented} options=${L.hubs.map(h => [h.name, T(hubKo[h.name] || h.name)])} value=${hub} onChange=${v => { setHub(v); setQ(''); }} /></div>
      <div style="padding:0 16px 12px"><${Search} value=${q} onInput=${setQ} placeholder=${T('lib.search')} /></div>
      <${Section}>${modes.map(m => html`<${Row} chevron onClick=${() => nav.push(html`<${ModeView} id=${m.id} />`)}><${RowLabel} title=${m.parent && !q ? '  ' + D(m.name) : D(m.name)} text=${[m.players && T('lib.players', { r: m.players.replace('명', '') }), T('lib.roles_n', { n: m.roles })].filter(Boolean).join(' · ')} /><//>`)}<//>
      <${Ad} />`}<//>
  <//>`;
}
function ModeView({ id }) {
  const nav = useNav(), on = useAuth();
  const [m, setM] = useState(), [q, setQ] = useState(''), [ad, setAd] = useState(false), [msg, setMsg] = useState(null);
  useEffect(() => { fetch(`library/modes/${id}.json`).then(r => r.json()).then(setM); }, [id]);
  const roles = m ? m.roles.filter(r => !q || (r.ko + D(r.ko) + (r.ab || '') + D(r.ab || '')).toLowerCase().includes(q.toLowerCase())) : [];
  const save = async () => { if (!on) { setMsg(T('err.not_logged_in')); return; } setAd(true); };
  const download = async () => { setAd(false); for (const [i, blob] of (await sheets(m)).entries()) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${T('lib.sheet_file', { name: D(m.name) })}${i ? '_' + (i + 1) : ''}.png`; a.click(); } };
  return html`<${Page} title=${m ? D(m.name) : ''} left=${html`<${Back} />`}>
    <${Loading} v=${m}>${m && html`
      <div style="display:flex;gap:10px;padding:12px 16px"><button class="bsec grow" onClick=${() => nav.push(html`<${Rulebook} m=${m} />`)}>${T('lib.rulebook')}</button><button class="bsec grow" onClick=${save}>${T('lib.download')}</button></div>
      ${DATA && html`<div class="sec" style="padding:0 16px 8px;font-size:12px">${tr(m.name) ? T('data.mt') : T('data.ko')}</div>`}
      <${Ad} />
      <div style="padding:0 16px 12px"><${Search} value=${q} onInput=${setQ} placeholder=${T('lib.search_roles')} /></div>
      <${Section}>${roles.map(r => html`<${Row}><${RoleArt} r=${r} size=${40} /><div class="rl"><div><b>${D(r.ko)}</b> <span class="sec">${D(r.teamKo)}</span></div><div class="sub">${D(r.ab)}</div></div><//>`)}<//>`}<//>
    ${ad && html`<div class="ad full" role="dialog" aria-label=${T('ad.label')}>${T('ad.label')}<button class="bsec" onClick=${download}>${T('ad.close_download')}</button></div>`}
    <${Alert} open=${!!msg} title=${msg} onClose=${() => setMsg(null)} />
  <//>`;
}
const Rulebook = ({ m }) => html`<${Page} title=${T('lib.rulebook')} left=${html`<${Back} />`}>
  ${(m.rules || []).map(b => html`<${Section} header=${D(b.ph)}>${b.steps.map(s => html`<${Row}><span>${D(s)}</span><//>`)}<//>`)}
  ${(m.tips || []).length > 0 && html`<${Section} header=${T('lib.tips')}>${m.tips.map(s => html`<${Row}><span>${D(s)}</span><//>`)}<//>`}
<//>`;

/* 직업표 A4 PNG — 앱(RoleSheet)과 같은 꼴: 2480×3508, 편별 두 칸, 40개 넘으면 다음 장 */
async function sheets(m) {
  const W = 2480, H = 3508, K = 2, PER = 40, out = [];
  const img = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  for (let p = 0; p * PER < m.roles.length; p++) {
    const part = m.roles.slice(p * PER, (p + 1) * PER), cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'), F = '-apple-system,"Apple SD Gothic Neo","Pretendard",system-ui,sans-serif';
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.fillStyle = '#1c1c1e';
    g.font = `700 ${34 * K}px ${F}`; g.fillText(D(m.name), 48 * K, 90 * K);
    g.font = `${16 * K}px ${F}`; g.fillStyle = '#8e8e93'; const pg = `${T('lib.roles_n', { n: m.roles.length })}${m.roles.length > PER ? ` · ${p + 1}/${Math.ceil(m.roles.length / PER)}` : ''}`; g.fillText(pg, W - 48 * K - g.measureText(pg).width, 90 * K);
    let y = 130 * K; const colW = (W - 96 * K - 24 * K) / 2;
    const wrap = (t, w) => { const out = []; let line = ''; for (const ch of String(t)) { if (g.measureText(line + ch).width > w && line) { out.push(line); line = ch; } else line += ch; } if (line) out.push(line); return out; };
    const teams = [...new Set(part.map(r => r.teamKo))];   /* 그리는 글은 D() — 영어 기기면 영어 */
    for (const team of teams) {
      g.font = `600 ${15 * K}px ${F}`; g.fillStyle = '#8e8e93'; g.fillText(D(team), 48 * K, y + 16 * K); y += 30 * K;
      const list = part.filter(r => r.teamKo === team);
      for (let i = 0; i < list.length; i += 2) {
        let h = 44 * K;
        for (let c = 0; c < 2 && list[i + c]; c++) {
          const r = list[i + c], x = 48 * K + c * (colW + 24 * K);
          if (r.icon) { const im = await img(`art/${r.icon}.webp`); if (im) g.drawImage(im, x, y, 44 * K, 44 * K); }
          g.fillStyle = '#1c1c1e'; g.font = `600 ${17 * K}px ${F}`; g.fillText(D(r.ko), x + 54 * K, y + 18 * K);
          g.font = `${13 * K}px ${F}`; const L = wrap(D(r.ab || ''), colW - 54 * K); L.forEach((t, k) => g.fillText(t, x + 54 * K, y + (40 + k * 18) * K));
          h = Math.max(h, (30 + L.length * 18) * K);
        }
        y += h + 14 * K;
      }
    }
    g.fillStyle = '#8e8e93'; g.font = `${12 * K}px ${F}`; g.fillText('1ND Club', 48 * K, H - 40 * K);
    out.push(await new Promise(res => cv.toBlob(res, 'image/png')));
  }
  return out;
}

/* ── 피드(0294) — 한 장 = 사람 한 명 × 광장 하나: 판마다 직업·승패, 좋아요. 앱 소셜 공간 SocialSpace.swift 와 같다(2026-10-07) ── */
const day = s => { const d = new Date(s || ''); return isNaN(d) ? (s || '').slice(0, 10) : d.toLocaleDateString(document.documentElement.lang || 'ko', { month: 'long', day: 'numeric', weekday: 'short' }); };
let ART = null; const artMap = async () => ART || (ART = await fetch('library/art.json').then(r => r.json()).catch(() => ({})));   // 직업 그림 이름표(자료_빌드.cjs)
const plazaLine = p => T('plaza.host_place', { host: p.host || '', place: T('place.plaza') }) + (p.title ? ' · ' + p.title : '');
/* 장 그리기 — 공용 엔진(core/postcard.js)이 준 그리기 목록을 비율대로 그리기만 한다(2026-10-07 «어느 시스템에 심어도 같은 결과»).
   좌표는 1000×1250 기준 → 1 = 0.1cqw. 배치·색·크기·효과를 여기서 정하지 않는다 — 바꾸려면 엔진을 고친다(앱 CardView.swift 와 같은 짝) */
const PC = window.Postcard, TN = s => PC.titleName(s);   // TN — 칭호 이름을 보는 사람 언어로
PC.setMetrics(await fetch('core/postcard_metrics.json').then(r => r.json()).catch(() => ({})));   // 글꼴 폭 표 — 엔진이 줄을 나눈다(D)
fetch('library/role_names.json').then(r => r.json()).then(m => PC.setRoles(m)).catch(() => {});   // 직업 코드 → 지금 이름(0308)
const ordOf = n => PC.ord(n);
const FX = PC.FX;
const rgba = c => c ? `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${c[3] == null ? 1 : c[3]})` : 'transparent';
const u = n => (n / 10) + 'cqw';
function Layers({ list }) {
  const g = list.filter(x => x.t !== 'tex'), tex = list.find(x => x.t === 'tex');
  return html`${g.length > 0 && html`<svg class="cl" viewBox="0 0 1000 1250" preserveAspectRatio="none" aria-hidden="true">
    ${g.map((x, k) => x.t === 'grad' ? html`<defs><linearGradient id=${'g' + k} x1="0" y1="0" x2="0" y2="1">${x.stops.map(s => html`<stop offset=${s[0]} stop-color=${rgba([s[1][0], s[1][1], s[1][2], 1])} stop-opacity=${s[1][3]} />`)}</linearGradient></defs><rect width="1000" height="1250" fill=${`url(#g${k})`} />`
      : x.t === 'line' ? html`<line x1=${x.x1} y1=${x.y1} x2=${x.x2} y2=${x.y2} stroke=${rgba(x.c)} stroke-width=${x.w} />`
      : x.t === 'poly' ? html`<polyline points=${x.pts.map(p => p.join(',')).join(' ')} fill="none" stroke=${rgba(x.c)} stroke-width=${x.w} />`
      : x.t === 'circle' ? html`<circle cx=${x.x} cy=${x.y} r=${x.r} fill=${rgba(x.c)} />` : null)}</svg>`}
    ${tex && html`<div class="cl tex" style=${`background:url(me/tex/${tex.name}.webp) 0 0 / ${u(tex.tile)} auto;opacity:${tex.a}`}></div>`}`;
}
/* 줄 찍기(D) — 엔진이 나눈 줄을 그대로. 줄마다 기준선(by)에 맞춰 놓고 다시 줄바꿈·줄이기를 하지 않는다(앱 CardView laidText 와 같은 짝) */
function CardLines({ it, interactive }) {
  const nav = useNav(), fam = 'pc-' + it.face.key, top = ln => ln.by - it.asc - (it.size - it.asc - it.dsc) / 2;   // line-height 1em 일 때 기준선 = 위 + 반여백 + asc
  const go = l => e => { e.preventDefault(); e.stopPropagation(); if (l.kind === 'egg') { P.eggTap(l.v, 7).catch(() => {}); return; } nav.push(l.kind === 'tag' ? html`<${TagFeed} tag=${l.v} />` : l.kind === 'more' ? html`<${Page} title=${T('feed.more')} left=${html`<${Back} />`}><div style="padding:20px;white-space:pre-wrap;font-size:16px;line-height:1.6"><${Cap} text=${l.v} /></div><//>` : html`<${Profile} handle=${l.v} />`); };
  return html`${it.bg && html`<div class="cbg" style=${`left:${u(it.x)};top:${u(it.y)};width:${u(it.w)};height:${u(it.h)};background:${rgba(it.bg)};border-radius:${u(it.radius)}`}></div>`}
    ${it.L.map((ln, n) => html`<div key=${n} class="cl2" style=${`left:${u(ln.x)};top:${u(top(ln))};font-family:'${fam}';font-size:${u(it.size)};color:${rgba(it.color)}`}>${ln.runs.map(r => r.link && interactive
      ? html`<a class="mention" href="#" style=${r.color ? 'color:' + rgba(r.color) : ''} onClick=${go(r.link)}>${r.s}</a>` : html`<span style=${r.color ? 'color:' + rgba(r.color) : ''}>${r.s}</span>`)}</div>`)}`;
}
function CardText({ it, interactive }) {
  if (it.L) return html`<${CardLines} it=${it} interactive=${interactive} />`;
  const nav = useNav(), clamp = it.lines > 1 ? `-webkit-line-clamp:${it.lines};display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden;` : 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
  const box = it.bg ? `background:${rgba(it.bg)};border-radius:${u(it.radius)};padding:${u(it.pad * 0.5)} ${u(it.pad)};width:fit-content;max-width:${u(it.w)};margin:0 auto;` : '';
  return html`<div class="ct" style=${`left:${u(it.x)};top:${u(it.y)};width:${u(it.w)};font-size:${u(it.size)};font-weight:${it.weight};color:${rgba(it.color)};text-align:${it.align}`}>
    <div style=${clamp + box}>${it.runs.map(r => r.link && interactive ? html`<a class="mention" href="#" style=${r.color ? 'color:' + rgba(r.color) : ''} onClick=${e => { e.preventDefault(); e.stopPropagation(); nav.push(r.link.kind === 'tag' ? html`<${TagFeed} tag=${r.link.v} />` : html`<${Profile} handle=${r.link.v} />`); }}>${r.s}</a>`
      : html`<span style=${r.color ? 'color:' + rgba(r.color) : ''}>${r.s}</span>`)}</div></div>`;
}
/* 얼굴 — 한 번 누르면 @말풍선, 말풍선을 누르면 프로필(인스타 태그) */
function CardFace({ it, tag, setTag, interactive }) {
  const nav = useNav(), on = interactive && it.handle && tag === it.handle;
  return html`<div class="cf" style=${`left:${u(it.x)};top:${u(it.y)};width:${u(it.d)};height:${u(it.d)};border:${u(it.ring)} solid ${rgba([it.color[0], it.color[1], it.color[2], 0.9])}`} onClick=${() => interactive && it.handle && setTag(on ? null : it.handle)}>
    ${it.photo || (it.avatar || '').startsWith('icon:') ? html`<${Avatar} r=${it} size=${100} />` : html`<span class="noface"><${Icon} name="person" size=${40} /></span>`}
    ${it.host && html`<span class="mask"><${Icon} name="theater" size=${14} /></span>`}
    ${on && html`<button class="bubble" onClick=${e => { e.stopPropagation(); nav.push(html`<${Profile} handle=${it.handle} />`); }}>@${it.handle}</button>`}</div>`;
}
function CardPage({ page, interactive = true }) {
  const [art, setArt] = useState(ART), [tag, setTag] = useState(null); useEffect(() => { artMap().then(setArt); }, []);
  const b = page.bg.base;
  return html`<div class="card">
    <div class="cl" style=${b.kind === 'image' ? 'background:#221a40 url(screen/night.jpg) center / cover' : 'background:' + rgba(b.rgb)}></div>
    <${Layers} list=${page.bg.layers} />
    ${page.items.map((it, k) => it.t === 'text' ? html`<${CardText} key=${k} it=${it} interactive=${interactive} />`
      : it.t === 'grad' ? html`<${Layers} key=${k} list=${[it]} />`
      : it.t === 'rect' ? html`<div key=${k} class="cr" style=${`left:${u(it.x)};top:${u(it.y)};width:${u(it.w)};height:${u(it.h)};background:${rgba(it.c)}`}></div>`
      : it.t === 'art' ? html`<div key=${k} class="ca" style=${`left:${u(it.x)};top:${u(it.y)};width:${u(it.size)};height:${u(it.size)};color:${rgba(it.color)}`}>${(() => { const a = (art || {})[it.role]; return a && a.icon ? html`<${RoleArt} r=${a} size=${200} />` : html`<span>${(a && a.e) || ''}</span>`; })()}</div>`
      : it.t === 'icon' && it.name === 'theater' ? html`<div key=${k} class="ca" style=${`left:${u(it.x)};top:${u(it.y)};width:${u(it.size)};height:${u(it.size)};color:${rgba(it.color)}`}><${Icon} name="theater" size=${200} stroke=${1.2} /></div>`
      : it.t === 'face' ? html`<${CardFace} key=${k} it=${it} tag=${tag} setTag=${setTag} interactive=${interactive} />`
      : it.t === 'sub' ? html`<div key=${k} class="cs" style=${`left:${u(it.x)};top:${u(it.y)};width:${u(it.w)};height:${u(it.h)};border-radius:${u(it.radius)}`}><${CardPage} page=${it.page} interactive=${interactive} /></div>` : null)}
  </div>`;
}
const Swatch = ({ bg }) => html`<${CardPage} page=${PC.swatch(bg)} interactive=${false} />`;
function Slides({ p, setPage }) {
  const specs = PC.specs(p);
  const story = specs.some(sp => sp.k === 'story') && specs.length >= 3;   // 숨은 장치 «끝까지 넘긴» — 판 넘겨 보기를 끝까지 갔다가 처음으로
  return html`<div class="slides" onScroll=${e => { const el = e.currentTarget, i = Math.round(el.scrollLeft / el.clientWidth); setPage && setPage(i);
      if (story) { if (i === specs.length - 1) el._end = 1; else if (i === 0 && el._end) { el._end = 0; P.egg('story_back').catch(() => {}); } } }}>
    ${specs.map((sp, i) => html`<div class="pg" key=${i}><${CardPage} page=${PC.page(p, sp, i, specs.length)} /></div>`)}</div>`;
}
/* 설명 글 — #태그는 태그 모아 보기, @아이디는 프로필로 */
function Cap({ text }) {
  const nav = useNav(), out = [], re = /#([\p{L}\p{N}_]{1,30})|@([A-Za-z0-9_.]{2,30})/gu; let last = 0, m;   // 엔진 tokens() 와 같은 규칙(0307)
  const s = String(text || '');
  while ((m = re.exec(s))) { if (m.index > last) out.push(s.slice(last, m.index)); const all = m[0], mk = m[1] ? '#' : '@', w = m[1] || m[2];
    out.push(html`<a class="mention" href="#" onClick=${e => { e.preventDefault(); e.stopPropagation(); nav.push(mk === '#' ? html`<${TagFeed} tag=${w} />` : html`<${Profile} handle=${w} />`); }}>${all}</a>`); last = m.index + all.length; }
  out.push(s.slice(last)); return html`<span>${out}</span>`;
}
function useLike(p0) {
  const [p, setP] = useState(p0), [busy, setBusy] = useState(false);
  useEffect(() => setP(p0), [p0]);
  const like = async () => { const was = !!p.liked, n = p.likes || 0; setP({ ...p, liked: !was, likes: n + (was ? -1 : 1) }); setBusy(true);   /* 바로 바꾸고, 서버가 거절하면 되돌린다 */
    const r = DEMO ? { ok: true, likes: n + (was ? -1 : 1) } : await P.like(p.handle, p.post, !was); setBusy(false); setP(q => r && r.ok ? { ...q, likes: r.likes } : { ...q, liked: was, likes: n }); };
  return [p, busy, like];
}
const Who = ({ p, nav }) => html`<button class="who" onClick=${() => nav.push(html`<${Profile} handle=${p.handle} />`)}><${Avatar} r=${p} size=${34} /><span>${p.ptitle && html`<small class=${'tc' + (p.tc || 0)} style="font-weight:600">${TN(p.ptitle)}</small>`}<b>${p.nick}</b><small>@${p.handle}</small></span></button>`;
function PostCard({ p: p0, removed }) {
  const nav = useNav(), [p, busy, like] = useLike(p0), [page, setPage] = useState(0), [menu, setMenu] = useState(false), n = PC.specs(p).length;
  return html`<article class="post">
    <div class="post-head"><${Who} p=${p} nav=${nav} /></div>
    <${Slides} p=${p} setPage=${setPage} />
    <div class="post-bar"><button class="icon" aria-label=${T('likes.title')} aria-pressed=${!!p.liked} disabled=${busy} onClick=${like} style=${p.liked ? 'color:var(--red)' : ''}><${Icon} name="heart" fill=${!!p.liked} size=${26} /></button>
      <span class="dots" aria-hidden="true">${n > 1 && Array.from({ length: n }, (_, i) => html`<i class=${i === page ? 'on' : ''}></i>`)}</span>
      <span class="sec tally">${T('feed.tally', { n: p.n || 0, w: p.won || 0 })}</span></div>
    ${p.likes > 0 && html`<button class="likes" onClick=${() => nav.push(html`<${PeopleList} title=${T('likes.title')} load=${async () => rows(await P.likers(p.handle, p.post))} />`)}>${T('feed.likes_n', { n: p.likes })}</button>`}
    ${p.caption && html`<div class="caption"><b>${p.nick}</b> <${Cap} text=${p.caption} /></div>`}
    <button class="likes sec" style="font-weight:400" onClick=${() => nav.push(html`<${Comments} handle=${p.handle} post=${p.post} />`)}>${p.comments > 0 ? T('comments.n', { n: p.comments }) : T('comments.ph')}</button>
  </article>`;
}
/* 글 한 장(0303) — X·스레드처럼 */
function NoteCard({ p: p0, removed }) {
  const nav = useNav(), [p, busy, like] = useLike(p0), [menu, setMenu] = useState(false);
  return html`<article class="note">
    <button class="av" onClick=${() => nav.push(html`<${Profile} handle=${p.handle} />`)}><${Avatar} r=${p} size=${38} /></button>
    <div class="grow"><div class="nh">${p.ptitle && html`<small class=${'tc' + (p.tc || 0)} style="font-weight:600">${TN(p.ptitle)}</small>`}<b>${p.nick}</b><small class="sec">@${p.handle} · ${day(p.at)}</small>
</div>
      <div class="nt"><${Cap} text=${p.caption} /></div>
      <div class="nb"><button class="icon" aria-pressed=${!!p.liked} disabled=${busy} onClick=${like} style=${p.liked ? 'color:var(--red)' : ''}><${Icon} name="heart" fill=${!!p.liked} size=${18} /> ${p.likes || 0}</button>
        <button class="icon" onClick=${() => nav.push(html`<${Comments} handle=${p.handle} post=${p.post} />`)}><${Icon} name="compose" size=${18} /> ${p.comments || 0}</button></div></div>
  </article>`;
}
const FeedItem = ({ p, removed }) => p.kind === 'note' ? html`<${NoteCard} p=${p} removed=${removed} />` : html`<${PostCard} p=${p} removed=${removed} />`;
/* 댓글(0296) — 지우기는 쓴 사람·장 주인 */
function Comments({ handle, post }) {
  const [l, setL] = useState(), [t, setT] = useState(''), [busy, setBusy] = useState(false), [msg, setMsg] = useState(null);
  const load = async () => setL(DEMO ? [] : rows(await P.comments(handle, post)));
  useEffect(() => { load(); }, []);
  const send = async () => { setBusy(true); const r = await P.comment(handle, post, t); setBusy(false); if (r && r.ok) { setT(''); load(); } else setMsg(msgOf(r)); };
  return html`<${Page} title=${T('comments.title')} left=${html`<${Back} />`} bottom=${html`<div class="cbar"><textarea id="cm" rows="1" maxlength="300" placeholder=${T('comments.ph')} value=${t} onInput=${e => setT(e.currentTarget.value)}></textarea>
      <button class="bprim" disabled=${busy || !t.trim()} onClick=${send}>${T('feed.post')}</button></div>`}>
    <${Loading} v=${l}>${l && html`<${Section}>${l.length ? l.map(c => html`<${Row}><${Avatar} r=${c} size=${32} /><div class="grow"><b>${c.nick}</b> <small class="sec">${day(c.at)}</small><div><${Cap} text=${c.body} /></div></div>
      ${c.can_delete && html`<button class="sec" style="background:none;border:0;font:inherit;min-height:44px" onClick=${async () => { await P.uncomment(c.id); load(); }}>${T('ui.delete')}</button>`}<//>`) : html`<${Row}><span class="sec">${T('comments.title')}</span><//>`}<//>`}<//>
    <${Alert} open=${!!msg} title=${msg} onClose=${() => setMsg(null)} />
  <//>`;
}
/* 요약 — 이번 달·분기·해(0297) */
function Summary({ handle }) {
  const [s, setS] = useState(null); useEffect(() => { if (!DEMO) P.summary(handle).then(setS); }, [handle]);
  if (!s || s.ok === false) return null;
  return html`<${Section}><div class="sum">${[['month', 'sum.month'], ['quarter', 'sum.quarter'], ['year', 'sum.year']].map(([k, t]) => { const x = s[k] || {};
      return html`<div><span>${T(t)}</span><b>${T('sum.games', { n: x.games || 0, w: x.won || 0 })}</b>${x.role && html`<small>${D(x.role)}</small>`}</div>`; })}</div>
    ${s.streak > 0 && html`<div class="row orange" style="font-weight:600">${T('sum.streak', { n: s.streak })}</div>`}<//>`;
}
const DEMO_FEED = [   /* 시안 확인용(?demo=1) — 실제 사람 아님 */
  { handle: 'sample_a', nick: '보기1', post: 'x:1', at: '2026-10-10T05:00:00Z', host: '햇살', title: '8회', n: 2, won: 1, likes: 4, liked: true, mine: true, ptitle: '양심에 털이 난', tc: 2, bg: 'p161.focus',
    caption: '오늘 최고의 판 #레전드 @sample_b', earned: [{ name: '흐름을 탄', tier: 1 }, { name: '노련한 무당', tier: 2 }],
    people: ['햇살', '치즈', '에이치', '지수', '준', '하루', '망고', '커피', '리단'].map((nick, k) => ({ nick, handle: k ? 'p' + k : 'hatsal', host: !k })),
    pages: [{ k: 'people', em: '9명이 모인 밤' }, { k: 'text', tx: '세 번 지목 끝에 드디어 잡았다 #레전드', em: '오늘의 한 줄' }, { k: 'game', id: 'g1' }, { k: 'story', id: 'g1', ph: 'd1', em: '산군 잡았다', cap: '세 번 지목 끝에 #첫승', lines: ['새우 → 채채 지명', '채채 10표', '⚖ 채채(부정한 여자) 처형'] }, { k: 'titles' }, { k: 'group', em: '오늘 요약', parts: [{ k: 'game', id: 'g1' }, { k: 'people' }, { k: 'text', tx: '세 번 지목 끝에 #레전드' }] }],
    games: [{ game: 'g1', mode: '당산나무 마을', role: '무당', won: true, nights: 3 }, { game: 'g2', mode: '클래식', host: true }] },
  { kind: 'note', handle: 'sample_b', nick: '보기2', post: 'note:1', at: '2026-10-09T05:00:00Z', caption: '오늘 처음 산군 해 봤는데 첫밤부터 손이 떨렸어요 #마피아 @sample_a', likes: 2, comments: 1 },
  { handle: 'sample_b', nick: '보기2', post: 'x:2', at: '2026-10-03T05:00:00Z', host: '햇살', title: '7회', n: 1, won: 1, likes: 0, bg: 'p30.linen', games: [{ game: 'g3', mode: '오리지널 마피아', role: '대부', won: true, nights: 4 }] }];
function FeedTab() {
  const on = useAuth(), nav = useNav();
  const [l, setL] = useState(), [more, setMore] = useState(false);
  const load = async () => { if (DEMO) { setL(DEMO_FEED); return; } if (!on) { setL([]); return; } const r = rows(await P.feed()); setL(r); setMore(r.length >= 20); };
  const next = async () => { const z = l[l.length - 1], r = rows(await P.feed(z.at, z.handle + '|' + z.post)); setL([...l, ...r]); setMore(r.length >= 20); };   // 같은 시각도 안 겹치게(0307)
  useEffect(() => { load(); }, [on]);
  /* 웹은 보기만 — 올리기·글 쓰기는 앱에서만(2026-10-07 햇살님) */
  return html`<${Page} ...${useShell()}>
    <${LargeTitle}>${T('tab.feed')}<//>
    ${!on ? html`<${LoginRows} />` : html`<${Loading} v=${l}>${l && html`
      ${!l.length && html`<${Section}><${Row}><span class="sec">${T('feed.empty')}</span><//><//>`}
      <div class="feed">${l.map(p => html`<${FeedItem} key=${p.handle + '|' + p.post} p=${p} removed=${load} />`)}</div>
      ${more && html`<${Section}><${Row} tint onClick=${next}>${T('ui.more')}<//><//>`}`}<//>`}
  <//>`;
}
function TagFeed({ tag }) {
  const [l, setL] = useState(); useEffect(() => { DEMO ? setL(DEMO_FEED) : P.tag(tag).then(r => setL(rows(r))); }, [tag]);
  return html`<${Page} title=${'#' + tag} left=${html`<${Back} />`}><${Loading} v=${l}>${l && html`<div class="feed">${l.length ? l.map(p => html`<${FeedItem} key=${p.handle + '|' + p.post} p=${p} />`) : html`<${Section}><${Row}><span class="sec">${T('feed.empty')}</span><//><//>`}</div>`}<//><//>`;
}
/* ── 사람 ── */
function PeopleTab() {
  const on = useAuth(), nav = useNav();
  const [me, setMe] = useState({}), [which, setWhich] = useState('following'), [list, setList] = useState([]), [q, setQ] = useState(''), [found, setFound] = useState([]);
  useEffect(() => { if (!on || DEMO) return; P.me().then(m => { const v = m.value || m; setMe(v); if (v.handle) P[which](v.handle).then(r => setList(rows(r))); }); }, [on, which]);
  useEffect(() => { const t = setTimeout(async () => setFound(rows(await P.search(q))), 300); return () => clearTimeout(t); }, [q]);
  const open = r => nav.push(html`<${Profile} handle=${r.handle} />`);
  useEffect(() => { const u = new URLSearchParams(location.search).get('u'); if (u && on) { history.replaceState(null, '', location.pathname); open({ handle: u }); } }, [on]);   /* 프로필 QR(…/me/?u=아이디) */
  return html`<${Page} ...${useShell()}>
    <${LargeTitle}>${T('tab.people')}<//>
    ${!on ? html`<${LoginRows} />` : html`
      <div style="padding:0 16px 12px"><${Search} value=${q} onInput=${v => { setQ(v); if (String(v).trim().toLowerCase() === '1ndc') P.egg('search_1ndc').catch(() => {}); }} placeholder=${T('people.search')} /></div>
      ${q ? html`<${Section}>${found.length ? found.map(r => html`<${PersonRow} r=${r} onClick=${() => open(r)} />`) : html`<${Row}><span class="sec">${T('empty.search')}</span><//>`}<//>` : html`
        <div style="padding:0 16px 12px"><${Segmented} options=${[['following', `${T('profile.following')} ${me.following || 0}`], ['followers', `${T('profile.followers')} ${me.followers || 0}`]]} value=${which} onChange=${setWhich} /></div>
        <${Section}>${list.length ? list.map(r => html`<${PersonRow} r=${r} onClick=${() => open(r)} />`) : html`<${Row}><span class="sec">${which === 'following' ? T('empty.following') : T('empty.followers')}</span><//>`}<//>
        <${Section} header=${T('people.find')}><${Row} chevron onClick=${() => nav.push(html`<${PeopleList} title=${T('people.played')} load=${async () => rows(await P.playedWith())} />`)}>${T('people.played')}<//><//>`}`}
  <//>`;
}
function PeopleList({ title, load }) {
  const nav = useNav(); const [l, setL] = useState();
  useEffect(() => { load().then(setL); }, []);
  return html`<${Page} title=${title} left=${html`<${Back} />`}><${Loading} v=${l}>${l && html`<${Section}>${l.length ? l.map(r => html`<${PersonRow} r=${r} onClick=${() => nav.push(html`<${Profile} handle=${r.handle} />`)} />`) : html`<${Row}><span class="sec">${T('empty.nobody')}</span><//>`}<//>`}<//><//>`;
}
function Requests() {
  const [l, setL] = useState(); const load = async () => setL(rows(await P.inbox()));
  useEffect(() => { load(); }, []);
  return html`<${Page} title=${T('requests.title')} left=${html`<${Back} />`}><${Loading} v=${l}>${l && html`<${Section}>${l.length ? l.filter(i => i.kind === 'follow').map(i => html`<${Row}><${Avatar} r=${i.from} size=${36} /><${RowLabel} title=${i.from?.nick} text=${'@' + (i.from?.handle || '')} />
    <button class="bprim" style="min-height:32px;padding:0 12px" onClick=${async () => { await P.answer(i.from.handle, true); load(); }}>${T('ui.ok')}</button>
    <button class="bsec" style="min-height:32px;padding:0 12px" onClick=${async () => { await P.answer(i.from.handle, false); load(); }}>${T('ui.delete')}</button><//>`) : html`<${Row}><span class="sec">${T('empty.requests')}</span><//>`}<//>`}<//><//>`;
}
function Notices() {
  const W = { followed: T('notice.followed'), follow_accepted: T('notice.follow_accepted'), fix_accepted: T('notice.fix_accepted'), fix_rejected: T('notice.fix_rejected'), amend: T('notice.amend'), photo_hidden: T('notice.photo_hidden'), liked: T('notice.liked'), commented: T('notice.commented'), title: T('notice.title_new'), tagged: T('notice.tagged') };
  const nav = useNav();
  /* 누르면 그 글로(0318, 2026-10-08) — 좋아요·댓글·태그는 그 장(owner 의 post), 칭호는 내 칭호 목록, 팔로우는 그 사람 */
  const go = n => ['liked', 'commented', 'tagged'].includes(n.kind) && n.post && n.owner ? () => nav.push(html`<${PostOne} handle=${n.owner} post=${n.post} />`)
    : n.kind === 'title' ? () => nav.push(html`<${MyTitles} />`) : ['followed', 'follow_accepted'].includes(n.kind) && n.from && n.from.handle ? () => nav.push(html`<${Profile} handle=${n.from.handle} />`) : null;
  const on = useAuth(), [reqs, setReqs] = useState(0);
  const [l, setL] = useState(); useEffect(() => { if (!on || DEMO) { setL([]); return; } P.notices().then(r => { setL(rows(r)); P.readNotices(); }); P.me().then(m => setReqs((m.value || m).requests || 0)); }, [on]);
  return html`<${Page} ...${useShell()}><${LargeTitle}>${T('notice.title')}<//>${!on ? html`<${LoginRows} />` : html`<${Loading} v=${l}>${l && html`<${Section}><${Row} chevron onClick=${() => nav.push(html`<${Requests} />`)}><${Labeled} label=${T('requests.title')} value=${reqs} /><//><//><${Section}>${l.length ? l.map(n => html`<${Row} chevron=${!!go(n)} onClick=${go(n)}><${Avatar} r=${n.from || {}} size=${32} /><${RowLabel} title=${(n.from?.nick || '') + (W[n.kind] || '')} text=${(n.at || '').slice(0, 10)} /><//>`) : html`<${Row}><span class="sec">${T('empty.notices')}</span><//>`}<//>`}<//>`}<//>`;
}
/* 장 하나 — 알림에서 열 때(feed_one) */
function PostOne({ handle, post }) {
  const [p, setP] = useState(), [gone, setGone] = useState(false);
  useEffect(() => { P.one(handle, post).then(r => { const x = rows(r)[0]; if (x) setP(x); else setGone(true); }); }, [handle, post]);
  return html`<${Page} title="" left=${html`<${Back} />`}>${p ? html`<div class="feed"><${FeedItem} p=${p} removed=${() => { setP(null); setGone(true); }} /></div>` : gone ? html`<${Empty} icon="eyeSlash" title=${T('feed.empty')} />` : html`<${Loading} v=${null} />`}<//>`;
}
/* 내 칭호 목록 — 알림(칭호 얻음)에서 */
function MyTitles() {
  const [h, setH] = useState();
  useEffect(() => { P.me().then(m => { const me = (m && m.value) || m || {}; setH(me.handle || null); }); }, []);
  return h ? html`<${Titles} handle=${h} mine=${true} />` : html`<${Page} title="" left=${html`<${Back} />`}><${Loading} v=${null} /><//>`;
}
function Profile({ handle }) {
  const nav = useNav(); const [p, setP] = useState(), [menu, setMenu] = useState(false), [msg, setMsg] = useState(null), [posts, setPosts] = useState([]), [tl, setTl] = useState({}), [codex, setCodex] = useState([]);
  const load = async () => { const v = await P.profile(handle); setP(v); if (v && v.open) { setPosts(rows(await P.posts(handle))); setTl(await P.titles(handle)); setCodex(rows(await P.codex(handle))); } else { setPosts([]); setTl({}); setCodex([]); } };   // 장·칭호·직업 도감(0294·0298)
  const tname = ((tl.owned || []).find(o => o.id === tl.equipped) || {}).name && TN(((tl.owned || []).find(o => o.id === tl.equipped) || {}).name);
  useEffect(() => { load(); }, [handle]);
  const act = async f => { await f(); load(); };
  const follow = !p ? null : p.follow === 'accepted' ? [T('follow.following'), () => act(() => P.unfollow(handle)), 'bsec'] : p.follow === 'requested' ? [T('requests.title'), () => act(() => P.unfollow(handle)), 'bsec'] : [p.private && !p.open ? T('follow.request') : T('follow.do'), () => act(() => P.follow(handle)), 'bprim'];
  return html`<${Page} title=${T('profile.title')} left=${html`<${Back} />`} right=${p && p.ok && !p.me && html`<${NavButton} icon="ellipsisCircle" label=${T('ui.more')} onClick=${() => setMenu(true)} />`}>
    <${Loading} v=${p}>${p && (!p.ok ? html`<${Empty} icon="person" title=${msgOf(p)} />` : html`
      <${Section}><div class="head"><${Avatar} r=${p} size=${60} /><div>${tname && html`<div class=${'tc' + (tl.tc || 0)} style="font-size:13px;font-weight:600">${tname}</div>`}<div style="font-size:20px;font-weight:600">${p.nick}</div><div class="sec">@${handle}</div>${p.name && html`<div>${p.name}</div>`}</div></div>
        ${p.bio && html`<${Row}><span>${p.bio}</span><//>`}
        <${Row}><span>${T('profile.followers')} <b>${p.followers}</b></span><span style="margin-left:16px">${T('profile.following')} <b>${p.following}</b></span><//>
        ${!p.me && html`<div style="padding:8px 16px 12px"><button class=${follow[2] + ' grow'} style="width:100%" onClick=${follow[1]}>${follow[0]}</button></div>`}<//>
      ${p.open && p.stats ? html`<${Summary} handle=${handle} /><${Section}><${Stats} s=${p.stats} /><//>${p.stats.hosted > 0 && html`<${Section}><${Labeled} label=${T('space.host')} value=${T('profile.hosted', { n: p.stats.hosted })} /><//>`}<${Ad} />
        ${(tl.owned || []).length > 0 && html`<${Section} header=${T('title.shelf')}><div class="tts">${tl.owned.slice(0, 6).map(o => html`<span class=${'tt t' + o.tier}>${TN(o.name)}</span>`)}</div>
          <${Row} chevron onClick=${() => nav.push(html`<${Titles} handle=${handle} mine=${!!p.me} reload=${load} />`)}>${T('title.all', { n: tl.owned.length })}<//><//>`}
        ${codex.length > 0 && html`<${Codex} rows=${codex} />`}
        ${posts.some(x => x.kind === 'note') && html`<${Section} header=${T('note.list')}><div class="feed">${posts.filter(x => x.kind === 'note').map(x => html`<${NoteCard} key=${x.post} p=${x} removed=${load} />`)}</div><//>`}
        ${posts.some(x => x.kind !== 'note') && html`<${Section} header=${T('posts.title')}><div class="pgrid">${posts.filter(x => x.kind !== 'note').map(x => html`<button key=${x.post} onClick=${() => nav.push(html`<${Page} title="" left=${html`<${Back} />`}><div class="feed"><${PostCard} p=${x} removed=${load} /></div><//>`)}>
          <${CardPage} page=${PC.page(x, PC.specs(x)[0] || {}, 0, 1)} interactive=${false} /></button>`)}</div><//>`}`
        : html`<${Section}><div style="text-align:center;padding:20px"><${Icon} name="eyeSlash" size=${26} /><div style="font-weight:600;margin-top:6px">${T('profile.private')}</div></div><//>`}`)}<//>
    <${ActionSheet} open=${menu} title=${'@' + handle} onClose=${() => setMenu(false)} actions=${[
      ...(p && p.follows_me ? [{ label: T('follow.remove'), onClick: () => act(() => P.removeFollower(handle)) }] : []),
      ...(p && p.photo ? [{ label: T('avatar.report'), onClick: async () => { await P.photoReport(handle); setMsg(T('avatar.reported')); } }] : []),
      { label: T('block.do'), role: 'destructive', onClick: () => act(() => P.block(handle)) }]} />
    <${Alert} open=${!!msg} title=${msg} onClose=${() => setMsg(null)} />
  <//>`;
}

/* 칭호 모두 보기 — 내 것이면 이름 위에 달기·다음 문턱(0298) */
function Titles({ handle, mine, reload }) {
  const [t, setT] = useState(); const load = async () => setT(await P.titles(handle));
  useEffect(() => { load(); }, []);
  const equip = async id => { await P.equip(id); await load(); reload && reload(); };
  return html`<${Page} title=${T('title.shelf')} left=${html`<${Back} />`}><${Loading} v=${t}>${t && html`
    <${Section}>${(t.owned || []).map(o => html`<${Row}><span class=${'tt t' + o.tier}>${TN(o.name)}</span><span class="grow"></span>
      ${mine && html`<button class="sec" style="background:none;border:0;font:inherit;min-height:44px" onClick=${() => equip(t.equipped === o.id ? null : o.id)}>${t.equipped === o.id ? T('title.unequip') : T('title.equip')}</button>`}<//>`)}<//>
    ${mine && (t.next || []).length > 0 && html`<${Section} header=${T('title.next')}>${t.next.map(x => html`<${Row}><div class="grow"><div class=${'t' + x.tier}>${TN(x.name)}</div><progress max=${x.at} value=${Math.min(x.n, x.at)} style="width:100%"></progress></div><span class="sec" style="font-variant-numeric:tabular-nums">${x.n} / ${x.at}</span><//>`)}<//>`}
    ${mine && t.hidden_left > 0 && html`<${Section} header=${T('title.hidden')}><button class="row" style="width:100%;background:none;border:0;font:inherit;min-height:44px;justify-content:space-between" onClick=${() => P.eggTap('qqq100', 100).catch(() => {})}><span class="sec">???</span><span class="sec" style="font-variant-numeric:tabular-nums">× ${t.hidden_left}</span></button><//>`}
    ${mine && html`<div style="height:160px" onPointerDown=${e => { e.currentTarget._t = setTimeout(() => P.egg('long_blank').catch(() => {}), 1500); }} onPointerUp=${e => clearTimeout(e.currentTarget._t)} onPointerLeave=${e => clearTimeout(e.currentTarget._t)}></div>`}`}<//><//>`;
}
/* 직업 도감 — 해 본 직업 그림, 이긴 직업은 진하게 */
function Codex({ rows: l }) {
  const [art, setArt] = useState(ART); useEffect(() => { artMap().then(setArt); }, []);
  return html`<${Section} header=${T('codex.title') + ' · ' + l.length}><div class="codex">${l.map(r => { const a = (art || {})[r.role];
    return html`<div class=${r.won > 0 ? '' : 'dim'}>${a && a.icon ? html`<${RoleArt} r=${a} size=${40} />` : html`<span style="font-size:30px;height:40px;display:block">${(a && a.e) || '·'}</span>`}<small>${D(r.role)}</small></div>`; })}</div><//>`;
}

/* ── 계정 ── */
function AccountTab({ close }) {
  const on = useAuth(), nav = useNav();
  const [me, setMe] = useState({}), [st, setSt] = useState({});
  const load = async () => { if (!on || DEMO) return; const m = await P.me(); const v = m.value || m; setMe(v); setSt(await P.status()); setLang(v.lang); if ((v.needs || []).length && !seen()) { seen(true); nav.push(html`<${Signup} me=${v} done=${load} />`); window.dispatchEvent(new Event('me-fill')); } };   // 처음 한 번·로그인했을 때만(2026-10-06 «나중에»)   // 빠진 칸(0250) — 계정 탭으로 넘겨 채우게
  useEffect(() => { load(); }, [on]);
  return html`<${Page} left=${close && html`<${NavButton} icon="xmark" label=${T('ui.close')} onClick=${close} />`}>
    <${LargeTitle}>${T('tab.account')}<//>
    ${!on ? html`<${LoginRows} />` : html`
      ${st.status === 'leaving' && html`<${Section} footer=${T('leave.until', { t: (st.leave_until || '').slice(0, 10) })}><${Row} tint onClick=${async () => { await P.accountReturn(); load(); }}>${T('leave.undo')}<//><//>`}
      <${Section}><div class="head"><${Avatar} r=${me} size=${60} /><div><div style="font-size:20px;font-weight:600">${me.nick}</div>
          ${me.handle ? html`<div class="sec">@${me.handle}</div>` : html`<div class="orange">${T('profile.need_handle')}</div>`}${me.private && html`<div class="sec" style="font-size:13px">${T('profile.private')}</div>`}</div></div>
        ${me.bio && html`<${Row}><span>${me.bio}</span><//>`}
        <${Row}><span>${T('profile.followers')} <b>${me.followers || 0}</b></span><span style="margin-left:16px">${T('profile.following')} <b>${me.following || 0}</b></span><//>
        <${Row} chevron onClick=${() => nav.push(html`<${EditProfile} me=${me} done=${load} />`)}>${T('profile.edit')}<//><//>
      ${me.stats && html`<${Section}><${Stats} s=${me.stats} /><//>
        <${Section}><${Labeled} label=${T('space.host')} value=${T('profile.hosted', { n: me.stats.hosted || 0 })} /><${Row} chevron onClick=${() => nav.push(html`<${Seated} />`)}>${T('games.mine')}<//><//>`}
      <${Ad} />
      <${Section}><${Row} chevron onClick=${() => nav.push(html`<${Settings} me=${me} done=${load} />`)}>${T('account.settings')}<//><//>`}
  <//>`;
}
function Seated() {
  const [l, setL] = useState(); const load = async () => setL(rows(await P.seated(50)));
  useEffect(() => { load(); }, []);
  const S = { pending: T('requests.title'), accepted: T('fix.accepted'), rejected: T('fix.rejected') };
  return html`<${Page} title=${T('games.mine')} left=${html`<${Back} />`}><${Loading} v=${l}>${l && html`<${Section}>${l.length ? l.map(g => html`<${Row}><${RowLabel} title=${T('games.row', { host: g.host, mode: g.mode || '' })} text=${(g.at || '').slice(0, 10)} />
    ${g.role === 'host' ? html`<span class="sec">${T('games.hosted')}</span>` : g.request ? html`<span class="sec">${S[g.request]}</span>` : html`<button class="blink" onClick=${async () => { await P.fixRequest(g.game); load(); }}>${T('fix.request')}</button>`}<//>`) : html`<${Row}><span class="sec">${T('empty.games')}</span><//>`}<//>`}<//><//>`;
}
function useNameCheck(kind, value, orig) {
  const [n, setN] = useState(null);
  useEffect(() => { if (!value || value === orig) { setN(null); return; } const p = window.Participant.problem(kind, value); if (p) { setN([false, T('err.' + p)]); return; }
    const t = setTimeout(async () => { const r = await P.nameCheck(kind, value); setN(r.ok ? [true, T('ok.available')] : [false, msgOf(r)]); }, 400); return () => clearTimeout(t); }, [value]);
  return n;
}
const Note = ({ n }) => n && html`<div class=${n[0] ? 'green' : 'red'} style="font-size:13px;padding:0 16px 8px">${n[1]}</div>`;
const seen = v => { try { if (v) sessionStorage.setItem('me.welcomed', '1'); return !!sessionStorage.getItem('me.welcomed'); } catch { return false; } };
function Signup({ me, done }) {
  const need = k => (me.needs || ['nick', 'handle', 'agree']).includes(k);
  const nav = useNav(); const [nick, setNick] = useState(me.nick || ''), [handle, setHandle] = useState(me.handle || ''), [nm, setNm] = useState(me.display_name || ''), [agree, setAgree] = useState(false), [busy, setBusy] = useState(false), [fail, setFail] = useState({});
  const nn = useNameCheck('nick', nick, me.nick), hn = useNameCheck('handle', handle, me.handle || '');
  const ok = (agree || !need('agree')) && handle && nick && !(nn && !nn[0]) && !(hn && !hn[0]);
  const save = async () => { setBusy(true); const ch = {}; if (need('agree')) ch.agreed = true; if (handle !== (me.handle || '')) ch.handle = handle; if (nick !== me.nick) ch.nick = nick; if (nm !== (me.display_name || '')) ch.name = nm; const r = await P.setProfile(ch); setBusy(false); if (r.ok) { nav.pop(); done(); } else setFail(r.failed || {}); };
  return html`<${Page} title=${T('signup.title')} right=${html`<${NavButton} label=${T('signup.go')} bold disabled=${!ok || busy} onClick=${save} />`}>
    <${Section}><div class="row" style="white-space:pre-line">${T(me.from_tunel ? 'signup.intro.tunel' : 'signup.intro')}</div><//>
    ${html`<${Section} header=${T('profile.nick')} footer=${T('signup.nick.help') + (me.from_tunel ? ' ' + T('signup.nick.tunel') : '')}><div class="row"><input class="textin grow" id="su-nick" value=${nick} onInput=${e => setNick(e.currentTarget.value)} /></div><//><${Note} n=${fail.nick ? [false, T('err.' + fail.nick)] : nn} />`}
    ${html`<${Section} header=${T('profile.handle')} footer=${T('signup.handle.help')}><div class="row"><span class="sec">@</span><input class="textin grow" id="su-handle" value=${handle} autocapitalize="off" autocomplete="off" spellcheck="false" onInput=${e => setHandle(e.currentTarget.value)} /></div><//><${Note} n=${fail.handle ? [false, T('err.' + fail.handle)] : hn} />`}
    <${Section} header=${T('profile.name')} footer=${T('signup.name.help')}><div class="row"><input class="textin grow" id="su-name" value=${nm} onInput=${e => setNm(e.currentTarget.value)} /></div><//><${Note} n=${fail.name ? [false, T('err.' + fail.name)] : null} />
    ${need('agree') && html`<${Section} footer=${T('signup.easy')}><${Toggle} checked=${agree} onChange=${setAgree}>${T('signup.agree')}<//>
      <${Row} chevron onClick=${() => open('../terms.html')}>${T('signup.terms')}<//><${Row} chevron onClick=${() => open('../privacy.html')}>${T('signup.privacy')}<//><//>`}
  <//>`;
}
function EditProfile({ me, done }) {
  const nav = useNav(), orig = k => (k === 'name' ? me.display_name : me[k]) || '';
  const [f, setF] = useState({ nick: orig('nick'), handle: orig('handle'), name: orig('name'), bio: orig('bio') }), [ask, setAsk] = useState(null), [fail, setFail] = useState({}), [busy, setBusy] = useState(false);
  const ch = Object.fromEntries(Object.entries(f).filter(([k, v]) => v !== orig(k)));
  const nn = useNameCheck('nick', f.nick, orig('nick')), hn = useNameCheck('handle', f.handle, orig('handle'));
  const local = k => { const p = (f[k] !== orig(k)) && window.Participant.problem(k, f[k]); return p ? [false, T('err.' + p)] : null; };
  const bad = [nn, hn, local('name'), local('bio')].some(n => n && !n[0]);
  const save = async () => { setBusy(true); const r = await P.setProfile(ch); setBusy(false); if (r.ok) { nav.pop(); done(); } else setFail(r.failed || {}); };
  const set = k => e => setF({ ...f, [k]: e.currentTarget.value });
  return html`<${Page} title=${T('profile.edit')}
      left=${html`<${NavButton} icon="chevronLeft" label=${T('ui.back')} onClick=${() => Object.keys(ch).length ? setAsk('discard') : nav.pop()} />`}
      right=${html`<${NavButton} icon="check" label=${T('edit.done')} disabled=${!Object.keys(ch).length || busy || bad} onClick=${() => ch.handle && orig('handle') ? setAsk('handle') : save()} />`}>
    <${Section} header=${T('profile.nick')}><div class="row"><input class="textin grow" id="ep-nick" value=${f.nick} onInput=${set('nick')} /></div><//><${Note} n=${fail.nick ? [false, T('err.' + fail.nick)] : nn} />
    <${Section} header=${T('profile.handle')} footer=${me.handle_left !== undefined && T('edit.left', { n: me.handle_left })}><div class="row"><span class="sec">@</span><input class="textin grow" id="ep-handle" value=${f.handle} autocapitalize="off" autocomplete="off" spellcheck="false" onInput=${set('handle')} /></div><//><${Note} n=${fail.handle ? [false, T('err.' + fail.handle)] : hn} />
    <${Section} header=${T('profile.name')} footer=${me.name_left !== undefined && T('edit.left', { n: me.name_left })}><div class="row"><input class="textin grow" id="ep-name" value=${f.name} onInput=${set('name')} /></div><//><${Note} n=${fail.name ? [false, T('err.' + fail.name)] : local('name')} />
    <${Section} header=${T('profile.bio')}><div class="row"><textarea class="textin grow" id="ep-bio" rows="3" maxlength="150" onInput=${set('bio')}>${f.bio}</textarea></div><//><${Note} n=${local('bio')} />
    ${(me.revert || []).map(x => html`<${Section}><${Row} tint onClick=${async () => { await P.revert(x.kind); nav.pop(); done(); }}>${T('revert.to', { old: (x.kind === 'handle' ? '@' : '') + x.old })}<//><//>`)}
    <${ActionSheet} open=${ask === 'handle'} title=${T('edit.handle_confirm', { old: orig('handle') })} onClose=${() => setAsk(null)} actions=${[{ label: T('ui.change'), onClick: save }]} />
    <${ActionSheet} open=${ask === 'discard'} title=${T('edit.discard')} onClose=${() => setAsk(null)} actions=${[{ label: T('ui.discard'), role: 'destructive', onClick: () => nav.pop() }]} />
  <//>`;
}
function Settings({ me, done, close }) {
  const nav = useNav(); const [priv, setPriv] = useState(me.private !== false), [lang, setL] = useState(me.lang || ''), [ask, setAsk] = useState(false);
  return html`<${Page} title=${T('account.settings')} left=${close ? html`<${NavButton} icon="xmark" label=${T('ui.close')} onClick=${close} />` : html`<${Back} />`}>
    <${Section}><${Toggle} checked=${priv} onChange=${async v => { setPriv(v); await P.setProfile({ private: v }); done(); }}>${T('profile.private')}<//><//>
    <${Section} header=${T('lang.title')}><div class="row"><select class="textin grow" id="me-lang" value=${lang} onChange=${async e => { const v = e.currentTarget.value; setL(v); await setLang(v || null); await P.setProfile({ lang: v || null }); draw(); }}>
      <option value="">${T('lang.device')}</option>${LANGS.map(([c, n]) => html`<option value=${c}>${n}</option>`)}</select></div><//>
    <${Section}><${Row} chevron onClick=${() => nav.push(html`<${PeopleList} title=${T('block.list')} load=${async () => rows(await P.blocked())} />`)}>${T('block.list')}<//><//>
    <${Section}><${Row} danger onClick=${() => auth.logout()}>${T('account.logout')}<//><//>
    <${Section} footer=${T('leave.note')}><${Row} danger onClick=${() => setAsk(true)}>${T('leave.do')}<//><//>
    <${ActionSheet} open=${ask} title=${T('leave.ask')} onClose=${() => setAsk(false)} actions=${[{ label: T('leave.ok'), role: 'destructive', onClick: async () => { await P.accountLeave(); nav.pop(); done(); } }]} />
  <//>`;
}

/* ── 틀 ── */
async function setLang(account) {
  const l = window.Participant.lang(account, navigator.language);
  dict = l === 'ko' ? ko : await (await fetch(`i18n/${l}.json`)).json().catch(() => ko);
  P.eggLang(l).catch(() => {});   // 숨은 장치 «바벨탑» — 언어를 10개 다 바꿔 보면
  DATA = l === 'ko' ? null : await fetch(`i18n/data/${l}.json`).then(r => r.ok ? r.json() : null).catch(() => null);
  document.documentElement.lang = l;
  window.Postcard.setText(dict, ko, DATA || {}, l);   // 장 그리기 엔진도 같은 말로
  window.Postcard.setTitles(l === 'ko' ? {} : await fetch(`i18n/titles/${l}.json`).then(r => r.ok ? r.json() : {}).catch(() => ({})));   // 칭호 이름(2026-10-07)
}
/* 활동 둘(2026-10-10 햇살님 «참가/피드/응») — 위쪽 «설정 · 참가⌄/피드⌄ · 계정», 아래는 활동 안 기능만(참가: 광장·자료실 / 피드: 피드·사람).
   첫 진입: ?j= 면 참가 › 광장, ?u= 면 피드 › 사람, 그 밖엔 마지막 활동(처음이면 참가). 활동마다 마지막 탭을 기억한다. 계정·설정은 닫으면 보던 탭으로. */
const SPACES = { play: [['plaza', 'tab.plaza', 'house', PlazaTab], ['library', 'tab.library', 'books', LibraryTab], ['notices', 'notice.title', 'bell', Notices]],
                 feed: [['feed', 'tab.feed', 'stack', FeedTab], ['people', 'tab.people', 'person', PeopleTab], ['notices', 'notice.title', 'bell', Notices]] };
const ls = (k, v) => { try { if (v !== undefined) localStorage.setItem(k, v); return localStorage.getItem(k); } catch { return null; } };
const ShellCtx = createContext(null);
export function useShell(extra) {   // 활동 첫 화면 머리 — Page 에 펼쳐 넣는다
  const sh = useContext(ShellCtx);
  if (!sh) return {};
  return { left: html`<${NavButton} icon="gear" label=${T('account.settings')} onClick=${() => sh.open('settings')} />`,
    title: html`<button class="nbtn bold" aria-label=${T('space.current')} onClick=${() => sh.pick(true)}>${T(sh.space === 'feed' ? 'space.social' : 'space.play')} ⌄</button>`,
    right: html`<span style="display:flex;gap:4px">${extra}<${NavButton} icon="personCircle" label=${T('tab.account')} onClick=${() => sh.open('account')} /></span>` };
}
function App() {
  const q = location.search;
  const [space, setSpace] = useState(() => /[?&]j=/.test(q) ? 'play' : /[?&]u=/.test(q) ? 'feed' : (ls('me.space') === 'feed' ? 'feed' : 'play'));
  const [tabs, setTabs] = useState(() => ({ play: /[?&]j=/.test(q) ? 'plaza' : (ls('me.tab.play') || 'plaza'), feed: /[?&]u=/.test(q) ? 'people' : (ls('me.tab.feed') || 'feed') }));
  const [over, setOver] = useState(null);   // 'account' | 'settings' — 닫으면 보던 탭
  const [picking, setPicking] = useState(false);
  const go = (sp, t) => { setSpace(sp); ls('me.space', sp); if (t) { setTabs(x => ({ ...x, [sp]: t })); ls('me.tab.' + sp, t); } setOver(null); };
  useEffect(() => { const f = () => setOver('account'); window.addEventListener('me-fill', f); return () => window.removeEventListener('me-fill', f); }, []);
  const sh = { space, open: setOver, pick: setPicking };
  const cur = tabs[space];
  const all = [...SPACES.play.map(t => ['play', ...t]), ...SPACES.feed.map(t => ['feed', ...t])];
  return html`<${ShellCtx.Provider} value=${sh}><div class="shell">
    ${all.map(([sp, id, , , C]) => html`<div class="tabpage" key=${sp + '.' + id} style=${!over && space === sp && cur === id ? '' : 'display:none'}><${NavStack} root=${html`<${C} />`} /></div>`)}
    <div class="tabpage" key="account" style=${over === 'account' ? '' : 'display:none'}><${NavStack} root=${html`<${AccountTab} close=${() => setOver(null)} />`} /></div>
    ${over === 'settings' && html`<div class="tabpage" key="settings"><${NavStack} root=${html`<${WebSettings} close=${() => setOver(null)} />`} /></div>`}
    ${!over && html`<nav class="tabs">${SPACES[space].map(([id, k, ic]) => html`<button class=${cur === id ? 'on' : ''} aria-current=${cur === id ? 'page' : undefined} onClick=${() => go(space, id)}><${Icon} name=${ic} size=${24} />${T(k)}</button>`)}</nav>`}
    <${ActionSheet} open=${picking} title=${T('space.pick')} onClose=${() => setPicking(false)}
      actions=${[{ label: (space === 'play' ? '✓ ' : '') + T('space.play.long'), onClick: () => go('play') }, { label: (space === 'feed' ? '✓ ' : '') + T('space.social.long'), onClick: () => go('feed') }]} />
  </div><//>`;
}
/* 왼쪽 위 설정 — 로그인했으면 계정 설정 전부, 아니면 언어만 */
function WebSettings({ close }) {
  const on = useAuth(); const [me, setMe] = useState(null);
  useEffect(() => { if (on && !DEMO) P.me().then(m => setMe(m.value || m)); }, [on]);
  if (on && me) return html`<${Settings} me=${me} done=${() => P.me().then(m => setMe(m.value || m))} close=${close} />`;
  return html`<${Page} title=${T('account.settings')} left=${html`<${NavButton} icon="xmark" label=${T('ui.close')} onClick=${close} />`}>
    <${Section} header=${T('lang.title')}><div class="row"><select class="textin grow" id="me-lang-guest" onChange=${async e => { await setLang(e.currentTarget.value || null); draw(); }}>
      <option value="">${T('lang.device')}</option>${LANGS.map(([c, n]) => html`<option value=${c}>${n}</option>`)}</select></div><//>
  <//>`;
}
function draw() { render(html`<${App} key=${document.documentElement.lang} />`, document.getElementById('app')); }
(async () => {
  ko = await (await fetch('i18n/ko.json')).json();
  await auth.init();
  await setLang(null);
  draw();
})();
