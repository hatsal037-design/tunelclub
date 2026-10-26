/* 광장 현황(참가 웹 «지금 판»)에 싣는 공개 값 — 코어 display.public(큰 화면과 같은 투영)에서 옮긴다. 2026-10-26 v6d(시안/참가웹_지금판_20261026_v6).
   자리는 번호(n)로 바꾸고, 직업 공개(reveal)는 판이 끝난 장면에서만 싣는다. 직업·진영·대상은 여기 칸이 없다.
   보내는 곳 둘이 같은 꼴: 웹 js/screenlink.js plazaPush · 아이폰 Bridge/PlazaStatus.swift. 서버가 한 번 더 거른다(0328 plaza_status_clean). */
const num = id => { const m = /^s(\d{1,2})$/.exec(String(id || '')); return m ? +m[1] : null; };
const int = v => (typeof v === 'number' && isFinite(v) ? Math.round(v) : null);
const put = (o, k, v) => { if (v !== null && v !== undefined) o[k] = v; return o; };

export function liveState(p) {
  const st = {};
  if (!p) return st;
  if (Array.isArray(p.seats)) st.seats = p.seats.map(s => {
    const o = { n: s.number, name: s.name || '', dead: !!s.dead };
    if (s.reveal) o.rv = s.reveal;
    if (s.dead && s.cause) o.cause = s.cause;
    if (s.dead && s.ghost) o.ghost = true;
    return o; });
  st.shape = p.shape === 'rect' ? 'rect' : 'round';
  if (p.board && Array.isArray(p.board.cells)) st.board = { cols: p.board.cols, rows: p.board.rows, cells: p.board.cells.map(c => put({ c: c.col, r: c.row }, 'n', num(c.seatId))) };
  if (p.nomination) { const r = (p.results || []).find(x => x.targetId === p.nomination.targetId);
    const o = put({ t: num(p.nomination.targetId) }, 'by', num(p.nomination.byId)); put(o, 'need', int(p.neededVotes));
    if (p.scene === 'confirmed' && r) { put(o, 'v', int(r.votes)); put(o, 'status', r.status); }
    st.nom = o; }
  if (p.execution) st.exec = { t: num(p.execution.targetId), died: !!p.execution.died };
  if (p.morningAnnouncement && Array.isArray(p.morningAnnouncement.deaths)) st.morning = p.morningAnnouncement.deaths.map(num).filter(x => x);
  if (p.handoff) st.handoff = put({ seen: int(p.handoff.seen), total: int(p.handoff.total) }, 't', num(p.handoff.seatId));
  if (p.briefingStage === 'rules') st.briefStage = 'rules';
  if (p.ending && p.ending.winnerLabel) st.win = String(p.ending.winnerLabel);
  if (p.scene === 'ended' && Array.isArray(p.endReveal)) st.reveal = p.endReveal.map(r => put({ n: num(r.seatId), role: String(r.role || ''), side: r.side }, 'icon', r.icon || null));
  if (Array.isArray(p.flow)) st.flow = p.flow.map(f => ({ k: f.kind, n: f.n, ev: (f.events || []).map(e => put(put(put(put({ w: e.what }, 't', num(e.targetId)), 'by', num(e.byId)), 'v', int(e.votes)), 'need', int(e.need))) }));
  if (typeof p.nightProgress === 'number') st.np = p.nightProgress;
  if (p.cycle === 'card') st.cyc = 'card';
  return st;
}
