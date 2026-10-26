// 큰 화면 연결 — 진행자 쪽. 코드로 승인하고, 판이 바뀔 때마다 코어가 고른 공개 정보(display.public)만 올린다.
// 서버 계약: docs/큰화면_서버연결_설계_v1.md · 연결 상태는 탭보다 위(여기)가 들고, 화면은 구독만 한다.
import { store } from './store.js';
import { account } from './account.js';
import { settings } from './settings.js';
import { soundOut } from './soundbus.js';
import { bgmSync } from './bgm.js';
import { liveState } from './plaza_live.js';

const subs = new Set();
const live = l => Date.parse(l.expires_at) > Date.now();
export const fmtCode = s => { const c = String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8); return c.length > 4 ? c.slice(0, 4) + ' ' + c.slice(4) : c; };

export const screens = {
  links: [], busy: false, error: '', pendingCode: '',
  sent: {},            // 연결별 마지막으로 올린 판본
  _pushing: false, _dirty: false, _gen: 0,
  subscribe(f) { subs.add(f); return () => subs.delete(f); },
  emit() { subs.forEach(f => f()); },
  active() { return this.links.filter(live); },
  forget() { this.pendingCode = ''; try { sessionStorage.removeItem('screen_pending'); } catch {} },

  async load() {
    if (!account.user) { this.links = []; this.emit(); return; }
    const g = ++this._gen;
    try { const r = await account.rpc('screen_mine'); if (g === this._gen) this.links = r || []; } catch {}
    this.emit(); this.push();
    try { bgmSync(store.get('bgm.slot')); } catch {}   // 화면이 붙거나 떨어지면 배경 음악 자리도 다시(큰 화면 소리)
  },
  /** 승인 — QR 로 들어왔든 손으로 쳤든 코드 하나. 요청 중 다시 누르기는 무시, 늦게 온 답이 끊긴 연결을 살리지 않는다(서버가 본다) */
  async approve(code) {
    if (this.busy) return false; this.busy = true; this.error = ''; this.emit();
    let ok = false;
    try { await account.rpc('claim_me', { p_nick: '' });
      const r = await account.rpc('screen_approve', { p_code: code });
      if (r && r.ok) { ok = true; this.forget(); } else this.error = (r && r.error) || '연결하지 못했어요.';
    } catch { this.error = '연결하지 못했어요. 인터넷을 확인해 주세요.'; }
    this.busy = false; await this.load(); return ok;
  },
  async revoke(id) {
    try { await account.rpc('screen_revoke', { p_id: id }); } catch { this.error = '끊지 못했어요. 다시 시도해 주세요.'; this.emit(); return false; }   // 실패하면 연결은 그대로
    delete this.sent[id]; await this.load(); return true;
  },
  _retry() { clearTimeout(this._rt); const k = this._rk = Math.min(3, (this._rk ?? -1) + 1); this._rt = setTimeout(() => this.push(), 1000 * 2 ** k); },
  /** 공개 정보 올리기 — 한 번에 하나, 도는 동안 바뀌면 끝나고 한 번 더(중간 것은 건너뛰고 최신만) */
  async push() {
    if (!account.user || !this.active().length) return;
    if (this._pushing) { this._dirty = true; return; }
    this._pushing = true;
    try {
      do { this._dirty = false;
        const p = withSound(store.get('display.public')); if (!p) break;
        for (const l of this.active()) {
          if (this.sent[l.id] >= p.revision) continue;
          try { const r = await account.rpc('screen_push', { p_id: l.id, p_epoch: p.gameEpoch, p_rev: p.revision, p_state: p });
            if (r && r.ok) this.sent[l.id] = p.revision; else { this.sent[l.id] = p.revision; this._stale = true; }   // 끊김·만료·낡은 판본 — 목록을 다시 읽는다
          } catch { this._retry(); }   // 인터넷이 잠깐 끊기면 1·2·4·8초 뒤 최신 것으로 다시(2026-10-06 — 전에는 다음 명령까지 멈춰 있었다)
        }
      } while (this._dirty);
    } finally { this._pushing = false; }
    if (this.active().every(l => this.sent[l.id] >= (withSound(store.get('display.public'))?.revision ?? -1))) this._rk = -1;   // 다 올라가면 재시도 간격 처음부터
    if (this._stale) { this._stale = false; this.load(); }
  },
};
/* 큰 화면 소리(2026-10-25) — 설정 «큰 화면 소리»가 큰 화면이고 연결돼 있으면 낭독·짧은 소리·알림음·배경 음악을 공개 정보에 실어 TV 가 튼다.
   낭독처럼 화면은 그대로인데 소리만 나는 일이 있어서, 올리는 판본 = 코어 판본×1000 + 그 판본 뒤로 소리가 바뀐 횟수(서버는 판본이 올라야 받는다).
   아이폰 앱도 같은 판본 규칙(Bridge/ScreenLink.swift withSound, 2026-10-26 아침 선택 1-6).
   ponytail: 한 연결에 진행자 둘(다른 코어)이 번갈아 올리면 판본 비교가 뜻이 없어 낮은 쪽이 거절된다 — 그렇게 쓰게 되면 연결마다 판본을 서버가 매긴다 */
