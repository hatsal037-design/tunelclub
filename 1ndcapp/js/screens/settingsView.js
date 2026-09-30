// S01 · 설정 — 진행(진동·진행 소리) · 화면(외관) · 백업(내보내기·가져오기) · 계정(연결 전)
import { html, useState, useRef } from '../../lib/preact-htm.js';
import { store } from '../store.js';
import { settings } from '../settings.js';
import { say } from '../narrator.js';
import { Page, Section, Row, Toggle, Segmented, Labeled, useRun } from '../ui.js';
import { Back } from '../nav.js';
import { account } from '../account.js';
import { useEffect } from '../../lib/preact-htm.js';
import { Alert } from '../ui.js';

/** 계정 — 투넬과 같은 카카오 로그인. 판이 끝나면 자동으로 올라가고, 밀린 판 올리기·서버에서 내려받기 */
function AccountSection() {
  const [, f] = useState(0), [msg, setMsg] = useState(null);
  useEffect(() => account.subscribe(() => f(x => x + 1)), []);
  if (!account.on) return html`<${Section} header="투넬 계정"><div class="row"><${Labeled} label="서버" value="연결 안 됨" /></div><//>`;
  if (!account.user) return html`<${Section} header="투넬 계정">
    <${Row} tint onClick=${() => account.login()}>카카오로 로그인<//><//>`;
  const i = account.info || {}, bits = [i.title && '🏅 ' + i.title, i.founder_no && '초기 참여자 No.' + i.founder_no].filter(Boolean).join(' · ');
  return html`<${Section} header="투넬 계정" footer=${`올라간 판 ${i.games ?? '?'} · 안 올라간 판 ${account.pending}`}>
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
      <${Toggle} checked=${settings.get('sound')} onChange=${v => set('sound', v)}>진행 소리<//>
      <${Toggle} checked=${!!store.get('director.enabled')} onChange=${async v => { await store.dispatch('director.setEnabled', { on: v }); rerender(); }}>판세 보정<//>
      ${settings.get('sound') && html`<${Row} tint onClick=${() => say('간밤에 한 사람이 돌아오지 못했습니다. 이제 이야기를 나눠 주세요.')}>들어 보기<//>`}
    <//>
    <${Section} header="화면">
      <div class="row"><div class="rc">외관</div><div style="width:200px"><${Segmented} value=${settings.get('appearance')} onChange=${v => set('appearance', v)}
        options=${[['system', '시스템'], ['light', '라이트'], ['dark', '다크']]} /></div></div>
    <//>
    <${Section} header="백업" footer=${imported ? '가져왔어요 — 없던 기록만 더했어요.' : null}>
      <${Row} tint onClick=${exportBackup}>백업 내보내기<//>
      <${Row} tint onClick=${() => file.current.click()}>백업 가져오기<//>
      <input ref=${file} type="file" accept="application/json,.json" hidden onChange=${importBackup} />
    <//>
    <${AccountSection} />
    ${R.alert}
  <//>`;
}
