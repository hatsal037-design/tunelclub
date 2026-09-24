/* 오늘의 잔디밭 — 화면 (2026-09-24 v2, Claude)
   흐름: 카카오 로그인 → 투넬 가입 확인 → 입장 코드 → 잔디밭(지금·일정·이야기·사진·투표·운영).
   권한 판단은 전부 서버(meadow_action)가 한다. 여기서는 그리기만.
   ?demo=1 · ?demo=guest 면 demo.js 의 가짜 서버를 쓴다. */
(function(){
'use strict';
const M=window.MeadowModel,esc=M.esc,$=s=>document.querySelector(s);
const qs=new URLSearchParams(location.search);
const SLUG=qs.get('event')||'hangang-2026-10-03';
const DEMO=qs.has('demo');
let S=null,tab='now',chatLast=0,unread=0,busy=false,preview=null,mixBy='count',mixN=null,mixTitle=null,zoom=null;

/* ── 서버 ─────────────────────────────────────────── */
const Real={
 async rpc(action,payload={}){
  const {data,error}=await TUNEL.sb().rpc('meadow_action',{p_event:SLUG,p_action:action,p_payload:payload});
  if(error)throw Object.assign(Error(['PGRST202','42883','42P01','42703'].includes(error.code)?'잔디밭 서버가 아직 열리지 않았어요. 운영진 안내를 기다려 주세요.':'연결이 불안해요. 잠시 뒤 다시 해 주세요.'),{code:error.code});
  if(data?.error)throw Object.assign(Error(data.error.message||'이 작업을 할 수 없어요.'),{code:data.error.code});
  return data;
 },
 async upload(blob,caption,contest){
  const r=await Real.rpc('photo_reserve',{caption,contest,consent:true,mime:'image/jpeg'});
  const st=TUNEL.sb().storage.from('meadow-photos');
  const {error}=await st.upload(r.path,blob,{contentType:'image/jpeg',upsert:false,cacheControl:'60'});
  if(error){await Real.rpc('photo_remove',{id:r.id}).catch(()=>{});throw Error('사진을 올리지 못했어요. 다시 해 주세요.');}
  return Real.rpc('photo_publish',{id:r.id});
 },
 _urls:new Map(),
 async photoUrl(p){
  const hit=Real._urls.get(p.path);if(hit&&hit.until>Date.now())return hit.url;
  const {data,error}=await TUNEL.sb().storage.from('meadow-photos').createSignedUrl(p.path,3600);
  if(error)return '';Real._urls.set(p.path,{url:data.signedUrl,until:Date.now()+50*60000});return data.signedUrl;
 }
};
const server=DEMO?MeadowDemo.create(qs.get('demo')!=='guest'):Real;

/* ── 작은 도구 ─────────────────────────────────────── */
let toastT;
function toast(t){const el=$('#toast');el.textContent=t;el.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>el.hidden=true,3200);}
const hm=iso=>{try{return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(iso));}catch(e){return '';}};
const nickOf=id=>(S?.people||[]).find(p=>p.id===id)?.nick||'나간 사람';
const typing=()=>{const a=document.activeElement;return a&&a.matches('input,textarea')&&a.value;};
async function act(action,payload,okMsg){
 if(busy)return;busy=true;
 try{const d=await server.rpc(action,payload);if(d&&d.joined!==undefined)S=d;if(okMsg)toast(okMsg);render();return d;}
 catch(e){toast(e.message);}finally{busy=false;}
}
function setTab(t){tab=t;history.replaceState(null,'','#'+t);if(t==='chat'){unread=0;$('#chatDot').hidden=true;}render();window.scrollTo(0,t==='chat'?document.body.scrollHeight:0);}

