/* 첫밤 사망자 클럽 — 기록 — 지난정모 편집·마이페이지·회원관리
   index.html 한 파일에 있던 것을 2026-08-23에 나눴다.
   순수 스크립트라 전역이 그대로 이어진다 — index.html 의 실행 순서를 바꾸지 말 것. */
/* ══ 지난정모 ══ */
function pastList(){
  /* 2026-08-19 — 지난 기록의 출처는 서버(meetings + attendance) 하나다.
     날짜가 지났는데 아직 기록이 안 들어간 예정 회차만 빈 껍데기로 채워 보여준다.
     past.js(씨앗)와 로컬 편집본은 서버로 이사를 마쳐서 더 읽지 않는다. */
  const by = {};
  ROUNDS.filter(r=>TUNEL.isPast(r)).forEach(r=>{   /* 끝났나 판정은 tunel.js 한 곳 */
    by[r.d] = { r:r.r, d:r.d, dow:r.dow, s:r.s, e:r.e, kind:'round',
                place:r.place, n:null, fee:r.fee||'', played:[], people:[],
                after:'', memo:'', auto:true };
  });
  serverPast.forEach(p=>by[p.d]={...(by[p.d]||{}),...p});
  return Object.values(by).sort((a,b)=>b.d.localeCompare(a.d));
}
/* ══ 예정 회차 편집 (관리자만) ══
   2026-09-14 신설. 까닭은 api.js 의 API.roundSave 주석에 적었다 —
   요컨대 다가오는 회차를 고칠 화면이 없어서 서버를 SQL 로 건드려 왔다.
   여기서 고치면 그게 곧 화면에 뜨는 값이다(회차는 서버가 최종). */
