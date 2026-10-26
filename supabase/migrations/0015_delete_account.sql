-- Delete my account (Google Play requirement). Removes the sign-in, which cascades to the
-- profile and everything linked to it: friendships, requests, circles, beacons, places,
-- preferences, "I'm in"s, Find a date requests and answers. Nobody is notified.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth
as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  delete from auth.users where id = auth.uid();
end;
$$;
revoke execute on function public.delete_my_account() from anon, public;
grant execute on function public.delete_my_account() to authenticated;