/* ── 들어오기 전 ───────────────────────────────────── */
function gate(html){$('#tabs').hidden=true;$('#view').innerHTML=html;}
function viewLogin(){
 gate(`<section class="card tape stack"><h2>잔디밭에 들어오려면</h2>
  <p>로그인하고 입장 코드를 넣으면 들어와요.</p>
  <button class="btn wide" id="kakao" type="button">카카오로 로그인</button>
  </section>`);
 $('#kakao').onclick=()=>TUNEL.sb().auth.signInWithOAuth({provider:'kakao',options:{redirectTo:location.origin+location.pathname+location.search}});
}
function viewSignup(){
 gate(`<section class="card tape stack"><h2>투넬 가입을 먼저 마쳐 주세요</h2>
  <p>투넬에서 닉네임을 정하고 다시 와 주세요.</p>
  <a class="btn wide" href="../../#me">투넬에서 가입하기</a></section>`);
}
function viewJoin(){
 gate(`<section class="card tape stack"><h2>입장 코드를 넣어 주세요</h2>
  <form id="joinF" class="stack"><input class="codein" id="code" type="text" inputmode="latin" autocomplete="off" autocapitalize="characters" maxlength="32" placeholder="ABCD2345" required>
  <button class="btn wide" type="submit">잔디밭 들어가기</button></form>
  ${S.is_host?'<button class="link" id="hostJoin" type="button">운영진으로 바로 들어가기</button>':''}</section>`);
 $('#joinF').onsubmit=e=>{e.preventDefault();act('join',{code:$('#code').value.trim()},'잔디밭에 들어왔어요');};
 if($('#hostJoin'))$('#hostJoin').onclick=()=>act('join',{},'운영진으로 들어왔어요');
}

/* ── 지금 ─────────────────────────────────────────── */
function myTeam(){const t=S.teams||[];const i=t.findIndex(g=>g.includes(S.me.id));return i;}
function teamsHTML(highlight=true){
 const t=S.teams||[];if(!t.length)return '';
 const mine=myTeam();
 return `<div class="teams">${t.map((g,i)=>`<div class="team${highlight&&i===mine?' mine':''}"><h4>${i+1}조</h4><ul>${g.map(id=>`<li${id===S.me.id?' class="me"':''}>${esc(nickOf(id))}</li>`).join('')}</ul></div>`).join('')}</div>`;
}
function viewNow(){
 const e=S.event,sc=e.schedule||[],i=e.now_idx,cur=sc[i],nxt=sc[i+1];
 const a=S.announcements||[],mine=myTeam(),me=S.people.find(p=>p.id===S.me.id);
 return `
 ${a.length?`<section class="card tape notice"><h3>공지</h3><p style="margin-top:6px">${esc(a[0].body)}</p><div class="at">${hm(a[0].at)}</div>
   ${a.length>1?`<details class="olds"><summary>지난 공지 ${a.length-1}개</summary>${a.slice(1).map(x=>`<div class="item">${esc(x.body)}<small>${hm(x.at)}</small></div>`).join('')}</details>`:''}</section>`:''}
 <div class="lab">지금 하는 것</div>
 <section class="card now">${cur?`<p class="muted">${esc(cur[0])} 부터</p><div class="big">${esc(cur[1])}</div>`:`<div class="big">곧 시작해요</div>`}
   ${nxt?`<div class="next"><b>${esc(nxt[0])}</b><span>다음 · ${esc(nxt[1])}</span></div>`:''}</section>
 ${(S.teams||[]).length?`<div class="lab">${esc(e.teams_title||'오늘의 조')}</div>
   <section class="card">${mine>=0?`<h2>나는 <span class="big" style="font-size:36px">${mine+1}조</span></h2>`:'<p class="muted">이번 조에는 내 이름이 없어요. 운영진에게 말해 주세요.</p>'}${teamsHTML()}</section>`:''}
 <div class="lab">오늘 잔디밭</div>
 <section class="card cream"><div class="toggle"><div><b>오늘 온 사람 ${S.people.length}명</b></div></div>
   <div class="toggle"><div><b>뒤풀이도 남아요</b></div>
   <button class="btn ${me?.after?'on':'ghost'}" data-after="${me?.after?0:1}" type="button">${me?.after?'남아요':'아직 몰라요'}</button></div>
   ${me?.after&&S.event.after_mode==='groups'&&me.group?`<p style="margin-top:8px"><b>뒤풀이 ${me.group}조</b> · ${S.people.filter(p=>p.group===me.group).map(p=>esc(p.nick)).join(', ')}</p>`:''}</section>
 <div class="crowd" aria-hidden="true"><img src="../img/fig_sit.webp" style="left:12%;height:52px" alt=""><img src="img/cooler.webp" style="left:44%;height:44px" alt=""><img src="../img/fig_lie.webp" style="right:10%;width:80px" alt=""></div>`;
}

