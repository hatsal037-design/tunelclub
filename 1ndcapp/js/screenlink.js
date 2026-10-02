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
          } catch { /* 인터넷이 없으면 다음 명령 때 최신 것으로 다시 */ }
        }
      } while (this._dirty);
    } finally { this._pushing = false; }
    if (this._stale) { this._stale = false; this.load(); }
  },
};
/* 판이 바뀔 때마다(명령 성공 뒤) 최신 공개 정보를 올린다. 코어가 같은 내용엔 판본을 안 올리므로 중복 전송은 없다 */
store.afterPublic = () => screens.push();
account.subscribe(() => { const uid = account.user && account.user.id; if (uid !== screens._uid) { screens._uid = uid; screens.load(); } });
