-- 잔디밭 서버 설치안. 로컬 검증용이며 운영 DB에는 아직 적용하지 않았다.
-- 기존 public 회원/회차/노선은 수정하지 않는다. 단독 닫힌 행사로 시작한다.
begin;
create schema if not exists meadow_private;
revoke all on schema meadow_private from public, anon, authenticated;
grant usage on schema meadow_private to authenticated;

create table if not exists meadow_private.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  date date not null,
  capacity integer not null default 26 check (capacity between 1 and 26),
  activity text not null default '모여서 쉬어요' check(length(activity)<=120),
  return_at timestamptz,
  notice text not null default '' check(length(notice)<=1000),
  voting_open boolean not null default false,
  after_mode text not null default 'together' check(after_mode in ('together','groups')),
  revision integer not null default 0,
  join_open boolean not null default false,
  schedule jsonb not null default '[]' check(jsonb_typeof(schedule)='array'),
  groups jsonb not null default '[]' check(jsonb_typeof(groups)='array'),
  code_salt uuid not null default gen_random_uuid(),
  code_hash bytea,
  code_expires_at timestamptz
);
create table if not exists meadow_private.participants (
  event_id uuid not null references meadow_private.events(id),
  member_id uuid not null references public.members(id),
  active boolean not null default true,
  revoked boolean not null default false,
  after boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key(event_id,member_id)
);
create index if not exists meadow_participant_member on meadow_private.participants(member_id);
create table if not exists meadow_private.attempts (
  event_id uuid not null references meadow_private.events(id),
  member_id uuid not null references public.members(id),
  started_at timestamptz not null default now(),
  failures integer not null default 0,
  primary key(event_id,member_id)
);
create index if not exists meadow_attempt_member on meadow_private.attempts(member_id);
create table if not exists meadow_private.photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  member_id uuid not null,
  path text not null unique,
  caption text not null default '' check(length(caption)<=160),
  contest boolean not null default false,
  published boolean not null default false,
  removed boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key(event_id,member_id) references meadow_private.participants(event_id,member_id),
  unique(event_id,id)
);
create index if not exists meadow_photo_member on meadow_private.photos(member_id);
create table if not exists meadow_private.votes (
  event_id uuid not null,
  member_id uuid not null,
  photo_id uuid not null,
  primary key(event_id,member_id),
  foreign key(event_id,member_id) references meadow_private.participants(event_id,member_id),
  foreign key(event_id,photo_id) references meadow_private.photos(event_id,id)
);
create index if not exists meadow_vote_photo on meadow_private.votes(photo_id);
create index if not exists meadow_vote_member on meadow_private.votes(member_id);
alter table meadow_private.events enable row level security;
alter table meadow_private.participants enable row level security;
alter table meadow_private.attempts enable row level security;
alter table meadow_private.photos enable row level security;
alter table meadow_private.votes enable row level security;
revoke all on all tables in schema meadow_private from public, anon, authenticated;

insert into meadow_private.events(slug,title,date,schedule)
values ('hangang-2026-10-03','어른이 놀이터 1회-한강 수건돌리기 마피아','2026-10-03',
  '[["15:00","모여서 인사해요"],["15:20","수건돌리기"],["16:00","쉬는 시간"],["16:30","마피아"],["17:30","노을과 사진"],["18:30","사진 투표"],["19:00","남는 사람끼리 뒤풀이"]]')
on conflict(slug) do nothing;

-- Only this private dispatcher bypasses RLS. It verifies the real auth.uid(),
-- current membership and current staff status on every request; never JWT metadata.
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

  if p_action in ('host_update','groups','revoke','code_rotate') and not host then
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
    if (p_payload ? 'voting_open' and jsonb_typeof(p_payload->'voting_open')<>'boolean') or (p_payload ? 'join_open' and jsonb_typeof(p_payload->'join_open')<>'boolean') then raise invalid_parameter_value; end if;
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
    update meadow_private.events set groups='[]',revision=revision+1 where id=e.id;
  elsif p_action='code_rotate' then
    code:=upper(trim(coalesce(p_payload->>'code','')));
    expiry:=(p_payload->>'expires_at')::timestamptz;
    if code!~'^[A-Z0-9]{8,32}$' or expiry is null or expiry<=now() or expiry>now()+interval '30 days' then raise invalid_parameter_value; end if;
    salt:=gen_random_uuid();
    update meadow_private.events set code_salt=salt,code_hash=sha256(convert_to(salt::text||':'||code,'UTF8')),code_expires_at=expiry,revision=revision+1 where id=e.id;
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
    'event',jsonb_build_object('id',e.id,'slug',e.slug,'title',e.title,'date',e.date,'capacity',e.capacity,'activity',e.activity,'return_at',e.return_at,'notice',e.notice,'voting_open',e.voting_open,'after_mode',e.after_mode,'revision',e.revision,'join_open',e.join_open,'schedule',e.schedule),
    'people',coalesce((select jsonb_agg(jsonb_build_object('id',y.member_id,'nick',u.nick,'after',y.after,'group',(select ord from jsonb_array_elements(e.groups) with ordinality g(value,ord) where g.value @> to_jsonb(array[y.member_id::text]))) order by y.joined_at,y.member_id) from meadow_private.participants y join public.members u on u.id=y.member_id where y.event_id=e.id and y.active and u.role is distinct from 'banned'),'[]'),
    'photos',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'member_id',x.member_id,'nick',u.nick,'path',x.path,'caption',x.caption,'contest',x.contest,'votes',(select count(*) from meadow_private.votes v join public.members vm on vm.id=v.member_id where v.photo_id=x.id and vm.role is distinct from 'banned'),'mine',x.member_id=m.id) order by x.created_at,x.id) from meadow_private.photos x join meadow_private.participants y on y.event_id=x.event_id and y.member_id=x.member_id join public.members u on u.id=x.member_id where x.event_id=e.id and x.published and not x.removed and y.active and u.role is distinct from 'banned'),'[]'),
    'my_vote',(select photo_id from meadow_private.votes where event_id=e.id and member_id=m.id),'groups',e.groups,'love',jsonb_build_object('enabled',false));
  if p_action='photo_remove' then result:=result||jsonb_build_object('removed_path',ph.path); end if;
  return result;
