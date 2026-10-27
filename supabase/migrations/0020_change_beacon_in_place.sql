-- Changing a beacon keeps everyone's answers (decision 76).
-- Before: "Change your beacon" put the old beacon out and lit a new one, so every "I'm in",
-- favourite place and suggestion was lost, and everyone got buzzed as if it were new.
-- Now light_beacon with p_replace edits that beacon where it is:
--   * people who are in stay in, with their favourite place kept if that place is still on it;
--     suggestions from friends stay;
--   * people who are in get one buzz saying it changed ("Warren changed drinks: today 7pm to 11pm. The Malt Cross");
--   * people newly added to Who get the normal new-beacon buzz; people taken off lose it, silently;
--   * everyone else sees the new details without a buzz.
-- Same signature and return value, so installed apps get the fix with no update.
--
-- Also lays the ground for Lock it in with a place (decision 77, migration 0021): the confirmed
-- place is a position on the beacon, cleared automatically if that place is deleted, and
-- carried over here when the owner changes the beacon.

alter table public.beacons add column if not exists confirmed_position smallint;

create or replace function public.clear_confirmed_place() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.beacons set confirmed_position = null where id = old.beacon_id and confirmed_position = old.position;
  return old;
end;
$$;
drop trigger if exists beacon_places_clear_confirmed on public.beacon_places;
create trigger beacon_places_clear_confirmed after delete on public.beacon_places
  for each row execute function public.clear_confirmed_place();

create or replace function public.light_beacon(
  p_activities text[], p_note text, p_start timestamptz, p_end timestamptz, p_all boolean, p_circle_ids uuid[],
  p_replace uuid default null,
  p_places jsonb default '[]'::jsonb,
  p_place_names text[] default '{}'
)
returns json language plpgsql security definer set search_path = public
as $$
declare
  b uuid; n int; me_name text; tokens text[]; places_txt text := ''; nm text[]; body text;
  editing boolean := false; who uuid[]; old_places jsonb; confirmed jsonb;
begin
  if not public.is_member() then raise exception 'Join Beacon first'; end if;
  if p_end <= now() then raise exception 'That time has already passed'; end if;
  if p_start > now() + interval '8 days' then raise exception 'Beacons can go up to a week ahead'; end if;
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
$$;
grant execute on function public.light_beacon(text[], text, timestamptz, timestamptz, boolean, uuid[], uuid, jsonb, text[]) to authenticated;