/* ── 일정 ─────────────────────────────────────────── */
function viewSched(){
 const e=S.event,sc=e.schedule||[];
 return `<div class="lab">오늘 순서</div><section class="card tape"><h2>${esc(e.title)}</h2>
  <ul class="sched" style="margin-top:10px">${sc.map((r,i)=>`<li class="${i<e.now_idx?'done':i===e.now_idx?'cur':''}"><time>${esc(r[0])}</time><span>${esc(r[1])}</span>${i===e.now_idx?'<span class="pin">지금</span>':''}</li>`).join('')}</ul></section>
  ${(S.teams||[]).length?`<div class="lab">${esc(e.teams_title||'오늘의 조')}</div><section class="card">${teamsHTML()}</section>`:''}`;
}

/* ── 이야기 ───────────────────────────────────────── */
function chatHTML(list){
 return list.map(c=>`<div class="msg${c.mine?' mine':''}" data-id="${c.id}">${c.mine?'':`<div class="who">${esc(c.nick)}</div>`}<div class="body">${esc(c.body)}</div>
  <div class="t">${hm(c.at)}${c.mine||S.is_host?` <button class="rm" data-chatrm="${c.id}" type="button">지우기</button>`:''}</div></div>`).join('');
}
function viewChat(){
 return `<div class="chat" id="chat">${(S.chat||[]).length?chatHTML(S.chat):'<p class="muted" style="text-align:center;margin-top:30px">첫 인사를 남겨 보세요.</p>'}</div>
  <div class="composer"><form id="chatF"><input id="chatIn" type="text" maxlength="300" autocomplete="off" placeholder="메시지 보내기" enterkeyhint="send"><button class="btn" type="submit">보내기</button></form></div>`;
}
async function pollChat(){
 if(!S?.joined||busy)return;
 try{
  const d=await server.rpc('chat_since',{after:chatLast});const add=(d.chat||[]).filter(c=>!(S.chat||[]).some(x=>x.id===c.id));
  if(!add.length)return;S.chat=(S.chat||[]).concat(add).slice(-120);chatLast=S.chat[S.chat.length-1].id;
  if(tab==='chat'){const box=$('#chat');if(box){const atEnd=window.innerHeight+window.scrollY>=document.body.scrollHeight-80;if(box.querySelector('.muted'))box.innerHTML='';box.insertAdjacentHTML('beforeend',chatHTML(add));if(atEnd)window.scrollTo(0,document.body.scrollHeight);}}
  else{unread+=add.filter(c=>!c.mine).length;if(unread){$('#chatDot').textContent=unread>9?'9+':unread;$('#chatDot').hidden=false;}}
 }catch(e){}
}

