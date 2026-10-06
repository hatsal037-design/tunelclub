/* 참가자 웹 tunel.kr/1ndcapp/me/ — 참가만 하는 가벼운 사람용(2026-10-06 단계 8). 앱 참가 공간(ios/1NDCAPP/Screens/Play)을 떼어 온 판.
   서버는 공통 참가자 모듈(core/participant.js)로만 부른다. 진행 코어(1.5MB)는 올리지 않는다 — 자료는 library/(빌드 때 뽑은 JSON).
   결은 시안 v2(iOS 기본 부품) — 웹 진행 화면과 같은 app.css·ui.js 부품. 광고 칸은 자리만(애드센스 연결 뒤 채움). */
import { html, render, useState, useEffect } from '../lib/preact-htm.js';
import { Icon } from '../js/icons.js';
import { NavStack, useNav, Back } from '../js/nav.js';
import { Page, LargeTitle, Section, Row, RowLabel, Labeled, Primary, Segmented, Toggle, Search, RoleArt, ActionSheet, Alert, Empty, NavButton } from '../js/ui.js';

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
  const [joined, setJoined] = useState([]), [people, setPeople] = useState([]), [code, setCode] = useState(''), [msg, setMsg] = useState(null);
  const load = async () => { if (!on || DEMO) return; const j = rows(await P.joined()); setJoined(j); setPeople(j[0] ? rows(await P.plazaPeople(j[0].plaza)) : []); };
  const checkin = async c => { const r = await P.checkin(c); setMsg(msgOf(r) || T('plaza.entered', { host: r.host || '', place: T('place.plaza') })); await load(); };
  useEffect(() => { load(); }, [on]);
  useEffect(() => { const c = window.Participant.codeFrom(location.href); if (c && on && !DEMO) { history.replaceState(null, '', location.pathname); checkin(c); } }, [on]);
  return html`<${Page} right=${html`<${NavButton} icon="bell" label=${T('notice.title')} onClick=${() => nav.push(html`<${Notices} />`)} />`}>
    <${LargeTitle}>${T('tab.plaza')}<//>
    ${!on ? html`<${LoginRows} />` : html`
      ${!joined.length && html`<${Section}><${Row}><span class="sec">${T('empty.plaza')}</span><//><//>`}
      ${joined.map(j => html`<${Section} header=${T('plaza.joined')}>
        <${Row}><${Icon} name="house" size=${22} /><${RowLabel} title=${T('plaza.host_place', { host: j.host, place: T('place.plaza') })} text=${T('plaza.until', { t: (j.ends_at || '').slice(0, 16).replace('T', ' ') })} /><//>
        ${people.length > 0 && html`<${Row} chevron onClick=${() => nav.push(html`<${PeopleList} title=${T('plaza.people')} load=${async () => rows(await P.plazaPeople(j.plaza))} />`)}>
          <span style="display:flex;gap:4px">${people.slice(0, 5).map(r => html`<${Avatar} r=${r} size=${28} />`)}</span><span class="sec">${T('plaza.count', { n: people.length })}</span><//>`}
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
  return html`<${Page}>
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

/* ── 사람 ── */
function PeopleTab() {
  const on = useAuth(), nav = useNav();
  const [me, setMe] = useState({}), [which, setWhich] = useState('following'), [list, setList] = useState([]), [q, setQ] = useState(''), [found, setFound] = useState([]);
  useEffect(() => { if (!on || DEMO) return; P.me().then(m => { const v = m.value || m; setMe(v); if (v.handle) P[which](v.handle).then(r => setList(rows(r))); }); }, [on, which]);
  useEffect(() => { const t = setTimeout(async () => setFound(rows(await P.search(q))), 300); return () => clearTimeout(t); }, [q]);
  const open = r => nav.push(html`<${Profile} handle=${r.handle} />`);
  useEffect(() => { const u = new URLSearchParams(location.search).get('u'); if (u && on) { history.replaceState(null, '', location.pathname); open({ handle: u }); } }, [on]);   /* 프로필 QR(…/me/?u=아이디) */
  return html`<${Page}>
    <${LargeTitle}>${T('tab.people')}<//>
    ${!on ? html`<${LoginRows} />` : html`
      <div style="padding:0 16px 12px"><${Search} value=${q} onInput=${setQ} placeholder=${T('people.search')} /></div>
      ${q ? html`<${Section}>${found.length ? found.map(r => html`<${PersonRow} r=${r} onClick=${() => open(r)} />`) : html`<${Row}><span class="sec">${T('empty.search')}</span><//>`}<//>` : html`
        <div style="padding:0 16px 12px"><${Segmented} options=${[['following', `${T('profile.following')} ${me.following || 0}`], ['followers', `${T('profile.followers')} ${me.followers || 0}`]]} value=${which} onChange=${setWhich} /></div>
        <${Section}><${Row} chevron onClick=${() => nav.push(html`<${Requests} />`)}><${Labeled} label=${T('requests.title')} value=${me.requests || 0} /><//><//>
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
  const W = { followed: T('notice.followed'), follow_accepted: T('notice.follow_accepted'), fix_accepted: T('notice.fix_accepted'), fix_rejected: T('notice.fix_rejected'), amend: T('notice.amend'), photo_hidden: T('notice.photo_hidden') };
  const [l, setL] = useState(); useEffect(() => { P.notices().then(r => { setL(rows(r)); P.readNotices(); }); }, []);
  return html`<${Page} title=${T('notice.title')} left=${html`<${Back} />`}><${Loading} v=${l}>${l && html`<${Section}>${l.length ? l.map(n => html`<${Row}><${Avatar} r=${n.from || {}} size=${32} /><${RowLabel} title=${(n.from?.nick || '') + (W[n.kind] || '')} text=${(n.at || '').slice(0, 10)} /><//>`) : html`<${Row}><span class="sec">${T('empty.notices')}</span><//>`}<//>`}<//><//>`;
}
function Profile({ handle }) {
  const nav = useNav(); const [p, setP] = useState(), [menu, setMenu] = useState(false), [msg, setMsg] = useState(null);
  const load = async () => setP(await P.profile(handle));
  useEffect(() => { load(); }, [handle]);
  const act = async f => { await f(); load(); };
  const follow = !p ? null : p.follow === 'accepted' ? [T('follow.following'), () => act(() => P.unfollow(handle)), 'bsec'] : p.follow === 'requested' ? [T('requests.title'), () => act(() => P.unfollow(handle)), 'bsec'] : [p.private && !p.open ? T('follow.request') : T('follow.do'), () => act(() => P.follow(handle)), 'bprim'];
  return html`<${Page} title=${T('profile.title')} left=${html`<${Back} />`} right=${p && p.ok && !p.me && html`<${NavButton} icon="ellipsisCircle" label=${T('ui.more')} onClick=${() => setMenu(true)} />`}>
    <${Loading} v=${p}>${p && (!p.ok ? html`<${Empty} icon="person" title=${msgOf(p)} />` : html`
      <${Section}><div class="head"><${Avatar} r=${p} size=${60} /><div><div style="font-size:20px;font-weight:600">${p.nick}</div><div class="sec">@${handle}</div>${p.name && html`<div>${p.name}</div>`}</div></div>
        ${p.bio && html`<${Row}><span>${p.bio}</span><//>`}
        <${Row}><span>${T('profile.followers')} <b>${p.followers}</b></span><span style="margin-left:16px">${T('profile.following')} <b>${p.following}</b></span><//>
        ${!p.me && html`<div style="padding:8px 16px 12px"><button class=${follow[2] + ' grow'} style="width:100%" onClick=${follow[1]}>${follow[0]}</button></div>`}<//>
      ${p.open && p.stats ? html`<${Section}><${Stats} s=${p.stats} /><//>${p.stats.hosted > 0 && html`<${Section}><${Labeled} label=${T('space.host')} value=${T('profile.hosted', { n: p.stats.hosted })} /><//>`}<${Ad} />`
        : html`<${Section}><div style="text-align:center;padding:20px"><${Icon} name="eyeSlash" size=${26} /><div style="font-weight:600;margin-top:6px">${T('profile.private')}</div></div><//>`}`)}<//>
    <${ActionSheet} open=${menu} title=${'@' + handle} onClose=${() => setMenu(false)} actions=${[
      ...(p && p.follows_me ? [{ label: T('follow.remove'), onClick: () => act(() => P.removeFollower(handle)) }] : []),
      ...(p && p.photo ? [{ label: T('avatar.report'), onClick: async () => { await P.photoReport(handle); setMsg(T('avatar.reported')); } }] : []),
      { label: T('block.do'), role: 'destructive', onClick: () => act(() => P.block(handle)) }]} />
    <${Alert} open=${!!msg} title=${msg} onClose=${() => setMsg(null)} />
  <//>`;
}

/* ── 계정 ── */
function AccountTab() {
  const on = useAuth(), nav = useNav();
  const [me, setMe] = useState({}), [st, setSt] = useState({});
  const load = async () => { if (!on || DEMO) return; const m = await P.me(); const v = m.value || m; setMe(v); setSt(await P.status()); setLang(v.lang); if ((v.needs || []).length) { nav.push(html`<${Signup} me=${v} done=${load} />`); window.dispatchEvent(new Event('me-fill')); } };   // 빠진 칸(0250) — 계정 탭으로 넘겨 채우게
  useEffect(() => { load(); }, [on]);
  return html`<${Page}>
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
    ${g.request ? html`<span class="sec">${S[g.request]}</span>` : html`<button class="blink" onClick=${async () => { await P.fixRequest(g.game); load(); }}>${T('fix.request')}</button>`}<//>`) : html`<${Row}><span class="sec">${T('empty.games')}</span><//>`}<//>`}<//><//>`;
}
function useNameCheck(kind, value, orig) {
  const [n, setN] = useState(null);
  useEffect(() => { if (!value || value === orig) { setN(null); return; } const p = window.Participant.problem(kind, value); if (p) { setN([false, T('err.' + p)]); return; }
    const t = setTimeout(async () => { const r = await P.nameCheck(kind, value); setN(r.ok ? [true, T('ok.available')] : [false, msgOf(r)]); }, 400); return () => clearTimeout(t); }, [value]);
  return n;
}
const Note = ({ n }) => n && html`<div class=${n[0] ? 'green' : 'red'} style="font-size:13px;padding:0 16px 8px">${n[1]}</div>`;
function Signup({ me, done }) {
  const need = k => (me.needs || ['nick', 'handle', 'agree']).includes(k);
  const nav = useNav(); const [nick, setNick] = useState(me.nick || ''), [handle, setHandle] = useState(me.handle || ''), [agree, setAgree] = useState(false), [busy, setBusy] = useState(false), [fail, setFail] = useState({});
  const nn = useNameCheck('nick', nick, me.nick), hn = useNameCheck('handle', handle, me.handle || '');
  const ok = (agree || !need('agree')) && handle && nick && !(nn && !nn[0]) && !(hn && !hn[0]);
  const save = async () => { setBusy(true); const ch = {}; if (need('agree')) ch.agreed = true; if (handle !== (me.handle || '')) ch.handle = handle; if (nick !== me.nick) ch.nick = nick; const r = await P.setProfile(ch); setBusy(false); if (r.ok) { nav.pop(); done(); } else setFail(r.failed || {}); };
  return html`<${Page} title=${T('signup.title')} right=${html`<${NavButton} label=${T('signup.go')} bold disabled=${!ok || busy} onClick=${save} />`}>
    ${need('nick') && html`<${Section} header=${T('profile.nick')}><div class="row"><input class="textin grow" id="su-nick" value=${nick} onInput=${e => setNick(e.currentTarget.value)} /></div><//><${Note} n=${fail.nick ? [false, T('err.' + fail.nick)] : nn} />`}
    ${need('handle') && html`<${Section} header=${T('profile.handle')}><div class="row"><span class="sec">@</span><input class="textin grow" id="su-handle" value=${handle} autocapitalize="off" autocomplete="off" spellcheck="false" onInput=${e => setHandle(e.currentTarget.value)} /></div><//><${Note} n=${fail.handle ? [false, T('err.' + fail.handle)] : hn} />`}
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
function Settings({ me, done }) {
  const nav = useNav(); const [priv, setPriv] = useState(me.private !== false), [lang, setL] = useState(me.lang || ''), [ask, setAsk] = useState(false);
  return html`<${Page} title=${T('account.settings')} left=${html`<${Back} />`}>
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
  DATA = l === 'ko' ? null : await fetch(`i18n/data/${l}.json`).then(r => r.ok ? r.json() : null).catch(() => null);
  document.documentElement.lang = l;
}
function App() {
  const [tab, setTab] = useState(() => { const q = location.search; if (/[?&]u=/.test(q)) return 'people'; if (/[?&]j=/.test(q)) return 'plaza'; try { return localStorage.getItem('me.tab') || 'plaza'; } catch { return 'plaza'; } });
  const go = t => { setTab(t); try { localStorage.setItem('me.tab', t); } catch {} };
  useEffect(() => { const f = () => setTab('account'); window.addEventListener('me-fill', f); return () => window.removeEventListener('me-fill', f); }, []);
  const tabs = [['plaza', 'tab.plaza', 'house', PlazaTab], ['library', 'tab.library', 'books', LibraryTab], ['people', 'tab.people', 'person', PeopleTab], ['account', 'tab.account', 'personCircle', AccountTab]];
  return html`<div class="shell">
    ${tabs.map(([id, , , C]) => html`<div class="tabpage" key=${id} style=${tab === id ? '' : 'display:none'}><${NavStack} root=${html`<${C} />`} /></div>`)}
    <nav class="tabs">${tabs.map(([id, k, ic]) => html`<button class=${tab === id ? 'on' : ''} aria-current=${tab === id ? 'page' : undefined} onClick=${() => go(id)}><${Icon} name=${ic} size=${24} />${T(k)}</button>`)}</nav>
  </div>`;
}
function draw() { render(html`<${App} key=${document.documentElement.lang} />`, document.getElementById('app')); }
(async () => {
  ko = await (await fetch('i18n/ko.json')).json();
  await auth.init();
  await setLang(null);
  draw();
})();
