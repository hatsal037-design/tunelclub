/* 첫밤 사망자 클럽 — 사람 — 참여자 표기·프로필·서기 각성·좋알람
   index.html 한 파일에 있던 것을 2026-08-23에 나눴다.
   순수 스크립트라 전역이 그대로 이어진다 — index.html 의 실행 순서를 바꾸지 말 것. */
/* ══ 참여자 표기 ══
   people 배열의 항목은 두 종류다.
     "이름"        수기 기록 — 그대로 보여준다
     { uid:"..." }  회원 태그 — 지금 닉네임을 찾아 보여준다. 닉변해도 따라간다 */
/* 게임 소유자 — 서버 지정(uid)이 우선, 없으면 games.js의 own(씨앗 이름) */
function ownerUid(g){ return OWNERS[g.n] || null; }
function ownerName(g){
  const uid = ownerUid(g);
  if(uid){ const m=MEMBERS.find(m=>m.uid===uid); return m ? m.nick : '(탈퇴한 회원)'; }
  return g.own || '';
}
/* 이 게임 소유자 정보를 볼 수 있는가 — 관리자·운영진이거나, 내가 그 소유자이거나 */
function canSeeOwner(g){
  if(isStaff()) return true;
  const uid = ownerUid(g);
  if(uid && acc && uid===acc.uid) return true;
  // 씨앗 이름(문자열) 소유는 내 닉네임과 일치할 때만
  if(!uid && g.own && acc && myNames().includes(g.own)) return true;
  return false;
}

/* 참여자 항목 → 회원 찾기. 이름 문자열로 기록됐어도 그 닉네임(옛 닉 포함)을
   쓰는 회원이 있으면 회원으로 본다 — 나중에 가입해도 자동으로 연결된다 */
function pMember(x){
  if(typeof x === 'object') return MEMBERS.find(m=>m.uid===x.uid) || null;
  return MEMBERS.find(m=>m.nick===x || (m.aliases||[]).includes(x)) || null;
}
function pName(x){
  const m = pMember(x);
  if(m) return m.nick;
  return typeof x === 'string' ? x : (x.label || '(탈퇴한 회원)');
}
function pIsMe(x){
  if(!acc) return false;
  if(typeof x === 'object') return x.uid === acc.uid;
  return myNames().includes(x);
}
/* ══ 프로필 (썸네일 + 카드) ══ */
const PFP = {};   // uid → dataURL(사진) 또는 null(없음). 세션 캐시
async function loadPfps(uids){
  await Promise.all([...new Set(uids)].filter(u=>!(u in PFP)).map(async u=>{
    try{ PFP[u] = await API.pfpGet(u); }catch(e){ PFP[u]=null; }
  }));
}
function avColor(key){
  let h=0; for(const c of key) h=(h*31+c.charCodeAt(0))%360;
  return `hsl(${h},45%,42%)`;
}
/* 칩 안에 들어가는 작은 동그라미 — 사진 있으면 사진, 없으면 색+첫글자 */
function avHtml(uid, nick){
  const p = PFP[uid];
  return p ? `<i style="background:url('${p}') center/cover"></i>`
           : `<i style="background:${avColor(uid)}">${(nick||'?')[0]}</i>`;
}
/* 참석자 프로필 카드 */
async function openProfile(key, backD){
  const m = MEMBERS.find(x=>x.uid===key);
  const back = backD ? `<div class="mbtns"><button class="mbtn ghost" onclick="openPast('${backD}')">← 모임으로</button></div>` : '';
  if(!m){
    document.getElementById('modal').innerHTML=`
      <h2>${key}</h2>
      <div class="mdesc">비회원 참가자예요. 아직 앱에 가입하지 않아서 프로필이 없어요.</div>
      ${back}<button class="mclose" onclick="closeM()">닫기</button>`;
    document.getElementById('ov').style.display='flex';
    return;
  }
  await loadPfps([m.uid]);
  const list = pastList();
  const att = list.filter(p=>(p.people||[]).some(x=>
    (typeof x==='object' && x.uid===m.uid) || (typeof x==='string' && [m.nick,...(m.aliases||[])].includes(x)))).length;
  const met = (acc && acc.uid!==m.uid) ? metTimes(m.uid) : null;
  const ph = PFP[m.uid];
  document.getElementById('modal').innerHTML=`
    <h2>프로필</h2>
    <div class="pfcard">
      <div class="av" style="${ph?`background:url('${ph}') center/cover`:`background:${avColor(m.uid)}`}">${ph?'':m.nick[0]}</div>
      <div>
        <div class="nm3">${m.nick}</div>
        <div class="sb3">No. ${m.no!=null?String(m.no).padStart(4,'0'):'—'}${m.admin?' · 관리자':m.role==='staff'?' · 운영진':m.scribe?' · 서기':''}</div>
      </div>
    </div>
    <div style="margin-top:12px">
      <div class="mrow"><div class="k">참석</div><div>${att?att+'번':'아직 기록 없음'}</div></div>
      <div class="mrow"><div class="k">가입일</div><div>${(m.joined||'').replace(/-/g,'.')||'—'}</div></div>
      ${met!=null?`<div class="mrow"><div class="k">나와</div><div>${met?`${met}번 같이 했어요`:'아직 같은 회차가 없었어요'}</div></div>`:''}
      <div id="dgProf"></div>
    </div>
    ${back}<button class="mclose" onclick="closeM()">닫기</button>`;
  document.getElementById('ov').style.display='flex';
  /* 당산나무 전적은 서버에서 따로 온다 — 시트를 먼저 띄우고 채운다 (2026-09-20 회원 통합) */
  dangsanGames().then(gs => { const el = document.getElementById('dgProf'); if(el) el.innerHTML = dangsanProfileHtml(gs, m); });
}
function meetKeyOf(x){
  if(typeof x==='object') return x.uid;
  const m = MEMBERS.find(m=>m.nick===x || (m.aliases||[]).includes(x));
  return m ? m.uid : x;
}
function myMeetCounts(){
  if(!acc) return {};
  const counts = {};
  pastList().forEach(p=>{
    const ppl = p.people||[];
    if(!ppl.some(pIsMe)) return;             // 내가 안 간 회차는 제외
    ppl.forEach(x=>{
      if(pIsMe(x)) return;                   // 나 자신 제외
      const key = meetKeyOf(x);
      counts[key] = (counts[key]||0)+1;
    });
  });
  return counts;
}
/* 특정 회원을 몇 번 만났나 (표기용 헬퍼 — 나중에 UI 붙일 때 이걸 쓰면 됨) */
function metTimes(uidOrName){
  return myMeetCounts()[uidOrName] || 0;
}

