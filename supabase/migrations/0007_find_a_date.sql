-- Find a date (decision 36): ask friends or circles which of a set of dates they're free.
-- One time window per poll, stored as a label. Answers are "free on these days".

create table public.polls (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 40),
  dates date[] not null check (cardinality(dates) between 1 and 60),
  time_label text not null check (char_length(time_label) between 1 and 40),
  created_at timestamptz not null default now()
);
create index polls_owner_idx on public.polls (owner_id, created_at desc);

create table public.poll_invitees (
  poll_id uuid not null references public.polls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  answered_at timestamptz,
  primary key (poll_id, user_id)
);
create index poll_invitees_user_idx on public.poll_invitees (user_id);

create table public.poll_answers (
  poll_id uuid not null references public.polls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  primary key (poll_id, user_id, day)
);

-- Helpers (security definer so policies don't recurse).
create or replace function public.in_poll(pid uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.polls where id = pid and owner_id = auth.uid())
      or exists (select 1 from public.poll_invitees where poll_id = pid and user_id = auth.uid());
$$;

alter table public.polls enable row level security;
alter table public.poll_invitees enable row level security;
alter table public.poll_answers enable row level security;

create policy "See polls you own or were asked to" on public.polls
  for select to authenticated using (public.in_poll(id));
create policy "See who was asked in your polls" on public.poll_invitees
  for select to authenticated using (public.in_poll(poll_id));
create policy "See answers in your polls" on public.poll_answers
  for select to authenticated using (public.in_poll(poll_id));

-- Create a poll: works out invitees like a beacon, notifies them.
create function public.create_poll(p_title text, p_dates date[], p_time_label text, p_all boolean, p_circle_ids uuid[])
returns json language plpgsql security definer set search_path = public
as $$
declare pid uuid; n int; me_name text; tokens text[];
begin
  if not public.is_member() then raise exception 'Join Beacon first'; end if;
  if coalesce(cardinality(p_dates), 0) = 0 then raise exception 'Pick at least one date'; end if;

  insert into public.polls (owner_id, title, dates, time_label)
  values (auth.uid(), trim(p_title), (select array_agg(distinct d order by d) from unnest(p_dates) d), trim(p_time_label))
  returning id into pid;

  insert into public.poll_invitees (poll_id, user_id)
  select distinct pid, f.friend_id from public.friendships f
  where f.user_id = auth.uid()
    and (p_all or exists (
      select 1 from public.circle_members cm join public.circles c on c.id = cm.circle_id
      where c.owner_id = auth.uid() and cm.member_id = f.friend_id and c.id = any(p_circle_ids)));
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Nobody to ask. Add friends or pick a circle with people in it.'; end if;

  select full_name into me_name from public.profiles where id = auth.uid();
  select array_agg(p.expo_push_token) into tokens
    from public.poll_invitees i join public.profiles p on p.id = i.user_id where i.poll_id = pid;
  perform public.send_push(tokens, 'Beacon',
    me_name || ' wants to find a date for ' || trim(p_title) || '. Tap when you''re free.',
    jsonb_build_object('type', 'poll', 'poll_id', pid));

  return json_build_object('poll_id', pid, 'invitees', n);
end;
$$;
grant execute on function public.create_poll(text, date[], text, boolean, uuid[]) to authenticated;

-- Answer (or change your answer): the days you're free. An empty list means none work.
create function public.answer_poll(p_poll_id uuid, p_days date[])
returns void language plpgsql security definer set search_path = public
as $$
declare owner uuid; ttl text; me_name text; tok text; first_time boolean; n int;
begin
  select answered_at is null into first_time from public.poll_invitees where poll_id = p_poll_id and user_id = auth.uid();
  if first_time is null then raise exception 'You weren''t asked to this one'; end if;

  delete from public.poll_answers where poll_id = p_poll_id and user_id = auth.uid();
  insert into public.poll_answers (poll_id, user_id, day)
  select p_poll_id, auth.uid(), d from unnest(coalesce(p_days, '{}')) d
  where d = any((select dates from public.polls where id = p_poll_id))
  on conflict do nothing;
  get diagnostics n = row_count;
  update public.poll_invitees set answered_at = now() where poll_id = p_poll_id and user_id = auth.uid();

  -- Tell the organiser once, on the first answer only.
  if first_time then
    select owner_id, title into owner, ttl from public.polls where id = p_poll_id;
    select full_name into me_name from public.profiles where id = auth.uid();
    select expo_push_token into tok from public.profiles where id = owner;
    perform public.send_push(array[tok], 'Beacon',
      me_name || ' answered ' || ttl || case when n = 0 then ': none of the dates work.' when n = 1 then ': free on 1 date.' else ': free on ' || n || ' dates.' end,
      jsonb_build_object('type', 'poll', 'poll_id', p_poll_id));
  end if;
end;
$$;
grant execute on function public.answer_poll(uuid, date[]) to authenticated;

-- Organiser can delete their own poll.
create policy "Delete your own polls" on public.polls
  for delete to authenticated using (owner_id = auth.uid());
