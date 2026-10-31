-- One sheet from the lamp (decision 82, prototype design/prototypes/one-sheet.html).
-- 1. Beacons can go up to 3 months ahead with "Pick a date", not just a week (a tester asked, 31 Oct).
-- 2. Find a day's buzz says "find a day", matching the app: "Warren wants to find a day for drinks. Tap when you're free."
-- Same signatures, so installed apps keep working.

CREATE OR REPLACE FUNCTION public.light_beacon(p_activities text[], p_note text, p_start timestamp with time zone, p_end timestamp with time zone, p_all boolean, p_circle_ids uuid[], p_replace uuid DEFAULT NULL::uuid, p_places jsonb DEFAULT '[]'::jsonb, p_place_names text[] DEFAULT '{}'::text[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b uuid; n int; me_name text; tokens text[]; places_txt text := ''; nm text[]; body text;
  editing boolean := false; who uuid[]; old_places jsonb; confirmed jsonb;
begin
  if not public.is_member() then raise exception 'Join Beacon first'; end if;
  if p_end <= now() then raise exception 'That time has already passed'; end if;
  if p_start > now() + interval '93 days' then raise exception 'Beacons can go up to 3 months ahead'; end if;
  if jsonb_array_length(coalesce(p_places, '[]'::jsonb)) > 3 then raise exception 'Up to 3 places'; end if;

  if p_replace is not null then
    select id into b from public.beacons
      where id = p_replace and owner_id = auth.uid() and is_active and end_time > now();
    editing := b is not null;
  end if;

  if editing then
    update public.beacons
      set activities = p_activities, note = nullif(trim(p_note), ''), start_time = p_start, end_time = p_end,
          audience_all = p_all, audience_circle_ids = coalesce(p_circle_ids, '{}')
      where id = b;

    -- The owner's places (1 to 3) are replaced; friends' suggestions (4 to 12) stay.
    -- A favourite follows its place to its new position, or becomes "any" if the place was removed.
    select jsonb_build_object('place_id', bp.place_id, 'label', bp.label) into confirmed
      from public.beacons bb join public.beacon_places bp on bp.beacon_id = bb.id and bp.position = bb.confirmed_position
      where bb.id = b and bp.position <= 3 and bp.suggested_by is null;
    select coalesce(jsonb_agg(jsonb_build_object('position', position, 'place_id', place_id, 'label', label)), '[]'::jsonb)
      into old_places from public.beacon_places where beacon_id = b and position <= 3 and suggested_by is null;
    delete from public.beacon_places where beacon_id = b and position <= 3 and suggested_by is null;
  else
    insert into public.beacons (owner_id, activities, note, start_time, end_time, audience_all, audience_circle_ids)
    values (auth.uid(), p_activities, nullif(trim(p_note), ''), p_start, p_end, p_all, coalesce(p_circle_ids, '{}'))
    returning id into b;
  end if;

  insert into public.beacon_places (beacon_id, position, place_id, label, starred)
  select b, (e.ord)::smallint, nullif(e.val->>'place_id', ''), nullif(trim(e.val->>'label'), ''), coalesce((e.val->>'starred')::boolean, false)
  from jsonb_array_elements(coalesce(p_places, '[]'::jsonb)) with ordinality as e(val, ord);

  if editing then
    update public.place_prefs pp
      set position = (select np.position from jsonb_array_elements(old_places) op join public.beacon_places np
                        on np.beacon_id = b and np.position <= 3 and np.suggested_by is null
                       and np.place_id is not distinct from (op->>'place_id') and np.label is not distinct from (op->>'label')
                      where (op->>'position')::smallint = pp.position limit 1),
          updated_at = now()
      where pp.beacon_id = b and pp.position <= 3;
    if confirmed is not null then
      update public.beacons set confirmed_position = (
        select np.position from public.beacon_places np
        where np.beacon_id = b and np.position <= 3 and np.suggested_by is null
          and np.place_id is not distinct from (confirmed->>'place_id') and np.label is not distinct from (confirmed->>'label')
        limit 1) where id = b;
    end if;
  end if;

  -- Who it goes to now.
  who := array(
    select distinct f.friend_id from public.friendships f
    where f.user_id = auth.uid()
      and (p_all or exists (
        select 1 from public.circle_members cm join public.circles c on c.id = cm.circle_id
        where c.owner_id = auth.uid() and cm.member_id = f.friend_id and c.id = any(p_circle_ids))));
  n := coalesce(array_length(who, 1), 0);

  -- "The Malt Cross" / "The Malt Cross or Dan's" / "A, B or C"
  nm := array(select left(trim(x), 40) from unnest(coalesce(p_place_names, '{}')) x where trim(x) <> '' limit 3);
  if array_length(nm, 1) = 1 then places_txt := '. ' || nm[1];
  elsif array_length(nm, 1) > 1 then
    places_txt := '. ' || array_to_string(nm[1:array_length(nm, 1) - 1], ', ') || ' or ' || nm[array_length(nm, 1)];
  end if;
  select full_name into me_name from public.profiles where id = auth.uid();
  body := me_name || '''s up for ' || public.activity_phrase(p_activities) || ', ' || public.when_phrase(p_start, p_end) ||
    places_txt || coalesce('. "' || nullif(trim(p_note), '') || '"', '');

  if editing then
    -- People taken off lose the beacon and anything they'd said on it, silently.
    delete from public.responses where beacon_id = b and user_id <> all(who);
    delete from public.place_prefs where beacon_id = b and user_id <> all(who);
    delete from public.beacon_places where beacon_id = b and suggested_by is not null and suggested_by <> all(who);
    delete from public.beacon_recipients where beacon_id = b and user_id <> all(who);

    -- People who are in: one buzz saying it changed.
    select array_agg(p.expo_push_token) into tokens
      from public.responses x join public.profiles p on p.id = x.user_id where x.beacon_id = b;
    perform public.send_push(tokens, 'Beacon',
      me_name || ' changed ' || public.activity_phrase(p_activities) || ': ' || public.when_phrase(p_start, p_end) ||
        places_txt || coalesce('. "' || nullif(trim(p_note), '') || '"', ''),
      jsonb_build_object('type', 'beacon', 'beacon_id', b));

    -- People newly added: the normal new-beacon buzz.
    select array_agg(p.expo_push_token) into tokens
      from public.profiles p
      where p.id = any(who) and not exists (select 1 from public.beacon_recipients r where r.beacon_id = b and r.user_id = p.id);
    insert into public.beacon_recipients (beacon_id, user_id)
      select b, u from unnest(who) u on conflict do nothing;
    perform public.send_push(tokens, 'Beacon', body, jsonb_build_object('type', 'beacon', 'beacon_id', b));
  else
    insert into public.beacon_recipients (beacon_id, user_id) select b, u from unnest(who) u;
    select array_agg(p.expo_push_token) into tokens
      from public.beacon_recipients r join public.profiles p on p.id = r.user_id where r.beacon_id = b;
    perform public.send_push(tokens, 'Beacon', body, jsonb_build_object('type', 'beacon', 'beacon_id', b));
  end if;

  return json_build_object('beacon_id', b, 'recipients', n);
end;
$function$

;

CREATE OR REPLACE FUNCTION public.create_poll(p_title text, p_dates date[], p_time_label text, p_all boolean, p_circle_ids uuid[], p_user_ids uuid[], p_start_minute integer DEFAULT NULL::integer, p_end_minute integer DEFAULT NULL::integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare pid uuid; n int; me_name text; tokens text[];
begin
  if not public.is_member() then raise exception 'Join Beacon first'; end if;
  if coalesce(cardinality(p_dates), 0) = 0 then raise exception 'Pick at least one date'; end if;

  insert into public.polls (owner_id, title, dates, time_label, start_minute, end_minute)
  values (auth.uid(), trim(p_title), (select array_agg(distinct d order by d) from unnest(p_dates) d), trim(p_time_label), p_start_minute, p_end_minute)
  returning id into pid;

  insert into public.poll_invitees (poll_id, user_id)
  select distinct pid, f.friend_id from public.friendships f
  where f.user_id = auth.uid()
    and (p_all
      or f.friend_id = any(coalesce(p_user_ids, '{}'))
      or exists (
        select 1 from public.circle_members cm join public.circles c on c.id = cm.circle_id
        where c.owner_id = auth.uid() and cm.member_id = f.friend_id and c.id = any(coalesce(p_circle_ids, '{}'))));
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Nobody to ask. Pick some friends or a circle with people in it.'; end if;

  select full_name into me_name from public.profiles where id = auth.uid();
  select array_agg(p.expo_push_token) into tokens
    from public.poll_invitees i join public.profiles p on p.id = i.user_id where i.poll_id = pid;
  perform public.send_push(tokens, 'Beacon',
    me_name || ' wants to find a day for ' || lower(trim(p_title)) || '. Tap when you''re free.',
    jsonb_build_object('type', 'poll', 'poll_id', pid));

  -- The organiser joins in after the notifications have gone.
  insert into public.poll_invitees (poll_id, user_id) values (pid, auth.uid()) on conflict do nothing;

  return json_build_object('poll_id', pid, 'invitees', n);
end;
$function$

;