function editRound(d){
  if(!isAdmin()){ ask('예정 회차는 관리자만 고칠 수 있어요.', null); return; }
  const cur = d ? (ROUNDS.find(r=>r.d===d) || {}) : {};
  const esc = v => String(v==null?'':v).replace(/"/g,'&quot;');
  const st = cur.st || 'soon';
  document.getElementById('modal').innerHTML=`
    <h2>${d?'예정 회차 고치기':'예정 회차 추가'}</h2>
    <div class="fld"><label>날짜 (YYYY-MM-DD)</label><input id="r_d" value="${esc(cur.d)}" placeholder="2026-10-24"></div>
    <div class="fld"><label>요일 / 시작 / 종료</label>
      <div style="display:flex;gap:6px">
        <input id="r_dow" value="${esc(cur.dow)}" placeholder="토" style="width:56px;text-align:center">
        <input id="r_s" value="${esc(cur.s)}" placeholder="13:00">
        <input id="r_e" value="${esc(cur.e)}" placeholder="18:00">
      </div></div>
    <div class="fld"><label>상태</label>
      <select id="r_st">
        <option value="soon"${st==='soon'?' selected':''}>예정 — 아직 안 엽니다</option>
        <option value="open"${st==='open'?' selected':''}>모집중 — 신청을 받습니다</option>
        <option value="cancelled"${st==='cancelled'?' selected':''}>취소</option>
      </select></div>
    <div class="fld"><label>회차 번호 (번개면 비워두세요)</label><input id="r_r" value="${esc(cur.r)}" placeholder="8"></div>
    <div class="fld"><label>회차 이름 (비우면 «N회차 정모»로 나옵니다)</label><input id="r_name" value="${esc(cur.name)}" placeholder="8회차 정모"></div>
    <div class="fld"><label>장소 — 서울갤러리는 «(지하 2층)»까지</label><input id="r_place" value="${esc(cur.place)}" placeholder="서울갤러리 동그라미방 (지하 2층)"></div>
    <div class="fld"><label>주소</label><input id="r_addr" value="${esc(cur.addr)}" placeholder="서울 중구 세종대로 110"></div>
    <div class="fld"><label>지도 검색어 (비우면 주소로 엽니다)</label><input id="r_mapq" value="${esc(cur.mapq)}" placeholder="서울 중구 세종대로 110"></div>
    <div class="fld"><label>정원 / 이용 시간(시간)</label>
      <div style="display:flex;gap:6px">
        <input id="r_cap" value="${esc(cur.cap)}" placeholder="18" style="width:80px;text-align:center">
        <input id="r_h" value="${esc(cur.h)}" placeholder="6" style="width:80px;text-align:center">
      </div></div>
    <div class="fld"><label>참가비</label><input id="r_fee" value="${esc(cur.fee)}" placeholder="15,000원"></div>
    <div class="fld"><label>한 줄 메모</label><input id="r_memo" value="${esc(cur.note)}" placeholder="「시계탑에 흐른 피」 두세 판 · 신청은 문토에서"></div>
    <div class="fld"><label>문토 신청 주소 (비우면 신청 버튼이 «준비 중»)</label><input id="r_munto" value="${esc(cur.apply&&cur.apply.munto)}" placeholder="https://www.munto.kr/app/socialing?id="></div>
    <div class="fld"><label>찾아오는 길 — 그림 파일</label><input id="r_rimg" value="${esc(cur.route&&cur.route.img)}" placeholder="img/place/botc_way_7.jpg"></div>
    <div class="fld"><label>찾아오는 길 — 안내 글</label><textarea id="r_rtip" placeholder="시청역·을지로입구역 어느 쪽에서 와도…">${String((cur.route&&cur.route.tip)||'')}</textarea></div>
    <div class="mbtns">
      <button class="mbtn" onclick="saveRound()">저장</button>
    </div>
    <div class="xr" style="opacity:.6;margin-top:10px;font-size:12px">저장하면 바로 화면에 반영돼요. 앱 안의 «지난 모임 기록»과는 다른 칸이에요.</div>
    <button class="mclose" onclick="closeM()">닫기</button>`;
  document.getElementById('ov').style.display='flex';
}
function saveRound(){
  const v = id => (document.getElementById(id).value||'').trim();
  const d = v('r_d');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d)){ alert('날짜를 2026-10-24 형식으로 적어주세요'); return; }
  const num = x => { const t=v(x); return t===''? null : (isNaN(+t)? null : +t); };
  const rec = { d, dow:v('r_dow'), s:v('r_s'), e:v('r_e'), st:v('r_st'),
                r:num('r_r'), name:v('r_name'), place:v('r_place'), addr:v('r_addr'),
                mapq:v('r_mapq'), cap:num('r_cap'), h:num('r_h'), fee:v('r_fee'),
                memo:v('r_memo'), munto:v('r_munto'),
                routeImg:v('r_rimg'), routeTip:v('r_rtip') };
  (async()=>{
    try{
      await API.roundSave(rec);
      const rows = await API.roundsList();
      if(rows && rows.length){ ROUNDS = rows; recalcRounds(); }
    }catch(e){
      alert('서버 저장에 실패했어요. 네트워크를 확인하고 다시 해주세요.\n' + (e && e.message ? e.message : ''));
      return;
    }
    closeM(); schedScrolled=true; renderSched();
  })();
}

