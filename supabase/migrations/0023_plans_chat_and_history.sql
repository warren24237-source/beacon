-- Plans, chat and history (decisions 79 to 81, prototypes design/prototypes/chat.html and home-and-history.html).
--
-- 1. Chat: a text thread on each beacon (the owner and everyone who's in) and each Find a day (everyone asked).
--    Text only, 300 characters. One buzz when a thread goes from nothing new to something new for you, then
--    quiet until you open it. Read only once the plan ends, deleted 7 days after.
-- 2. Report a message, block a person. Blocking removes the friendship both ways, stops either re-adding the
--    other, and hides their messages from you in any shared thread.
-- 3. Lock in a date on a Find a day (open question 25): the organiser picks the day, everyone asked gets a buzz.
-- 4. Past plans: ended beacons that someone was in on, and ended Find a days, that you were part of, last 6 months.
--
-- All additive: older apps keep working and simply don't show chat, past plans or the locked day.

-- When a beacon was put out (null = never; older put-out beacons count as ending at end_time).
alter table public.beacons add column if not exists put_out_at timestamptz;
create or replace function public.beacon_put_out_at() returns trigger
language plpgsql as $$
begin
  if old.is_active and not new.is_active then new.put_out_at := now(); end if;
  return new;
end;
$$;
drop trigger if exists beacons_put_out_at on public.beacons;
create trigger beacons_put_out_at before update of is_active on public.beacons
  for each row execute function public.beacon_put_out_at();

-- Find a day: the agreed day.
alter table public.polls add column if not exists locked_day date;

-- When a plan ends. Beacons: put out or end time. Find a days: the end of the locked day, or of the last date.
create or replace function public.beacon_ends(b public.beacons) returns timestamptz
language sql stable as $$
  select case when not b.is_active then least(coalesce(b.put_out_at, b.end_time), b.end_time) else b.end_time end;
$$;
create or replace function public.poll_ends(p public.polls) returns timestamptz
language sql stable as $$
  select ((coalesce(p.locked_day, (select max(d) from unnest(p.dates) d)) + 1)::timestamp at time zone 'Europe/London');
$$;

-- Blocks and reports ---------------------------------------------------------------------------------------

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);
alter table public.blocks enable row level security;
drop policy if exists "See your own blocks" on public.blocks;
create policy "See your own blocks" on public.blocks for select to authenticated using (blocker_id = auth.uid());

create or replace function public.blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;

-- Chat -----------------------------------------------------------------------------------------------------

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  beacon_id uuid references public.beacons(id) on delete cascade,
  poll_id uuid references public.polls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 300),
  -- 'text' is something someone typed. 'event' is a line the plan writes itself (Kat's in, locked in, ...):
  -- body is the event name and meta its details (place ids, never Google place names, which can't be stored).
  kind text not null default 'text' check (kind in ('text', 'event')),
  meta jsonb,
  created_at timestamptz not null default now(),
  check ((beacon_id is null) <> (poll_id is null))
);
create index if not exists messages_beacon_idx on public.messages (beacon_id, id) where beacon_id is not null;
create index if not exists messages_poll_idx on public.messages (poll_id, id) where poll_id is not null;

-- Where you're up to in each thread (thread = a beacon or poll id), and whether you've had your one buzz.
create table if not exists public.chat_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  thread_id uuid not null,
  last_read_id bigint not null default 0,
  buzzed boolean not null default false,
  primary key (user_id, thread_id)
);

create table if not exists public.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid references public.profiles(id) on delete set null,
  reported_id uuid references public.profiles(id) on delete set null,
  message_id bigint,
  body text,
  created_at timestamptz not null default now()
);

