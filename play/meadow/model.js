/* 잔디밭의 순수 표시·편성 로직. 접근 권한은 서버 RPC가 판정한다. */
(function(root){
 'use strict';
 const questions=['아무 계획 없는 하루가 생기면 뭘 하고 싶어요?','다시 해보고 싶은 어릴 적 놀이가 있나요?','산책할 때 음악과 주변 소리 중 어느 쪽이 좋아요?','최근에 먹은 것 중 또 먹고 싶은 건 뭐예요?','오늘 찍은 사진 중 마음에 드는 장면은 뭐예요?','같이 해보고 싶은 가벼운 놀이가 있나요?'];
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function pairs(group){const p=[];for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++)p.push([group[i],group[j]].sort().join('|'));return p;}
 function groupPeople(ids,size=7,previous=[],round=1){
  if(!Number.isInteger(size)||size<2||size>8)throw Error('조 크기는 2~8명으로 정해 주세요.');
  const unique=[...new Set(ids)];if(!unique.length)return [];
  const count=Math.ceil(unique.length/size),seen=new Set(previous.flatMap(pairs));let best=[],score=Infinity,seed=round+17;
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let attempt=0;attempt<200;attempt++){
   const shuffled=[...unique];for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
   const groups=Array.from({length:count},()=>[]);shuffled.forEach((id,i)=>groups[i%count].push(id));
   const next=groups.flatMap(pairs).filter(p=>seen.has(p)).length;if(next<score){best=groups;score=next;}if(!next)break;
  }return best;
 }
 function validGroups(groups,ids){
  if(!Array.isArray(groups)||groups.some(g=>!Array.isArray(g)||!g.length))return false;
  const flat=groups.flat();return flat.length===ids.length&&new Set(flat).size===flat.length&&flat.every(id=>ids.includes(id));
 }
 function photoInput(file){
  if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('JPG·PNG·WebP 사진을 골라 주세요. 아이폰 HEIC는 JPG로 내보낸 뒤 올려 주세요.');
  if(file.size>12*1024*1024)throw Error('원본 사진은 12MB 이하로 골라 주세요.');
  if(file.size<=0)throw Error('빈 파일은 올릴 수 없어요.');return true;
 }
 function scheduleInput(text){
  const rows=text.trim().split('\n').filter(Boolean).map(line=>{const m=line.trim().match(/^(\d{2}:\d{2})\s+(.+)$/);if(!m||!/^([01]\d|2[0-3]):[0-5]\d$/.test(m[1])||m[2].length>100)throw Error('시간표는 “15:00 자리 잡기”처럼 한 줄씩 적어 주세요.');return [m[1],m[2]];});
  if(!rows.length||rows.length>20)throw Error('시간표는 1~20줄로 적어 주세요.');return rows;
 }
 function returnTime(value){if(!value)return '';const d=new Date(value);if(!Number.isFinite(+d))return '';return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(d);}
 function returnTimestamp(date,time){if(!time)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('다시 모일 날짜와 시각을 확인해 주세요.');return new Date(date+'T'+time+':00+09:00').toISOString();}

 /* 조 섞기 — 2026-09-24 햇살님 «조 짤 수 있는 프로그램에 알아서 잘 섞이게 랜덤으로».
    by: {count:n} 조 개수 또는 {size:n} 한 조 인원. history: 지난 조들([[id…]…]).
    수백 번 섞어 «지난번에 같은 조였던 짝» 이 제일 적은 안을 고른다. 인원은 조마다 많아야 한 명 차이 */
 function mixTeams(ids,by={},history=[],rand=Math.random){
  const people=[...new Set(ids)];if(!people.length)return [];
  let count=by.count?Math.round(by.count):Math.ceil(people.length/Math.max(2,Math.round(by.size||4)));
  count=Math.max(1,Math.min(count,people.length,13));
  const seen=new Map();history.forEach(g=>pairs(g).forEach(k=>seen.set(k,(seen.get(k)||0)+1)));
  let best=null,score=Infinity;
  for(let attempt=0;attempt<400;attempt++){
   const s=[...people];for(let i=s.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[s[i],s[j]]=[s[j],s[i]];}
   const teams=Array.from({length:count},()=>[]);s.forEach((id,i)=>teams[i%count].push(id));
   const sc=teams.flatMap(pairs).reduce((a,k)=>a+(seen.get(k)||0),0);
   if(sc<score){best=teams;score=sc;}if(!sc)break;
  }
  /* 마무리 — 서로 다른 조 두 사람을 바꿔 보며 겹침을 더 줄인다 */
  const cost=t=>t.flatMap(pairs).reduce((a,k)=>a+(seen.get(k)||0),0);
  for(let it=0;it<3000&&score>0&&count>1;it++){
   const a=Math.floor(rand()*count);let b=Math.floor(rand()*(count-1));if(b>=a)b++;
   const i=Math.floor(rand()*best[a].length),j=Math.floor(rand()*best[b].length);
   [best[a][i],best[b][j]]=[best[b][j],best[a][i]];const sc=cost(best);
   if(sc<=score)score=sc;else [best[a][i],best[b][j]]=[best[b][j],best[a][i]];
  }
  return best;
 }
 function repeatPairs(teams,history=[]){const seen=new Set(history.flatMap(pairs));return teams.flatMap(pairs).filter(k=>seen.has(k)).length;}
 const api={questions,esc,groupPeople,validGroups,photoInput,scheduleInput,returnTime,returnTimestamp,mixTeams,repeatPairs};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MeadowModel=api;
})(typeof window!=='undefined'?window:globalThis);