/* ── 사진 ─────────────────────────────────────────── */
function photoCard(p,voting){
 const mine=S.my_vote===p.id;
 return `<figure class="pic">${p.contest?'<span class="tag">출품</span>':''}${p.votes!=null&&p.contest?`<span class="cnt">${p.votes}표</span>`:''}
  <img data-src="${esc(p.id)}" alt="${esc(p.caption||'참가자가 올린 사진')}">
  <figcaption><div class="cap">${esc(p.caption)}</div><div class="by">${esc(p.nick)}</div>
  ${voting&&p.contest?`<button class="btn votebtn ${mine?'on':''}" data-vote="${esc(p.id)}" type="button">${mine?'내가 고른 사진':'이 사진에 한 표'}</button>`:''}
  ${p.mine||S.is_host?`<button class="rm" data-photorm="${esc(p.id)}" type="button">사진 내리기</button>`:''}</figcaption></figure>`;
}
function viewPhoto(){
 const ph=S.photos||[];
 return `<div class="lab">사진 올리기</div>
 <section class="card tape"><form id="upF" class="stack">
  <label class="btn ghost wide filepick"><input id="file" type="file" accept="image/jpeg,image/png,image/webp" required hidden><span id="fileName">사진 고르기</span></label>
  <input id="cap" type="text" maxlength="120" placeholder="한 줄 설명 (예: 노을 지는 돗자리)">
  <label class="check"><input id="contest" type="checkbox" checked><span>«오늘의 사진» 투표에도 낼게요</span></label>
  <button class="btn wide" type="submit">올리기</button>
  <p class="muted">개인 SNS 에 올릴 땐 사진 속 사람에게 먼저 물어봐 주세요.</p></form></section>
 <div class="lab">우리 사진첩 · ${ph.length}장</div>
 ${ph.length?`<div class="gallery">${ph.slice().reverse().map(p=>photoCard(p,false)).join('')}</div>`:'<section class="card cream"><p>아직 사진이 없어요.</p></section>'}`;
}
async function fillPhotos(){
 for(const img of document.querySelectorAll('img[data-src]')){
  const p=(S.photos||[]).find(x=>x.id===img.dataset.src);if(!p)continue;
  const url=await server.photoUrl(p);if(url&&img.isConnected)img.src=url;
 }
}
async function shrink(file){
 M.photoInput(file);
 const img=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>no(Error('사진을 읽지 못했어요. JPG 로 다시 골라 주세요.'));i.src=URL.createObjectURL(file);});
 const scale=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));
 const c=document.createElement('canvas');c.width=Math.round(img.naturalWidth*scale);c.height=Math.round(img.naturalHeight*scale);
 const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(img.src);
 return new Promise(ok=>c.toBlob(ok,'image/jpeg',.84));
}

/* ── 투표 ─────────────────────────────────────────── */
function viewVote(){
 const e=S.event,ph=(S.photos||[]).filter(p=>p.contest),mv=S.mvp||{};
 const others=S.people.filter(p=>p.id!==S.me.id);
 const photoRank=e.photo_reveal||S.is_host?ph.slice().sort((a,b)=>(b.votes||0)-(a.votes||0)):null;
 return `<div class="lab">오늘의 사진</div>
 <section class="card tape"><div class="row"><span class="status ${e.voting_open?'open':'shut'}">${e.voting_open?'투표 중':'투표 전·마감'}</span><span class="muted">${S.photo_voters||0}명 참여</span></div>
  ${e.voting_open?(ph.length?`<div class="gallery">${ph.map(p=>photoCard(p,true)).join('')}</div>`:'<p style="margin-top:10px">아직 출품된 사진이 없어요.</p>'):''}
  ${photoRank&&photoRank.length&&(e.photo_reveal||!e.voting_open)?`<div class="sep"></div><h3>${e.photo_reveal?'결과':'결과 (운영진만 보여요)'}</h3><ul class="tally">${photoRank.slice(0,5).map((p,i)=>`<li><span class="rank">${i+1}</span><div>${esc(p.caption||'사진')} <small class="muted">· ${esc(p.nick)}</small><div class="bar" style="width:${Math.max(4,(p.votes||0)*100/Math.max(1,photoRank[0].votes||1))}%"></div></div><span class="n">${p.votes||0}</span></li>`).join('')}</ul>`:''}
 </section>
 <div class="lab">마피아 MVP</div>
 <section class="card"><div class="row"><span class="status ${e.mvp_open?'open':'shut'}">${e.mvp_open?'투표 중':'투표 전·마감'}</span><span class="muted">${mv.voters||0}명 참여</span></div>
  ${e.mvp_open?`<div class="people">${others.map(p=>`<button class="pick${mv.my===p.id?' on':''}" data-mvp="${esc(p.id)}" type="button">${esc(p.nick)}</button>`).join('')}</div>
   ${mv.my?`<p class="muted" style="margin-top:8px">내 한 표 → <b>${esc(nickOf(mv.my))}</b></p>`:''}`:''}
  ${mv.tally&&mv.tally.length?`<div class="sep"></div><h3>${e.mvp_reveal?'결과':'지금까지 (운영진만 보여요)'}</h3><ul class="tally">${mv.tally.slice(0,5).map((t,i)=>`<li><span class="rank">${i+1}</span><div>${esc(t.nick)}<div class="bar" style="width:${t.votes*100/mv.tally[0].votes}%"></div></div><span class="n">${t.votes}</span></li>`).join('')}</ul>`:''}
 </section>`;
}

