/* ══ 당산나무 전적 — 투넬 회원 통합 (2026-09-20) ══
   당산나무(tunel.kr/dangsan/)가 같은 프로젝트의 dangsan 스키마에 판을 올린다. 여기서는 읽기만 한다.
   보이는 범위는 서버(dangsan.my_games)가 정한다 — 내가 앉은 판 · 그 판이 든 마당의 다른 판 · 내가 이야기꾼인 판.
   그래서 남의 통산 전적은 만들 수 없고, 남의 프로필에는 «나와 같이 한 판»만 보인다 (햇살님 결정 2026-09-20).
   스키마가 아직 안 열렸거나 로그인 전이면 조용히 아무것도 안 보인다. */
let _dgP = null;
function dangsanGames(){
  if(_dgP) return _dgP;
  _dgP = (async () => {
    try{
      const { data, error } = await sb.schema('dangsan').rpc('my_games', { p_limit: 200, p_with_payload: false });
      if(error) throw error;
      return Array.isArray(data) ? data : [];
    }catch(e){ _dgP = null; return null; }
  })();
  return _dgP;
}
function dgDate(g){ const s = g.started_raw || g.started_at || ''; return String(s).slice(0,10).replace(/-/g,'.'); }
function dgResult(p, g){ if(p.won === true) return '이김'; if(p.won === false) return '짐'; return g.winner ? '—' : '미정'; }
function dgRole(p){ return p.final_role || p.role || p.final_role_id || p.role_id || ''; }
/* 프로필에 넣을 조각 — m 이 나면 내 전적, 남이면 «나와 같이 한 판» */
function dangsanProfileHtml(games, m){
  if(!games) return '';
  const meIs = !!(acc && acc.uid === m.uid);
  const rows = games.map(g => ({ g, p: (g.players||[]).find(p => p.member_id === m.uid) })).filter(x => x.p);
  if(!rows.length) return meIs ? `<div class="mrow"><div class="k">당산나무</div><div>아직 올라온 판이 없어요</div></div>` : '';
  const wins = rows.filter(x => x.p.won === true).length, losses = rows.filter(x => x.p.won === false).length;
  const head = meIs ? `${rows.length}판 · ${wins}승 ${losses}패` : `나와 같이 ${rows.length}판`;
  const recent = rows.slice(0, 3).map(x => `${dgDate(x.g)} ${x.g.mode_name || x.g.mode || ''} · ${dgRole(x.p)} · ${dgResult(x.p, x.g)}`).join('<br>');
  return `<div class="mrow"><div class="k">당산나무</div><div>${head}<div style="font-size:12px;color:var(--sub);line-height:1.7;margin-top:4px">${recent}</div></div></div>`;
}
