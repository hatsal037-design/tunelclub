// 투넬 계정 — 투넬(tunel.kr)과 같은 카카오 로그인·같은 서버. 같은 사이트라 투넬에 로그인돼 있으면 여기도 켜진다.
// 판을 서버 모양으로 만드는 건 코어(sync.pending), 여기는 보내기·받기만. 판이 끝나면 조용히 올린다
import { store } from './store.js';
const URL_ = 'https://yguvfogtzazoawtclqvf.supabase.co', KEY = 'sb_publishable_KeezD9hmEnxSTEWA_w8x-A_Tgk3roUf';   // 공개 키(투넬 앱도 그대로 싣는다)
let cl = null;
const client = () => cl || (window.supabase && window.supabase.createClient ? (cl = window.supabase.createClient(URL_, KEY)) : null);
const subs = new Set();
const rpc = async (fn, args) => { const { data, error } = await client().schema('dangsan').rpc(fn, args || {}); if (error) throw error; return data; };

export const account = {
  on: false, user: null, info: null, busy: false, pending: 0,
  subscribe(f) { subs.add(f); return () => subs.delete(f); },
  emit() { this.pending = (store.get('sync.pending') || []).length; subs.forEach(f => f()); },
  nick() { const u = this.user, i = this.info; return (i && i.nick) || (u && u.user_metadata && (u.user_metadata.name || u.user_metadata.nickname)) || ''; },

  async init() {
    this.on = !!client(); if (!this.on) return;
    try { const { data } = await cl.auth.getSession(); this.user = (data && data.session && data.session.user) || null; } catch { this.user = null; }
    cl.auth.onAuthStateChange((_e, s) => { const u = (s && s.user) || null; if ((u && u.id) !== (this.user && this.user.id)) { this.user = u; this.load(); } });
    await this.load();
  },
  async load() {
    if (this.user) { try { const d = await rpc('me_info'); this.info = (d && d[0]) || null; } catch { this.info = null; } this.sync(); }
    else this.info = null;
    this.emit();
  },
  login() {
    const c = client(); if (!c) return;
    c.auth.signInWithOAuth({ provider: 'kakao', options: { redirectTo: location.origin + location.pathname } });
  },
  async logout() { try { await client().auth.signOut({ scope: 'local' }); } catch {} this.user = null; this.info = null; this.emit(); },

  /** 밀린 판 올리기 — 사람 맞추기 → 판 올리기. 올라간 판은 코어에 표시(sync.markUploaded). 같은 판을 두 번 올려도 서버가 하나로 친다 */
  async sync() {
    if (!this.user || this.busy) return { ok: 0, bad: 0 };
    this.busy = true; this.emit();
    let ok = 0, bad = 0; const done = [];
    try {
      await rpc('claim_me', { p_nick: '' });
      for (const g of store.get('sync.pending') || []) {
        try {
          if (g.people.length && !(await rpc('sync_people', { p_people: g.people }))) throw new Error('people');
          await rpc('upload_game', { p_game: g.game, p_players: g.players });
          done.push(g.id); ok++;
        } catch { bad++; }
      }
      if (done.length) await store.dispatch('sync.markUploaded', { ids: done });
      if (ok) { try { const d = await rpc('me_info'); this.info = (d && d[0]) || this.info; } catch {} }
    } catch { bad = bad || 1; }
    this.busy = false; this.emit();
    return { ok, bad };
  },
  /** 투넬 회원 명단 — 오늘 참석·최근 두 달·전체(서버가 닉·참석 여부만 준다) */
  async members() { if (!this.user) return null; try { return (await rpc('list_members')) || []; } catch { return null; } },
  /** 서버에 있는 내 판 중 이 기기에 없는 것을 받는다 — 기기를 바꿨을 때 */
  async pull() {
    if (!this.user) return null;
    try {
      const rows = await rpc('my_games', { p_limit: 200, p_with_payload: true });
      const r = await store.dispatch('sync.merge', { rows: rows || [] });
      if (!r.ok) return null;
      this.emit(); return store.get('sync.merged');
    } catch { return null; }
  },
};
// 판이 끝나면(기록이 쌓이면) 조용히 올린다
store.afterCommit = type => { if ((type === 'game.finish' || type === 'backup.import') && account.user) account.sync(); };