/* ══ 서기 각성 ══
   참석 10회를 채우면 본인에게 "능력이 깨어날 준비가 됐다"는 카드가 한 번 뜨고,
   관리자가 회원관리에서 승인하면 진짜 권한(지난모임 기록)이 붙는다.
   acc.scribeReady: 알림 봤음 / acc.scribe: 승인됨 / acc.scribeHello: 임명 축하 봤음 */
async function checkScribe(){
  if(!acc || acc.admin || acc.role==='staff') return;
  if(acc.scribe && !acc.scribeHello){
    acc.scribeHello = true;
    try{ await API.save(acc); }catch(e){}
    scribeModal(true);
  } else if(!acc.scribe && !acc.scribeReady && myAttendance() >= SCRIBE_MIN){
    acc.scribeReady = true;
    try{ await API.save(acc); }catch(e){}
    scribeModal(false);
  }
}
function scribeModal(appointed){
  document.getElementById('modal').innerHTML = appointed ? `
    <h2 style="text-align:center">📜</h2>
    <div class="hero" style="margin:10px 0 0;text-align:center">
      <div class="dt">서기로 임명되었습니다</div>
      <div class="tm">이제 일정 탭에서 지난 모임을 기록할 수 있어요.<br>
        그날 한 게임과 참여자를 남겨주세요 — 참석 기록·만난 횟수가 전부 여기서 나옵니다.</div>
    </div>
    <button class="mclose" onclick="closeM();renderSched()">시작하기</button>` : `
    <h2 style="text-align:center">🌙</h2>
    <div class="hero" style="margin:10px 0 0;text-align:center">
      <div class="dt">밤이 지나고… 능력이 깨어날 준비가 되었습니다</div>
      <div class="tm">${SCRIBE_MIN}번의 밤을 살아남은 당신에게 <b style="color:var(--red-lite)">서기</b>의 자격이 생겼어요.<br>
        촌장의 승인이 떨어지면 능력이 활성화됩니다.</div>
    </div>
    <button class="mclose" onclick="closeM()">기다리기</button>`;
  document.getElementById('ov').style.display='flex';
}

/* ══ 좋알람 (히든) ══
   들어가는 길: 내 활동의 하트(한 번 = 설명, 다섯 번 = 열기). 2026-09-25 부터 서버가 지키는 공용 좋알람(tunel.js joalarm*)으로 바뀌었다.
   옛 방식(폰에서 암호화한 public.crush)은 저장된 지목이 없어 옮길 것 없이 걷었다 — 코드는 git 기록에 있다. */