exception when invalid_text_representation or invalid_parameter_value or check_violation or not_null_violation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
  return jsonb_build_object('error',jsonb_build_object('code','INVALID_INPUT','message','입력값을 확인해 주세요.'));
end $$;

create or replace function public.meadow_action(p_event text,p_action text,p_payload jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$
  select meadow_private.action(p_event,p_action,p_payload)
$$;
revoke all on function meadow_private.action(text,text,jsonb) from public, anon;
grant execute on function meadow_private.action(text,text,jsonb) to authenticated;
revoke all on function public.meadow_action(text,text,jsonb) from public, anon;
grant execute on function public.meadow_action(text,text,jsonb) to authenticated;

-- Used only for Storage policy decisions, never reveals paths or participant rows.
create or replace function meadow_private.storage_access(p_path text,p_operation text)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
   select 1 from public.members me
   join meadow_private.photos ph on ph.path=p_path
   join meadow_private.participants mine on mine.event_id=ph.event_id and mine.member_id=me.id
   join meadow_private.participants author on author.event_id=ph.event_id and author.member_id=ph.member_id
   join public.members am on am.id=ph.member_id
   where me.auth_id=auth.uid() and me.role is distinct from 'banned' and mine.active
   and case p_operation
     when 'read' then (ph.published and not ph.removed and author.active and am.role is distinct from 'banned') or ph.member_id=me.id or (ph.removed and (me.is_admin or me.role='staff'))
     when 'insert' then ph.member_id=me.id and not ph.published and not ph.removed
     when 'delete' then ph.member_id=me.id or me.is_admin or me.role='staff'
     else false end
 )
$$;
revoke all on function meadow_private.storage_access(text,text) from public, anon;
grant execute on function meadow_private.storage_access(text,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('meadow-photos','meadow-photos',false,5242880,array['image/jpeg','image/webp'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/webp'];
-- Restrictive bucket guards defeat unrelated permissive existing Storage policies.
drop policy if exists meadow_read on storage.objects;
create policy meadow_read on storage.objects for select to authenticated using(bucket_id='meadow-photos' and meadow_private.storage_access(name,'read'));
drop policy if exists meadow_insert on storage.objects;
create policy meadow_insert on storage.objects for insert to authenticated with check(bucket_id='meadow-photos' and meadow_private.storage_access(name,'insert'));
drop policy if exists meadow_delete on storage.objects;
create policy meadow_delete on storage.objects for delete to authenticated using(bucket_id='meadow-photos' and meadow_private.storage_access(name,'delete'));
drop policy if exists meadow_guard_read on storage.objects;
create policy meadow_guard_read on storage.objects as restrictive for select to authenticated using(bucket_id<>'meadow-photos' or meadow_private.storage_access(name,'read'));
drop policy if exists meadow_guard_insert on storage.objects;
create policy meadow_guard_insert on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'meadow-photos' or meadow_private.storage_access(name,'insert'));
drop policy if exists meadow_guard_update on storage.objects;
create policy meadow_guard_update on storage.objects as restrictive for update to authenticated using(bucket_id<>'meadow-photos') with check(bucket_id<>'meadow-photos');
drop policy if exists meadow_guard_delete on storage.objects;
create policy meadow_guard_delete on storage.objects as restrictive for delete to authenticated using(bucket_id<>'meadow-photos' or meadow_private.storage_access(name,'delete'));
drop policy if exists meadow_guard_anon on storage.objects;
create policy meadow_guard_anon on storage.objects as restrictive for all to anon using(bucket_id<>'meadow-photos') with check(bucket_id<>'meadow-photos');
commit;
