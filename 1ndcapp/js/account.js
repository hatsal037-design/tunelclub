// 투넬 계정 — 투넬(tunel.kr)과 같은 카카오 로그인·같은 서버. 같은 사이트라 투넬에 로그인돼 있으면 여기도 켜진다.
// 판을 서버 모양으로 만드는 건 코어(sync.pending), 여기는 보내기·받기만. 판이 끝나면 조용히 올린다
import { store } from './store.js';
import { slimGame, restoreGames } from './core.js';
const URL_ = 'https://yguvfogtzazoawtclqvf.supabase.co', KEY = 'sb_publishable_KeezD9hmEnxSTEWA_w8x-A_Tgk3roUf';   // 공개 키(투넬 앱도 그대로 싣는다)
let cl = null;
const client = () => cl || (window.supabase && window.supabase.createClient ? (cl = window.supabase.createClient(URL_, KEY)) : null);
const subs = new Set();
const rpc = async (fn, args) => { const { data, error } = await client().schema('dangsan').rpc(fn, args || {}); if (error) throw error; return data; };

export const account = {
  on: false, user: null, info: null, busy: false, pending: 0,
  rpc,   // 큰 화면 연결(screenlink.js)이 같은 로그인으로 서버 함수를 부른다
  subscribe(f) { subs.add(f); return () => subs.delete(f); },
  emit() { this.pending = store.get('sync.pendingCount') || 0; subs.forEach(f => f()); },
  nick() { const u = this.user, i = this.info; return (i && i.nick) || (u && u.user_metadata && (u.user_metadata.name || u.user_metadata.nickname)) || ''; },

  async init() {
    this.on = !!client(); if (!this.on) return;
    try { const { data } = await cl.auth.getSession(); this.user = (data && data.session && data.session.user) || null; } catch { this.user = null; }
    cl.auth.onAuthStateChange((_e, s) => { const u = (s && s.user) || null; if ((u && u.id) !== (this.user && this.user.id)) { this.user = u; this.load(); } });
    await this.load();
  },
  async load() {
    if (this.user) { try { const d = await rpc('me_info'); this.info = (d && d[0]) || null; } catch { this.info = null; } this.sync();
      try { this.needs = (await rpc('my_needs')) || []; } catch { this.needs = []; }   // 빠진 계정 칸(0250) — 계정 칸에 «채우기»
      rpc('role_stats').then(rows => rows && store.dispatch('director.setRoleStats', { rows }), () => {});   // 직업 세기 — 구성 기울이기
      rpc('mode_stats_all').then(rows => rows && store.dispatch('director.setModeStats', { rows }), () => {}); }   // 모드·인원별 승수 — 구조 기울기
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
          await rpc('upload_game', { p_game: slimGame(g.game), p_players: g.players });   // 확인되면 사건 기록 빼고(씨앗+명령 2단계)
          try { await rpc('game_skill_facts', { p_client_game_id: g.game.client_game_id, p_players: g.players }); } catch {}   // 숙련 등급 재료(0110) — 실패해도 판 올리기는 성공
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
  /* 광장 체크인(0170) — 진행자: 열기·코드·명단·닫기 / 참가자: 체크인·나 갈게요. 실패는 null(서버에 아직 없을 때도) */
  plazaJoin: '',   // QR(…/?j=코드)로 들어온 참가 코드 — 로그인 뒤 저절로 체크인한다
  async plaza(fn, args) { if (!this.user) return null; try { return await rpc(fn, args || {}); } catch { return null; } },
  async plazaCheckinPending() { const c = this.plazaJoin; if (!c || !this.user) return null;
    this.plazaJoin = ''; try { sessionStorage.removeItem('plaza_join'); } catch {}
    return await this.plaza('plaza_checkin', { p_code: c }) || { ok: false, error: '참가하지 못했어요. 연결을 확인해 주세요.' }; },
  async members() { if (!this.user) return null; try { return (await rpc('list_members')) || []; } catch { return null; } },
  /** 친구 — 서로 수락. 목록(friend·received·sent)·요청·수락·끊기, 전적은 서로 친구이거나 나일 때만 서버가 준다 */
  async friends() { if (!this.user) return null; try { return (await rpc('friends_list')) || []; } catch { return null; } },
  async friendDo(fn, id) { try { return await rpc(fn, { p_member: id }); } catch { return null; } },
  /** 숙련 등급(0110) — 회원마다 «20판 이상인가»·1~5 숫자만. 전적 숫자·지표는 안 온다 */
  async grades(ids) { try { return (await rpc('member_grades', { p_members: ids })) || []; } catch { return null; } },
  async experienced(id) { try { const r = await rpc('member_experienced', { p_member: id }); return typeof r === 'boolean' ? r : null; } catch { return null; } },   // 친구 아니어도 «20판 이상인가»만
  async stats(id) { try { return id ? await rpc('member_stats', { p_member: id }) : await rpc('my_stats'); } catch { return null; } },
  /** 판세 보정 — 역할을 나눈 직후 회원 편별 실력 차이(숫자 하나)를 받아 코어에 넣는다. 5명 미만이면 서버가 주지 않는다 */
  async director() {
    if (!this.user) return; const c = store.get('director.context'); if (!c || c.good.length + c.evil.length < 5) return;
    let skill = null; try { skill = await rpc('team_skill_gap', { p_good: c.good, p_evil: c.evil }); } catch {}
    if (skill) await store.dispatch('director.setServer', { skill });
  },
  /** 서버에 있는 내 판 중 이 기기에 없는 것을 받는다 — 기기를 바꿨을 때.
   *  마지막으로 받은 판의 updated_at 을 두었다가 그 뒤 바뀐 판만 묻는다(0150 p_since). 처음·실패 때는 전체 */
  async pull() {
    if (!this.user) return null;
    const key = 'dangsan_pull_since:' + this.user.id;
    let since = null; try { since = localStorage.getItem(key); } catch {}
    try {
      const rows = (await rpc('my_games', since ? { p_limit: 200, p_with_payload: true, p_since: since } : { p_limit: 200, p_with_payload: true })) || [];
      await restoreGames(rows);   // 사건 기록을 빼고 올라간 판은 기기에서 다시 돌려 채운다(씨앗+명령 3단계)
      const r = await store.dispatch('sync.merge', { rows });
      if (!r.ok) return null;
      const last = rows.reduce((m, g) => (g && g.updated_at && g.updated_at > m ? g.updated_at : m), since || '');   // 서버가 같은 꼴(UTC ISO)로 줘서 글자 비교로 충분
      if (last) { try { localStorage.setItem(key, last); } catch {} }
      this.emit(); return store.get('sync.merged');
    } catch { if (since) { try { localStorage.removeItem(key); } catch {} } return null; }   // 실패하면 다음엔 전체
  },
  /** 진행 중인 판을 서버에 두기 — 밤·낮 경계와 처형 뒤. 결과가 정해진 채 12시간 방치되면 서버가 닫는다 (2026-09-30) */
  async snapshot() {
    if (!this.user) return; const g = store.get('sync.snapshot'); if (!g) return;
    try { await rpc('claim_me', { p_nick: '' }); if (g.people.length) { try { await rpc('sync_people', { p_people: g.people }); } catch {} } await rpc('upload_game', { p_game: g.game, p_players: g.players });
      try { await rpc('game_skill_facts', { p_client_game_id: g.game.client_game_id, p_players: g.players }); } catch {} } catch {}
  },
  /** 앱을 켤 때 — 결과가 정해진 판을 12시간 안 건드렸으면 그 결과로 닫는다(코어가 알림을 낸다) */
  async autoClose() { try { const r = await store.dispatch('game.autoClose', {}); return !!(r && r.ok); } catch { return false; } },
};
// 판이 끝나면(기록이 쌓이면) 조용히 올린다
store.afterCommit = type => { if ((type === 'game.finish' || type === 'backup.import' || type === 'game.autoClose') && account.user) account.sync(); if (type === 'roles.assign') account.director();
  if (type === 'phase.enterDay' || type === 'phase.enterNight' || type === 'day.execute' || type === 'day.executeAndFinish') account.snapshot(); };
