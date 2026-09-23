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

/* 내 활동 탭 — «시계탑 전적 · 당산나무 베타» (2026-09-24 햇살님 «내 활동에 시계탑 전적을 넣어서 당산나무 앱 베타테스트»,
   «날짜 말고 승패·직업별 승리 횟수·승률, 악·선 승수·승률 — 전에 이야기한 거 어느 정도»).
   항목은 당산나무 docs/통계_항목_후보.md 에서 서버 목록(my_games, 판 원본 없이)만으로 셀 수 있는 것만:
   나-01 판·승·패·승률 · 나-02 선/악 성적과 자주 한 직업 · 나-31 진영 조합 · 나-20 흉수로 이긴 판 ·
   나-30 직업별 판·승·승률 · 나-32 최다 직업 · 나-33 해본 직업 가짓수 · 나-34 궁합 직업 · 나-19 최다 연승·연패 · 나-63 모드별.
   승률은 승/(승+패) — 결과가 안 정해진 판은 판수에만 센다 */
const DG_TEAM = { town:'마을', outsider:'외지인', minion:'하수인', demon:'흉수' };
const DG_GOOD = { town:1, outsider:1 }, DG_EVIL = { minion:1, demon:1 };
function dgRate(w, l){ return (w + l) ? Math.round(w * 100 / (w + l)) + '%' : '—'; }
function dgTally(list){ const w = list.filter(x => x.p.won === true).length, l = list.filter(x => x.p.won === false).length; return { n:list.length, w, l, r:dgRate(w, l) }; }
function dgTop(list){ const c = {}; list.forEach(x => { const r = dgRole(x.p); if(r) c[r] = (c[r]||0) + 1; });
  return Object.entries(c).sort((a,b) => b[1]-a[1])[0]; }