const au = { items: [], bgm: null, k: 0, base: 0, core: -1, n: 0, g: 0 };
let auSaved = (() => { try { return JSON.parse(localStorage.getItem('screen_au') || 'null'); } catch { return null; } })();   // 진행자 웹을 새로 열어도 같은 코어 판본 안에서 올린 판본보다 크게(서버는 판본이 올라야 받는다)
const routed = () => settings.get('soundAt') === 'screen' && screens.active().length > 0;
const bump = () => { au.k++; screens.push(); };
soundOut.send = items => { if (!routed()) return false;
  const g = Date.now() * 100 + (au.g++ % 100);   // 한 번에 보낸 묶음 — TV 는 새 묶음의 낭독이 오면 앞 낭독을 끊는다(폰과 같게)
  items.forEach(x => { x.id = Date.now() * 100 + (au.n++ % 100); x.g = g; au.items.push(x); });   // 진행자 폰을 새로 열어도 번호가 앞으로만 간다
  au.items = au.items.slice(-8); bump(); return true; };
soundOut.bgm = b => { const on = routed(), want = on ? b : null;
  if (JSON.stringify(want) !== JSON.stringify(au.bgm)) { au.bgm = want; bump(); }   // 폰으로 돌리면 TV 음악은 멈춘다
  return on; };
soundOut.ping = bump;
function withSound(p) {
  if (!p) return p;
  if (p.revision !== au.core) { au.core = p.revision; au.base = au.k - (auSaved && auSaved.core === p.revision ? auSaved.sub + 1 : 0); auSaved = null; }
  const sub = Math.min(999, au.k - au.base); try { localStorage.setItem('screen_au', JSON.stringify({ core: p.revision, sub })); } catch {}
  return Object.assign({}, p, { revision: p.revision * 1000 + sub, audio: routed() ? { items: au.items, bgm: au.bgm } : null });
}
/* 판이 바뀔 때마다(명령 성공 뒤) 최신 공개 정보를 올린다. 코어가 같은 내용엔 판본을 안 올리므로 중복 전송은 없다 */
/* 광장 현황(0320·0321) — 참가자 폰 잠금화면·«이번 판 자료»용 공개 한 줄. 앱 Bridge/PlazaStatus.swift 와 같은 규칙(2026-10-10 웹 구성 W2).
   열린 실전 광장이 있고 로그인했으면, 허용 칸(광장 이름·모드·모드 번호·테마·장면·몇째 날/밤·타이머)만, 바뀌었을 때만 올린다. 실패해도 진행은 안 막는다 */
const plaza = { sent: '', cards: '', busy: false, dirty: false };
async function plazaPush() {
  const pot = store.home && store.home.pot;
  if (!account.user || !pot || pot.practice) return;
  if (plaza.busy) { plaza.dirty = true; return; }
  plaza.busy = true;
  try {
    do { plaza.dirty = false;
      const p = store.get('display.public'); if (!p) break;
      const h = store.home, st = { title: pot.title, scene: p.scene || 'prep' };
      if (h.modeName) st.mode = h.modeName;
      if (h.modeId) { st.modeId = h.modeId; st.shelf = h.ruleFamily; }
      if (typeof p.dayNumber === 'number') st.day = p.dayNumber;
      if (typeof p.nightNumber === 'number') st.night = p.nightNumber;
      if (p.briefing) st.brief = p.briefing;   // 이번 판 안내(0326 — 참가 웹 광장 탭이 그린다. 0326 이 없는 서버는 이 칸을 버린다)
      Object.assign(st, liveState(p));   // 0327 공개 자리판 + 0328 «지금 판» 공개 값(자리 모양·지명·처형·아침·넘김·판 흐름·판 끝 직업 공개) — 아이폰 PlazaStatus.swift 와 같은 꼴
      if (p.timer) { const t = {}; ['state', 'endsAt', 'leftMs', 'durationMs'].forEach(k => { if (p.timer[k] != null) t[k] = p.timer[k]; }); st.timer = t; }
      const epoch = p.gameEpoch || 'none', rev = p.revision || 0, key = epoch + '|' + rev + '|' + JSON.stringify(st);
      /* 0327 내 카드 — 자리별 «넘길 때 본 카드»(코어 plaza.cards)를 통째로. 서버가 체크인한 계정 것만 남기고 본인만 읽게 한다 */
      const cards = store.get('plaza.cards') || [], ck = epoch + '|' + JSON.stringify(cards);
      if (ck !== plaza.cards) { try { const r = await account.rpc('plaza_card_push', { p_pot: pot.id, p_epoch: epoch, p_cards: cards }); if (r && r.ok) plaza.cards = ck; } catch {} }
      if (key === plaza.sent) break;
      try { const send = () => account.rpc('plaza_status_push', { p_pot: pot.id, p_epoch: epoch, p_rev: rev, p_state: st });
        let r = await send();
        if (r && r.code === 'too_long' && st.brief) { delete st.brief; r = await send(); }   /* 0326 전 서버(한도 4096자)는 안내를 넣으면 통째로 거절한다 — 안내만 빼고 다시 */
        if (r && (r.ok || r.code === 'stale')) plaza.sent = key; } catch {}
    } while (plaza.dirty);
  } finally { plaza.busy = false; }
}
store.afterPublic = () => { screens.push(); plazaPush(); };
account.subscribe(() => { const uid = account.user && account.user.id; if (uid !== screens._uid) { screens._uid = uid; screens.load(); } });
