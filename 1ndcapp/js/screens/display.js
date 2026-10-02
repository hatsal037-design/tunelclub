// 개발용 화면 연결 진입. 서버 구현 전 외부 연결/QR 생성/계정 정보 전송 없음.
import { html } from '../../lib/preact-htm.js';
import { Page, Section, Row, LargeTitle } from '../ui.js';
import { Icon } from '../icons.js';

export function DisplayConnectionView() {
  return html`<${Page} title="화면 연결">
    <${LargeTitle}>화면 연결<//>
    <${Section}>
      <div style="padding:24px;text-align:center">
        <${Icon} name="display" size=${56} />
        <h2>함께 볼 화면을 연결해요</h2>
        <p class="sub">TV나 컴퓨터에서 화면 주소를 열고, 나타난 QR을 찍어 주세요.</p>
      </div>
      <${Row}>연결 안 됨<//>
    <//>
    <${Section} footer="서버 연결을 준비 중입니다. 아직 주소 공유와 QR 스캔을 사용할 수 없습니다.">
      <${Row}><span class="sub">화면 주소 공유</span><//>
      <${Row}><span class="sub">QR 스캔</span><//>
    <//>
    <${Section} footer="개발용 화면 · 실제 연결 기능은 아직 없습니다.">
      <${Row}>연결 후 12시간 동안 사용할 수 있어요.<//>
    <//>
  <//>`;
}
