-- Places on a beacon (decision 58). Up to 3 per beacon: a real Google place (we keep only
-- Google's place ID, per Google's terms; names and addresses are fetched fresh) or text as typed.
-- The owner can star one. Friends who are in can pick one favourite, or "any".

create table public.beacon_places (
  beacon_id uuid not null references public.beacons(id) on delete cascade,
  position smallint not null check (position between 1 and 3),
  place_id text check (place_id is null or char_length(place_id) <= 300),
  label text check (label is null or char_length(label) between 1 and 40),
  starred boolean not null default false,
  primary key (beacon_id, position),
  check ((place_id is null) <> (label is null))  -- exactly one: a Google place or typed text
);

create table public.place_prefs (
  beacon_id uuid not null references public.beacons(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  position smallint check (position between 1 and 3),  -- null = "Any is fine"
  updated_at timestamptz not null default now(),
  primary key (beacon_id, user_id)
);

alter table public.beacon_places enable row level security;
alter table public.place_prefs enable row level security;

-- Places: visible to the owner and to anyone the beacon was sent to.
create policy "See places on own and received beacons" on public.beacon_places
  for select to authenticated using (public.owns_beacon(beacon_id) or public.received_beacon(beacon_id));

-- Preferences: only the owner of the beacon and the person who chose see them (like who's in).
create policy "See own preference or preferences on own beacons" on public.place_prefs
  for select to authenticated using (user_id = auth.uid() or public.owns_beacon(beacon_id));

-- Lighting a beacon now takes places. p_place_names are the names the app just showed,
-- used only in the notification text and never stored.
drop function if exists public.light_beacon(text[], text, timestamptz, timestamptz, boolean, uuid[], uuid);
create function public.light_beacon(
  p_activities text[], p_note text, p_start timestamptz, p_end timestamptz, p_all boolean, p_circle_ids uuid[],
  p_replace uuid default null,
  p_places jsonb default '[]'::jsonb,       -- [{ "place_id": "...", "starred": true } | { "label": "Dan's", "starred": false }]
  p_place_names text[] default '{}'
)
returns json language plpgsql security definer set search_path = public
as $$
declare b uuid; n int; me_name text; tokens text[]; places_txt text := ''; nm text[];
begin
  if not public.is_member() then raise exception 'Join Beacon first'; end if;
  if p_end <= now() then raise exception 'That time has already passed'; end if;
  if p_start > now() + interval '8 days' then raise exception 'Beacons can go up to a week ahead'; end if;
  if jsonb_array_length(coalesce(p_places, '[]'::jsonb)) > 3 then raise exception 'Up to 3 places'; end if;
  if p_replace is not null then
    update public.beacons set is_active = false where id = p_replace and owner_id = auth.uid();
  end if;

  insert into public.beacons (owner_id, activities, note, start_time, end_time, audience_all, audience_circle_ids)
  values (auth.uid(), p_activities, nullif(trim(p_note), ''), p_start, p_end, p_all, coalesce(p_circle_ids, '{}'))
  returning id into b;

  insert into public.beacon_places (beacon_id, position, place_id, label, starred)
  select b, (e.ord)::smallint, nullif(e.val->>'place_id', ''), nullif(trim(e.val->>'label'), ''), coalesce((e.val->>'starred')::boolean, false)
  from jsonb_array_elements(coalesce(p_places, '[]'::jsonb)) with ordinality as e(val, ord);

  insert into public.beacon_recipients (beacon_id, user_id)
  select distinct b, f.friend_id from public.friendships f
  where f.user_id = auth.uid()
    and (p_all or exists (
      select 1 from public.circle_members cm join public.circles c on c.id = cm.circle_id
      where c.owner_id = auth.uid() and cm.member_id = f.friend_id and c.id = any(p_circle_ids)));
  get diagnostics n = row_count;

  -- "The Malt Cross" / "The Malt Cross or Dan's" / "A, B or C"
  nm := array(select left(trim(x), 40) from unnest(coalesce(p_place_names, '{}')) x where trim(x) <> '' limit 3);
  if array_length(nm, 1) = 1 then places_txt := '. ' || nm[1];
  elsif array_length(nm, 1) > 1 then
    places_txt := '. ' || array_to_string(nm[1:array_length(nm, 1) - 1], ', ') || ' or ' || nm[array_length(nm, 1)];
  end if;

  select full_name into me_name from public.profiles where id = auth.uid();
  select array_agg(p.expo_push_token) into tokens
    from public.beacon_recipients r join public.profiles p on p.id = r.user_id where r.beacon_id = b;
  perform public.send_push(tokens, 'Beacon',
    me_name || '''s up for ' || public.activity_phrase(p_activities) || ', ' || public.when_phrase(p_start, p_end) ||
      places_txt || coalesce('. "' || nullif(trim(p_note), '') || '"', ''),
    jsonb_build_object('type', 'beacon', 'beacon_id', b));

  return json_build_object('beacon_id', b, 'recipients', n);
end;
$$;
grant execute on function public.light_beacon(text[], text, timestamptz, timestamptz, boolean, uuid[], uuid, jsonb, text[]) to authenticated;

-- A friend who's in picks a favourite place (1 to 3) or "any" (null). Only for beacons you're in on.
create function public.set_place_pref(p_beacon_id uuid, p_position smallint)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.responses where beacon_id = p_beacon_id and user_id = auth.uid()) then
    raise exception 'Say you''re in first';
  end if;
  if p_position is not null and not exists (select 1 from public.beacon_places where beacon_id = p_beacon_id and position = p_position) then
    raise exception 'That place is not on this beacon';
  end if;
  insert into public.place_prefs (beacon_id, user_id, position) values (p_beacon_id, auth.uid(), p_position)
  on conflict (beacon_id, user_id) do update set position = excluded.position, updated_at = now();
end;
$$;
revoke execute on function public.set_place_pref(uuid, smallint) from anon, public;
grant execute on function public.set_place_pref(uuid, smallint) to authenticated;

-- Our own daily cap on Google calls, used by the places server function (service role only).
create table public.places_usage (day date primary key, calls int not null default 0);
alter table public.places_usage enable row level security;  -- no policies: invisible to the app

create function public.places_take(p_calls int, p_daily_cap int)
returns boolean language plpgsql security definer set search_path = public
as $$
declare used int;
begin
  insert into public.places_usage as u (day, calls) values ((now() at time zone 'Europe/London')::date, p_calls)
  on conflict (day) do update set calls = u.calls + p_calls
  returning calls into used;
  return used <= p_daily_cap;
end;
$$;
revoke execute on function public.places_take(int, int) from anon, authenticated, public;
