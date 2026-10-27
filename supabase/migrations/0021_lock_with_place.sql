-- Lock it in also confirms the place (decision 77, prototype design/prototypes/lock-it-in.html).
-- The owner locks with a place (or "not sure yet"), and can change it afterwards. People who are in
-- get one buzz each time: "Warren's locked in drinks, today 7pm to 11pm, at The Malt Cross. You're in with Sam."
-- then "Warren moved drinks to Dan's." p_place_name is only for the buzz, never stored (Google's terms).
-- beacons.confirmed_position and its clean-up trigger arrive in 0020.

-- Replaces lock_beacon(uuid). Older apps call it with only p_beacon_id and still lock, with no place.
drop function if exists public.lock_beacon(uuid);
create function public.lock_beacon(p_beacon_id uuid, p_position smallint default null, p_place_name text default null)
returns void language plpgsql security definer set search_path = public
as $$
declare b public.beacons%rowtype; me_name text; r record; others text[]; at_txt text := '';
begin
  select * into b from public.beacons where id = p_beacon_id and owner_id = auth.uid() and is_active and end_time > now();
  if not found then raise exception 'That beacon has gone out'; end if;
  if b.locked_at is not null then return; end if;
  if not exists (select 1 from public.responses where beacon_id = p_beacon_id) then
    raise exception 'Nobody''s in yet';
  end if;
  if p_position is not null and not exists (select 1 from public.beacon_places where beacon_id = p_beacon_id and position = p_position) then
    raise exception 'That place is not on this beacon';
  end if;
  update public.beacons set locked_at = now(), confirmed_position = coalesce(p_position, confirmed_position) where id = p_beacon_id;
  if p_position is not null and nullif(trim(p_place_name), '') is not null then
    at_txt := ', at ' || left(trim(p_place_name), 40);
  end if;

  select full_name into me_name from public.profiles where id = auth.uid();
  for r in select x.user_id, p.expo_push_token from public.responses x join public.profiles p on p.id = x.user_id
           where x.beacon_id = p_beacon_id loop
    select array_agg(p.full_name order by x.created_at) into others
      from public.responses x join public.profiles p on p.id = x.user_id
      where x.beacon_id = p_beacon_id and x.user_id <> r.user_id;
    perform public.send_push(array[r.expo_push_token], 'Beacon',
      me_name || '''s locked in ' || public.activity_phrase(b.activities) || ', ' ||
        case when (b.start_time at time zone 'Europe/London')::date = (now() at time zone 'Europe/London')::date then 'today ' else '' end ||
        public.when_phrase(b.start_time, b.end_time) || at_txt || '. ' ||
        case when others is null then 'It''s you and ' || me_name || '.' else 'You''re in with ' || public.name_list(others) || '.' end,
      jsonb_build_object('type', 'locked', 'beacon_id', p_beacon_id));
  end loop;
end;
$$;
revoke execute on function public.lock_beacon(uuid, smallint, text) from anon, public;
grant execute on function public.lock_beacon(uuid, smallint, text) to authenticated;

-- Change the place after locking (or pick one, if it was locked with "not sure yet").
-- null means "not sure yet". Buzzes the people who are in, only when it actually changes.
create or replace function public.set_beacon_place(p_beacon_id uuid, p_position smallint, p_place_name text default null)
returns void language plpgsql security definer set search_path = public
as $$
declare b public.beacons%rowtype; me_name text; tokens text[];
begin
  select * into b from public.beacons where id = p_beacon_id and owner_id = auth.uid() and is_active and end_time > now();
  if not found then raise exception 'That beacon has gone out'; end if;
  if b.locked_at is null then raise exception 'Lock it in first'; end if;
  if p_position is not null and not exists (select 1 from public.beacon_places where beacon_id = p_beacon_id and position = p_position) then
    raise exception 'That place is not on this beacon';
  end if;
  if b.confirmed_position is not distinct from p_position then return; end if;
  update public.beacons set confirmed_position = p_position where id = p_beacon_id;

  select full_name into me_name from public.profiles where id = auth.uid();
  select array_agg(p.expo_push_token) into tokens
    from public.responses x join public.profiles p on p.id = x.user_id where x.beacon_id = p_beacon_id;
  perform public.send_push(tokens, 'Beacon',
    case when p_position is null
      then me_name || ' hasn''t decided where for ' || public.activity_phrase(b.activities) || ' yet.'
      else me_name || ' moved ' || public.activity_phrase(b.activities) || ' to ' || coalesce(nullif(left(trim(p_place_name), 40), ''), 'a new place') || '.'
    end,
    jsonb_build_object('type', 'locked', 'beacon_id', p_beacon_id));
end;
$$;
revoke execute on function public.set_beacon_place(uuid, smallint, text) from anon, public;
grant execute on function public.set_beacon_place(uuid, smallint, text) to authenticated;