/* ── 운영 ─────────────────────────────────────────── */
function randCode(){const A='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='';const b=crypto.getRandomValues(new Uint8Array(8));for(const x of b)s+=A[x%A.length];return s;}
const codeKey='meadow_code_'+SLUG;
function savedCode(){try{return localStorage.getItem(codeKey)||'';}catch(e){return '';}}
function sw(key,on,label,sub){return `<div class="toggle"><div><b>${label}</b>${sub?`<small>${sub}</small>`:''}</div><button class="btn ${on?'on':'ghost'}" data-sw="${key}" data-val="${on?0:1}" type="button">${on?'켜짐':'꺼짐'}</button></div>`;}
function viewHost(){
 const e=S.event,code=savedCode(),sc=e.schedule||[];
 const hist=S.team_history||[];
 return `<div class="lab">입장</div>
 <section class="card tape stack">${code?`<div class="code">${esc(code)}</div>`:'<p>아직 입장 코드가 없어요.</p>'}
  <button class="btn wide" data-newcode type="button">${code?'새 코드로 바꾸기':'입장 코드 만들기'}</button>
  ${sw('join_open',e.join_open,'입장 받기','')}</section>

 <div class="lab">공지 보내기</div>
 <section class="card stack"><form id="annF" class="stack"><textarea id="ann" maxlength="500" placeholder="예: 수건돌리기 시작해요! 큰 원으로 모여 주세요." required></textarea><button class="btn wide" type="submit">공지 올리기</button></form>
  ${(S.announcements||[]).slice(0,5).map(a=>`<div class="toggle"><div><b style="font-weight:600;font-size:12.5px">${esc(a.body)}</b><small>${hm(a.at)}</small></div><button class="link red" data-annrm="${a.id}" type="button">내리기</button></div>`).join('')}</section>

 <div class="lab">지금 순서</div>
 <section class="card">
  <ul class="sched">${sc.map((r,i)=>`<li class="${i===e.now_idx?'cur':''}"><time>${esc(r[0])}</time><span>${esc(r[1])}</span>${i===e.now_idx?'<span class="pin">지금</span>':`<button class="link" data-now="${i}" type="button" style="margin-left:auto">지금으로</button>`}</li>`).join('')}</ul>
  <details class="olds"><summary>순서 고치기</summary><form id="schF" class="stack" style="margin-top:8px"><textarea id="sch">${sc.map(r=>r.join(' ')).join('\n')}</textarea><button class="btn ghost wide" type="submit">순서 저장</button></form></details></section>

 <div class="lab">조 섞기</div>
 <section class="card stack"><input id="tTitle" type="text" maxlength="40" placeholder="이름 (예: 수건돌리기 조 · 마피아 1판)" value="${esc(mixTitle??e.teams_title??'')}">
  <div class="row"><button class="btn ${mixBy==='count'?'on':'ghost'}" data-by="count" type="button">조 개수로</button><button class="btn ${mixBy==='size'?'on':'ghost'}" data-by="size" type="button">한 조 인원으로</button>
   <input id="tN" type="number" min="1" max="13" value="${mixN??(mixBy==='count'?4:5)}" style="width:80px"></div>
  <p class="muted">${S.people.length}명</p>
  <button class="btn wide" data-mix type="button">섞어 보기</button>
  ${preview?`<div class="sep"></div><h3>미리보기 · 겹친 짝 ${M.repeatPairs(preview,hist)}쌍</h3><div class="teams">${preview.map((g,i)=>`<div class="team"><h4>${i+1}조</h4><ul>${g.map(id=>`<li>${esc(nickOf(id))}</li>`).join('')}</ul></div>`).join('')}</div>
   <div class="row"><button class="btn green" data-pubteams type="button">이대로 모두에게 보이기</button><button class="btn ghost" data-mix type="button">다시 섞기</button></div>`:''}
  ${(S.teams||[]).length?`<button class="link red" data-clearteams type="button">지금 보이는 조 내리기</button>`:''}</section>

 <div class="lab">투표</div>
 <section class="card">${sw('voting_open',e.voting_open,'오늘의 사진 투표','')}${sw('photo_reveal',e.photo_reveal,'사진 결과 공개','')}
  ${sw('mvp_open',e.mvp_open,'마피아 MVP 투표','')}${sw('mvp_reveal',e.mvp_reveal,'MVP 결과 공개','')}</section>

 <div class="lab">뒤풀이</div>
 <section class="card stack"><p>남는다고 한 사람 ${S.people.filter(p=>p.after).length}명 · 지금 ${e.after_mode==='groups'?'작은 조로 나눠 있어요':'다 같이'}</p>
  <div class="row"><button class="btn ghost" data-aftermix type="button">4~6명씩 나누기</button><button class="btn ghost" data-sw="after_mode" data-val="together" type="button">다 같이로 돌리기</button></div></section>

 <div class="lab">참가자 ${S.people.length}명</div>
 <section class="card cream"><ul class="plist">${S.people.map(p=>`<li><span>${esc(p.nick)}${p.id===S.me.id?' <small>(나)</small>':''}</span>${p.after?'<small>뒤풀이</small>':''}${p.id!==S.me.id?`<button class="link red" data-revoke="${esc(p.id)}" type="button">내보내기</button>`:''}</li>`).join('')}</ul></section>`;
}

/* ── 그리기 ───────────────────────────────────────── */
function render(){
 if(!S)return;
 if(!S.joined)return viewJoin();
 $('#tabs').hidden=false;$('#hostTab').hidden=!S.is_host;
 if(tab==='host'&&!S.is_host)tab='now';
 document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===tab));
 const me=S.people.find(p=>p.id===S.me.id);
 $('#who').innerHTML=`${esc(S.me.nick)}<small>${S.is_host?'운영진':(myTeam()>=0?(myTeam()+1)+'조':'참가')}</small>`;
 $('#view').innerHTML=({now:viewNow,sched:viewSched,chat:viewChat,photo:viewPhoto,vote:viewVote,host:viewHost}[tab]||viewNow)()+
   '';
 fillPhotos();
}
async function refresh(){
 if(busy||typing()||preview)return;
 try{const d=await server.rpc('snapshot');S=d;if(S.chat?.length)chatLast=Math.max(chatLast,S.chat[S.chat.length-1].id);render();}catch(e){}
}

