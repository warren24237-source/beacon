-- "Can't make it now" (decision 67, Charlotte's feedback 26 Oct): take back an "I'm in".
-- Removes your response, your place favourite and any place you suggested, and buzzes the owner once.
-- On a locked beacon you then stop seeing it, like everyone else who isn't in (decision 61).
create or replace function public.im_out(p_beacon_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare owner uuid; acts text[]; me_name text; tok text;
begin
  delete from public.responses where beacon_id = p_beacon_id and user_id = auth.uid();
  if not found then return; end if;
  delete from public.place_prefs where beacon_id = p_beacon_id and user_id = auth.uid();
  delete from public.beacon_places where beacon_id = p_beacon_id and suggested_by = auth.uid();

  select owner_id, activities into owner, acts from public.beacons where id = p_beacon_id and is_active and end_time > now();
  if owner is null then return; end if;
  select full_name into me_name from public.profiles where id = auth.uid();
  select expo_push_token into tok from public.profiles where id = owner;
  perform public.send_push(array[tok], 'Beacon',
    me_name || ' can''t make ' || public.activity_phrase(acts) || ' now.',
    jsonb_build_object('type', 'out', 'beacon_id', p_beacon_id));
end;
$$;
revoke execute on function public.im_out(uuid) from anon, public;
grant execute on function public.im_out(uuid) to authenticated;
