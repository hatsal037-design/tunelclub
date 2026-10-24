// QR 읽기 — 진행 웹(화면 연결·광장 참가)과 참가 웹이 같이 쓴다(2026-10-25 참가 웹 «코드를 QR로 읽기»). 진행 모듈(store·account)을 끌어오지 않게 따로 둔다
import { html, useState, useEffect, useRef } from '../lib/preact-htm.js';

const loadScript = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
/* QR 글자에서 연결 코드만 — 큰 화면 QR 은 «…/1ndcapp/?screen=코드». 다른 QR 은 무시한다 */
export const codeFromQr = s => { const m = /[?&]screen=([A-Za-z]{8})(?:&|#|$)/.exec(String(s || '')); return m ? m[1].toUpperCase() : ''; };

/* 앱 안 카메라 — 뒤 카메라를 열어 QR 을 읽는다. 브라우저에 QR 읽기가 있으면 그걸, 없으면(아이폰 사파리) jsQR 로. 닫으면 카메라를 끈다 */
export function QrScanner({ onCode, onClose, parse = codeFromQr, title, noCam = '카메라를 쓸 수 없어요. 코드를 직접 입력해 주세요.', closeLabel = '닫기' }) {
  const video = useRef(null), [err, setErr] = useState('');
  useEffect(() => { let stream = null, raf = 0, dead = false, det = null; const cv = document.createElement('canvas');
    (async () => {
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); }
      catch { if (!dead) setErr(noCam); return; }
      if (dead) { stream.getTracks().forEach(t => t.stop()); return; }
      const v = video.current; v.srcObject = stream; try { await v.play(); } catch {}
      if ('BarcodeDetector' in window) { try { det = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch {} }
      if (!det && !window.jsQR) { try { await loadScript('lib/jsQR.js'); } catch {} }
      const scan = async () => { if (dead) return; let text = '';
        if (v.readyState >= 2 && v.videoWidth) {
          try { if (det) { const r = await det.detect(v); text = r[0] ? r[0].rawValue : ''; }
            else if (window.jsQR) { const k = Math.min(1, 640 / v.videoWidth); cv.width = v.videoWidth * k; cv.height = v.videoHeight * k; const c = cv.getContext('2d', { willReadFrequently: true });
              c.drawImage(v, 0, 0, cv.width, cv.height); const d = c.getImageData(0, 0, cv.width, cv.height), r = window.jsQR(d.data, d.width, d.height, { inversionAttempts: 'dontInvert' }); text = r ? r.data : ''; } } catch {} }
        const code = parse(text); if (code) return onCode(code);
        raf = setTimeout(scan, det ? 120 : 200); };
      scan();
    })();
    return () => { dead = true; clearTimeout(raf); if (stream) stream.getTracks().forEach(t => t.stop()); }; }, []);
  return html`<div class="qrscan" role="dialog" aria-label="QR 찍기">
    <video ref=${video} playsinline muted></video>
    <div class="qrscan-t">${err || title || '큰 화면의 QR을 비춰 주세요'}</div>
    <button class="qrscan-x" onClick=${onClose}>${closeLabel}</button></div>`;
}

