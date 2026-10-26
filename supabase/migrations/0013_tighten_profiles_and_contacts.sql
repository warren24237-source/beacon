-- Security tightening (26 Oct 2026), from Claude's review of the live rules.

-- 1. Contact matching no longer gives away names. It says who is on Beacon (so the app can
--    show Add instead of Invite) but only returns a name for people you're already linked to.
--    The app shows names from your own contacts, so it never needed them.
create or replace function public.find_contacts_on_beacon(p_numbers text[])
returns table (id uuid, full_name text, phone_number text, status text)
language sql stable security definer set search_path = public
as $$
  select p.id,
    case when public.are_friends(auth.uid(), p.id)
           or exists (select 1 from public.friend_requests r where r.from_id = p.id and r.to_id = auth.uid())
         then p.full_name end,
    p.phone_number,
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
  order by p.id;
$$;
revoke execute on function public.find_contacts_on_beacon(text[]) from anon, public;
grant execute on function public.find_contacts_on_beacon(text[]) to authenticated;

-- 2. People can only edit their own name, picture and notification address directly.
--    Phone number and friend code change only through the checked functions
--    (set_phone_number, join_group), so nobody can take over someone else's number.
revoke update on public.profiles from authenticated, anon;
grant update (full_name, avatar_url, expo_push_token) on public.profiles to authenticated;

-- 3. Not tied to WhatsApp any more (decision 52): fix the wording.
create or replace function public.set_phone_number(p_phone_number text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_member() then raise exception 'Join Beacon first'; end if;
  if p_phone_number !~ '^[0-9]{10,15}$' then raise exception 'That mobile number does not look right'; end if;
  if exists (select 1 from public.profiles where phone_number = p_phone_number and id <> auth.uid()) then
    raise exception 'That number is already on Beacon';
  end if;
  update public.profiles set phone_number = p_phone_number where id = auth.uid();
end;
$$;
