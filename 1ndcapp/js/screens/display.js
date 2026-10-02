// D01 · 화면 연결 — TV·컴퓨터에 뜬 코드를 넣어(또는 QR 로 들어와) 연결하고, 연결된 화면을 끊는다. 공개 정보 전송은 screenlink.js 가 알아서
import { html, useState, useEffect } from '../../lib/preact-htm.js';
import { Page, Section, Row, LargeTitle, Primary, ActionSheet } from '../ui.js';
import { account } from '../account.js';
import { screens, fmtCode } from '../screenlink.js';

const SCREEN_URL = 'tunel.kr/1ndcapp/screen/';
const hm = t => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

export function DisplayConnectionView() {
  const [, re] = useState(0);
  useEffect(() => { const a = screens.subscribe(() => re(x => x + 1)), b = account.subscribe(() => re(x => x + 1)); screens.load(); return () => { a(); b(); }; }, []);
  const [code, setCode] = useState(''), [ask, setAsk] = useState(null), [copied, setCopied] = useState(false);
  useEffect(() => { if (screens.pendingCode) setCode(fmtCode(screens.pendingCode)); }, [screens.pendingCode]);   // QR 로 들어온 코드 — 채워만 두고 승인은 직접 누른다
  const waiting = screens.active().some(l => !l.seen_at);
  useEffect(() => { if (!waiting) return; const t = setInterval(() => screens.load(), 4000); return () => clearInterval(t); }, [waiting]);   // 화면이 받았는지 — 받을 때까지만 가끔 다시 묻는다
  const links = screens.active(), full = code.replace(/ /g, '').length === 8;
  const connect = async () => { if (await screens.approve(code)) setCode(''); };
  const share = async () => { const url = 'https://' + SCREEN_URL;
    try { if (navigator.share) return await navigator.share({ title: '첫밤 사망자 클럽 큰 화면', url }); await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {} };
  return html`<${Page} title="">
    <${LargeTitle}>화면 연결<//>
    ${!account.user ? html`<${Section} footer="큰 화면 연결은 로그인한 진행자만 할 수 있어요.">
        <${Row} tint onClick=${() => account.login()}>카카오로 로그인<//><//>`
    : html`
      ${links.length > 0 && html`<${Section} header="연결된 화면" footer="12시간 뒤 저절로 끊겨요.">
        ${links.map((l, i) => html`<${Row} onClick=${() => setAsk(l)}><div class="grow"><div>화면 ${links.length - i}</div>
          <div class="sub">${l.seen_at ? '화면이 연결을 확인했어요' : '화면 응답을 기다리는 중'} · ${hm(l.expires_at)}까지</div></div><span class="red">끊기</span><//>`)}<//>`}
      <${Section} header=${links.length ? '화면 더 연결' : '코드로 연결'} footer=${screens.error || 'TV에 뜬 QR을 폰 카메라로 찍어도 돼요.'}>
        <div class="row"><input class="textin" style="font:600 22px ui-monospace,Menlo,monospace;letter-spacing:.12em;text-transform:uppercase" inputmode="text" autocapitalize="characters" autocomplete="off" spellcheck="false"
          aria-label="화면에 뜬 연결 코드" placeholder="ABCD EFGH" value=${code} onInput=${e => { screens.error = ''; screens.forget(); setCode(fmtCode(e.currentTarget.value)); }} onKeyDown=${e => { if (e.key === 'Enter' && full) connect(); }} /></div><//>
      <div style="padding:0 16px 20px"><${Primary} title="이 화면에 연결" enabled=${full} loading=${screens.busy} onClick=${connect} /></div>`}
    <${Section} header="큰 화면 주소" footer="TV나 컴퓨터 브라우저에서 이 주소를 열면 QR과 코드가 떠요.">
      <${Row} chevron onClick=${share}><div class="grow"><div>${SCREEN_URL}</div>${copied && html`<div class="sub blue">복사했어요</div>`}</div><//><//>
    <${ActionSheet} open=${!!ask} title="이 화면 연결을 끊을까요?" message="큰 화면에서 이름과 자리가 지워져요. 판과 기록은 그대로예요." onClose=${() => setAsk(null)}
      actions=${[{ label: '연결 끊기', role: 'destructive', onClick: () => { const l = ask; setAsk(null); screens.revoke(l.id); } }]} />
  <//>`;
}