function editPast(d){
  const cur = d ? pastList().find(p=>p.d===d)||{} : {};
  const sel = cur.played||[];
  document.getElementById('modal').innerHTML=`
    <h2>${d?'기록 편집':'지난 정모 추가'}</h2>
    <div class="fld"><label>날짜 (YYYY-MM-DD)</label><input id="e_d" value="${cur.d||''}" placeholder="2026-08-08"></div>
    <div class="fld"><label>요일 / 시작 / 종료</label>
      <div style="display:flex;gap:6px">
        <input id="e_dow" value="${cur.dow||''}" placeholder="토" style="width:56px;text-align:center">
        <input id="e_s" value="${cur.s||''}" placeholder="12:00">
        <input id="e_e" value="${cur.e||''}" placeholder="18:00">
      </div></div>
    <div class="fld"><label>회차 번호 (번개면 비워두세요)</label><input id="e_r" value="${cur.r||''}" placeholder="2"></div>
    <div class="fld"><label>장소</label><input id="e_place" value="${cur.place||''}" placeholder="그림동네창작센터 공유화실"></div>
    <div class="fld"><label>참가비</label><input id="e_fee" value="${cur.fee||''}" placeholder="12,000원"></div>
    <div class="fld"><label>참여자 — <b style="color:var(--red-lite)">@</b>를 붙이면 회원 태그(닉변해도 따라감), 그냥 쓰면 수기 기록</label>
      <div class="chips2" id="pplChips"></div>
      <div style="position:relative">
        <input id="pplIn" placeholder="@닉네임 또는 이름 입력 후 엔터" autocomplete="off">
        <div class="sug" id="pplSug" style="display:none"></div>
      </div></div>
    <div class="fld"><label>그날 한 게임 — 보유 게임은 눌러서, 가져온 게임은 아래에 입력</label>
      <div class="gsel" id="gsel">${GAMES.filter(g=>g.have!==false).map(g=>
        `<span class="gs${sel.includes(g.n)?' on':''}" onclick="this.classList.toggle('on')" data-n="${g.n}">${g.n}</span>`).join('')}</div>
      <div class="chips2" id="xgChips" style="margin-top:9px"></div>
      <div style="position:relative">
        <input id="xgIn" placeholder="미보유 게임 이름 입력 (인기 게임은 자동완성)" autocomplete="off">
        <div class="sug" id="xgSug" style="display:none"></div>
      </div></div>
    <div class="fld"><label>2차</label><input id="e_after" value="${cur.after||''}" placeholder="레드버튼 (달무티)"></div>
    <div class="fld"><label>메모</label><textarea id="e_memo" placeholder="그날 어땠는지 한두 줄">${cur.memo||''}</textarea></div>
    <div class="mbtns">
      <button class="mbtn" onclick="savePast()">저장</button>
    </div>
    <button class="mclose" onclick="closeM()">닫기</button>`;
  document.getElementById('ov').style.display='flex';
  initPplEditor(cur.people||[]);
  initXgEditor(cur.played||[]);
}

/* ── 미보유 게임 입력기 (지난 모임 '한 게임') ── */
let extraPlayed = [];
function initXgEditor(played){
  const ownNames = new Set(GAMES.filter(g=>g.have!==false).map(g=>g.n));
  extraPlayed = (played||[]).filter(n=>!ownNames.has(n));
  const inp=document.getElementById('xgIn'); if(!inp) return;
  inp.addEventListener('input', xgSuggest);
  inp.addEventListener('keydown', e=>{
    if(e.key==='Enter'){ e.preventDefault(); xgCommit(); }
    else if(e.key==='Backspace' && !inp.value && extraPlayed.length){ extraPlayed.pop(); renderXg(); }
  });
  renderXg();
}
function renderXg(){
  const box=document.getElementById('xgChips'); if(!box) return;
  box.innerHTML = extraPlayed.map((n,i)=>
    `<span class="ch">${n}<b onclick="extraPlayed.splice(${i},1);renderXg()">✕</b></span>`).join('');
}
function xgSuggest(){
  const inp=document.getElementById('xgIn'), sug=document.getElementById('xgSug');
  const v=inp.value.trim();
  if(!v || typeof GAMES_DB==='undefined'){ sug.style.display='none'; return; }
  const hits=GAMES_DB.filter(g=>!extraPlayed.includes(g.n) && (g.n+g.eng).toLowerCase().includes(v.toLowerCase())).slice(0,6);
  sug.innerHTML = hits.length
    ? hits.map(g=>`<div class="si" onclick="xgPick('${g.n.replace(/'/g,"\\'")}')">${g.n}<span>⭐${g.rate} · ${g.players}명</span></div>`).join('')
    : `<div class="si none">DB에 없어요 — 엔터로 그대로 기록</div>`;
  sug.style.display='block';
}
function xgPick(n){
  if(!extraPlayed.includes(n)) extraPlayed.push(n);
  document.getElementById('xgIn').value='';
  document.getElementById('xgSug').style.display='none';
  renderXg();
}
function xgCommit(){
  const inp=document.getElementById('xgIn');
  const v=inp.value.trim(); if(!v) return;
  if(!extraPlayed.includes(v)) extraPlayed.push(v);
  inp.value=''; document.getElementById('xgSug').style.display='none';
  renderXg();
}

