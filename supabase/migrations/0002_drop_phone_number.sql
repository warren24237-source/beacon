-- No phone numbers. WhatsApp opens with the message and the user picks the friend.
drop function if exists public.join_group(text, text, text);
alter table public.profiles drop column if exists phone_number;

create function public.join_group(p_invite_code text, p_full_name text)
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
  insert into public.profiles (id, full_name)
  values (auth.uid(), p_full_name)
  on conflict (id) do update set full_name = excluded.full_name;
end;
$$;

revoke all on function public.join_group(text, text) from public, anon;
grant execute on function public.join_group(text, text) to authenticated;
