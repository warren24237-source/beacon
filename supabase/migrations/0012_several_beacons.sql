-- Several beacons at once, now or up to a week ahead (decisions 50 and 51).
-- Lighting no longer puts your other beacons out. "Put it out" can end one beacon.
-- Notifications say the day when it isn't today. Older app versions keep working:
-- the new parameters have defaults.

-- "today", "tomorrow" or "Sat 31 Oct", then "9am to 12pm" (London time).
create or replace function public.when_phrase(p_start timestamptz, p_end timestamptz)
returns text language sql stable set search_path = public
as $$
  select
    case (p_start at time zone 'Europe/London')::date - (now() at time zone 'Europe/London')::date
      when 0 then ''
      when 1 then 'tomorrow, '
      else to_char(p_start at time zone 'Europe/London', 'Dy FMDD Mon') || ', '
    end ||
    replace(lower(to_char(p_start at time zone 'Europe/London', 'FMHH12:MIam')), ':00', '') || ' to ' ||
    replace(lower(to_char(p_end at time zone 'Europe/London', 'FMHH12:MIam')), ':00', '');
$$;

drop function if exists public.light_beacon(text[], text, timestamptz, timestamptz, boolean, uuid[]);
create function public.light_beacon(
  p_activities text[], p_note text, p_start timestamptz, p_end timestamptz, p_all boolean, p_circle_ids uuid[],
  p_replace uuid default null  -- "Change": this beacon goes out and the new one takes its place
)
returns json language plpgsql security definer set search_path = public
as $$
declare b uuid; n int; me_name text; tokens text[];
begin
  if not public.is_member() then raise exception 'Join Beacon first'; end if;
  if p_end <= now() then raise exception 'That time has already passed'; end if;
  if p_start > now() + interval '8 days' then raise exception 'Beacons can go up to a week ahead'; end if;
  if p_replace is not null then
    update public.beacons set is_active = false where id = p_replace and owner_id = auth.uid();
  end if;

  insert into public.beacons (owner_id, activities, note, start_time, end_time, audience_all, audience_circle_ids)
  values (auth.uid(), p_activities, nullif(trim(p_note), ''), p_start, p_end, p_all, coalesce(p_circle_ids, '{}'))
  returning id into b;

  insert into public.beacon_recipients (beacon_id, user_id)
  select distinct b, f.friend_id from public.friendships f
  where f.user_id = auth.uid()
    and (p_all or exists (
      select 1 from public.circle_members cm join public.circles c on c.id = cm.circle_id
      where c.owner_id = auth.uid() and cm.member_id = f.friend_id and c.id = any(p_circle_ids)));
  get diagnostics n = row_count;

  select full_name into me_name from public.profiles where id = auth.uid();
  select array_agg(p.expo_push_token) into tokens
    from public.beacon_recipients r join public.profiles p on p.id = r.user_id where r.beacon_id = b;
  perform public.send_push(tokens, 'Beacon',
    me_name || '''s up for ' || public.activity_phrase(p_activities) || ', ' || public.when_phrase(p_start, p_end) ||
      coalesce('. "' || nullif(trim(p_note), '') || '"', ''),
    jsonb_build_object('type', 'beacon', 'beacon_id', b));

  return json_build_object('beacon_id', b, 'recipients', n);
end;
$$;
grant execute on function public.light_beacon(text[], text, timestamptz, timestamptz, boolean, uuid[], uuid) to authenticated;

-- Put out one beacon, or (older app versions, no argument) all of them.
drop function if exists public.put_out_beacon();
create function public.put_out_beacon(p_beacon_id uuid default null)
returns void language sql security definer set search_path = public
as $$
  update public.beacons set is_active = false
  where owner_id = auth.uid() and is_active and (p_beacon_id is null or id = p_beacon_id);
$$;
grant execute on function public.put_out_beacon(uuid) to authenticated;

-- "I'm in": the owner's notification says which day when it isn't today.
create or replace function public.im_in(p_beacon_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare owner uuid; acts text[]; st timestamptz; me_name text; tok text; d int;
begin
  if not exists (select 1 from public.beacon_recipients r join public.beacons bb on bb.id = r.beacon_id
                 where r.beacon_id = p_beacon_id and r.user_id = auth.uid() and bb.is_active and bb.end_time > now()) then
    raise exception 'That beacon has gone out';
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
