-- Friend requests (decision 30). Codes still connect instantly (sharing your code is consent);
-- adding by number or from contacts sends a request the other person accepts.
create table public.friend_requests (
  from_id uuid not null references public.profiles(id) on delete cascade,
  to_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_id, to_id),
  check (from_id <> to_id)
);
alter table public.friend_requests enable row level security;
create policy "See own requests" on public.friend_requests
  for select to authenticated using (from_id = auth.uid() or to_id = auth.uid());

-- Internal: request or, if they already asked you, connect.
create or replace function public._request_friend(p_to uuid)
returns text language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid(); me_name text; tok text;
begin
  if not public.is_member() then raise exception 'Join Beacon first'; end if;
  if p_to = me then raise exception 'That is you'; end if;
  if public.are_friends(me, p_to) then return 'friends'; end if;
  if exists (select 1 from public.friend_requests where from_id = p_to and to_id = me) then
    insert into public.friendships (user_id, friend_id) values (me, p_to), (p_to, me) on conflict do nothing;
    delete from public.friend_requests where (from_id = p_to and to_id = me) or (from_id = me and to_id = p_to);
    return 'friends';
  end if;
  insert into public.friend_requests (from_id, to_id) values (me, p_to) on conflict do nothing;
  if found then
    select full_name into me_name from public.profiles where id = me;
    select expo_push_token into tok from public.profiles where id = p_to;
    perform public.send_push(array[tok], 'Beacon', me_name || ' wants to add you on Beacon.', jsonb_build_object('type', 'friend_request'));
  end if;
  return 'requested';
end;
$$;
revoke all on function public._request_friend(uuid) from public, anon, authenticated;

create function public.request_friend(p_user_id uuid)
returns text language sql security definer set search_path = public
as $$ select public._request_friend(p_user_id); $$;
grant execute on function public.request_friend(uuid) to authenticated;

create function public.request_friend_by_phone(p_phone_number text)
returns text language plpgsql security definer set search_path = public
as $$
declare other uuid;
begin
  select id into other from public.profiles where phone_number = p_phone_number;
  if other is null then raise exception 'Nobody with that number is on Beacon yet'; end if;
  return public._request_friend(other);
end;
$$;
grant execute on function public.request_friend_by_phone(text) to authenticated;

create function public.respond_friend_request(p_from uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid(); me_name text; tok text;
begin
  if not exists (select 1 from public.friend_requests where from_id = p_from and to_id = me) then return; end if;
  delete from public.friend_requests where from_id = p_from and to_id = me;
  if p_accept then
    insert into public.friendships (user_id, friend_id) values (me, p_from), (p_from, me) on conflict do nothing;
    select full_name into me_name from public.profiles where id = me;
    select expo_push_token into tok from public.profiles where id = p_from;
    perform public.send_push(array[tok], 'Beacon', me_name || ' accepted your friend request.', jsonb_build_object('type', 'friend_accept'));
  end if;
end;
$$;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;

-- Contacts matching: numbers are compared, never stored.
create function public.find_contacts_on_beacon(p_numbers text[])
returns table (id uuid, full_name text, phone_number text, status text)
language sql stable security definer set search_path = public
as $$
  select p.id, p.full_name, p.phone_number,
    case
      when public.are_friends(auth.uid(), p.id) then 'friends'
      when exists (select 1 from public.friend_requests r where r.from_id = auth.uid() and r.to_id = p.id) then 'requested'
      when exists (select 1 from public.friend_requests r where r.from_id = p.id and r.to_id = auth.uid()) then 'incoming'
      else 'none'
    end
  from public.profiles p
  where public.is_member()
    and p.id <> auth.uid()
    and p.phone_number = any(p_numbers[1:3000])
  order by p.full_name;
$$;
grant execute on function public.find_contacts_on_beacon(text[]) to authenticated;

-- Names of people who sent you requests (profiles are otherwise friends-only).
create function public.incoming_friend_requests()
returns table (from_id uuid, full_name text, created_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select r.from_id, p.full_name, r.created_at from public.friend_requests r
  join public.profiles p on p.id = r.from_id where r.to_id = auth.uid() order by r.created_at desc;
$$;
grant execute on function public.incoming_friend_requests() to authenticated;
