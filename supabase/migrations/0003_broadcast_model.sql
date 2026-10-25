-- Broadcast model (decisions 23 to 25): friends, private circles, beacons sent to chosen audiences, "I'm in".
create extension if not exists pg_net with schema extensions;

drop table if exists public.matches;
drop table if exists public.beacons;

-- Friend codes for adding each other.
alter table public.profiles add column if not exists friend_code text unique;
update public.profiles set friend_code = upper(substr(md5(random()::text), 1, 6)) where friend_code is null;

create table public.friendships (
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create table public.circles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  created_at timestamptz not null default now()
);

create table public.circle_members (
  circle_id uuid not null references public.circles(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  primary key (circle_id, member_id)
);

create table public.beacons (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  activities text[] not null check (cardinality(activities) > 0),
  note text check (note is null or char_length(note) <= 80),
  start_time timestamptz not null,
  end_time timestamptz not null,
  audience_all boolean not null default true,
  audience_circle_ids uuid[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index beacons_owner_idx on public.beacons (owner_id, is_active, end_time);

create table public.beacon_recipients (
  beacon_id uuid not null references public.beacons(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (beacon_id, user_id)
);
create index beacon_recipients_user_idx on public.beacon_recipients (user_id);

create table public.responses (
  beacon_id uuid not null references public.beacons(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (beacon_id, user_id)
);

-- Helpers ------------------------------------------------------------------

create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.friendships where user_id = a and friend_id = b); $$;

create or replace function public.activity_phrase(acts text[])
returns text language sql immutable
as $$
  select case
    when 'Anything' = any(acts) then 'anything'
    when cardinality(acts) = 1 then lower(acts[1])
    else lower(array_to_string(acts[1:cardinality(acts)-1], ', ') || ' or ' || acts[cardinality(acts)])
  end;
$$;

create or replace function public.send_push(tokens text[], title text, body text, data jsonb)
returns void language plpgsql security definer set search_path = public, extensions
as $$
declare msgs jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('to', t, 'title', title, 'body', body, 'data', data, 'sound', 'default', 'channelId', 'matches', 'priority', 'high')), '[]'::jsonb)
    into msgs from unnest(tokens) t where t is not null;
  if jsonb_array_length(msgs) > 0 then
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := msgs,
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
    );
  end if;
end;
$$;
revoke all on function public.send_push(text[], text, text, jsonb) from public, anon, authenticated;

-- Join: invite code still gates joining for the friend test. Gives you a friend code.
drop function if exists public.join_group(text, text);
create function public.join_group(p_invite_code text, p_full_name text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from public.app_settings where key = 'invite_code' and value = p_invite_code) then
    raise exception 'Wrong invite code';
  end if;
  insert into public.profiles (id, full_name, friend_code)
  values (auth.uid(), p_full_name, upper(substr(md5(random()::text), 1, 6)))
  on conflict (id) do update set full_name = excluded.full_name;
end;
$$;
revoke all on function public.join_group(text, text) from public, anon;
grant execute on function public.join_group(text, text) to authenticated;

-- Add a friend by their code. Connects both ways.
create function public.add_friend(p_code text)
returns text language plpgsql security definer set search_path = public
as $$
declare other uuid; other_name text;
begin
  if not public.is_member() then raise exception 'Join Beacon first'; end if;
  select id, full_name into other, other_name from public.profiles where friend_code = upper(trim(p_code));
  if other is null then raise exception 'No one has that friend code'; end if;
  if other = auth.uid() then raise exception 'That is your own code'; end if;
  insert into public.friendships (user_id, friend_id) values (auth.uid(), other), (other, auth.uid()) on conflict do nothing;
  return other_name;
end;
$$;
grant execute on function public.add_friend(text) to authenticated;

-- Light a beacon: replaces any active one, works out recipients, notifies them.
create function public.light_beacon(p_activities text[], p_note text, p_start timestamptz, p_end timestamptz, p_all boolean, p_circle_ids uuid[])
returns json language plpgsql security definer set search_path = public
as $$
declare b uuid; n int; me_name text; tokens text[];
begin
  if not public.is_member() then raise exception 'Join Beacon first'; end if;
  if p_end <= now() then raise exception 'That time has already passed'; end if;
  update public.beacons set is_active = false where owner_id = auth.uid() and is_active;

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
    me_name || '''s free for ' || public.activity_phrase(p_activities) || ', ' ||
      lower(to_char(p_start at time zone 'Europe/London', 'FMHH12:MIam')) || ' to ' ||
      lower(to_char(p_end at time zone 'Europe/London', 'FMHH12:MIam')) ||
      coalesce('. "' || nullif(trim(p_note), '') || '"', ''),
    jsonb_build_object('type', 'beacon', 'beacon_id', b));

  return json_build_object('beacon_id', b, 'recipients', n);
end;
$$;
grant execute on function public.light_beacon(text[], text, timestamptz, timestamptz, boolean, uuid[]) to authenticated;

create function public.put_out_beacon()
returns void language sql security definer set search_path = public
as $$ update public.beacons set is_active = false where owner_id = auth.uid() and is_active; $$;
grant execute on function public.put_out_beacon() to authenticated;

-- "I'm in": records it and notifies the beacon owner.
create function public.im_in(p_beacon_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare owner uuid; acts text[]; me_name text; tok text;
begin
  if not exists (select 1 from public.beacon_recipients r join public.beacons bb on bb.id = r.beacon_id
                 where r.beacon_id = p_beacon_id and r.user_id = auth.uid() and bb.is_active and bb.end_time > now()) then
    raise exception 'That beacon has gone out';
  end if;
  insert into public.responses (beacon_id, user_id) values (p_beacon_id, auth.uid()) on conflict do nothing;
  if not found then return; end if;
  select owner_id, activities into owner, acts from public.beacons where id = p_beacon_id;
  select full_name into me_name from public.profiles where id = auth.uid();
  select expo_push_token into tok from public.profiles where id = owner;
  perform public.send_push(array[tok], 'Beacon', me_name || '''s in for ' || public.activity_phrase(acts) || '.',
    jsonb_build_object('type', 'response', 'beacon_id', p_beacon_id));
