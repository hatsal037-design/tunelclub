/* 잔디밭 미리보기 서버 — ?demo=1(운영진) · ?demo=guest(참가자).
   진짜 서버(meadow_action)와 같은 모양으로 답한다. 서버·저장소에는 아무것도 보내지 않고, 새로고침하면 처음으로 돌아간다.
   닉네임은 전부 지어낸 것이다. */
(function(root){
 'use strict';
 function create(asHost){
  const M=root.MeadowModel;
  const nicks=['햇살','감자칩','노을헌터','수건장인','한강러','잔디요정','맥주한캔','돗자리','눈치왕','무궁화','피크닉','버스기사','한량','여름밤','치즈','새벽','마피아초보','산책왕'];
  const people=nicks.map((n,i)=>({id:'p'+i,nick:n,after:i%3!==0,active:true}));
  const meId=asHost?'p0':'p1';
  const now=Date.now(),ago=m=>new Date(now-m*60000).toISOString();
  const ev={id:'demo',slug:'hangang-2026-10-03',title:'어른이 놀이터 1회-한강 수건돌리기 마피아',date:'2026-10-03',capacity:26,
   activity:'모여서 쉬어요',return_at:null,notice:'',voting_open:true,after_mode:'together',revision:1,join_open:true,
   schedule:[['15:00','모여서 인사해요'],['15:20','수건돌리기'],['16:00','쉬는 시간 · 맥주 한 캔'],['16:30','마피아'],['17:30','노을과 사진'],['18:30','사진 투표 · MVP 발표'],['19:00','남는 사람끼리 뒤풀이']],
   now_idx:1,mvp_open:true,mvp_reveal:false,photo_reveal:false,teams_title:'수건돌리기 조'};
  let seq=10;
  const ann=[{id:2,body:'수건돌리기 시작해요! 돗자리 옆 큰 원으로 모여 주세요.',at:ago(3)},{id:1,body:'도착하면 초록 체크 돗자리로 오세요. 아이스박스에 맥주 있어요.',at:ago(25)}];
  const chat=[[3,'도착! 돗자리 어디예요?',24],[5,'망원 1번 출구 쪽 잔디요',23],[0,'초록 체크 돗자리예요. 버스 모형 있는 데!',22],[8,'수건 누가 갖고 있어요ㅋㅋ',6],[2,'노을 5시 반쯤이래요',4],[11,'맥주 시원하다',2]]
   .map(([p,b,m])=>({id:++seq,member_id:'p'+p,body:b,at:ago(m)}));
  const photos=[['d1','돗자리 첫 장면',3,true],['d2','노을 지는 거 봐',5,true],['d3','해 지고 랜턴',8,true],['d4','맑은 낮 잔디',2,false]]
   .map(([f,c,p,contest])=>({id:'ph_'+f,member_id:'p'+p,url:'img/demo_'+f+'.jpg',caption:c,contest,removed:false}));
  const votes=new Map([['p4','ph_d2'],['p6','ph_d2'],['p9','ph_d1'],['p12','ph_d2'],['p13','ph_d3']]);
  const mvp=new Map([['p3','p8'],['p5','p8'],['p7','p2'],['p10','p8']]);
  let teams=M.mixTeams(people.map(p=>p.id),{count:4},[],mulberry(7)),history=teams.slice(),groups=[];
  function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
  const nick=id=>(people.find(p=>p.id===id)||{}).nick||'?';
  const active=()=>people.filter(p=>p.active);
  const err=(code,message)=>({error:{code,message}});
  function snap(){
   const host=asHost;
   const cnt=id=>[...votes.values()].filter(v=>v===id).length;
   const tally=[...new Set(mvp.values())].map(id=>({id,nick:nick(id),votes:[...mvp.values()].filter(v=>v===id).length})).sort((a,b)=>b.votes-a.votes);
   return JSON.parse(JSON.stringify({joined:true,is_host:host,me:{id:meId,nick:nick(meId),after:(people.find(p=>p.id===meId)||{}).after},
    event:ev,people:active().map(p=>({id:p.id,nick:p.nick,after:p.after,group:groups.findIndex(g=>g.includes(p.id))+1||null})),
    photos:photos.filter(p=>!p.removed).map(p=>({id:p.id,member_id:p.member_id,nick:nick(p.member_id),path:p.url,caption:p.caption,contest:p.contest,votes:host||ev.photo_reveal?cnt(p.id):null,mine:p.member_id===meId})),
    my_vote:votes.get(meId)||null,photo_voters:votes.size,groups,teams,team_history:host?history:null,
    announcements:ann.slice(0,20),chat:chat.slice(-80).map(c=>({...c,nick:nick(c.member_id),mine:c.member_id===meId})),
    mvp:{my:mvp.get(meId)||null,voters:mvp.size,tally:host||ev.mvp_reveal?tally:null}}));
  }
  const api={
   demo:true,
   async rpc(action,p={}){
    await new Promise(r=>setTimeout(r,120));
    switch(action){
     case 'snapshot':case 'join':break;
     case 'chat_since':return {chat:chat.filter(c=>c.id>(p.after||0)).map(c=>({...c,nick:nick(c.member_id),mine:c.member_id===meId}))};
     case 'chat_send':{const b=String(p.body||'').trim();if(!b||b.length>300)return err('INVALID_INPUT','메시지는 1~300자로 보내 주세요.');chat.push({id:++seq,member_id:meId,body:b,at:new Date().toISOString()});break;}
     case 'chat_remove':{const i=chat.findIndex(c=>c.id===p.id&&(c.member_id===meId||asHost));if(i>=0)chat.splice(i,1);break;}
     case 'announce':if(!asHost)return err('HOST_REQUIRED','운영진만 바꿀 수 있어요.');ann.unshift({id:++seq,body:p.body,at:new Date().toISOString()});break;
     case 'announce_remove':{const i=ann.findIndex(a=>a.id===p.id);if(i>=0)ann.splice(i,1);break;}
     case 'host_update':if(!asHost)return err('HOST_REQUIRED','운영진만 바꿀 수 있어요.');Object.assign(ev,p);ev.revision++;break;
     case 'code_rotate':ev.join_open=true;break;
     case 'mvp_vote':if(!ev.mvp_open)return err('MVP_CLOSED','지금은 MVP 투표 시간이 아니에요.');if(p.target_id===meId)return err('MVP_SELF','나 말고 다른 사람을 골라 주세요.');mvp.set(meId,p.target_id);break;
     case 'vote':if(!ev.voting_open)return err('VOTING_CLOSED','지금은 투표 시간이 아니에요.');votes.set(meId,p.photo_id);break;
     case 'photo_remove':{const ph=photos.find(x=>x.id===p.id);if(ph&&(ph.member_id===meId||asHost)){ph.removed=true;for(const [k,v] of votes)if(v===ph.id)votes.delete(k);}break;}
     case 'teams':teams=p.teams;ev.teams_title=p.title||'';history=history.concat(p.teams);break;
     case 'teams_clear':teams=[];ev.teams_title='';break;
     case 'after':{const me=people.find(x=>x.id===meId);me.after=!!p.enabled;groups=[];break;}
     case 'groups':groups=p.groups;ev.after_mode='groups';break;
     case 'revoke':{const x=people.find(y=>y.id===p.member_id);if(x){x.active=false;teams=teams.map(t=>t.filter(i=>i!==x.id)).filter(t=>t.length);}break;}
     default:return err('UNKNOWN_ACTION','지원하지 않는 동작이에요.');
    }
    return snap();
   },
   async upload(blob,caption,contest){photos.push({id:'ph_'+(++seq),member_id:meId,url:URL.createObjectURL(blob),caption,contest,removed:false});return snap();},
   async photoUrl(p){return p.path;},
   tick(){ /* 미리보기에서만 — 가끔 다른 사람이 말을 건다 */
    const lines=['사진 찍어주실 분~','수건 제 뒤에 있는 거 아니죠?','마피아 몇 시에 해요?','노을 진짜 예쁘다','맥주 하나 더 있어요?','2조 어디 있어요?'];
    const who=people[2+Math.floor(Math.random()*14)];chat.push({id:++seq,member_id:who.id,body:lines[Math.floor(Math.random()*lines.length)],at:new Date().toISOString()});
   }
  };
  return api;
 }
 root.MeadowDemo={create};
})(window);
