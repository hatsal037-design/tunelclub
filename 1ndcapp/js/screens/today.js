// T01 · 오늘 — 설정(왼쪽) · 테마(가운데, 작은 창) · 계정(오른쪽), 큰 상자 안 3:2 사진 + 유리 아이콘 + 판 상태 + 큰 행동, 바로 가기 두 행 (27차 시안 2026-10-01 햇살님 «맞아 이거야»)
import { html, useState, useEffect, useRef } from '../../lib/preact-htm.js';
import { store } from '../store.js';
import { Icon } from '../icons.js';
import { Page, Section, Row, Primary, NavButton, LargeTitle, RoleArt, ActionSheet, Labeled, Alert, Sheet, cx } from '../ui.js';
import { account } from '../account.js';
import { QrScanner } from './display.js';
import { settings } from '../settings.js';
import { useNav } from '../nav.js';
import { SettingsView, AccountView } from './settingsView.js';
import { RecordsView } from './records.js';

/* 테마 = 계열(2026-10-01 햇살님 «버튼으로 계열 고르기», 29차 시안) — 고르면 사진·색과 새 판 준비의 «게임 계열»(roles.setFamily)이 같이 바뀐다.
   hub 는 모드 데이터의 계열 이름. soon 은 아직 게임이 없는 빈깡통 계열(«준비 중», 고를 수 없음). 사진은 web/theme/<테마>/ 에 두고 photos 에 적는다 */
export const THEMES = [
  { id: '오리지널', hub: '오리지널 마피아', color: '#3a3a3c', art: '마피아', photos: [] },
  { id: '클래식', hub: '클래식', color: '#5a1f1f', art: '임프', photos: [] },
  { id: '당산나무', hub: '당산나무', color: '#6b4a24', art: '객귀', photos: [] },
  { id: '파티', soon: true, color: '#1f5a4a' },   // 말판·주사위 — 큰 화면이 말판(2026-10-05)
  { id: '판타지', soon: true, shelf: '판타지', color: '#3d2f6b' },   // shelf — 게임은 아직이지만 자료실 목록은 있다(2026-10-08 원작 재현판 나눔)
  { id: '우주', soon: true, shelf: '우주', color: '#1f3a5a' },
  { id: '스팀펑크', soon: true, color: '#6b5326' },
  { id: '사이버펑크', soon: true, color: '#5a1f4f' },
];
export function currentTheme() { const f = store.home && store.home.ruleFamily; return THEMES.find(x => x.hub && x.hub === f) || THEMES[2]; }

