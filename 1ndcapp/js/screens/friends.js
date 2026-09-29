// 친구 · 전적 — 서로 수락한 친구끼리만 서로 전적을 본다(2026-09-29). 내 전적은 언제나
import { html, useState, useEffect } from '../../lib/preact-htm.js';
import { account } from '../account.js';
import { Icon } from '../icons.js';
import { Page, Section, Row, Labeled, Empty, Search, NavButton, Sheet, ActionSheet, RoleArt, cx } from '../ui.js';
import { useNav, Back } from '../nav.js';

export function FriendsView() {
  const nav = useNav();
  const [list, setList] = useState(undefined), [adding, setAdding] = useState(false), [, f] = useState(0);
  const load = () => account.friends().then(setList);
  useEffect(() => { load(); return account.subscribe(() => { f(x => x + 1); load(); }); }, []);
  const act = async (fn, id) => { await account.friendDo(fn, id); load(); };
  if (!account.user) return html`<${Page} title="친구" left=${html`<${Back} />`}><${Section}><${Row} tint onClick=${() => account.login()}>카카오로 로그인<//><//><//>`;
  const by = st => (list || []).filter(x => x.state === st);
  const btn = (t, fn, danger) => html`<button class=${cx('btn-s', danger && 'danger')} onClick=${e => { e.stopPropagation(); fn(); }}>${t}</button>`;
  return html`<${Page} title="친구" left=${html`<${Back} />`} right=${html`<${NavButton} icon="plus" label="친구 추가" onClick=${() => setAdding(true)} />`}>
    <${Section}><${Row} chevron onClick=${() => nav.push(html`<${StatsView} />`)}><${Icon} name="person" size=${20} /><span class="grow">내 전적</span><//><//>
    ${list === undefined ? html`<${Empty} title="불러오는 중…" />` : list === null ? html`<${Empty} icon="warn" title="친구 목록을 못 받았어요" text="투넬 회원으로 로그인했는지 확인해 주세요." />` : html`
      ${by('received').length > 0 && html`<${Section} header="받은 요청">${by('received').map(x => html`<div class="row"><span class="grow">${x.nick}</span>${btn('수락', () => act('friend_accept', x.member_id))}${btn('거절', () => act('friend_remove', x.member_id), true)}</div>`)}<//>`}
      <${Section} header=${`친구 ${by('friend').length}`}>${by('friend').length ? by('friend').map(x => html`<${Row} chevron onClick=${() => nav.push(html`<${StatsView} id=${x.member_id} nick=${x.nick} reload=${load} />`)}>${x.nick}<//>`)
        : html`<${Row} tint onClick=${() => setAdding(true)}>친구 추가<//>`}<//>
      ${by('sent').length > 0 && html`<${Section} header="보낸 요청">${by('sent').map(x => html`<div class="row"><span class="grow">${x.nick}</span><span class="sub">대기</span>${btn('취소', () => act('friend_remove', x.member_id), true)}</div>`)}<//>`}`}
    <${Sheet} open=${adding} onClose=${() => setAdding(false)}>${adding && html`<${AddFriend} list=${list || []} close=${() => { setAdding(false); load(); }} />`}<//>
  <//>`;
}

/** 친구 추가 — 투넬 회원에서 찾아 요청. 상대가 이미 나에게 요청했으면 바로 친구 */
function AddFriend({ list, close }) {
  const [rows, setRows] = useState(undefined), [q, setQ] = useState(''), [state, setState] = useState({});
  useEffect(() => { account.members().then(setRows); }, []);
  const known = Object.fromEntries(list.map(x => [x.member_id, x.state]));
  const shown = (rows || []).filter(r => !q || String(r.nick || '').toLowerCase().includes(q.toLowerCase()));
  const label = id => ({ friend: '친구', sent: '요청함', received: '수락하기' })[state[id] || known[id]] || '요청';
  const go = async r => { const s = state[r.member_id] || known[r.member_id]; if (s === 'friend' || s === 'sent') return;
    const res = await account.friendDo(s === 'received' ? 'friend_accept' : 'friend_request', r.member_id);
    if (res) setState(o => ({ ...o, [r.member_id]: res === 'friend' ? 'friend' : res === 'sent' ? 'sent' : o[r.member_id] })); };
  return html`<${Page} title="친구 추가" right=${html`<${NavButton} label="완료" bold onClick=${close} />`}>
    <${Search} value=${q} onInput=${setQ} placeholder="닉네임 검색" />
    ${rows === undefined ? html`<${Empty} title="명단 받는 중…" />` : rows === null ? html`<${Empty} icon="warn" title="명단을 못 받았어요" />`
      : html`<${Section}>${shown.map(r => { const l = label(r.member_id);
          return html`<div class="row"><span class="grow">${r.nick}</span><button class=${cx('btn-s')} disabled=${l === '친구' || l === '요청함'} onClick=${() => go(r)}>${l}</button></div>`; })}<//>`}
  <//>`;
}

/** 전적 — 판·승패·선악·많이 한 직업·최근 판. 친구면 맨 아래 «친구 끊기» */
export function StatsView({ id, nick, reload }) {
  const nav = useNav();
  const [s, setS] = useState(undefined), [ask, setAsk] = useState(false);
  useEffect(() => { account.stats(id).then(setS); }, [id]);
  const rate = s && (s.wins + s.losses) ? Math.round(s.wins * 100 / (s.wins + s.losses)) + '%' : '—';
  return html`<${Page} title=${id ? (nick || '전적') : '내 전적'} left=${html`<${Back} />`}>
    ${s === undefined ? html`<${Empty} title="불러오는 중…" />` : !s ? html`<${Empty} icon="warn" title="전적을 볼 수 없어요" text="서로 친구일 때만 보여요." />` : html`
      <${Section}>
        <div class="row"><${Labeled} label="판" value=${s.games} strong /></div>
        <div class="row"><${Labeled} label="승 · 패" value=${`${s.wins}승 ${s.losses}패 · ${rate}`} strong /></div>
        <div class="row"><${Labeled} label="선 · 악" value=${`선 ${s.good} · 악 ${s.evil}`} /></div>
      <//>
      ${s.roles.length > 0 && html`<${Section} header="많이 한 직업">${s.roles.map(r => html`<div class="row"><${RoleArt} r=${r.role} size=${28} /><span class="grow">${r.role}</span><span class="sub num">${r.n}판 · ${r.wins}승</span></div>`)}<//>`}
      ${s.recent.length > 0 && html`<${Section} header="최근 판">${s.recent.map(g => html`<div class="row"><div class="grow"><div>${g.role || '—'}</div><div class="sub">${String(g.at || '').slice(0, 10)} · ${g.mode || ''}</div></div>
        <span class=${g.won === true ? 'blue' : 'sec'}>${g.won === true ? '승' : g.won === false ? '패' : '—'}</span></div>`)}<//>`}
      ${!s.games && html`<${Empty} title="아직 올라온 판이 없어요" />`}`}
    ${id && html`<${Section}><${Row} danger onClick=${() => setAsk(true)}>친구 끊기<//><//>`}
    <${ActionSheet} open=${ask} title=${`${nick}님과 친구를 끊을까요?`} message="서로 전적이 안 보여요." onClose=${() => setAsk(false)}
      actions=${[{ label: '친구 끊기', role: 'destructive', onClick: async () => { await account.friendDo('friend_remove', id); reload && reload(); nav.pop(); } }]} />
  <//>`;
}
