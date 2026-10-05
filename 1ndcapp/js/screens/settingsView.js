// S01 · 설정 — 진행·화면·백업 / 계정(AccountView) 은 따로
import { html, useState, useRef } from '../../lib/preact-htm.js';
import { store } from '../store.js';
import { settings } from '../settings.js';
import { say, speak, VOICES } from '../narrator.js';
import { bgmSync, bgmStop, bgmVolume } from '../bgm.js';
import { Page, Section, Row, Toggle, Segmented, Labeled, useRun } from '../ui.js';
import { Back, useNav } from '../nav.js';
import { Icon } from '../icons.js';
import { FriendsView } from './friends.js';
import { account } from '../account.js';
import { useEffect } from '../../lib/preact-htm.js';
import { Alert } from '../ui.js';

/** 계정 — 투넬과 같은 카카오 로그인. 판이 끝나면 자동으로 올라가고, 밀린 판 올리기·서버에서 내려받기 */
function AccountSection() {
  const [, f] = useState(0), [msg, setMsg] = useState(null);
  useEffect(() => account.subscribe(() => f(x => x + 1)), []);
  if (!account.on) return html`<${Section}><div class="row"><${Labeled} label="서버" value="연결 안 됨" /></div><//>`;
  if (!account.user) return html`<${Section}>
    <${Row} tint onClick=${() => account.login()}>카카오로 로그인<//><//>`;
  const i = account.info || {}, bits = [i.title && '🏅 ' + i.title, i.founder_no && '초기 참여자 No.' + i.founder_no].filter(Boolean).join(' · ');
  return html`<${Section} footer=${`올라간 판 ${i.games ?? '?'} · 안 올라간 판 ${account.pending}`}>
    <div class="row"><div class="grow"><div>${account.nick() || '이름 없음'}</div><div class="sub">${bits || '투넬 계정으로 로그인됨'}</div></div><span class="sub">로그인</span></div>
    ${account.pending > 0 && html`<${Row} tint disabled=${account.busy} onClick=${async () => { const r = await account.sync(); setMsg('올림 ' + r.ok + '판' + (r.bad ? ' · 실패 ' + r.bad + '판' : '')); }}>${account.busy ? '올리는 중…' : '밀린 기록 올리기'}<//>`}
    <${Row} tint onClick=${async () => { const n = await account.pull(); setMsg(n === null ? '내려받지 못했어요. 로그인·연결을 확인해 주세요.' : n ? n + '판을 내려받았어요.' : '새로 내려받을 판이 없어요.'); }}>서버에서 내려받기<//>
    <${Row} danger onClick=${() => account.logout()}>로그아웃<//>
    <${Alert} open=${!!msg} title=${msg} onClose=${() => setMsg(null)} />
  <//>`;
}

