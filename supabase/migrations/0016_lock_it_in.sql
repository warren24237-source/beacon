-- "Lock it in" (decision 61). Once someone's in, the owner can lock a beacon:
-- it stays for the owner and the people who are in, disappears for everyone else,
-- and nobody new can join. People who are in get a buzz and see who else is in
-- (first names; numbers only for people who are already their friends, decision 28).
-- Unlock reopens it with no buzz. Putting out a locked beacon buzzes the people who were in.

alter table public.beacons add column if not exists locked_at timestamptz;

-- A friend sees a beacon they were sent, unless it's locked and they aren't in.
-- Also used by the places rules, so locked places disappear for them too.
create or replace function public.received_beacon(bid uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.beacon_recipients r join public.beacons b on b.id = r.beacon_id
    where r.beacon_id = bid and r.user_id = auth.uid()
      and (b.locked_at is null
           or exists (select 1 from public.responses x where x.beacon_id = bid and x.user_id = auth.uid())));
$$;

-- "I'm in" is refused once a beacon is locked.
create or replace function public.im_in(p_beacon_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare owner uuid; acts text[]; st timestamptz; me_name text; tok text; d int;
begin
  if not exists (select 1 from public.beacon_recipients r join public.beacons bb on bb.id = r.beacon_id
                 where r.beacon_id = p_beacon_id and r.user_id = auth.uid() and bb.is_active and bb.end_time > now()) then
    raise exception 'That beacon has gone out';
  end if;
  if exists (select 1 from public.beacons where id = p_beacon_id and locked_at is not null)
     and not exists (select 1 from public.responses where beacon_id = p_beacon_id and user_id = auth.uid()) then
    raise exception 'That one''s already locked in';
  end if;
  insert into public.responses (beacon_id, user_id) values (p_beacon_id, auth.uid()) on conflict do nothing;
  if not found then return; end if;
  select owner_id, activities, start_time into owner, acts, st from public.beacons where id = p_beacon_id;
  select full_name into me_name from public.profiles where id = auth.uid();
  select expo_push_token into tok from public.profiles where id = owner;
  d := (st at time zone 'Europe/London')::date - (now() at time zone 'Europe/London')::date;
  perform public.send_push(array[tok], 'Beacon',
    me_name || '''s in for ' || public.activity_phrase(acts) ||
      case when d <= 0 then '' when d = 1 then ' tomorrow' else ' on ' || to_char(st at time zone 'Europe/London', 'FMDay') end || '.',
    jsonb_build_object('type', 'response', 'beacon_id', p_beacon_id));
end;
$$;

-- "Sam", "Sam and Jo", "Sam, Jo and Kat".
create or replace function public.name_list(names text[])
returns text language sql immutable set search_path = public
as $$
  select case coalesce(array_length(names, 1), 0)
    when 0 then ''
    when 1 then names[1]
    else array_to_string(names[1:array_length(names, 1) - 1], ', ') || ' and ' || names[array_length(names, 1)]
  end;
$$;

-- Lock it in. One buzz per person who's in: "Warren's locked in drinks, today 7pm to 11pm. You're in with Sam."
create or replace function public.lock_beacon(p_beacon_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare b public.beacons%rowtype; me_name text; r record; others text[];
begin
  select * into b from public.beacons where id = p_beacon_id and owner_id = auth.uid() and is_active and end_time > now();
  if not found then raise exception 'That beacon has gone out'; end if;
  if b.locked_at is not null then return; end if;
  if not exists (select 1 from public.responses where beacon_id = p_beacon_id) then
    raise exception 'Nobody''s in yet';
  end if;
  update public.beacons set locked_at = now() where id = p_beacon_id;
  select full_name into me_name from public.profiles where id = auth.uid();
  for r in select x.user_id, p.expo_push_token from public.responses x join public.profiles p on p.id = x.user_id
           where x.beacon_id = p_beacon_id loop
    select array_agg(p.full_name order by x.created_at) into others
      from public.responses x join public.profiles p on p.id = x.user_id
      where x.beacon_id = p_beacon_id and x.user_id <> r.user_id;
    perform public.send_push(array[r.expo_push_token], 'Beacon',
      me_name || '''s locked in ' || public.activity_phrase(b.activities) || ', ' ||
        case when (b.start_time at time zone 'Europe/London')::date = (now() at time zone 'Europe/London')::date then 'today ' else '' end ||
        public.when_phrase(b.start_time, b.end_time) || '. ' ||
        case when others is null then 'It''s you and ' || me_name || '.' else 'You''re in with ' || public.name_list(others) || '.' end,
      jsonb_build_object('type', 'locked', 'beacon_id', p_beacon_id));
  end loop;
end;
$$;
grant execute on function public.lock_beacon(uuid) to authenticated;

-- Unlock: the friends it was sent to can see it and join again. No buzz.
create or replace function public.unlock_beacon(p_beacon_id uuid)
returns void language sql security definer set search_path = public
as $$
  update public.beacons set locked_at = null where id = p_beacon_id and owner_id = auth.uid();
$$;
grant execute on function public.unlock_beacon(uuid) to authenticated;

-- Put out one beacon (or all, for older versions). Calling off a locked one buzzes the people who were in.
create or replace function public.put_out_beacon(p_beacon_id uuid default null)
returns void language plpgsql security definer set search_path = public
as $$
declare b record; me_name text; tokens text[];
begin
  select full_name into me_name from public.profiles where id = auth.uid();
  for b in select * from public.beacons
           where owner_id = auth.uid() and is_active and (p_beacon_id is null or id = p_beacon_id) loop
    update public.beacons set is_active = false where id = b.id;
    if b.locked_at is not null and b.end_time > now() then
      select array_agg(p.expo_push_token) into tokens
        from public.responses x join public.profiles p on p.id = x.user_id where x.beacon_id = b.id;
      perform public.send_push(tokens, 'Beacon',
        me_name || '''s called off ' || public.activity_phrase(b.activities) || ', ' || public.when_phrase(b.start_time, b.end_time) || '.',
        jsonb_build_object('type', 'called_off', 'beacon_id', b.id));
    end if;
  end loop;
end;
$$;
grant execute on function public.put_out_beacon(uuid) to authenticated;

-- Who's in on a locked beacon, for the people who are in (the owner already sees responses).
-- The owner comes first. Numbers only for people who are already your friends.
create or replace function public.locked_in_with(p_beacon_id uuid)
returns table (id uuid, full_name text, phone_number text)
language sql stable security definer set search_path = public
as $$
  with b as (
    select bb.* from public.beacons bb
    where bb.id = p_beacon_id and bb.locked_at is not null
      and exists (select 1 from public.responses x where x.beacon_id = bb.id and x.user_id = auth.uid())
  ), people as (
    select b.owner_id as uid, 0 as ord, b.locked_at as t from b
    union all
    select x.user_id, 1, x.created_at from public.responses x join b on b.id = x.beacon_id where x.user_id <> auth.uid()
  )
  select p.id, p.full_name,
         case when public.are_friends(auth.uid(), p.id) then p.phone_number end
  from people pe join public.profiles p on p.id = pe.uid
  order by pe.ord, pe.t;
$$;
grant execute on function public.locked_in_with(uuid) to authenticated;