-- Who's in a thread right now.
create or replace function public.chat_members(p_beacon_id uuid, p_poll_id uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select b.owner_id from public.beacons b where b.id = p_beacon_id
  union
  select x.user_id from public.responses x where x.beacon_id = p_beacon_id
  union
  select p.owner_id from public.polls p where p.id = p_poll_id
  union
  select i.user_id from public.poll_invitees i where i.poll_id = p_poll_id;
$$;

create or replace function public.in_chat(p_beacon_id uuid, p_poll_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() in (select public.chat_members(p_beacon_id, p_poll_id));
$$;

-- Still open for new messages?
create or replace function public.chat_open(p_beacon_id uuid, p_poll_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select public.beacon_ends(b) > now() from public.beacons b where b.id = p_beacon_id), false)
      or coalesce((select public.poll_ends(p) > now() from public.polls p where p.id = p_poll_id), false);
$$;

alter table public.messages enable row level security;
alter table public.chat_reads enable row level security;
alter table public.reports enable row level security;

drop policy if exists "See messages in your threads" on public.messages;
create policy "See messages in your threads" on public.messages for select to authenticated
  using (public.in_chat(beacon_id, poll_id)
         and not exists (select 1 from public.blocks k where k.blocker_id = auth.uid() and k.blocked_id = messages.user_id));
drop policy if exists "See your own read state" on public.chat_reads;
create policy "See your own read state" on public.chat_reads for select to authenticated using (user_id = auth.uid());

-- Send a message. Buzzes each other member once, until they open the thread.
create or replace function public.send_message(p_beacon_id uuid, p_poll_id uuid, p_body text)
returns json language plpgsql security definer set search_path = public as $$
declare
  txt text := trim(coalesce(p_body, '')); mid bigint; thread uuid := coalesce(p_beacon_id, p_poll_id);
  me_name text; title text; m record;
begin
  if (p_beacon_id is null) = (p_poll_id is null) then raise exception 'Pick one plan'; end if;
  if txt = '' then raise exception 'Say something first'; end if;
  if char_length(txt) > 300 then raise exception 'Keep it under 300 characters'; end if;
  if not public.in_chat(p_beacon_id, p_poll_id) then raise exception 'Only people in on this plan can chat'; end if;
  if not public.chat_open(p_beacon_id, p_poll_id) then raise exception 'This plan has ended'; end if;

  insert into public.messages (beacon_id, poll_id, user_id, body) values (p_beacon_id, p_poll_id, auth.uid(), txt)
    returning id into mid;
  insert into public.chat_reads (user_id, thread_id, last_read_id) values (auth.uid(), thread, mid)
    on conflict (user_id, thread_id) do update set last_read_id = excluded.last_read_id, buzzed = false;

  select full_name into me_name from public.profiles where id = auth.uid();
  if p_beacon_id is not null then
    select initcap(public.activity_phrase(b.activities)) || ', ' || public.when_phrase(b.start_time, b.end_time)
      into title from public.beacons b where b.id = p_beacon_id;
  else
    select p.title into title from public.polls p where p.id = p_poll_id;
  end if;

  for m in
    select u as id, p.expo_push_token from public.chat_members(p_beacon_id, p_poll_id) u
    join public.profiles p on p.id = u
    left join public.chat_reads r on r.user_id = u and r.thread_id = thread
    where u <> auth.uid() and not coalesce(r.buzzed, false) and not public.blocked_between(u, auth.uid())
  loop
    insert into public.chat_reads (user_id, thread_id, buzzed) values (m.id, thread, true)
      on conflict (user_id, thread_id) do update set buzzed = true;
    perform public.send_push(array[m.expo_push_token], title, me_name || ': ' || left(txt, 120),
      jsonb_build_object('type', 'chat', 'beacon_id', p_beacon_id, 'poll_id', p_poll_id));
  end loop;
  return json_build_object('id', mid);
end;
$$;
revoke all on function public.send_message(uuid, uuid, text) from public, anon;
grant execute on function public.send_message(uuid, uuid, text) to authenticated;

-- Opened the thread: up to date, and the next new message can buzz again.
create or replace function public.mark_chat_read(p_beacon_id uuid, p_poll_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare thread uuid := coalesce(p_beacon_id, p_poll_id); top bigint;
begin
  if not public.in_chat(p_beacon_id, p_poll_id) then return; end if;
  select max(id) into top from public.messages where beacon_id is not distinct from p_beacon_id and poll_id is not distinct from p_poll_id;
  insert into public.chat_reads (user_id, thread_id, last_read_id, buzzed) values (auth.uid(), thread, coalesce(top, 0), false)
    on conflict (user_id, thread_id) do update set last_read_id = greatest(chat_reads.last_read_id, excluded.last_read_id), buzzed = false;
end;
$$;
revoke all on function public.mark_chat_read(uuid, uuid) from public, anon;
grant execute on function public.mark_chat_read(uuid, uuid) to authenticated;

-- New-message counts and the last message for every thread you're in that's still readable.
create or replace function public.chat_overview()
returns table (thread_id uuid, unread int, last_from text, last_body text, last_mine boolean, last_kind text, last_meta jsonb)
language sql stable security definer set search_path = public as $$
  with mine as (
    select b.id as thread_id, b.id as bid, null::uuid as pid from public.beacons b
      where (b.owner_id = auth.uid() or exists (select 1 from public.responses x where x.beacon_id = b.id and x.user_id = auth.uid()))
        and public.beacon_ends(b) > now() - interval '7 days'
    union all
    select p.id, null, p.id from public.polls p
      where public.in_poll(p.id) and public.poll_ends(p) > now() - interval '7 days'
  ), visible as (
    select t.thread_id, m.* from mine t join public.messages m
      on (m.beacon_id = t.bid or m.poll_id = t.pid)
    where not exists (select 1 from public.blocks k where k.blocker_id = auth.uid() and k.blocked_id = m.user_id)
  )
  select t.thread_id,
    (select count(*)::int from visible v left join public.chat_reads r on r.user_id = auth.uid() and r.thread_id = t.thread_id
       where v.thread_id = t.thread_id and v.kind = 'text' and v.user_id <> auth.uid() and v.id > coalesce(r.last_read_id, 0)),
    l.full_name, l.body, l.user_id = auth.uid(), l.kind, l.meta
  from mine t
  left join lateral (select v.body, v.user_id, v.kind, v.meta, p.full_name from visible v join public.profiles p on p.id = v.user_id
                     where v.thread_id = t.thread_id order by v.id desc limit 1) l on true;
$$;
revoke all on function public.chat_overview() from public, anon;
grant execute on function public.chat_overview() to authenticated;

-- Report a message. Kept for Warren to review in the database; the text is copied in case it's deleted.
create or replace function public.report_message(p_message_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare m public.messages;
begin
  select * into m from public.messages where id = p_message_id;
  if m.id is null or not public.in_chat(m.beacon_id, m.poll_id) then raise exception 'Message not found'; end if;
  insert into public.reports (reporter_id, reported_id, message_id, body) values (auth.uid(), m.user_id, m.id, m.body);
end;
$$;
revoke all on function public.report_message(bigint) from public, anon;
grant execute on function public.report_message(bigint) to authenticated;

-- Block someone: no longer friends, can't re-add each other, their messages are hidden from you.
create or replace function public.block_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user_id = auth.uid() then raise exception 'That is you'; end if;
  insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), p_user_id) on conflict do nothing;
  delete from public.friendships where (user_id = auth.uid() and friend_id = p_user_id) or (user_id = p_user_id and friend_id = auth.uid());
  delete from public.friend_requests where (from_id = auth.uid() and to_id = p_user_id) or (from_id = p_user_id and to_id = auth.uid());
  delete from public.circle_members cm using public.circles c
    where c.id = cm.circle_id and ((c.owner_id = auth.uid() and cm.member_id = p_user_id) or (c.owner_id = p_user_id and cm.member_id = auth.uid()));
end;
$$;
revoke all on function public.block_user(uuid) from public, anon;
grant execute on function public.block_user(uuid) to authenticated;

-- Blocked people can't re-add each other (by code or by request). Same wording as a wrong code, so it doesn't tell.
create or replace function public.add_friend(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare other uuid; other_name text;
begin
  if not public.is_member() then raise exception 'Join Beacon first'; end if;
  select id, full_name into other, other_name from public.profiles where friend_code = upper(trim(p_code));
  if other is null or public.blocked_between(auth.uid(), other) then raise exception 'No one has that friend code'; end if;
  if other = auth.uid() then raise exception 'That is your own code'; end if;
  insert into public.friendships (user_id, friend_id) values (auth.uid(), other), (other, auth.uid()) on conflict do nothing;
  return other_name;
end;
$$;

create or replace function public._request_friend(p_to uuid)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); me_name text; tok text;
begin
  if not public.is_member() then raise exception 'Join Beacon first'; end if;
  if p_to = me then raise exception 'That is you'; end if;
  if public.blocked_between(me, p_to) then return 'requested'; end if;
  if public.are_friends(me, p_to) then return 'friends'; end if;
  if exists (select 1 from public.friend_requests where from_id = p_to and to_id = me) then
    insert into public.friendships (user_id, friend_id) values (me, p_to), (p_to, me) on conflict do nothing;
    delete from public.friend_requests where (from_id = p_to and to_id = me) or (from_id = me and to_id = p_to);
    return 'friends';
  end if;
  insert into public.friend_requests (from_id, to_id) values (me, p_to) on conflict do nothing;
  if found then
    select full_name into me_name from public.profiles where id = me;
    select expo_push_token into tok from public.profiles where id = p_to;
    perform public.send_push(array[tok], 'Beacon', me_name || ' wants to add you on Beacon.', jsonb_build_object('type', 'friend_request'));
  end if;
  return 'requested';
end;
$$;

-- Lock in a date (Find a day) ---------------------------------------------------------------------------------

create or replace function public.lock_poll(p_poll_id uuid, p_day date)
returns void language plpgsql security definer set search_path = public as $$
declare p public.polls; me_name text; tokens text[]; was date;
begin
  select * into p from public.polls where id = p_poll_id and owner_id = auth.uid();
  if p.id is null then raise exception 'Only the organiser can lock in a date'; end if;
  if p_day is not null and not (p_day = any(p.dates)) then raise exception 'That date is not on this one'; end if;
  if p_day is not null and p_day < (now() at time zone 'Europe/London')::date then raise exception 'That date has passed'; end if;
  was := p.locked_day;
  if was is not distinct from p_day then return; end if;
  update public.polls set locked_day = p_day where id = p_poll_id;
  if p_day is null then return; end if;  -- unlocking is silent

  select full_name into me_name from public.profiles where id = auth.uid();
  select array_agg(pr.expo_push_token) into tokens
    from public.poll_invitees i join public.profiles pr on pr.id = i.user_id where i.poll_id = p_poll_id;
  perform public.send_push(tokens, 'Beacon',
    case when was is null
      then me_name || '''s locked in ' || p.title || ': ' || to_char(p_day, 'Dy FMDD Mon') || ', ' || lower(p.time_label) || '.'
      else me_name || ' moved ' || p.title || ' to ' || to_char(p_day, 'Dy FMDD Mon') || '.' end,
    jsonb_build_object('type', 'poll', 'poll_id', p_poll_id));
end;
$$;
revoke all on function public.lock_poll(uuid, date) from public, anon;
grant execute on function public.lock_poll(uuid, date) to authenticated;

-- Past plans -------------------------------------------------------------------------------------------------

create or replace function public.past_plans()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(x order by x.ended desc), '[]'::json) from (
    select 'beacon'::text as kind, b.id, initcap(public.activity_phrase(b.activities)) as title, b.activities,
      b.owner_id = auth.uid() as mine, o.full_name as owner,
      b.start_time, b.end_time, null::date as day, null::text as time_label,
      case when b.put_out_at is not null and b.put_out_at < b.end_time then 'called_off'
           when b.locked_at is not null then 'locked'
           else 'ended' end as status,
      (select json_build_object('place_id', bp.place_id, 'label', bp.label) from public.beacon_places bp
         where bp.beacon_id = b.id and bp.position = b.confirmed_position) as place,
      coalesce((select json_agg(json_build_object('place_id', bp.place_id, 'label', bp.label, 'starred', bp.starred) order by bp.position)
         from public.beacon_places bp where bp.beacon_id = b.id and bp.position <= 3 and bp.suggested_by is null), '[]'::json) as places,
      b.audience_all, b.audience_circle_ids,
      coalesce((select json_agg(pr.full_name order by x.created_at) from public.responses x join public.profiles pr on pr.id = x.user_id
         where x.beacon_id = b.id and x.user_id <> auth.uid()), '[]'::json) as who,
      public.beacon_ends(b) as ended,
      public.beacon_ends(b) > now() - interval '7 days' as chat_open
    from public.beacons b join public.profiles o on o.id = b.owner_id
    where (b.owner_id = auth.uid() or exists (select 1 from public.responses x where x.beacon_id = b.id and x.user_id = auth.uid()))
      and exists (select 1 from public.responses x where x.beacon_id = b.id)
      and (b.is_active or b.put_out_at is not null)
      and public.beacon_ends(b) <= now()
      and public.beacon_ends(b) > now() - interval '6 months'
      and not public.blocked_between(auth.uid(), b.owner_id)
    union all
    select 'poll', p.id, p.title, null::text[], p.owner_id = auth.uid(), o.full_name,
      null::timestamptz, null::timestamptz, coalesce(p.locked_day, (select max(d) from unnest(p.dates) d)), p.time_label,
      case when p.locked_day is not null then 'locked' else 'ended' end,
      null::json, null::json, null::boolean, null::uuid[],
      coalesce((select json_agg(pr.full_name order by pr.full_name) from public.poll_invitees i join public.profiles pr on pr.id = i.user_id
         where i.poll_id = p.id and i.user_id <> auth.uid()), '[]'::json),
      public.poll_ends(p),
      public.poll_ends(p) > now() - interval '7 days'
    from public.polls p join public.profiles o on o.id = p.owner_id
    where public.in_poll(p.id)
      and public.poll_ends(p) <= now()
      and public.poll_ends(p) > now() - interval '6 months'
      and not public.blocked_between(auth.uid(), p.owner_id)
  ) x;
$$;
revoke all on function public.past_plans() from public, anon;
grant execute on function public.past_plans() to authenticated;

-- Past beacons stay readable to the people who were in on them (the beacons policy only covers recipients,
-- which already includes everyone who was in, so nothing to change there).


-- Event lines in the chat (Warren, 31 Oct): the plan writes what happened, so nobody has to type it.
-- They never buzz (each of these already sends its own buzz) and never count as new.
create or replace function public.chat_event(p_beacon_id uuid, p_poll_id uuid, p_actor uuid, p_event text, p_meta jsonb default null)
returns void language sql security definer set search_path = public as $$
  insert into public.messages (beacon_id, poll_id, user_id, body, kind, meta)
  select p_beacon_id, p_poll_id, p_actor, p_event, 'event', p_meta where p_actor is not null;
$$;
revoke all on function public.chat_event(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.place_ref(p_beacon_id uuid, p_position smallint) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('place_id', place_id, 'label', label) from public.beacon_places
  where beacon_id = p_beacon_id and position = p_position;
$$;

-- "Kat's in"
create or replace function public.event_response_in() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.chat_event(new.beacon_id, null, new.user_id, 'in');
  return new;
end;
$$;
drop trigger if exists responses_event_in on public.responses;
create trigger responses_event_in after insert on public.responses for each row execute function public.event_response_in();

-- "Dan can't make it" (only when they take themselves out, not when the owner changes Who).
create or replace function public.event_response_out() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.user_id = auth.uid() then perform public.chat_event(old.beacon_id, null, old.user_id, 'out'); end if;
  return old;
end;
$$;
drop trigger if exists responses_event_out on public.responses;
create trigger responses_event_out after delete on public.responses for each row execute function public.event_response_out();

-- Locked in (with or without a place), place changed, unlocked, beacon changed, called off.
create or replace function public.event_beacon() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.is_active and not new.is_active and new.end_time > now() then
    perform public.chat_event(new.id, null, new.owner_id, 'called_off');
    return new;
  end if;
  if old.locked_at is null and new.locked_at is not null then
    perform public.chat_event(new.id, null, new.owner_id, 'locked', public.place_ref(new.id, new.confirmed_position));
  elsif old.locked_at is not null and new.locked_at is null then
    perform public.chat_event(new.id, null, new.owner_id, 'unlocked');
  elsif new.locked_at is not null and new.confirmed_position is distinct from old.confirmed_position
        and new.confirmed_position is not null and auth.uid() = new.owner_id then
    perform public.chat_event(new.id, null, new.owner_id, 'moved', public.place_ref(new.id, new.confirmed_position));
  end if;
  if new.is_active and (new.start_time, new.end_time, new.activities) is distinct from (old.start_time, old.end_time, old.activities) then
    perform public.chat_event(new.id, null, new.owner_id, 'changed',
      jsonb_build_object('what', public.activity_phrase(new.activities), 'when', public.when_phrase(new.start_time, new.end_time)));
  end if;
  return new;
end;
$$;
drop trigger if exists beacons_event on public.beacons;
create trigger beacons_event after update on public.beacons for each row execute function public.event_beacon();

-- "Sam suggested The Malt Cross"
create or replace function public.event_suggestion() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.suggested_by is not null then
    perform public.chat_event(new.beacon_id, null, new.suggested_by, 'suggested',
      jsonb_build_object('place_id', new.place_id, 'label', new.label));
  end if;
  return new;
end;
$$;
drop trigger if exists beacon_places_event on public.beacon_places;
create trigger beacon_places_event after insert on public.beacon_places for each row execute function public.event_suggestion();

-- Find a day: "Warren locked in Sat 12 Dec"
create or replace function public.event_poll() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.locked_day is distinct from old.locked_day then
    perform public.chat_event(null, new.id, new.owner_id, case when new.locked_day is null then 'unlocked' else 'locked_day' end,
      case when new.locked_day is null then null else jsonb_build_object('day', new.locked_day) end);
  end if;
  return new;
end;
$$;
drop trigger if exists polls_event on public.polls;
create trigger polls_event after update of locked_day on public.polls for each row execute function public.event_poll();

-- Clean-up: chat text goes 7 days after its plan ends. Hourly.
create or replace function public.delete_old_chat() returns void
language sql security definer set search_path = public as $$
  delete from public.messages m using public.beacons b
    where m.beacon_id = b.id and public.beacon_ends(b) < now() - interval '7 days';
  delete from public.messages m using public.polls p
    where m.poll_id = p.id and public.poll_ends(p) < now() - interval '7 days';
  delete from public.chat_reads r
    where not exists (select 1 from public.messages m where m.beacon_id = r.thread_id or m.poll_id = r.thread_id)
      and not exists (select 1 from public.beacons b where b.id = r.thread_id and public.beacon_ends(b) > now())
      and not exists (select 1 from public.polls p where p.id = r.thread_id and public.poll_ends(p) > now());
$$;
revoke all on function public.delete_old_chat() from public, anon, authenticated;
select cron.unschedule(jobid) from cron.job where jobname = 'delete-old-chat';
select cron.schedule('delete-old-chat', '17 * * * *', 'select public.delete_old_chat()');

-- Live chat: let the app listen for new messages (Supabase Realtime honours the select policy above).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
exception when duplicate_object then null;
end $$;

grant select on public.messages, public.chat_reads, public.blocks to authenticated;
