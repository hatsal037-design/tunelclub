// S01 · 설정 — 진행(진동·진행 소리) · 화면(외관) · 백업(내보내기·가져오기) · 계정(연결 전)
import { html, useState, useRef } from '../../lib/preact-htm.js';
import { store } from '../store.js';
import { settings } from '../settings.js';
import { say } from '../narrator.js';
import { Page, Section, Row, Toggle, Segmented, Labeled, useRun } from '../ui.js';
import { Back } from '../nav.js';

export function SettingsView() {
  const [, force] = useState(0), rerender = () => force(x => x + 1);
  const [imported, setImported] = useState(false);
  const file = useRef(null), R = useRun();
  const set = (k, v) => { settings.set(k, v); rerender(); };
  const exportBackup = () => {
    const text = store.get('backup.export'); if (!text) return;
    const d = new Date(), stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = `dangsan-backup-${stamp}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
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
    <${Section} header="계정">
      <div class="row"><${Labeled} label="계정·회원 연결" value="연결 전" /></div>
      <div class="row"><${Labeled} label="완료 기록 동기화" value="연결 전" /></div>
    <//>
    ${R.alert}
  <//>`;
}