function dangsanActivityHtml(games){
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const link = `<a class="dglink" href="../dangsan/">당산나무로 판 열기 (베타) →</a>`;
  if(games === null) return `<div class="dgbox"><div class="dgnone">전적을 못 불러왔어요. 잠시 뒤 다시 열어 주세요.</div>${link}</div>`;
  const rows = (games||[]).map(g => ({ g, p: (g.players||[]).find(p => p.me) })).filter(x => x.p);
  if(!rows.length) return `<div class="dgbox"><div class="dgnone">아직 올라온 판이 없어요.<br>당산나무에서 판을 마감하면 여기 저절로 쌓여요.</div>${link}</div>`;
  const all = dgTally(rows);
  const good = rows.filter(x => DG_GOOD[x.p.team]), evil = rows.filter(x => DG_EVIL[x.p.team]);
  const G = dgTally(good), E = dgTally(evil), gTop = dgTop(good), eTop = dgTop(evil);
  const teamN = t => rows.filter(x => x.p.team === t).length;
  const demonWin = rows.filter(x => x.p.team === 'demon' && x.p.won === true).length;
  /* 직업별 */
  const byRole = {};
  rows.forEach(x => { const r = dgRole(x.p) || '—'; (byRole[r] = byRole[r] || []).push(x); });
  const roles = Object.entries(byRole).map(([name, l]) => ({ name, team: l[0].p.team, ...dgTally(l) })).sort((a,b) => b.n - a.n || b.w - a.w);
  const rated = roles.filter(x => x.w + x.l >= 2);
  const best = rated.slice().sort((a,b) => (b.w/(b.w+b.l)) - (a.w/(a.w+a.l)) || b.n - a.n)[0];
  const worst = rated.slice().sort((a,b) => (a.w/(a.w+a.l)) - (b.w/(b.w+b.l)) || b.n - a.n)[0];
  /* 연승·연패 — 오래된 판부터 */
  const seq = rows.slice().sort((a,b) => String(a.g.started_raw||a.g.started_at||'').localeCompare(String(b.g.started_raw||b.g.started_at||'')));
  let ws = 0, ls = 0, cw = 0, cl = 0;
  seq.forEach(x => { if(x.p.won === true){ cw++; cl = 0; } else if(x.p.won === false){ cl++; cw = 0; } ws = Math.max(ws, cw); ls = Math.max(ls, cl); });
  /* 모드별 */
  const byMode = {};
  rows.forEach(x => { const m = x.g.mode_name || x.g.mode || '—'; (byMode[m] = byMode[m] || []).push(x); });
  const modes = Object.entries(byMode).map(([m, l]) => ({ m, ...dgTally(l) })).sort((a,b) => b.n - a.n);
  const roleRow = x => `<tr><td><i class="tm ${esc(x.team||'')}"></i>${esc(x.name)}</td><td>${x.n}</td><td>${x.w}</td><td>${x.r}</td></tr>`;
  return `<div class="dgbox">
    <div class="dgsum"><div><b>${all.n}</b><span>판</span></div><div><b>${all.w}</b><span>승</span></div><div><b>${all.l}</b><span>패</span></div><div><b>${all.r}</b><span>승률</span></div></div>
    <div class="dgside">
      <div class="good"><em>선 · 마을 편</em><b>${G.w}<small>승</small> ${G.l}<small>패</small></b><span>${G.n}판 · 승률 ${G.r}</span>${gTop ? `<span>자주 한 직업 ${esc(gTop[0])} ${gTop[1]}번</span>` : ''}</div>
      <div class="evil"><em>악 · 흉수 편</em><b>${E.w}<small>승</small> ${E.l}<small>패</small></b><span>${E.n}판 · 승률 ${E.r}</span>${eTop ? `<span>자주 한 직업 ${esc(eTop[0])} ${eTop[1]}번</span>` : ''}</div>
    </div>
    <details class="dgdetail"><summary>진영·직업별 기록 <i>⌄</i></summary>
    <div class="dgteam"><span>마을 <b>${teamN('town')}</b></span><span>외지인 <b>${teamN('outsider')}</b></span><span>하수인 <b>${teamN('minion')}</b></span><span>흉수 <b>${teamN('demon')}</b></span>${demonWin ? `<span>흉수로 이긴 판 <b>${demonWin}</b></span>` : ''}</div>
    <div class="dgfacts">
      <span>해본 직업 <b>${roles.length}가지</b></span>
      ${roles[0] ? `<span>최다 직업 <b>${esc(roles[0].name)}</b> ${roles[0].n}번</span>` : ''}
      ${best ? `<span>궁합 좋은 직업 <b>${esc(best.name)}</b> ${dgRate(best.w, best.l)}</span>` : ''}
      ${worst && worst !== best ? `<span>안 풀리는 직업 <b>${esc(worst.name)}</b> ${dgRate(worst.w, worst.l)}</span>` : ''}
      <span>최다 연승 <b>${ws}</b> · 최다 연패 <b>${ls}</b></span>
    </div>
    <div class="dgh">직업별</div>
    <table class="dgtab"><thead><tr><th>직업</th><th>판</th><th>승</th><th>승률</th></tr></thead>
      <tbody>${roles.slice(0, 8).map(roleRow).join('')}</tbody></table>
    ${roles.length > 8 ? `<details class="dgmore"><summary>직업 ${roles.length - 8}개 더 보기</summary><table class="dgtab"><tbody>${roles.slice(8).map(roleRow).join('')}</tbody></table></details>` : ''}
    ${modes.length > 1 ? `<div class="dgh">모드별</div><table class="dgtab"><thead><tr><th>모드</th><th>판</th><th>승</th><th>승률</th></tr></thead><tbody>${modes.map(x => `<tr><td>${esc(x.m)}</td><td>${x.n}</td><td>${x.w}</td><td>${x.r}</td></tr>`).join('')}</tbody></table>` : ''}
    </details>
    ${link}
  </div>`;
}