end;
$$;
grant execute on function public.im_in(uuid) to authenticated;

-- Row level security ----------------------------------------------------------
alter table public.friendships enable row level security;
alter table public.circles enable row level security;
alter table public.circle_members enable row level security;
alter table public.beacons enable row level security;
alter table public.beacon_recipients enable row level security;
alter table public.responses enable row level security;

drop policy if exists "Members see members" on public.profiles;
create policy "See self and friends" on public.profiles
  for select to authenticated using (id = auth.uid() or public.are_friends(auth.uid(), id));

create policy "Own friendships" on public.friendships
  for select to authenticated using (user_id = auth.uid());
create policy "Remove own friendships" on public.friendships
  for delete to authenticated using (user_id = auth.uid() or friend_id = auth.uid());

create policy "Own circles" on public.circles
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "Own circle members" on public.circle_members
  for all to authenticated
  using (exists (select 1 from public.circles c where c.id = circle_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.circles c where c.id = circle_id and c.owner_id = auth.uid())
              and public.are_friends(auth.uid(), member_id));

create policy "See own and received beacons" on public.beacons
  for select to authenticated using (
    owner_id = auth.uid()
    or exists (select 1 from public.beacon_recipients r where r.beacon_id = id and r.user_id = auth.uid()));

create policy "See own recipient rows" on public.beacon_recipients
  for select to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from public.beacons bb where bb.id = beacon_id and bb.owner_id = auth.uid()));

create policy "See responses to own beacons or own responses" on public.responses
  for select to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from public.beacons bb where bb.id = beacon_id and bb.owner_id = auth.uid()));
