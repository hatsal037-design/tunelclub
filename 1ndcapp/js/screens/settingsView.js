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
    ${account.user && html`<${ProfileSection} />`}
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

/* @아이디·이름 — 아이디는 찾고 가리키는 열쇠(30일에 한 번), 이름은 본명도 닉네임도 아닌 프로필 이름(친구에게만). 2026-10-05 햇살님 */
function ProfileSection() {
  const [h, setH] = useState(''), [n, setN] = useState(''), [next, setNext] = useState(null), [msg, setMsg] = useState(null);
  const load = async () => { const p = await account.plaza('my_profile'); if (!p) return; setH(p.handle || ''); setN(p.display_name || '');
    setNext(p.handle_next && new Date(p.handle_next) > new Date() ? String(p.handle_next).slice(0, 10) : null); };
  useEffect(() => { load(); }, []);
  const save = async (fn, args) => { const o = await account.plaza(fn, args); if (!o || !o.ok) setMsg((o && o.error) || '저장하지 못했어요.'); load(); };
  return html`<${Section} header="프로필" footer=${next ? '아이디는 ' + next + ' 뒤에 바꿀 수 있어요' : null}>
    <div class="row"><span>@</span><input id="pf-handle" class="textin grow" value=${h} placeholder="아이디" autocapitalize="off" autocomplete="off" spellcheck="false"
      onInput=${e => setH(e.currentTarget.value)} onKeyDown=${e => { if (e.key === 'Enter') save('set_handle', { p_handle: h }); }} onBlur=${() => h && save('set_handle', { p_handle: h })} /></div>
    <div class="row"><input id="pf-name" class="textin grow" value=${n} placeholder="이름" onInput=${e => setN(e.currentTarget.value)}
      onKeyDown=${e => { if (e.key === 'Enter') save('set_display_name', { p_name: n }); }} onBlur=${() => save('set_display_name', { p_name: n })} /></div>
    <${Alert} open=${!!msg} title=${msg} onClose=${() => setMsg(null)} />
  <//>`;
}