/* ── 누르기 ───────────────────────────────────────── */
document.addEventListener('click',async ev=>{
 const b=ev.target.closest('button,[data-src]');if(!b)return;const d=b.dataset;
 if(d.tab)return setTab(d.tab);
 if(b.matches('img[data-src]')&&b.src){zoom=document.createElement('div');zoom.className='zoom';zoom.innerHTML=`<img src="${b.src}" alt="">`;zoom.onclick=()=>zoom.remove();document.body.appendChild(zoom);return;}
 if(d.after)return act('after',{enabled:d.after==='1'},d.after==='1'?'뒤풀이 남는 걸로 했어요':'바꿨어요');
 if(d.chatrm)return act('chat_remove',{id:+d.chatrm});
 if(d.vote)return act('vote',{photo_id:d.vote},'한 표 넣었어요');
 if(d.mvp)return act('mvp_vote',{target_id:d.mvp},'MVP 한 표 넣었어요');
 if(d.photorm){if(b.dataset.sure!=='1'){b.dataset.sure='1';b.textContent='한 번 더 누르면 내려요';return;}
  const r=await act('photo_remove',{id:d.photorm},'사진을 내렸어요');if(r?.removed_path&&!DEMO)TUNEL.sb().storage.from('meadow-photos').remove([r.removed_path]).catch(()=>{});return;}
 if(d.annrm)return act('announce_remove',{id:+d.annrm},'공지를 내렸어요');
 if(d.now)return act('host_update',{now_idx:+d.now},'지금 순서를 바꿨어요');
 if(d.sw){const v=d.sw==='after_mode'?{after_mode:'together'}:{[d.sw]:d.val==='1'};return act('host_update',v,'바꿨어요');}
 if(d.newcode!==undefined){const code=randCode();const exp=new Date(Date.now()+24*3600e3).toISOString();
  const r=await act('code_rotate',{code,expires_at:exp});if(r){try{localStorage.setItem(codeKey,code);}catch(e){}await act('host_update',{join_open:true},'새 입장 코드를 만들었어요');}return;}
 if(d.by){mixBy=d.by;mixN=null;preview=null;return render();}
 if(d.mix!==undefined){mixTitle=$('#tTitle')?.value??mixTitle;mixN=$('#tN')?.value??mixN;const n=Math.max(1,Math.min(13,+($('#tN')?.value||4)));preview=M.mixTeams(S.people.map(p=>p.id),mixBy==='count'?{count:n}:{size:n},S.team_history||[]);return render();}
 if(d.pubteams!==undefined){const title=($('#tTitle')?.value||'').trim();const t=preview;preview=null;mixTitle=null;return act('teams',{title,teams:t},'조를 모두에게 보였어요');}
 if(d.clearteams!==undefined){preview=null;return act('teams_clear',{},'조를 내렸어요');}
 if(d.aftermix!==undefined){const ids=S.people.filter(p=>p.after).map(p=>p.id);if(ids.length<2)return toast('남는 사람이 두 명 이상일 때 나눌 수 있어요');
  const g=M.mixTeams(ids,{size:5},S.team_history||[]);return act('groups',{groups:g,expected_revision:S.event.revision},'뒤풀이 조를 나눴어요');}
 if(d.revoke){if(b.dataset.sure!=='1'){b.dataset.sure='1';b.textContent='정말 내보내기';return;}return act('revoke',{member_id:d.revoke},'내보냈어요');}
});
document.addEventListener('change',ev=>{if(ev.target.id==='file'){const f=ev.target.files[0];$('#fileName').textContent=f?f.name:'사진 고르기';}});
document.addEventListener('submit',async ev=>{
 ev.preventDefault();const f=ev.target;
 if(f.id==='chatF'){const i=$('#chatIn'),v=i.value.trim();if(!v)return;i.value='';
  try{const d=await server.rpc('chat_send',{body:v});S=d;chatLast=S.chat.length?S.chat[S.chat.length-1].id:chatLast;render();$('#chatIn')?.focus();window.scrollTo(0,document.body.scrollHeight);}catch(e){toast(e.message);i.value=v;}return;}
 if(f.id==='annF'){const v=$('#ann').value.trim();if(v)await act('announce',{body:v},'공지를 올렸어요');return;}
 if(f.id==='schF'){try{const rows=M.scheduleInput($('#sch').value);await act('host_update',{schedule:rows},'순서를 저장했어요');}catch(e){toast(e.message);}return;}
 if(f.id==='upF'){
  const file=$('#file').files[0];
  if(busy)return;busy=true;const btn=f.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='올리는 중…';
  try{const blob=await shrink(file);S=await server.upload(blob,$('#cap').value.trim(),$('#contest').checked);toast('사진을 올렸어요');}
  catch(e){toast(e.message);}finally{busy=false;render();}
 }
});

