// D01 · 화면 연결 — TV·컴퓨터에 뜬 코드를 넣어(또는 QR 로 들어와) 연결하고, 연결된 화면을 끊는다. 공개 정보 전송은 screenlink.js 가 알아서
import { html, useState, useEffect, useRef } from '../../lib/preact-htm.js';
import { Page, Section, Row, LargeTitle, Primary, ActionSheet } from '../ui.js';
import { account } from '../account.js';
import { screens, fmtCode } from '../screenlink.js';

const SCREEN_URL = 'tunel.kr/1ndcapp/screen/';
const hm = t => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

const loadScript = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
/* QR 글자에서 연결 코드만 — 큰 화면 QR 은 «…/1ndcapp/?screen=코드». 다른 QR 은 무시한다 */
export const codeFromQr = s => { const m = /[?&]screen=([A-Za-z]{8})(?:&|#|$)/.exec(String(s || '')); return m ? m[1].toUpperCase() : ''; };

/* 앱 안 카메라 — 뒤 카메라를 열어 QR 을 읽는다. 브라우저에 QR 읽기가 있으면 그걸, 없으면(아이폰 사파리) jsQR 로. 닫으면 카메라를 끈다 */
function QrScanner({ onCode, onClose }) {
  const video = useRef(null), [err, setErr] = useState('');
  useEffect(() => { let stream = null, raf = 0, dead = false, det = null; const cv = document.createElement('canvas');
    (async () => {
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); }
      catch { if (!dead) setErr('카메라를 쓸 수 없어요. 코드를 직접 입력해 주세요.'); return; }
      if (dead) { stream.getTracks().forEach(t => t.stop()); return; }
      const v = video.current; v.srcObject = stream; try { await v.play(); } catch {}
      if ('BarcodeDetector' in window) { try { det = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch {} }
      if (!det && !window.jsQR) { try { await loadScript('lib/jsQR.js'); } catch {} }
      const scan = async () => { if (dead) return; let text = '';
        if (v.readyState >= 2 && v.videoWidth) {
          try { if (det) { const r = await det.detect(v); text = r[0] ? r[0].rawValue : ''; }
            else if (window.jsQR) { const k = Math.min(1, 640 / v.videoWidth); cv.width = v.videoWidth * k; cv.height = v.videoHeight * k; const c = cv.getContext('2d', { willReadFrequently: true });
              c.drawImage(v, 0, 0, cv.width, cv.height); const d = c.getImageData(0, 0, cv.width, cv.height), r = window.jsQR(d.data, d.width, d.height, { inversionAttempts: 'dontInvert' }); text = r ? r.data : ''; } } catch {} }
        const code = codeFromQr(text); if (code) return onCode(code);
        raf = setTimeout(scan, det ? 120 : 200); };
      scan();
    })();
    return () => { dead = true; clearTimeout(raf); if (stream) stream.getTracks().forEach(t => t.stop()); }; }, []);
  return html`<div class="qrscan" role="dialog" aria-label="QR 찍기">
    <video ref=${video} playsinline muted></video>
    <div class="qrscan-t">${err || '큰 화면의 QR을 비춰 주세요'}</div>
    <button class="qrscan-x" onClick=${onClose}>닫기</button></div>`;
}

export function DisplayConnectionView() {
  const [, re] = useState(0);
  useEffect(() => { const a = screens.subscribe(() => re(x => x + 1)), b = account.subscribe(() => re(x => x + 1)); screens.load(); return () => { a(); b(); }; }, []);
  const [code, setCode] = useState(''), [ask, setAsk] = useState(null), [copied, setCopied] = useState(false), [scan, setScan] = useState(false);
  const [confirm, setConfirm] = useState('');   // QR 로 받은 코드 — «이 화면에 연결할까요?» 를 바로 묻는다(2026-10-02 햇살님). 손으로 친 코드는 버튼으로
  useEffect(() => { if (!screens.pendingCode) return; const c = fmtCode(screens.pendingCode); setCode(c); if (account.user && c.replace(/ /g, '').length === 8) setConfirm(c); }, [screens.pendingCode, !!account.user]);   // 로그인 전이면 로그인하고 돌아왔을 때 묻는다
  const waiting = screens.active().some(l => !l.seen_at);
  useEffect(() => { if (!waiting) return; const t = setInterval(() => screens.load(), 4000); return () => clearInterval(t); }, [waiting]);   // 화면이 받았는지 — 받을 때까지만 가끔 다시 묻는다
  const links = screens.active(), full = code.replace(/ /g, '').length === 8;
  const connect = async c => { if (await screens.approve(c || code)) setCode(''); };
  const url = 'https://' + SCREEN_URL;
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {} };
  const share = async () => { if (!navigator.share) return copy();   // 공유 창(에어드롭·카카오톡·메시지…)이 없는 브라우저에선 복사로
    try { await navigator.share({ title: '첫밤 사망자 클럽 큰 화면', url }); } catch {} };
  const [qr, setQr] = useState('');   // 주소 QR — 다른 기기(TV·노트북·옆 사람 폰)로 찍어 큰 화면을 연다
  const showQr = async () => { if (qr) return setQr('');
    if (!window.qrcode) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'lib/qrcode.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); }).catch(() => {});
    if (!window.qrcode) return; const q = window.qrcode(0, 'M'); q.addData(url); q.make(); setQr(q.createSvgTag({ cellSize: 4, margin: 0, scalable: true })); };
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent), qrCode = screens.pendingCode.toUpperCase().replace(/[^A-Z]/g, '');
  return html`<${Page} title="">
    <${LargeTitle}>화면 연결<//>
    ${ios && qrCode.length === 8 && html`<${Section} footer="아이폰 앱으로 진행 중이면 앱에서 연결하세요.">
      <${Row} tint onClick=${() => { location.href = 'kr.tunel.1ndcapp://screen?screen=' + qrCode; }}>아이폰 앱에서 열기<//><//>`}
    ${!account.user ? html`<${Section} footer="큰 화면 연결은 로그인한 진행자만 할 수 있어요.">
        <${Row} tint onClick=${() => account.login()}>카카오로 로그인<//><//>`
    : html`
      ${links.length > 0 && html`<${Section} header="연결된 화면" footer="12시간 뒤 저절로 끊겨요.">
        ${links.map((l, i) => html`<${Row} onClick=${() => setAsk(l)}><div class="grow"><div>화면 ${links.length - i}</div>
          <div class="sub">${l.seen_at ? '화면이 연결을 확인했어요' : '화면 응답을 기다리는 중'} · ${hm(l.expires_at)}까지</div></div><span class="pill-red">끊기</span><//>`)}<//>`}
      <${Section} header=${links.length ? '화면 더 연결' : '코드로 연결'} footer=${screens.error || 'TV에 뜬 QR을 폰 카메라로 찍어도 돼요.'}>
        <div class="row"><input class="textin" style="font:600 22px ui-monospace,Menlo,monospace;letter-spacing:.12em;text-transform:uppercase;text-align:center" inputmode="text" autocapitalize="characters" autocomplete="off" spellcheck="false"
          aria-label="화면에 뜬 연결 코드" placeholder="ABCD EFGH" value=${code} onInput=${e => { screens.error = ''; screens.forget(); setCode(fmtCode(e.currentTarget.value)); }} onKeyDown=${e => { if (e.key === 'Enter' && full) connect(); }} /></div><//>
      <div style="padding:0 16px 20px"><${Primary} title="이 화면에 연결" enabled=${full} loading=${screens.busy} onClick=${() => connect()} /></div>
      ${navigator.mediaDevices && html`<${Section}><${Row} tint onClick=${() => setScan(true)}><span class="grow" style="text-align:center">카메라로 QR 찍기</span><//><//>`}`}
    ${scan && html`<${QrScanner} onClose=${() => setScan(false)} onCode=${c => { setScan(false); screens.error = ''; setCode(fmtCode(c)); setConfirm(fmtCode(c)); }} />`}
    <${ActionSheet} open=${!!confirm} title="이 화면에 연결할까요?" message=${confirm} onClose=${() => { setConfirm(''); screens.forget(); }}
      actions=${[{ label: '연결', onClick: () => { const c = confirm; setConfirm(''); connect(c); } }]} />
    <${Section} header="큰 화면 주소" footer="TV나 컴퓨터 브라우저에서 열면 QR과 코드가 떠요.">
      <div class="row"><div class="grow">${SCREEN_URL}</div><button class="btn-s" onClick=${copy}>${copied ? '복사됨' : '복사'}</button><button class="btn-s" aria-pressed=${!!qr} onClick=${showQr}>QR</button></div>
      ${qr && html`<div class="row" style="justify-content:center;padding:16px"><div role="img" aria-label="큰 화면 주소 QR" style="background:#fff;padding:12px;border-radius:12px;line-height:0;width:200px" dangerouslySetInnerHTML=${{ __html: qr }}></div></div>`}<//>
    <div style="display:flex;padding:0 16px 20px"><button class="bsec" style="background:var(--blue);color:#fff" onClick=${share}>공유하기</button></div>
    <${ActionSheet} open=${!!ask} title="이 화면 연결을 끊을까요?" message="큰 화면에서 이름과 자리가 지워져요. 판과 기록은 그대로예요." onClose=${() => setAsk(null)}
      actions=${[{ label: '연결 끊기', role: 'destructive', onClick: () => { const l = ask; setAsk(null); screens.revoke(l.id); } }]} />
  <//>`;
}