/* ── 참여자 칩 편집기 ──
   editPeople: ["수기이름", {uid:"...", label:"태그당시닉"}] 혼합 배열 */
let editPeople = [];
function initPplEditor(init){
  editPeople = init.map(x => typeof x==='string' ? x : {uid:x.uid, label:x.label||pName(x)});
  const inp = document.getElementById('pplIn');
  inp.addEventListener('input', pplSuggest);
  inp.addEventListener('keydown', e=>{
    if(e.key==='Enter'){ e.preventDefault(); pplCommit(); }
    else if(e.key==='Backspace' && !inp.value && editPeople.length){ editPeople.pop(); renderPpl(); }
  });
  renderPpl();
}
function renderPpl(){
  const box=document.getElementById('pplChips'); if(!box) return;
  box.innerHTML = editPeople.map((x,i)=> typeof x==='string'
    ? `<span class="ch">${x}<b onclick="editPeople.splice(${i},1);renderPpl()">✕</b></span>`
    : `<span class="ch m">@${pName(x)}<b onclick="editPeople.splice(${i},1);renderPpl()">✕</b></span>`
  ).join('');
}
function pplSuggest(){
  const inp=document.getElementById('pplIn'), sug=document.getElementById('pplSug');
  const v=inp.value.trim();
  if(!v.startsWith('@')){ sug.style.display='none'; return; }
  const q=v.slice(1);
  const taken=new Set(editPeople.filter(x=>typeof x==='object').map(x=>x.uid));
  const hits=MEMBERS.filter(m=>!taken.has(m.uid) && (!q || m.nick.includes(q))).slice(0,6);
  sug.innerHTML = hits.length
    ? hits.map(m=>`<div class="si" onclick="pplPick('${m.uid}')">@${m.nick}<span>${(m.joined||'').slice(2)}</span></div>`).join('')
    : `<div class="si none">'${q}' 닉네임의 회원이 없어요</div>`;
  sug.style.display='block';
}
function pplPick(uid){
  const m=MEMBERS.find(m=>m.uid===uid); if(!m) return;
  editPeople.push({uid, label:m.nick});
  document.getElementById('pplIn').value='';
  document.getElementById('pplSug').style.display='none';
  renderPpl();
}
function pplCommit(){
  const inp=document.getElementById('pplIn');
  const v=inp.value.trim(); if(!v) return;
  if(v.startsWith('@')){
    // @입력 후 엔터 — 정확히 일치하는 회원이 있으면 태그, 없으면 무시
    const m=MEMBERS.find(m=>m.nick===v.slice(1));
    if(m) pplPick(m.uid);
    return;
  }
  if(!editPeople.includes(v)) editPeople.push(v);
  inp.value=''; document.getElementById('pplSug').style.display='none';
  renderPpl();
}

function savePast(){
  pplCommit();                       // 입력창에 쓰다 만 이름도 챙긴다
  xgCommit();
  const v=id=>document.getElementById(id).value.trim();
  const d=v('e_d');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d)){ alert('날짜를 2026-08-08 형식으로 적어주세요'); return; }
  const rn=v('e_r');
  edits[d]={
    d, dow:v('e_dow'), s:v('e_s'), e:v('e_e'),
    r: rn?+rn:null, kind: rn?'round':'flash',
    place:v('e_place'), fee:v('e_fee'), after:v('e_after'), memo:v('e_memo'),
    people: editPeople.slice(),
    played: [...document.querySelectorAll('#gsel .gs.on')].map(el=>el.dataset.n).concat(extraPlayed),
  };
  const rec = edits[d];
  lsSet(RKEY,JSON.stringify(edits));   // 일단 로컬에 남겨 유실을 막는다
  (async()=>{
    try{
      await API.pastSave(rec);
      serverPast = await API.pastList();
      delete edits[d]; lsSet(RKEY,JSON.stringify(edits));   // 서버 성공 후에만 로컬 정리
    }
    catch(e){ alert('서버 저장에 실패했어요. 이 기기에는 남아 있으니 네트워크 확인 후 다시 저장해주세요.'); }
    closeM(); schedScrolled=true; renderSched();
  })();
}
/* 기록 삭제 — 실수로 지우면 되돌릴 수 없어서 화면에서는 뺐다.
   지워야 할 일이 생기면 서버(meetings)에서 직접 정리한다. */
