-- Beacon: initial schema. Paste into Supabase > SQL Editor and run once.

-- Settings only the database can read (e.g. the group invite code).
create table public.app_settings (
  key text primary key,
  value text not null
);
alter table public.app_settings enable row level security;
-- No policies: the app can't read this table directly.

insert into public.app_settings (key, value) values ('invite_code', 'CHANGE-ME');

-- Group members. A row here means "has joined with the invite code".
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null,
  phone_number text unique not null, -- international, digits only, for wa.me links
  avatar_url text,
  expo_push_token text,
  created_at timestamptz not null default now()
);

-- Free windows ("Drinks, 4pm to 7pm").
create table public.beacons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  activity_type text not null, -- 'Coffee', 'Drinks', 'Food'
  start_time timestamptz not null,
  end_time timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index beacons_active_idx on public.beacons (is_active, end_time);

-- Mutual overlaps between two members.
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  user_a_id uuid not null references public.profiles(id) on delete cascade,
  user_b_id uuid not null references public.profiles(id) on delete cascade,
  overlap_start timestamptz not null,
  overlap_end timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'completed')),
  created_at timestamptz not null default now(),
  check (user_a_id <> user_b_id)
);

-- Is the signed-in user a group member?
create function public.is_member()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

-- Join the group with the shared invite code.
create function public.join_group(p_invite_code text, p_full_name text, p_phone_number text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if not exists (select 1 from public.app_settings where key = 'invite_code' and value = p_invite_code) then
    raise exception 'Wrong invite code';
  end if;
  insert into public.profiles (id, full_name, phone_number)
  values (auth.uid(), p_full_name, p_phone_number)
  on conflict (id) do update
    set full_name = excluded.full_name, phone_number = excluded.phone_number;
end;
$$;

revoke all on function public.join_group(text, text, text) from public, anon;
grant execute on function public.join_group(text, text, text) to authenticated;

-- Row level security: members only.
alter table public.profiles enable row level security;
alter table public.beacons enable row level security;
alter table public.matches enable row level security;

create policy "Members see members" on public.profiles
  for select to authenticated using (public.is_member() or id = auth.uid());
create policy "Update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Beacons are private: you only ever see your own. Matching runs in the database.
create policy "Own beacons" on public.beacons
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_member());

create policy "See own matches" on public.matches
  for select to authenticated using (auth.uid() in (user_a_id, user_b_id));
