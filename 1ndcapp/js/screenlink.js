// 큰 화면 연결 — 진행자 쪽. 코드로 승인하고, 판이 바뀔 때마다 코어가 고른 공개 정보(display.public)만 올린다.
// 서버 계약: docs/큰화면_서버연결_설계_v1.md · 연결 상태는 탭보다 위(여기)가 들고, 화면은 구독만 한다.
import { store } from './store.js';
import { account } from './account.js';

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
        const p = store.get('display.public'); if (!p) break;
        for (const l of this.active()) {
          if (this.sent[l.id] >= p.revision) continue;
          try { const r = await account.rpc('screen_push', { p_id: l.id, p_epoch: p.gameEpoch, p_rev: p.revision, p_state: p });
            if (r && r.ok) this.sent[l.id] = p.revision; else { this.sent[l.id] = p.revision; this._stale = true; }   // 끊김·만료·낡은 판본 — 목록을 다시 읽는다
          } catch { this._retry(); }   // 인터넷이 잠깐 끊기면 1·2·4·8초 뒤 최신 것으로 다시(2026-10-06 — 전에는 다음 명령까지 멈춰 있었다)
        }
      } while (this._dirty);
    } finally { this._pushing = false; }
    if (this.active().every(l => this.sent[l.id] >= (store.get('display.public')?.revision ?? -1))) this._rk = -1;   // 다 올라가면 재시도 간격 처음부터
    if (this._stale) { this._stale = false; this.load(); }
  },
};
/* 판이 바뀔 때마다(명령 성공 뒤) 최신 공개 정보를 올린다. 코어가 같은 내용엔 판본을 안 올리므로 중복 전송은 없다 */
/* 광장 현황(0320·0321) — 참가자 폰 잠금화면·«이번 판 자료»용 공개 한 줄. 앱 Bridge/PlazaStatus.swift 와 같은 규칙(2026-10-10 웹 구성 W2).
   열린 실전 광장이 있고 로그인했으면, 허용 칸(광장 이름·모드·모드 번호·테마·장면·몇째 날/밤·타이머)만, 바뀌었을 때만 올린다. 실패해도 진행은 안 막는다 */
const plaza = { sent: '', busy: false, dirty: false };
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
      if (p.timer) { const t = {}; ['state', 'endsAt', 'leftMs', 'durationMs'].forEach(k => { if (p.timer[k] != null) t[k] = p.timer[k]; }); st.timer = t; }
      const epoch = p.gameEpoch || 'none', rev = p.revision || 0, key = epoch + '|' + rev + '|' + JSON.stringify(st);
      if (key === plaza.sent) break;
      try { const r = await account.rpc('plaza_status_push', { p_pot: pot.id, p_epoch: epoch, p_rev: rev, p_state: st }); if (r && (r.ok || r.code === 'stale')) plaza.sent = key; } catch {}
    } while (plaza.dirty);
  } finally { plaza.busy = false; }
}
store.afterPublic = () => { screens.push(); plazaPush(); };
account.subscribe(() => { const uid = account.user && account.user.id; if (uid !== screens._uid) { screens._uid = uid; screens.load(); } });