function delPast(d){
  if(!confirm('이 기록을 지울까요?')) return;
  delete edits[d]; lsSet(RKEY,JSON.stringify(edits));
  (async()=>{
    try{ await API.pastDelete(d); serverPast = await API.pastList(); }catch(e){}
    closeM(); schedScrolled=true; renderSched();
  })();
}

/* ══ 마이페이지 ══ */
function renderMePage(){
  const body=document.getElementById('meBody');
  if(!acc){
    body.innerHTML=`<div class="empty">로그인하면 내 활동 기록을 볼 수 있어요.<br><br>
      <span style="display:inline-block;background:var(--red);color:#fff;padding:11px 20px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer" onclick="askNick('login')">로그인 · 가입하기</span></div>`;
    return;
  }
  const list = pastList();
  const mineRounds = list.filter(p=>(p.people||[]).some(pIsMe)).sort((a,b)=>a.d.localeCompare(b.d));
  const cnt = mineRounds.length;
  const first = mineRounds[0], last = mineRounds[cnt-1];
  /* 날짜 계산도 모임이 열리는 곳(KST) 기준 — TUNEL.at 이 시간대를 붙여 만든다 */
  const daysSince = first ? Math.floor((TODAY - TUNEL.at(first.d))/86400000) : null;

  const playedSet = new Set();
  mineRounds.forEach(p=>(p.played||[]).forEach(g=>playedSet.add(g)));
  const wish = favs.filter(n=>!playedSet.has(n));
  const next = upcoming[0];
  const dday = next ? Math.round((TUNEL.at(next.d) - TODAY)/86400000) : null;

  body.innerHTML=`
    <div class="hero" style="text-align:center;position:relative">${TUNEL.joalarmHeart()}
      <div class="attbadge"><div class="an">${cnt}</div><div class="al">회 참석</div></div>
      <div class="dt" style="margin-top:12px">${acc.nick}</div>
      <div class="tm">${isAdmin()?'관리자':acc.role==='staff'?'운영진':acc.scribe?'서기':'첫밤 사망자 클럽 멤버'}</div>
      ${myMemberNo()?`<div class="memno">No. ${myMemberNo()}</div>`:''}
      <div class="rows" style="text-align:left">
        <div class="rw"><div class="k">참석</div><div>${cnt?`${cnt}번`:'아직 기록 없음'}</div></div>
        ${first?`<div class="rw"><div class="k">첫 참석</div><div>${first.d.replace(/-/g,'.')} (${first.dow}) · ${daysSince}일 전</div></div>`:''}
        ${last&&cnt>1?`<div class="rw"><div class="k">최근</div><div>${last.d.replace(/-/g,'.')} (${last.dow})</div></div>`:''}
        <div class="rw"><div class="k">해본 게임</div><div>${playedSet.size?playedSet.size+'가지':'아직 기록 없음'}</div></div>
        ${acc.joined?`<div class="rw"><div class="k">가입일</div><div>${acc.joined.replace(/-/g,'.')}</div></div>`:''}
        ${acc.aliases?.length?`<div class="rw"><div class="k">옛 닉네임</div><div>${acc.aliases.join(', ')}<br><span style="color:var(--sub);font-size:11px">이 이름으로 남은 기록도 함께 잡혀요</span></div></div>`:''}
        <div class="rw"><div class="k">내 아이디</div><div style="font-family:ui-monospace,monospace;font-size:11.5px;color:var(--sub)">${acc.uid.slice(0,8)}</div></div>
      </div>
    </div>

    ${next?`<div class="notice" style="text-align:center">다음 모임 <b style="color:var(--red-lite)">${fmt(next.d)} (${next.dow})</b>
      ${dday===0?'· 오늘이에요!':dday>0?`· D-${dday}`:''}</div>`:''}

    <div class="label">시계탑 전적 · 당산나무 베타</div>
    <div id="dgAct"><div class="dgbox"><div class="dgnone">불러오는 중…</div></div></div>

    ${picks.length?`
      <div class="label">이번 회차에 고른 게임 · ${picks.length}개</div>
      <div class="picked" style="margin:0 14px">${picks.join(' · ')}</div>`:''}

    ${playedSet.size?`
      <div class="label">해본 게임 · ${playedSet.size}가지</div>
      <div class="tags" style="margin:0 18px">${[...playedSet].map(n=>`<span class="tg done">${n}</span>`).join('')}<span class="tg" style="opacity:.45">?</span></div>
      <div class="notice">도장은 참석한 회차의 기록에서 저절로 찍혀요.</div>`:''}

    <div class="label">내 즐겨찾기 · ${favs.length}개</div>
    ${favs.length
      ? `<div class="tags" style="margin:0 18px">${favs.map(n=>`<span class="tg${playedSet.has(n)?' done':''}">${playedSet.has(n)?'✓ ':''}${n}</span>`).join('')}</div>
         ${wish.length?`<div class="notice">다음에 해봐요 — <b style="color:var(--red-lite)">${wish.join(' · ')}</b></div>`:''}`
      : `<div class="empty" style="padding:22px">게임 도감에서 ★를 눌러 담아보세요.</div>`}

    <div class="label">내가 참여한 모임</div>
    ${cnt ? [...mineRounds].reverse().map(p=>`
        <div class="rd">
          <div class="top">
            <span class="dt">${fmt(p.d)} <span style="font-size:14px">(${p.dow})</span></span>
            <span class="tm">${p.s}~${p.e}</span>
            <span class="st done">${p.kind==='flash'?'번개':(p.r?p.r+'회차':'정모')}</span>
          </div>
          <div class="pl">${p.place}</div>
          ${(p.played||[]).length?`<div class="tags">${p.played.map(g=>`<span class="tg">${g}</span>`).join('')}</div>`:''}
        </div>`).join('')
      : `<div class="empty" style="padding:26px 20px">아직 참여 기록이 없어요.<br>
          모임에 다녀오면 관리자가 참여자를 기록합니다.</div>`}

    <div class="notice">닉네임을 바꿔도 활동 기록은 그대로 따라옵니다. 계정은 내 아이디로 구분되고,
      예전에 쓰던 닉네임도 같이 기억해뒀다가 대조하거든요.</div>
    <div style="margin:14px"><button class="abtn ghost" onclick="askNick()">내 정보</button></div>
    <div class="notice" style="border-color:var(--red)">📲 <b style="color:var(--red-lite)">홈 화면에 추가</b>해두면 앱처럼 바로 열려요.<br>
      <span style="font-size:11.5px">갤럭시는 크롬 메뉴 → "홈 화면에 추가", 아이폰은 사파리 공유 → "홈 화면에 추가".
      나중에 회차 알림도 여기로 받을 수 있게 준비 중이에요.</span></div>
    <footer>즐겨찾기는 이 기기에, 고른 게임은 서버에 저장돼요</footer>`;
  try{ dangsanGames().then(gs => { const el = document.getElementById('dgAct'); if(el) el.innerHTML = dangsanActivityHtml(gs); }); }catch(e){}
}