export function SettingsView() {
  const [, force] = useState(0), rerender = () => force(x => x + 1);
  const [imported, setImported] = useState(false);
  const file = useRef(null), R = useRun();
  const set = (k, v) => { settings.set(k, v); rerender(); };
  const exportBackup = () => {
    const text = store.get('backup.export'); if (!text) return;
    const d = new Date(), stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = `1ndcapp-backup-${stamp}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const importBackup = async e => {
    const f = e.currentTarget.files[0]; e.currentTarget.value = ''; if (!f) return;
    const text = await f.text();
    R.run('backup.import', { json: text }, () => setImported(true));
  };
  return html`<${Page} title="설정" left=${html`<${Back} />`}>
    <${Section} header="진행">
      <${Toggle} checked=${settings.get('haptics')} onChange=${v => set('haptics', v)}>진동 피드백<//>
      <${Toggle} checked=${settings.get('bgm')} onChange=${v => { set('bgm', v); if (v) bgmSync(store.get('bgm.slot')); else bgmStop(); }}>배경 음악<//>
      ${settings.get('bgm') && html`<div class="row"><input type="range" min="0" max="1" step="0.05" style="width:100%" value=${settings.get('bgmVolume') ?? 0.5} onInput=${e => { set('bgmVolume', +e.currentTarget.value); bgmVolume(); }} aria-label="배경 음악 크기" /></div>`}
      <${Toggle} checked=${settings.get('sound')} onChange=${v => set('sound', v)}>진행 소리<//>
      <${Toggle} checked=${!!store.get('director.enabled')} onChange=${async v => { await store.dispatch('director.setEnabled', { on: v }); rerender(); }}>판세 보정<//>
      ${settings.get('sound') && html`<div class="row"><span class="grow">진행 목소리</span><select class="textin" style="width:auto" value=${settings.get('voice') || 'mujin'} onChange=${e => set('voice', e.currentTarget.value)}>${VOICES.map(([id, nm]) => html`<option value=${id}>${nm}</option>`)}</select></div>
        <${Row} tint onClick=${() => speak('날이 밝았습니다. 마을 사람들이 하나둘 눈을 뜹니다. 간밤에 한 사람이 돌아오지 못했습니다. 이제 이야기를 나눠 주세요. 누가 마을을 해치고 있을까요.', [{ clip: 'dangsan_morning_one_0' }])}>들어 보기<//>`}
    <//>
    ${settings.get('bgm') && html`<div class="foot" style="margin:-8px 16px 12px">배경 음악: MiniMax-Music3 로 만들었어요.</div>`}
    <${Section} header="화면">
      <div class="row"><div class="rc">외관</div><div style="width:200px"><${Segmented} value=${settings.get('appearance')} onChange=${v => set('appearance', v)}
        options=${[['system', '시스템'], ['light', '라이트'], ['dark', '다크']]} /></div></div>
    <//>
    <${Section} header="백업" footer=${imported ? '가져왔어요 — 없던 기록만 더했어요.' : null}>
      <${Row} tint onClick=${exportBackup}>백업 내보내기<//>
      <${Row} tint onClick=${() => file.current.click()}>백업 가져오기<//>
      <input ref=${file} type="file" accept="application/json,.json" hidden onChange=${importBackup} />
    <//>
    ${R.alert}
  <//>`;
}

/* 계정(👤) — 설정(⚙)과 나눔(2026-10-05 햇살님 «들어가면 항목이 같아, 나누자» · 이름 «계정»). 나·전적·친구·동기화 */
export function AccountView() {
  const nav = useNav(), [, f] = useState(0);
  useEffect(() => account.subscribe(() => f(x => x + 1)), []);
  return html`<${Page} title="계정" left=${html`<${Back} />`}>
    <${AccountSection} />
    ${account.user && html`<${ProfileCard} />`}
    ${account.user && html`<${Section}><${Row} chevron onClick=${() => nav.push(html`<${FriendsView} />`)}><${Icon} name="person2" size=${20} /><span class="grow">친구 · 내 전적</span><//><//>`}
    ${account.user && html`<${Section}><${Row} chevron onClick=${() => nav.push(html`<${SeatedView} />`)}><${Icon} name="listBullet" size=${20} /><span class="grow">내가 들어간 판</span><//><//>`}
  <//>`;
}

/* 내가 들어간 판 — 잘못 들어간 판(그 판 안 했는데 앉혀 있음)은 정정 요청 → 진행자 수락·거절(2026-10-05 햇살님, 서버 0180).
   결과·역할은 싣지 않는다 — 진 판만 빼 달라는 재료가 되지 않게 */
function SeatedView() {
  const [rows, setRows] = useState(undefined), [msg, setMsg] = useState(null);
  const load = async () => setRows(await account.plaza('my_seated', { p_limit: 20 }) || []);
  useEffect(() => { load(); }, []);
  const ask = async g => { const o = await account.plaza('fix_request', { p_game: g }); if (!o || !o.ok) setMsg((o && o.error) || '보내지 못했어요.'); load(); };
  const tag = { pending: '요청함', accepted: '빠짐', rejected: '거절됨' };
  return html`<${Page} title="내가 들어간 판" left=${html`<${Back} />`}>
    <${Section}>${rows === undefined ? html`<div class="row sub">불러오는 중…</div>` : !rows.length ? html`<div class="row sub">아직 들어간 판이 없어요</div>`
      : rows.map(r => html`<div class="row"><div class="grow"><div>${r.host}님 · ${r.mode || ''}</div><div class="sub">${String(r.at || '').slice(0, 10)}</div></div>
        ${r.request ? html`<span class="sub">${tag[r.request]}</span>` : html`<button class="btn-s" onClick=${() => ask(r.game)}>정정 요청</button>`}</div>`)}<//>
    <${Alert} open=${!!msg} title=${msg} onClose=${() => setMsg(null)} />
  <//>`;
}

/* 계정 맨 위 프로필 카드 + 프로필 수정 (2026-10-06 햇살님 «프로필 수정 기능, 허용 글자·중복 확인, 닉네임 한글만 제한 없애자») — 폰 앱 ProfileCard·ProfileEditView 와 같다 */
export const nickProblem = raw => {   // 서버(0180 set_nickname)와 같은 규칙을 저장 전에 미리 — 판정은 서버
  const v = String(raw || '').trim().normalize('NFC');
  if (!v || [...v].length > 12) return '닉네임은 1~12자예요';
  if (/[\u0000-\u001f\u007f]/.test(v)) return '쓸 수 없는 글자가 있어요';
  if (/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}]/u.test(v)) return '이모지·그림 문자는 쓸 수 없어요';
  if (/[!"#$%&()*+,/:;<=>?@[\\\]^`{|}~]/.test(v)) return "기호는 . _ - ' · 만 쓸 수 있어요";
  const flat = v.toLowerCase().replace(/\s/g, '');
  if (['운영자', '관리자', '진행자', '운영진', 'admin', 'administrator', 'official', 'support', 'moderator', 'tunel', '투넬', '첫밤사망자클럽', '1ndclub', '1ndcapp', '당산나무'].some(w => flat.includes(w))) return '운영·진행자로 보이는 이름은 쓸 수 없어요';
  return null;
};
function ProfileCard() {
  const nav = useNav(), [p, setP] = useState({});
  const load = async () => setP(await account.plaza('my_profile') || {});
  useEffect(() => { load(); }, []);
  return html`<${Section}>
    <div class="row" style="flex-direction:column;align-items:flex-start;gap:2px"><div style="font-size:20px;font-weight:600">${p.nick || account.nick()}</div>
      ${p.handle ? html`<div class="sub">@${p.handle}</div>` : html`<div class="orange">아이디를 정해 주세요</div>`}${p.display_name && html`<div class="sub">${p.display_name}</div>`}</div>
    <${Row} chevron onClick=${() => nav.push(html`<${ProfileEdit} profile=${p} done=${load} />`)}>프로필 수정<//>
  <//>`;
}
function ProfileEdit({ profile, done }) {
  const nav = useNav();
  const [h, setH] = useState(profile.handle || ''), [n, setN] = useState(profile.nick || account.nick()), [nm, setNm] = useState(profile.display_name || '');
  const [hn, setHn] = useState(null), [err, setErr] = useState({}), [saving, setSaving] = useState(false);
  useEffect(() => { setErr(e => ({ ...e, handle: null })); const v = h.trim().toLowerCase(); if (!v || v === (profile.handle || '')) { setHn(null); return; }
    const t = setTimeout(async () => { const r = await account.plaza('handle_check', { p_handle: v }); setHn(r ? { ok: r.ok, text: r.ok ? '쓸 수 있어요' : r.reason } : { ok: false, text: '확인하지 못했어요' }); }, 400);
    return () => clearTimeout(t); }, [h]);
  const nickNote = n === (profile.nick || '') ? null : nickProblem(n);
  const [ns, setNs] = useState(null);   // 서버 확인 — 겹침·한 달 규칙
  useEffect(() => { setErr(e => ({ ...e, nick: null })); if (n === (profile.nick || '') || nickProblem(n)) { setNs(null); return; }
    const t = setTimeout(async () => { const r = await account.plaza('nick_check', { p_nick: n }); setNs(r ? { ok: r.ok, text: r.ok ? '쓸 수 있어요' : r.reason } : { ok: false, text: '확인하지 못했어요' }); }, 400);
    return () => clearTimeout(t); }, [n]);
  const note = (ok, t) => html`<div class="row sub" style=${'color:' + (ok ? 'var(--green)' : 'var(--red)')}>${ok ? '✓' : '!'} ${t}</div>`;
  const save = async () => { setSaving(true); const e = {};
    if (h && h.toLowerCase() !== (profile.handle || '')) { const r = await account.plaza('set_handle', { p_handle: h }); if (!r || !r.ok) e.handle = (r && r.error) || '저장하지 못했어요'; }
    if (n !== (profile.nick || '')) { const r = await account.plaza('set_nickname', { p_nick: n }); if (!r || !r.ok) e.nick = (r && r.error) || '저장하지 못했어요'; }
    if (nm !== (profile.display_name || '')) { const r = await account.plaza('set_display_name', { p_name: nm }); if (!r || !r.ok) e.name = (r && r.error) || '저장하지 못했어요'; }
    setSaving(false); setErr(e); if (!Object.keys(e).length) { await account.load(); done && done(); nav.pop(); } };
  return html`<${Page} title="프로필 수정" left=${html`<${Back} />`} right=${html`<button class="nbtn bold" disabled=${saving || !!nickNote || (hn && !hn.ok) || (ns && !ns.ok)} onClick=${save}>${saving ? '저장 중…' : '저장'}</button>`}>
    <${Section} header="아이디" footer="영문 소문자·숫자·밑줄·점, 3~20자 · 30일에 한 번 바꿀 수 있어요">
      <div class="row"><span class="sub">@</span><input id="pe-handle" class="textin grow" value=${h} placeholder="아이디" autocapitalize="off" autocomplete="off" spellcheck="false" onInput=${e => setH(e.currentTarget.value)} /></div>
      ${err.handle ? note(false, err.handle) : hn && note(hn.ok, hn.text)}<//>
    <${Section} header="닉네임" footer=${'게임에서 보이는 이름 · 1~12자 · 다른 사람과 겹칠 수 없어요 · 한 달에 한 번 바꿀 수 있어요' + (profile.nick_next ? ' · ' + String(profile.nick_next).slice(0, 10) + ' 뒤에' : '')}>
      <div class="row"><input id="pe-nick" class="textin grow" value=${n} placeholder="닉네임" onInput=${e => setN(e.currentTarget.value)} /></div>
      ${(err.nick || nickNote) ? note(false, err.nick || nickNote) : ns && note(ns.ok, ns.text)}<//>
    <${Section} header="이름" footer="본명이 아니어도 돼요 · 친구에게만 보여요">
      <div class="row"><input id="pe-name" class="textin grow" value=${nm} placeholder="이름" onInput=${e => setNm(e.currentTarget.value)} /></div>
      ${err.name && note(false, err.name)}<//>
  <//>`;
}