/* ── 시작 ─────────────────────────────────────────── */
async function boot(){
 tab=['now','sched','chat','photo','vote','host'].includes(location.hash.slice(1))?location.hash.slice(1):'now';
 if(DEMO){const d=$('#demo');d.hidden=false;const host=qs.get('demo')!=='guest';
  d.innerHTML=`미리보기 · 가짜 데이터 (${host?'운영진':'참가자'} 화면)<button type="button" id="demoSwap">${host?'참가자로 보기':'운영진으로 보기'}</button>`;
  $('#demoSwap').onclick=()=>{location.search=host?'?demo=guest':'?demo=1';};
  setInterval(()=>{server.tick();},25000);
 }else{
  const {data}=await TUNEL.sb().auth.getSession();
  if(!data?.session)return viewLogin();
  const me=await TUNEL.me();if(!me)return viewSignup();
 }
 try{S=await server.rpc('snapshot');}catch(e){gate(`<section class="card tape"><h2>잔디밭을 열지 못했어요</h2><p>${esc(e.message)}</p></section>`);return;}
 if(S.chat?.length)chatLast=S.chat[S.chat.length-1].id;
 render();
 setInterval(()=>{if(document.visibilityState==='visible')refresh();},12000);
 setInterval(()=>{if(document.visibilityState==='visible')pollChat();},3000);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});
}
boot();
})();