export function TodayView({ openSpace }) {
  const nav = useNav(), h = store.home;
  const step = h.prepStep === 'handoff' ? 'handoff' : h.prepStep === 'people' ? 'people' : 'seats';
  const hero = {
    /* 마당(광장)을 먼저 열고 그 안에서 새 판(2026-10-06 햇살님 «일단 마당을 열고 거기서 새 판을 할 수 있어야») */
    newPreparation: h.pot && !h.pot.practice ? ['plus', h.pot.title || '오늘 ' + (h.potKo || '광장'), h.pot.games ? '판 ' + h.pot.games + '개 · 다음 판을 준비해요' : '사람을 모으고 자리를 정하면 차근차근 안내할게요', '새 판 준비', { prep: 'people' }]
      : ['house', '오늘 ' + (h.potKo || '광장') + '을 열어 볼까요?', '모인 사람들이 QR로 들어오고 여기서 판을 이어 가요', (h.potKo || '광장') + ' 열기', null],
    resumePreparation: ['listNumber', '준비하던 판이 있어요', h.summary || '', '준비 계속', { prep: step }],
    resumeGame: ['moon', '진행 중인 판이 있어요', h.summary || '', '이어 하기', { game: true }],
  }[h.destination] || [];
  const go = async () => {
    if (h.destination === 'newPreparation' && !(h.pot && !h.pot.practice)) { setNaming(''); return; }   // 먼저 마당만 연다 — 열 때 이름부터(2026-10-06 햇살님 «광장 열면 이름 정하게»)
    if (h.destination === 'newPreparation') { await store.dispatch('preparation.enter', { practice: false }); }   // 새 판은 실전
    openSpace(hero[4]);
  };
  const [naming, setNaming] = useState(null);
  const openPot = async () => { const t = naming; setNaming(null); if (h.pot) await store.dispatch('pot.close', {}); await store.dispatch('pot.open', { title: t || '' }); };
  const practice = async () => { const r = await store.dispatch('preparation.enter', { practice: true }); if (r.ok) openSpace({ prep: 'people' }); };
  const theme = currentTheme();
  const photo = theme.photos.length ? theme.photos[(h.summary || '').length % theme.photos.length] : null;   // 돌아가며 — 같은 판이면 같은 사진
  const nameSheet = html`<${NameSheet} open=${naming !== null} title=${(h.potKo || '광장') + ' 이름'} value=${naming || ''} onInput=${setNaming} go=${openPot} goLabel="열기" onClose=${() => setNaming(null)} />`;
  return html`${nameSheet}<${Page} title=${html`<${ThemePill} theme=${theme} />`}
      left=${html`<${NavButton} icon="gear" label="설정" onClick=${() => nav.push(html`<${SettingsView} />`)} />`}
      right=${html`<${NavButton} icon="personCircle" label="계정" onClick=${() => nav.push(html`<${AccountView} />`)} />`}>
    <${LargeTitle}>오늘<//>
    <${Section} footer=${h.ruleFamily + (h.modeName ? ' · ' + h.modeName : '')}>
      <div class="hero2">
        <div class="tcover" style=${photo ? '' : `--tc:${theme.color}`}>
          ${photo ? html`<img class="bg" src=${photo} alt="" />` : html`<div class="ph"><${RoleArt} r=${store.artOf(theme.art) || theme.art} size=${220} /></div><div class="stars"></div>`}
          <span class="glass"><${Icon} name=${hero[0]} size=${26} /></span>
          <div class="info"><div class="t">${hero[1]}</div>${hero[2] && html`<div class="s">${hero[2]}</div>`}</div>
        </div>
        <${Primary} title=${hero[3]} onClick=${go} />
      </div>
    <//>
    <${PlazaSection} />
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
/* 가운데 테마 버튼 — 누르면 버튼 밑 작은 창(아래서 올라오는 시트 아님). 오늘 화면과 자료실이 같이 쓴다: 고르면 onPick(테마), locked 면 흐리게(못 바꿈) */
export function ThemeMenu({ theme, onPick, locked, browse }) {   // browse — 자료실: 목록이 있는 준비 중 테마도 열어 볼 수 있다
  const off = t => (t.soon && !(browse && t.shelf)) || locked;
  const [open, setOpen] = useState(false), box = useRef(null);
  useEffect(() => { if (!open) return; const h = e => { if (!box.current || !box.current.contains(e.target)) setOpen(false); }; document.addEventListener('pointerdown', h); return () => document.removeEventListener('pointerdown', h); }, [open]);
  return html`<div class="tpill-wrap" ref=${box}>
    <button class="tpill" aria-haspopup="menu" aria-expanded=${open} onClick=${() => setOpen(o => !o)}><i style=${`background:${theme.color}`}></i>${theme.id}<${Icon} name="chevronDown" size=${12} stroke=${2.4} /></button>
    ${open && html`<div class="tpop" role="menu">${THEMES.map((t, k) => html`${k > 0 && t.soon && !THEMES[k - 1].soon && html`<div class="tsep"></div>`}<button class=${cx('tpi', t.id === theme.id && 'on', off(t) && 'off')} role="menuitemradio" aria-checked=${t.id === theme.id} aria-disabled=${off(t)}
      onClick=${() => { setOpen(false); if (!off(t) && t.id !== theme.id) onPick(t); }}>
      <i style=${`background:${t.color}`}></i><span>${t.id}</span>${t.soon ? html`<span class="soon">준비 중</span>` : t.id === theme.id && html`<span class="blue"><${Icon} name="check" size=${18} stroke=${2.4} /></span>`}</button>`)}</div>`}
  </div>`;
}
/* 오늘 화면 — 고르면 새 판 준비의 계열이 바뀐다. 판이 진행 중이면 못 바꾼다 */
function ThemePill({ theme }) {
  const [ask, setAsk] = useState(null);
  const locked = store.home && store.home.destination === 'resumeGame';
  const pick = async (t, force) => { const r = await store.dispatch('roles.setFamily', force ? { family: t.hub, force: true } : { family: t.hub }); if (r.confirm) setAsk(t); else store.refresh(); };
  return html`<${ThemeMenu} theme=${theme} locked=${locked} onPick=${t => pick(t, false)} />
    <${ActionSheet} open=${!!ask} title=${ask ? `준비하던 판의 역할을 비우고 ${ask.id}로 바꿀까요?` : ''} onClose=${() => setAsk(null)} actions=${[{ label: '역할 비우고 변경', role: 'destructive', onClick: () => { const t = ask; setAsk(null); pick(t, true); } }]} />`;
}
const Shortcut = ({ icon, title, text }) => html`<div class="hstack shortcut" style="gap:12px;padding:4px 0">
  <span class="sym"><${Icon} name=${icon} size=${18} /></span><div><div class="shortcut-t">${title}</div><div class="sub">${text}</div></div></div>`;

/* 오늘 화면 «광장» 칸(당산나무 마당·클래식 광장·오리지널 구역 — 계열 말) — 2026-10-05 햇살님 «B안 · 광장 체크인». 폰 앱 PlazaSection 과 같다.
   진행자: 열기 → 체크인 QR(10분마다 새 코드) → 체크인 명단·판 수 → 닫기. 참가자: QR 로 참가(…/?j=코드로 들어오면 로그인 뒤 저절로) · 나 갈게요 */
/* 광장 이름 정하기·바꾸기 — 큰 화면 대기에 크게 나온다 */
function NameSheet({ open, title, value, onInput, go, goLabel, onClose }) {
  return html`<${Sheet} open=${open} onClose=${onClose} detent="medium" label=${title}>
    <${Page} title=${title} left=${html`<${NavButton} label="취소" onClick=${onClose} />`} right=${html`<${NavButton} label=${goLabel} bold onClick=${go} />`}>
      <${Section} footer="큰 화면 대기 화면에 크게 나와요. 비워 두면 날짜로 정해요."><div class="row"><input class="textin grow" id="pot-name" maxlength="40" placeholder="예: 어른이 놀이터 8회" value=${value} onInput=${e => onInput(e.currentTarget.value)} /></div><//>
    <//><//>`;
}
const plazaCodeFrom = t => { const m = /[?&]j=([A-Za-z]{8})(?:&|#|$)/.exec(String(t || '')); if (m) return m[1].toUpperCase(); const u = String(t || '').toUpperCase().replace(/[^A-Z]/g, ''); return u.length === 8 ? u : ''; };
function PlazaSection() {
  const h = store.home, word = h.potKo || '광장', pot = h.pot;
  const [, re] = useState(0), [srv, setSrv] = useState(null), [code, setCode] = useState(''), [qr, setQr] = useState(''), [roster, setRoster] = useState([]);
  const [joined, setJoined] = useState([]), [scan, setScan] = useState(false), [msg, setMsg] = useState(null), [fixes, setFixes] = useState([]);   // fixes — 내 판에 들어온 정정 요청(0180)
  useEffect(() => account.subscribe(() => re(x => x + 1)), []);
  const logged = !!account.user;
  const showCode = async c => { setCode(c || ''); if (!c) return setQr('');
    if (!window.qrcode) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'lib/qrcode.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); }).catch(() => {});
    if (!window.qrcode) return; const q = window.qrcode(0, 'M'); q.addData('https://tunel.kr/1ndcapp/me/?j=' + c); q.make(); setQr(q.createSvgTag({ cellSize: 4, margin: 0, scalable: true })); };
  const openServer = async () => { if (!logged || !pot || pot.practice) return; const r = await account.plaza('plaza_open', { p_pot: pot.id }); if (r) { setSrv(r.id); showCode(r.code); } };
  // 명단 20초마다, 코드 9분마다(서버 코드 10분). QR 로 들어온 참가자는 로그인되면 저절로 체크인
  useEffect(() => { if (!logged) return; let dead = false, lastCode = 0, id = srv;
    (async () => { const r = await account.plazaCheckinPending(); if (r && !dead) setMsg(r.ok ? r.host + '님의 ' + word + '에 들어왔어요' : r.error); })();
    const tick = async () => { if (dead) return; setJoined(await account.plaza('plaza_joined') || []); setFixes(await account.plaza('fix_requests_mine') || []);
      if (pot && !pot.practice) { const m = await account.plaza('plaza_mine'); if (m && m.pot_id === pot.id) { id = m.id; setSrv(m.id); setRoster(m.roster || []); } else if (!id) { const r = await account.plaza('plaza_open', { p_pot: pot.id }); if (r) { id = r.id; setSrv(r.id); showCode(r.code); lastCode = Date.now(); } }   // 마당을 열면 체크인 QR 도 바로
        if (id && Date.now() - lastCode > 540000 && (code || lastCode)) { const r = await account.plaza('plaza_code', { p_id: id }); if (r && r.ok) { showCode(r.code); lastCode = Date.now(); } } } };
    tick(); const t = setInterval(tick, 5000); return () => { dead = true; clearInterval(t); }; }, [logged, pot && pot.id]);   // 들어온 사람이 큰 화면에 빨리 뜨게 5초(전 20초)
  const close = async () => { const r = await store.dispatch('pot.close', {}); if (!r.ok) return; const id = srv || ((await account.plaza('plaza_mine')) || {}).id; if (id) await account.plaza('plaza_close', { p_id: id }); setSrv(null); showCode(''); store.dispatch('display.plaza', {}); setRoster([]); };
  const here = roster.filter(r => !r.left);
  const [renaming, setRenaming] = useState(null);
  // 큰 화면 대기(참가 QR·광장 이름·들어온 사람) — 판 시작 전·자리 잡기 전까지 TV 에 뜬다(2026-10-06)
  const tvKey = code + '|' + (pot && pot.title || '') + '|' + here.map(r => r.nick).join(',');
  useEffect(() => { if (!code || !pot) return; store.dispatch('display.plaza', { code, title: pot.title || word, people: here.map(r => r.nick) }); }, [tvKey]);
  if (!pot && !logged && !account.plazaJoin) return null;   // 열기는 오늘 화면 큰 버튼(마당 먼저)
  return html`<${NameSheet} open=${renaming !== null} title=${word + ' 이름'} value=${renaming || ''} onInput=${setRenaming} goLabel="바꾸기" go=${async () => { const t = renaming; setRenaming(null); if (t && t.trim()) await store.dispatch('pot.rename', { title: t }); }} onClose=${() => setRenaming(null)} />
  <${Section} header=${word}>
    ${pot && !pot.practice ? html`<${Row} chevron onClick=${() => setRenaming(pot.title || '')}><${Labeled} label="이름" value=${pot.title || ''} /><//>` : ''}
    ${pot ? html`
      ${pot.practice ? html`<div class="row"><${Labeled} label="연습" value="기록 안 남김" /></div>` : logged && html`
        ${qr ? html`<div class="row" style="flex-direction:column;align-items:center;gap:8px;padding:14px 0"><div style="width:180px;height:180px" aria-label=${word + ' 체크인 QR'} dangerouslySetInnerHTML=${{ __html: qr }}></div><div class="num" style="font-size:20px;font-weight:600;letter-spacing:.06em">${code}</div></div>`
          : html`<${Row} tint onClick=${openServer}>체크인 QR<//>`}
        <div class="row"><${Labeled} label="체크인" value=${here.length + '명'} /></div>
        ${roster.length > 0 && html`<div class="row sub">${roster.map(r => r.nick + (r.left ? '(나감)' : '')).join(' · ')}</div>`}`}
      <div class="row"><${Labeled} label="판" value=${pot.games + '개'} /></div>
      <${Row} danger disabled=${h.destination === 'resumeGame'} onClick=${close}>${word} 닫기<//>`
    : null}
    ${logged && joined.map(j => html`<div class="row"><span class="grow">${j.host}님의 ${word}</span><button class="btn-s" onClick=${async () => { await account.plaza('plaza_leave', { p_id: j.plaza }); setJoined(await account.plaza('plaza_joined') || []); }}>나 갈게요</button></div>`)}
    ${logged && fixes.map(f => html`<div class="row" style="flex-direction:column;align-items:stretch;gap:6px"><div>${f.nick} · ${f.mode || ''} ${f.seat ? f.seat + '번 자리' : ''}</div><div class="sub">이 판에 없었다고 해요</div>
      <div style="display:flex;gap:8px"><button class="btn-s" onClick=${async () => { await account.plaza('fix_decide', { p_id: f.id, p_accept: true }); setFixes(await account.plaza('fix_requests_mine') || []); }}>수락</button><button class="btn-s" onClick=${async () => { await account.plaza('fix_decide', { p_id: f.id, p_accept: false }); setFixes(await account.plaza('fix_requests_mine') || []); }}>거절</button></div></div>`)}
    ${logged ? html`<${Row} tint onClick=${() => setScan(true)}>QR로 ${word} 참가<//>` : account.plazaJoin && html`<${Row} tint onClick=${() => account.login()}>로그인하고 ${word} 참가<//>`}
  <//>
  ${scan && html`<${QrScanner} title=${word + ' QR을 비춰 주세요'} parse=${plazaCodeFrom} onClose=${() => setScan(false)} onCode=${async c => { setScan(false); const r = await account.plaza('plaza_checkin', { p_code: c }); setMsg(r && r.ok ? r.host + '님의 ' + word + '에 들어왔어요' : (r && r.error) || '참가하지 못했어요. 연결을 확인해 주세요.'); setJoined(await account.plaza('plaza_joined') || []); }} />`}
  <${Alert} open=${!!msg} title=${msg} onClose=${() => setMsg(null)} />`;
}