/* ══ 회원관리 (관리자 전용) ══ */
let MEMS = [];
async function renderMembers(){
  const body=document.getElementById('memBody');
  body.innerHTML=`<div class="empty"><span class="spin"></span> 회원 불러오는 중…</div>`;
  try{ MEMS = await API.list(); }
  catch(e){ body.innerHTML=`<div class="empty">회원을 못 불러왔어요.<br>${e.message}</div>`; return; }

  const list=pastList();
  const cntOf = m => list.filter(p=>(p.people||[]).some(x=>
    (typeof x==='object' && x.uid===m.uid) || (typeof x==='string' && [m.nick,...(m.aliases||[])].includes(x)))).length;
  let agg='';
  if(openRound){
    try{
      const rows = await API.allPicks(openRound.d);
      const tally={};
      rows.forEach(r=>r.games.forEach(g=>tally[g]=(tally[g]||0)+1));
      const sorted=Object.entries(tally).sort((a,b)=>b[1]-a[1]);
      if(sorted.length){
        const grp={};
        sorted.forEach(([g,c])=>{const gm=GAMES.find(x=>x.n===g); const o=(gm?ownerName(gm):'')||'미지정';(grp[o]=grp[o]||[]).push(`${g} ${c}표`);});
        agg=`<div class="adminbox">
          <div class="at">🗳️ ${fmt(openRound.d)} 회차 게임 집계 · ${rows.length}명 참여</div>
          ${sorted.slice(0,8).map(([g,c])=>`<div class="row"><b>${g}</b> — ${c}표</div>`).join('')}
          <div class="at" style="margin-top:12px">🎒 챙겨갈 목록</div>
          ${Object.entries(grp).map(([o,ns])=>`<div class="row"><b>${o}</b> — ${ns.join(', ')}</div>`).join('')}
        </div>`;
      } else {
        agg=`<div class="notice">${fmt(openRound.d)} 회차에 아직 게임을 고른 사람이 없어요.</div>`;
      }
    }catch(e){}
  }

  body.innerHTML=`
    <div class="label">회원 ${MEMS.length}명</div>
    ${agg}
    <div class="notice">입금자 실명은 계좌이체 대조용이에요. 참가자에게는 안 보입니다.</div>
    <div style="margin-top:12px">${MEMS.map((m,i)=>`
      <div class="mem${m.admin?' adm':''}${m.role==='banned'?' ban':''}">
        <div class="top">
          <span class="nm">${m.nick}</span>
          <span class="pn">${m.payname||'실명 없음'}</span>
          ${m.admin?'<span class="tag">관리자</span>':m.role==='banned'?'<span class="tag ban">정지</span>':m.role==='staff'?'<span class="tag staff">운영진</span>':m.scribe?'<span class="tag scribe">서기</span>':m.scribeReady?'<span class="tag ready">서기 대기</span>':''}
        </div>
        <div class="sub2">
          가입 ${(m.joined||'').replace(/-/g,'.')} · 참석 ${cntOf(m)}번
          ${m.aliases?.length?`<br>옛 닉네임 — ${m.aliases.join(', ')}`:''}
          <br><span style="font-family:ui-monospace,monospace">${m.uid.slice(0,8)}</span>
        </div>
        <div class="btns">
          <span class="b" onclick="memEdit(${i})">✏️ 수정</span>
          ${isAdmin()&&!m.admin?`<span class="b" onclick="memRole(${i})">${m.role==='banned'?'⛔ 정지됨':m.role==='staff'?'🛠 운영진':'👤 일반'} ▾</span>`:''}
          ${isAdmin()&&!m.admin&&m.scribeReady&&!m.scribe?`<span class="b" onclick="memScribe(${i},true)">📜 서기 승인</span>`:''}
          ${isAdmin()&&!m.admin&&m.scribe?`<span class="b" onclick="memScribe(${i},false)">📜 서기 해제</span>`:''}
          ${isAdmin()&&!m.admin?`<span class="b d" onclick="memDel(${i})">삭제</span>`:''}
        </div>
      </div>`).join('')||`<div class="empty">아직 가입한 회원이 없어요.</div>`}
    <div style="margin:14px"><button class="abtn ghost" onclick="renderMembers()">🔄 새로고침</button></div>
    <footer>회원 정보는 서버에 저장됩니다</footer>`;
}
function memEdit(i){
  const m=MEMS[i];
  document.getElementById('modal').innerHTML=`
    <h2>${m.nick}</h2>
    <div class="mdesc">닉네임을 바꾸면 옛 이름이 기록에 남아 지난 활동이 계속 잡힙니다.</div>
    <div class="fld"><label>닉네임</label><input id="m_nick" value="${m.nick}"></div>
    <div class="fld"><label>입금자 실명</label><input id="m_pay" value="${m.payname||''}"></div>
    <div id="joinErr" style="display:none;color:var(--red-lite);font-size:12px;margin-top:9px"></div>
    <div class="mbtns"><button class="mbtn" id="authBtn" onclick="memSave(${i})">저장</button></div>
    <button class="mclose" onclick="closeM()">닫기</button>`;
  document.getElementById('ov').style.display='flex';
}
/* 관리 조작은 전부 서버 RPC — 브라우저를 조작해도 서버가 관리자 여부를 재검증한다 */
async function memSave(i){
  const m=MEMS[i];
  const n=document.getElementById('m_nick').value.trim();
  const p=document.getElementById('m_pay').value.trim();
  if(!n) return joinErr('닉네임을 적어주세요.');
  if(!NICK_RE.test(n)) return joinErr('닉네임은 한글만 쓸 수 있어요 (1~10자).');
  busy('저장 중');
  try{
    await API.adminUpdate(m.uid, n, p);
    if(acc && acc.uid===m.uid){ acc = await API.get(m.uid); renderMe(); }
    closeM(); renderMembers();
  }catch(e){ joinErr(e.message); }
}
async function memDel(i){
  if(!isAdmin()) return;
  const m=MEMS[i];
  if(!confirm(`${m.nick} 회원을 지울까요? 되돌릴 수 없어요.`)) return;
  try{ await API.remove(m); renderMembers(); }
  catch(e){ alert('삭제에 실패했어요: '+e.message); }
}
async function memScribe(i, on){
  if(!isAdmin()) return;
  try{ await API.adminSetScribe(MEMS[i].uid, on); renderMembers(); }
  catch(e){ alert('저장에 실패했어요: '+e.message); }
}
/* 등급 변경 — 일반 / 운영진 / 정지 중에서 고른다 */
const ROLE_OPTS = [
  { v:'',       t:'일반 회원', d:'모임에 참여하는 보통 회원이에요.' },
  { v:'staff',  t:'운영진',   d:'회원 목록과 게임 소유자를 볼 수 있고 기록을 남길 수 있어요.' },
  { v:'banned', t:'정지',     d:'로그인은 되지만 참석 신청·게임 고르기·기록 작성이 모두 막혀요.' },
];
function memRole(i){
  if(!isAdmin()) return;
  const m=MEMS[i];
  if(m.admin) return;
  const cur = m.role || '';
  document.getElementById('modal').innerHTML=`
    <h2>${m.nick} 등급</h2>
    <div class="mdesc">언제든 되돌릴 수 있어요.</div>
    <div class="ropts">
      ${ROLE_OPTS.map(o=>`
        <label class="ropt${o.v===cur?' on':''}${o.v==='banned'?' danger':''}">
          <input type="radio" name="mrole" value="${o.v}"${o.v===cur?' checked':''}>
          <div><b>${o.t}</b><span>${o.d}</span></div>
        </label>`).join('')}
    </div>
    <div class="mbtns"><button class="mbtn" onclick="memRoleSave(${i})">저장</button></div>
    <button class="mclose" onclick="closeM()">닫기</button>`;
  document.getElementById('ov').style.display='flex';
  document.querySelectorAll('.ropt input').forEach(r=>r.addEventListener('change',()=>{
    document.querySelectorAll('.ropt').forEach(l=>l.classList.toggle('on', l.querySelector('input').checked));
  }));
}
async function memRoleSave(i){
  if(!isAdmin()) return;
  const m=MEMS[i];
  const v = document.querySelector('.ropt input:checked')?.value ?? '';
  if((m.role||'') === v){ closeM(); return; }
  if(v==='banned' && !confirm(`${m.nick} 회원을 정지할까요?\n로그인은 되지만 참석·기록·게임 고르기가 막혀요.`)) return;
  try{
    await API.adminSetRole(m.uid, v || null);
    closeM(); renderMembers();
  }catch(e){ alert('저장에 실패했어요: '+e.message); }
}
