// T01 · 오늘 — 큰 행동 하나(homeState 결과에 따라), 바로 가기 두 행. 오른쪽 위 설정
import { html } from '../../lib/preact-htm.js';
import { store } from '../store.js';
import { Icon } from '../icons.js';
import { Page, Section, Row, Primary, NavButton, LargeTitle } from '../ui.js';
import { useNav } from '../nav.js';
import { SettingsView } from './settingsView.js';
import { RecordsView } from './records.js';

export function TodayView({ openSpace }) {
  const nav = useNav(), h = store.home;
  const step = h.prepStep === 'handoff' ? 'handoff' : h.prepStep === 'people' ? 'people' : 'seats';
  const hero = {
    newPreparation: ['plus', '새 판을 준비해 볼까요?', '사람을 모으고 자리를 정하면\n다음은 차근차근 안내할게요.', '새 판 준비', { prep: 'people' }],
    resumePreparation: ['listNumber', '준비하던 판이 있어요', h.summary || '', '준비 계속', { prep: step }],
    resumeGame: ['moon', '진행 중인 판이 있어요', h.summary || '', '이어 하기', { game: true }],
  }[h.destination] || [];
  const go = async () => {
    if (h.destination === 'newPreparation') { await store.dispatch('preparation.enter', { practice: false }); }   // 새 판은 실전
    openSpace(hero[4]);
  };
  const practice = async () => { const r = await store.dispatch('preparation.enter', { practice: true }); if (r.ok) openSpace({ prep: 'people' }); };
  return html`<${Page} title="" right=${html`<${NavButton} icon="personCircle" label="계정과 설정" onClick=${() => nav.push(html`<${SettingsView} />`)} />`}>
    <${LargeTitle}>오늘<//>
    <${Section} footer=${h.ruleFamily + (h.modeName ? ' · ' + h.modeName : '')}>
      <div class="hero">
        <span class="sym"><${Icon} name=${hero[0]} size=${24} /></span>
        <div><div class="title2">${hero[1]}</div>${hero[2] && html`<p>${hero[2]}</p>`}</div>
        <${Primary} title=${hero[3]} onClick=${go} />
      </div>
    <//>
    <${Section} header="바로 가기">
      <${Row} onClick=${practice} disabled=${h.destination === 'resumeGame'}>
        <${Shortcut} icon="play" title="연습판" text=${h.destination === 'resumeGame' ? '진행 중인 판을 먼저 끝내요' : '기록 없이 흐름을 익혀요'} />
      <//>
      <${Row} chevron onClick=${() => nav.push(html`<${RecordsView} embedded />`)}>
        <${Shortcut} icon="clock" title="최근 기록" text=${h.hasRecords ? '지난 판을 다시 살펴봐요' : '아직 완료한 판이 없어요'} />
      <//>
    <//>
  <//>`;
}
const Shortcut = ({ icon, title, text }) => html`<div class="hstack shortcut" style="gap:12px;padding:4px 0">
  <span class="sym"><${Icon} name=${icon} size=${18} /></span><div><div class="shortcut-t">${title}</div><div class="sub">${text}</div></div></div>`;
