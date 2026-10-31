-- Nudge (open question 27, decision 87). The organiser can nudge someone who hasn't answered, once per
-- person per plan. The app never nudges on its own (principle 3): a person chooses to.
--   Beacon:     "Warren's still up for drinks, today 7pm to 11pm. In?"
--   Find a day: "Warren's still finding a day for christmas drinks. Tick when you're free."
-- People who hid the beacon are skipped silently: the organiser sees "Nudged" either way, so hiding stays private.
-- Hiding moves to the server for this (it was only on the phone). Only you can see your own hidden list.

create table if not exists public.hidden_beacons (
  user_id uuid not null references public.profiles(id) on delete cascade,
  beacon_id uuid not null references public.beacons(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, beacon_id)
);
alter table public.hidden_beacons enable row level security;
drop policy if exists "See your own hidden beacons" on public.hidden_beacons;
create policy "See your own hidden beacons" on public.hidden_beacons for select to authenticated using (user_id = auth.uid());

create or replace function public.set_hidden(p_beacon_id uuid, p_hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_hidden then
    insert into public.hidden_beacons (user_id, beacon_id)
      select auth.uid(), p_beacon_id where public.received_beacon(p_beacon_id)
      on conflict do nothing;
  else
    delete from public.hidden_beacons where user_id = auth.uid() and beacon_id = p_beacon_id;
  end if;
end;
$$;
revoke all on function public.set_hidden(uuid, boolean) from public, anon;
grant execute on function public.set_hidden(uuid, boolean) to authenticated;

-- Who's been nudged on which plan (a beacon or a poll id). The organiser can see their own plans' nudges.
create table if not exists public.nudges (
  plan_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  nudged_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);
alter table public.nudges enable row level security;
drop policy if exists "See nudges on your plans" on public.nudges;
create policy "See nudges on your plans" on public.nudges for select to authenticated
  using (public.owns_beacon(plan_id) or exists (select 1 from public.polls p where p.id = plan_id and p.owner_id = auth.uid()));
grant select on public.nudges, public.hidden_beacons to authenticated;

create or replace function public.nudge(p_beacon_id uuid, p_poll_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me_name text; tok text; b public.beacons; p public.polls; plan uuid := coalesce(p_beacon_id, p_poll_id);
begin
  if (p_beacon_id is null) = (p_poll_id is null) then raise exception 'Pick one plan'; end if;
  select full_name into me_name from public.profiles where id = auth.uid();

  if p_beacon_id is not null then
    select * into b from public.beacons where id = p_beacon_id and owner_id = auth.uid();
    if b.id is null then raise exception 'Only the organiser can nudge'; end if;
    if not b.is_active or b.end_time <= now() then raise exception 'This plan has ended'; end if;
    if b.locked_at is not null then raise exception 'It''s locked in, so nobody new can join'; end if;
    if not exists (select 1 from public.beacon_recipients where beacon_id = b.id and user_id = p_user_id) then raise exception 'They weren''t sent this one'; end if;
    if exists (select 1 from public.responses where beacon_id = b.id and user_id = p_user_id) then raise exception 'They''re already in'; end if;
  else
    select * into p from public.polls where id = p_poll_id and owner_id = auth.uid();
    if p.id is null then raise exception 'Only the organiser can nudge'; end if;
    if public.poll_ends(p) <= now() or p.locked_day is not null then raise exception 'This one''s settled'; end if;
    if not exists (select 1 from public.poll_invitees where poll_id = p.id and user_id = p_user_id and answered_at is null) then raise exception 'They''ve already answered'; end if;
  end if;

  insert into public.nudges (plan_id, user_id) values (plan, p_user_id) on conflict do nothing;
  if not found then raise exception 'Already nudged'; end if;

  -- Skipped silently: anyone who hid the beacon or blocked you (or you them).
  if p_beacon_id is not null and exists (select 1 from public.hidden_beacons where user_id = p_user_id and beacon_id = p_beacon_id) then return; end if;
  if public.blocked_between(auth.uid(), p_user_id) then return; end if;

  select expo_push_token into tok from public.profiles where id = p_user_id;
  if p_beacon_id is not null then
    perform public.send_push(array[tok], 'Beacon',
      me_name || '''s still up for ' || public.activity_phrase(b.activities) || ', ' || public.when_phrase(b.start_time, b.end_time) || '. In?',
      jsonb_build_object('type', 'beacon', 'beacon_id', b.id));
  else
    perform public.send_push(array[tok], 'Beacon',
      me_name || '''s still finding a day for ' || lower(p.title) || '. Tick when you''re free.',
      jsonb_build_object('type', 'poll', 'poll_id', p.id));
  end if;
end;
$$;
revoke all on function public.nudge(uuid, uuid, uuid) from public, anon;
grant execute on function public.nudge(uuid, uuid, uuid) to authenticated;
