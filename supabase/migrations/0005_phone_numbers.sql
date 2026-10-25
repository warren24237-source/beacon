-- Required WhatsApp numbers (decision 28). Only the owner and their friends can read profiles (existing RLS).
alter table public.profiles add column if not exists phone_number text unique;

drop function if exists public.join_group(text, text);
create function public.join_group(p_invite_code text, p_full_name text, p_phone_number text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from public.app_settings where key = 'invite_code' and value = p_invite_code) then
    raise exception 'Wrong invite code';
  end if;
  if p_phone_number !~ '^[0-9]{10,15}$' then raise exception 'That WhatsApp number does not look right'; end if;
  if exists (select 1 from public.profiles where phone_number = p_phone_number and id <> auth.uid()) then
    raise exception 'That number is already on Beacon';
  end if;
  insert into public.profiles (id, full_name, phone_number, friend_code)
  values (auth.uid(), p_full_name, p_phone_number, upper(substr(md5(random()::text), 1, 6)))
  on conflict (id) do update set full_name = excluded.full_name, phone_number = excluded.phone_number;
end;
$$;
revoke all on function public.join_group(text, text, text) from public, anon;
grant execute on function public.join_group(text, text, text) to authenticated;

create function public.set_phone_number(p_phone_number text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_member() then raise exception 'Join Beacon first'; end if;
  if p_phone_number !~ '^[0-9]{10,15}$' then raise exception 'That WhatsApp number does not look right'; end if;
  if exists (select 1 from public.profiles where phone_number = p_phone_number and id <> auth.uid()) then
    raise exception 'That number is already on Beacon';
  end if;
  update public.profiles set phone_number = p_phone_number where id = auth.uid();
end;
$$;
grant execute on function public.set_phone_number(text) to authenticated;
