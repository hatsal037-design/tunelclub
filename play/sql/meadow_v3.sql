-- 잔디밭 v3 — v2 위에 행사 좋알람을 더한다 (2026-09-25 햇살님 «좋알람 구현» · «행사 땐 조건 없이»). 칸·표만 더한다.
-- 행사 좋알람: 운영진이 열면 오늘 온 사람 중 한 명을 가리키고, 서로 가리키면 두 사람에게만 연락처가 열린다.
begin;
alter table meadow_private.events add column if not exists love_open boolean not null default false;
create table if not exists meadow_private.love_picks (
  event_id uuid not null,
  member_id uuid not null,
  target_id uuid not null,
  insta text not null default '' check(length(insta)<=60),
  kakao text not null default '' check(length(kakao)<=120),
  match_seen boolean not null default false,
  primary key(event_id,member_id),
  foreign key(event_id,member_id) references meadow_private.participants(event_id,member_id),
  foreign key(event_id,target_id) references meadow_private.participants(event_id,member_id)
);
create index if not exists meadow_love_target on meadow_private.love_picks(event_id,target_id);
alter table meadow_private.love_picks enable row level security;
revoke all on meadow_private.love_picks from public, anon, authenticated;

create or replace function meadow_private.action(p_event text,p_action text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m public.members%rowtype;
  e meadow_private.events%rowtype;
  p meadow_private.participants%rowtype;
  a meadow_private.attempts%rowtype;
  ph meadow_private.photos%rowtype;
  host boolean;
  mid uuid;
  pid uuid;
  file_path text;
  code text;
  salt uuid;
  expiry timestamptz;
  gs jsonb;
  ids uuid[];
  wanted uuid[];
  part jsonb;
  result jsonb;
  body text;
  tid uuid;
  hist jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('error',jsonb_build_object('code','AUTH_REQUIRED','message','로그인해 주세요.')); end if;
  select * into m from public.members where auth_id=auth.uid();
  if m.id is null or m.role='banned' then return jsonb_build_object('error',jsonb_build_object('code','MEMBER_REQUIRED','message','이용 가능한 회원이 아니에요.')); end if;
  if p_action is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>20000 then
    return jsonb_build_object('error',jsonb_build_object('code','INVALID_INPUT','message','입력값을 확인해 주세요.'));
  end if;
  host:=coalesce(m.is_admin or m.role='staff',false);
  -- All mutations lock the same event first: capacity, revision, vote and leave race safely.
  select * into e from meadow_private.events where slug=p_event for update;
  if e.id is null then return jsonb_build_object('error',jsonb_build_object('code','NOT_FOUND','message','잔디밭을 찾을 수 없어요.')); end if;
  select * into p from meadow_private.participants where event_id=e.id and member_id=m.id;

  if p_action='join' and not coalesce(p.active,false) then
    if coalesce(p.revoked,false) then return jsonb_build_object('error',jsonb_build_object('code','REVOKED','message','이 잔디밭 입장이 제한됐어요.')); end if;
    if not host then
      if not e.join_open or e.code_hash is null or e.code_expires_at<=now() then return jsonb_build_object('error',jsonb_build_object('code','JOIN_CLOSED','message','아직 입장할 수 없어요.')); end if;
      insert into meadow_private.attempts(event_id,member_id) values(e.id,m.id) on conflict do nothing;
      select * into a from meadow_private.attempts where event_id=e.id and member_id=m.id;
      if a.started_at<=now()-interval '15 minutes' then
        update meadow_private.attempts set started_at=now(),failures=0 where event_id=e.id and member_id=m.id;
        a.failures:=0;
      end if;
      if a.failures>=5 then return jsonb_build_object('error',jsonb_build_object('code','RATE_LIMIT','message','잠시 뒤 다시 시도해 주세요.')); end if;
      code:=upper(trim(coalesce(p_payload->>'code','')));
      if sha256(convert_to(e.code_salt::text||':'||code,'UTF8'))<>e.code_hash then
        update meadow_private.attempts set failures=failures+1 where event_id=e.id and member_id=m.id;
        -- Return rather than RAISE: the failure counter must commit.
        return jsonb_build_object('error',jsonb_build_object('code','INVALID_CODE','message','입장 코드를 확인해 주세요.'));
      end if;
    end if;
    -- Staff must still enter a full meadow to moderate it. Regular joins count
    -- all active participants; the event's recruitment headcount is unchanged.
    if not host and (select count(*) from meadow_private.participants where event_id=e.id and active)>=e.capacity then
      return jsonb_build_object('error',jsonb_build_object('code','FULL','message','잔디밭 정원이 찼어요.'));
    end if;
    insert into meadow_private.participants(event_id,member_id) values(e.id,m.id)
      on conflict(event_id,member_id) do update set active=true,after=false,joined_at=now();
    delete from meadow_private.attempts where event_id=e.id and member_id=m.id;
    update meadow_private.events set revision=revision+1 where id=e.id;
    select * into p from meadow_private.participants where event_id=e.id and member_id=m.id;
  elsif p_action not in ('snapshot','join') and not coalesce(p.active,false) then
    return jsonb_build_object('error',jsonb_build_object('code','JOIN_REQUIRED','message','입장 코드로 먼저 들어와 주세요.'));
  end if;

  if p_action='chat_since' then
    return jsonb_build_object('chat',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'member_id',c.member_id,'nick',u.nick,'body',c.body,'at',c.created_at,'mine',c.member_id=m.id) order by c.id)
      from meadow_private.chat c join public.members u on u.id=c.member_id
      where c.event_id=e.id and not c.removed and c.id>coalesce((p_payload->>'after')::bigint,0) and u.role is distinct from 'banned'),'[]'));
  end if;
  if p_action in ('host_update','groups','revoke','code_rotate','teams','teams_clear','announce','announce_remove') and not host then
    return jsonb_build_object('error',jsonb_build_object('code','HOST_REQUIRED','message','운영진만 바꿀 수 있어요.'));
  end if;
  if p_action='after' then
    if jsonb_typeof(p_payload->'enabled') is distinct from 'boolean' then raise invalid_parameter_value; end if;
    if p.after is distinct from (p_payload->>'enabled')::boolean then
      update meadow_private.participants set after=(p_payload->>'enabled')::boolean where event_id=e.id and member_id=m.id;
      update meadow_private.events set groups='[]',revision=revision+1 where id=e.id;
    end if;
  elsif p_action='vote' then
    if not e.voting_open then return jsonb_build_object('error',jsonb_build_object('code','VOTING_CLOSED','message','지금은 투표 시간이 아니에요.')); end if;
    pid:=(p_payload->>'photo_id')::uuid;
    if not exists(select 1 from meadow_private.photos x join meadow_private.participants y on y.event_id=x.event_id and y.member_id=x.member_id join public.members u on u.id=x.member_id where x.id=pid and x.event_id=e.id and x.published and not x.removed and x.contest and y.active and u.role is distinct from 'banned') then
      return jsonb_build_object('error',jsonb_build_object('code','PHOTO_UNAVAILABLE','message','투표할 수 없는 사진이에요.'));
    end if;
    insert into meadow_private.votes(event_id,member_id,photo_id) values(e.id,m.id,pid)
      on conflict(event_id,member_id) do update set photo_id=excluded.photo_id;
  elsif p_action='photo_reserve' then
    if p_payload->'consent' is distinct from 'true'::jsonb then return jsonb_build_object('error',jsonb_build_object('code','CONSENT_REQUIRED','message','사진 공유 동의를 확인해 주세요.')); end if;
    if length(coalesce(p_payload->>'caption',''))>160 or jsonb_typeof(p_payload->'contest') is distinct from 'boolean' or coalesce(p_payload->>'mime','image/jpeg') not in ('image/jpeg','image/webp') then raise invalid_parameter_value; end if;
    if (select count(*) from meadow_private.photos where event_id=e.id and member_id=m.id and not removed)>=20 then
      return jsonb_build_object('error',jsonb_build_object('code','PHOTO_LIMIT','message','사진은 한 사람당 20장까지 올릴 수 있어요.'));
    end if;
    pid:=gen_random_uuid();
    file_path:=e.id::text||'/'||m.id::text||'/'||pid::text||case when p_payload->>'mime'='image/webp' then '.webp' else '.jpg' end;
    insert into meadow_private.photos(id,event_id,member_id,path,caption,contest)
      values(pid,e.id,m.id,file_path,coalesce(p_payload->>'caption',''),(p_payload->>'contest')::boolean);
    return jsonb_build_object('id',pid,'path',file_path);
  elsif p_action in ('photo_publish','photo_remove') then
    pid:=(p_payload->>'id')::uuid;
    select * into ph from meadow_private.photos where id=pid and event_id=e.id;
    if ph.id is null or (ph.member_id<>m.id and not (host and p_action='photo_remove')) then
      return jsonb_build_object('error',jsonb_build_object('code','PHOTO_FORBIDDEN','message','내 사진만 바꿀 수 있어요.'));
    end if;
    if p_action='photo_publish' then
      if ph.removed or not exists(select 1 from storage.objects where bucket_id='meadow-photos' and name=ph.path) then
        return jsonb_build_object('error',jsonb_build_object('code','UPLOAD_REQUIRED','message','사진 업로드를 먼저 완료해 주세요.'));
      end if;
      update meadow_private.photos set published=true where id=pid;
    else
      update meadow_private.photos set published=false,removed=true where id=pid;
      delete from meadow_private.votes where photo_id=pid;
    end if;
  elsif p_action='host_update' then
    if (p_payload ? 'voting_open' and jsonb_typeof(p_payload->'voting_open')<>'boolean') or (p_payload ? 'join_open' and jsonb_typeof(p_payload->'join_open')<>'boolean')
      or (p_payload ? 'mvp_open' and jsonb_typeof(p_payload->'mvp_open')<>'boolean') or (p_payload ? 'mvp_reveal' and jsonb_typeof(p_payload->'mvp_reveal')<>'boolean')
      or (p_payload ? 'photo_reveal' and jsonb_typeof(p_payload->'photo_reveal')<>'boolean')
      or (p_payload ? 'love_open' and jsonb_typeof(p_payload->'love_open')<>'boolean')
      or (p_payload ? 'now_idx' and (jsonb_typeof(p_payload->'now_idx')<>'number' or (p_payload->>'now_idx')::integer not between -1 and 19)) then raise invalid_parameter_value; end if;
    if p_payload ? 'schedule' then
      if jsonb_typeof(p_payload->'schedule')<>'array' or jsonb_array_length(p_payload->'schedule')>20 then raise invalid_parameter_value; end if;
      for part in select value from jsonb_array_elements(p_payload->'schedule') loop
        if jsonb_typeof(part)<>'array' or jsonb_array_length(part)<>2 or jsonb_typeof(part->0)<>'string' or jsonb_typeof(part->1)<>'string' or (part->>0)!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or length(part->>1) not between 1 and 120 then raise invalid_parameter_value; end if;
      end loop;
    end if;
    update meadow_private.events set
      activity=case when p_payload ? 'activity' then p_payload->>'activity' else activity end,
      return_at=case when p_payload ? 'return_at' then nullif(p_payload->>'return_at','')::timestamptz else return_at end,
      notice=case when p_payload ? 'notice' then p_payload->>'notice' else notice end,
      voting_open=case when p_payload ? 'voting_open' then (p_payload->>'voting_open')::boolean else voting_open end,
      join_open=case when p_payload ? 'join_open' then (p_payload->>'join_open')::boolean else join_open end,
      after_mode=case when p_payload ? 'after_mode' then p_payload->>'after_mode' else after_mode end,
      groups=case when p_payload->>'after_mode'='together' then '[]'::jsonb else groups end,
      schedule=case when p_payload ? 'schedule' then p_payload->'schedule' else schedule end,
      mvp_open=case when p_payload ? 'mvp_open' then (p_payload->>'mvp_open')::boolean else mvp_open end,
      mvp_reveal=case when p_payload ? 'mvp_reveal' then (p_payload->>'mvp_reveal')::boolean else mvp_reveal end,
      photo_reveal=case when p_payload ? 'photo_reveal' then (p_payload->>'photo_reveal')::boolean else photo_reveal end,
      love_open=case when p_payload ? 'love_open' then (p_payload->>'love_open')::boolean else love_open end,
      now_idx=case when p_payload ? 'now_idx' then (p_payload->>'now_idx')::integer else now_idx end,
      revision=revision+1 where id=e.id;
  elsif p_action='groups' then
    if (p_payload->>'expected_revision')::integer is distinct from e.revision then return jsonb_build_object('error',jsonb_build_object('code','REVISION_CONFLICT','message','참가자가 바뀌었어요. 새로 편성해 주세요.')); end if;
    gs:=p_payload->'groups';
    if jsonb_typeof(gs) is distinct from 'array' or jsonb_array_length(gs)>13 then raise invalid_parameter_value; end if;
    ids:='{}';
    for part in select value from jsonb_array_elements(gs) loop
      if jsonb_typeof(part)<>'array' or jsonb_array_length(part) not between 1 and 26 then raise invalid_parameter_value; end if;
      ids:=ids || array(select value::uuid from jsonb_array_elements_text(part));
    end loop;
    if cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise invalid_parameter_value; end if;
    select coalesce(array_agg(y.member_id order by y.member_id),'{}') into wanted from meadow_private.participants y join public.members u on u.id=y.member_id where y.event_id=e.id and y.active and y.after and u.role is distinct from 'banned';
    if array(select x from unnest(ids) x order by x)<>wanted then return jsonb_build_object('error',jsonb_build_object('code','GROUP_MEMBERS_CHANGED','message','남는 참가자 전체를 한 번씩 넣어 주세요.')); end if;
    update meadow_private.events set groups=gs,after_mode='groups',revision=revision+1 where id=e.id;
  elsif p_action in ('leave','revoke') then
    mid:=case when p_action='leave' then m.id else (p_payload->>'member_id')::uuid end;
    if mid is null then raise invalid_parameter_value; end if;
    update meadow_private.participants set active=false,after=false,revoked=(p_action='revoke') where event_id=e.id and member_id=mid;
    update meadow_private.photos set published=false,removed=true where event_id=e.id and member_id=mid;
    delete from meadow_private.votes where event_id=e.id and (member_id=mid or photo_id in (select id from meadow_private.photos where event_id=e.id and member_id=mid));
    delete from meadow_private.mvp_votes where event_id=e.id and (member_id=mid or target_id=mid);
    delete from meadow_private.love_picks where event_id=e.id and (member_id=mid or target_id=mid);
    update meadow_private.events set groups='[]',revision=revision+1 where id=e.id;
  elsif p_action='code_rotate' then
    code:=upper(trim(coalesce(p_payload->>'code','')));
    expiry:=(p_payload->>'expires_at')::timestamptz;
    if code!~'^[A-Z0-9]{8,32}$' or expiry is null or expiry<=now() or expiry>now()+interval '30 days' then raise invalid_parameter_value; end if;
    salt:=gen_random_uuid();
    update meadow_private.events set code_salt=salt,code_hash=sha256(convert_to(salt::text||':'||code,'UTF8')),code_expires_at=expiry,revision=revision+1 where id=e.id;
  elsif p_action='chat_send' then
    body:=trim(coalesce(p_payload->>'body',''));
    if length(body) not between 1 and 300 then return jsonb_build_object('error',jsonb_build_object('code','INVALID_INPUT','message','메시지는 1~300자로 보내 주세요.')); end if;
    if exists(select 1 from meadow_private.chat where event_id=e.id and member_id=m.id and created_at>now()-interval '1 second') then
      return jsonb_build_object('error',jsonb_build_object('code','SLOW','message','조금 천천히 보내 주세요.'));
    end if;
    insert into meadow_private.chat(event_id,member_id,body) values(e.id,m.id,body);
  elsif p_action='chat_remove' then
    update meadow_private.chat set removed=true where event_id=e.id and id=(p_payload->>'id')::bigint and (member_id=m.id or host);
  elsif p_action='announce' then
    body:=trim(coalesce(p_payload->>'body',''));
    if length(body) not between 1 and 500 then raise invalid_parameter_value; end if;
    insert into meadow_private.announcements(event_id,body) values(e.id,body);
    update meadow_private.events set revision=revision+1 where id=e.id;
  elsif p_action='announce_remove' then
    update meadow_private.announcements set removed=true where event_id=e.id and id=(p_payload->>'id')::bigint;
  elsif p_action='mvp_vote' then
    if not e.mvp_open then return jsonb_build_object('error',jsonb_build_object('code','MVP_CLOSED','message','지금은 MVP 투표 시간이 아니에요.')); end if;
    tid:=(p_payload->>'target_id')::uuid;
    if tid=m.id then return jsonb_build_object('error',jsonb_build_object('code','MVP_SELF','message','나 말고 다른 사람을 골라 주세요.')); end if;
    if not exists(select 1 from meadow_private.participants y join public.members u on u.id=y.member_id where y.event_id=e.id and y.member_id=tid and y.active and u.role is distinct from 'banned') then
      return jsonb_build_object('error',jsonb_build_object('code','MVP_UNAVAILABLE','message','지금 잔디밭에 있는 사람만 고를 수 있어요.'));
    end if;
    insert into meadow_private.mvp_votes(event_id,member_id,target_id) values(e.id,m.id,tid)
      on conflict(event_id,member_id) do update set target_id=excluded.target_id;
  elsif p_action='teams' then
    gs:=p_payload->'teams';
    if jsonb_typeof(gs) is distinct from 'array' or jsonb_array_length(gs) not between 1 and 13 or length(coalesce(p_payload->>'title',''))>40 then raise invalid_parameter_value; end if;
    ids:='{}';
    for part in select value from jsonb_array_elements(gs) loop
      if jsonb_typeof(part)<>'array' or jsonb_array_length(part) not between 1 and 26 then raise invalid_parameter_value; end if;
      ids:=ids || array(select value::uuid from jsonb_array_elements_text(part));
    end loop;
    if cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise invalid_parameter_value; end if;
    if exists(select 1 from unnest(ids) x where not exists(select 1 from meadow_private.participants y where y.event_id=e.id and y.member_id=x and y.active)) then
      return jsonb_build_object('error',jsonb_build_object('code','TEAM_MEMBERS_CHANGED','message','잔디밭을 나간 사람이 있어요. 다시 섞어 주세요.'));
    end if;
    hist:=e.team_history || gs;
    if jsonb_array_length(hist)>60 then hist:=(select jsonb_agg(value order by ord) from jsonb_array_elements(hist) with ordinality h(value,ord) where ord>jsonb_array_length(hist)-60); end if;
    update meadow_private.events set teams=gs,teams_title=coalesce(p_payload->>'title',''),team_history=hist,revision=revision+1 where id=e.id;
  elsif p_action='love_pick' then
    if not e.love_open then return jsonb_build_object('error',jsonb_build_object('code','LOVE_CLOSED','message','지금은 좋알람 시간이 아니에요.')); end if;
    tid:=(p_payload->>'target_id')::uuid;
    code:=regexp_replace(regexp_replace(trim(coalesce(p_payload->>'insta','')),'^(https?://)?(www\.)?instagram\.com/',''),'^@|/.*$','','g');
    body:=trim(coalesce(p_payload->>'kakao',''));
    if tid=m.id then return jsonb_build_object('error',jsonb_build_object('code','LOVE_SELF','message','나 말고 다른 사람을 골라 주세요.')); end if;
    if code='' and body='' then return jsonb_build_object('error',jsonb_build_object('code','INVALID_INPUT','message','인스타나 카카오톡 중 하나는 적어 주세요.')); end if;
    if length(code)>60 or length(body)>120 then raise invalid_parameter_value; end if;
    if not exists(select 1 from meadow_private.participants y join public.members u on u.id=y.member_id where y.event_id=e.id and y.member_id=tid and y.active and u.role is distinct from 'banned') then
      return jsonb_build_object('error',jsonb_build_object('code','LOVE_UNAVAILABLE','message','지금 잔디밭에 있는 사람만 고를 수 있어요.'));
    end if;
    insert into meadow_private.love_picks(event_id,member_id,target_id,insta,kakao,match_seen) values(e.id,m.id,tid,code,body,false)
      on conflict(event_id,member_id) do update set target_id=excluded.target_id,insta=excluded.insta,kakao=excluded.kakao,match_seen=false;
  elsif p_action='love_ack' then
    update meadow_private.love_picks set match_seen=true where event_id=e.id and member_id=m.id;
  elsif p_action='love_clear' then
    delete from meadow_private.love_picks where event_id=e.id and member_id=m.id;
  elsif p_action='teams_clear' then
    update meadow_private.events set teams='[]',teams_title='',revision=revision+1 where id=e.id;
  elsif p_action not in ('snapshot','join') then
    return jsonb_build_object('error',jsonb_build_object('code','UNKNOWN_ACTION','message','지원하지 않는 동작이에요.'));
  end if;

  select * into p from meadow_private.participants where event_id=e.id and member_id=m.id;
  if not coalesce(p.active,false) then return jsonb_build_object('joined',false,'me',jsonb_build_object('id',m.id,'nick',m.nick),'is_host',host); end if;
  select * into e from meadow_private.events where id=e.id;
  -- A platform-level ban may happen outside this feature. Do not show stale groups.
  if exists(select 1 from jsonb_array_elements(e.groups) g cross join lateral jsonb_array_elements_text(g) x
    where not exists(select 1 from meadow_private.participants y join public.members u on u.id=y.member_id where y.event_id=e.id and y.member_id=x::uuid and y.active and y.after and u.role is distinct from 'banned')) then e.groups:='[]'; end if;
  result:=jsonb_build_object('joined',true,'me',jsonb_build_object('id',m.id,'nick',m.nick,'after',p.after),'is_host',host,
    'event',jsonb_build_object('id',e.id,'slug',e.slug,'title',e.title,'date',e.date,'capacity',e.capacity,'activity',e.activity,'return_at',e.return_at,'notice',e.notice,'voting_open',e.voting_open,'after_mode',e.after_mode,'revision',e.revision,'join_open',e.join_open,'schedule',e.schedule,'now_idx',e.now_idx,'mvp_open',e.mvp_open,'mvp_reveal',e.mvp_reveal,'photo_reveal',e.photo_reveal,'teams_title',e.teams_title,'love_open',e.love_open),
    'people',coalesce((select jsonb_agg(jsonb_build_object('id',y.member_id,'nick',u.nick,'after',y.after,'group',(select ord from jsonb_array_elements(e.groups) with ordinality g(value,ord) where g.value @> to_jsonb(array[y.member_id::text]))) order by y.joined_at,y.member_id) from meadow_private.participants y join public.members u on u.id=y.member_id where y.event_id=e.id and y.active and u.role is distinct from 'banned'),'[]'),
    'photos',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'member_id',x.member_id,'nick',u.nick,'path',x.path,'caption',x.caption,'contest',x.contest,'votes',case when host or e.photo_reveal then (select count(*) from meadow_private.votes v join public.members vm on vm.id=v.member_id where v.photo_id=x.id and vm.role is distinct from 'banned') end,'mine',x.member_id=m.id) order by x.created_at,x.id) from meadow_private.photos x join meadow_private.participants y on y.event_id=x.event_id and y.member_id=x.member_id join public.members u on u.id=x.member_id where x.event_id=e.id and x.published and not x.removed and y.active and u.role is distinct from 'banned'),'[]'),
    'my_vote',(select photo_id from meadow_private.votes where event_id=e.id and member_id=m.id),'groups',e.groups,
    -- 좋알람: 내 지목과 «서로 가리킨 짝»만. 누가 나를 가리켰는지·몇 명인지는 운영진에게도 안 준다
    'love',(select jsonb_build_object('enabled',e.love_open,
       'target',case when lp.target_id is null then null else jsonb_build_object('id',lp.target_id,'nick',(select nick from public.members where id=lp.target_id)) end,
       'insta',coalesce(lp.insta,''),'kakao',coalesce(lp.kakao,''),
       'matched',coalesce((select true from meadow_private.love_picks q where q.event_id=e.id and q.member_id=lp.target_id and q.target_id=m.id),false),
       'new_match',coalesce((select not lp.match_seen from meadow_private.love_picks q where q.event_id=e.id and q.member_id=lp.target_id and q.target_id=m.id),false),
       'their_insta',(select q.insta from meadow_private.love_picks q where q.event_id=e.id and q.member_id=lp.target_id and q.target_id=m.id),
       'their_kakao',(select q.kakao from meadow_private.love_picks q where q.event_id=e.id and q.member_id=lp.target_id and q.target_id=m.id))
      from (select 1) one left join meadow_private.love_picks lp on lp.event_id=e.id and lp.member_id=m.id),
    'photo_voters',(select count(*) from meadow_private.votes where event_id=e.id),
    'teams',e.teams,
    'team_history',case when host then e.team_history end,
    'announcements',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'body',n.body,'at',n.created_at) order by n.id desc) from (select * from meadow_private.announcements where event_id=e.id and not removed order by id desc limit 20) n),'[]'),
    'chat',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'member_id',c.member_id,'nick',c.nick,'body',c.body,'at',c.created_at,'mine',c.member_id=m.id) order by c.id) from
      (select c.*,u.nick from meadow_private.chat c join public.members u on u.id=c.member_id where c.event_id=e.id and not c.removed and u.role is distinct from 'banned' order by c.id desc limit 80) c),'[]'),
    'mvp',jsonb_build_object('my',(select target_id from meadow_private.mvp_votes where event_id=e.id and member_id=m.id),
      'voters',(select count(*) from meadow_private.mvp_votes where event_id=e.id),
      'tally',case when host or e.mvp_reveal then coalesce((select jsonb_agg(jsonb_build_object('id',t.target_id,'nick',u.nick,'votes',t.n) order by t.n desc,u.nick) from
        (select target_id,count(*) n from meadow_private.mvp_votes where event_id=e.id group by target_id) t join public.members u on u.id=t.target_id),'[]') end));
  if p_action='photo_remove' then result:=result||jsonb_build_object('removed_path',ph.path); end if;
  return result;
exception when invalid_text_representation or invalid_parameter_value or check_violation or not_null_violation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
  return jsonb_build_object('error',jsonb_build_object('code','INVALID_INPUT','message','입력값을 확인해 주세요.'));
end $$;


revoke all on function meadow_private.action(text,text,jsonb) from public, anon;
grant execute on function meadow_private.action(text,text,jsonb) to authenticated;
commit;
