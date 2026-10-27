-- Feedback 27 Oct (decision 75, replaces part of 63): everyone a beacon went to sees who else it
-- went to, by first name, as well as who's in. Never anyone's number.
-- Backward compatible: adds 'to' alongside 'sent' and 'in', which older app versions keep using.

create or replace function public.beacon_summary(p_beacon_id uuid)
returns json language sql stable security definer set search_path = public
as $$
  select case when public.owns_beacon(p_beacon_id) or public.received_beacon(p_beacon_id) then
    json_build_object(
      'sent', (select count(*) from public.beacon_recipients where beacon_id = p_beacon_id),
      'to', coalesce((select json_agg(p.full_name order by p.full_name)
                      from public.beacon_recipients r join public.profiles p on p.id = r.user_id
                      where r.beacon_id = p_beacon_id and r.user_id <> auth.uid()), '[]'::json),
      'in', coalesce((select json_agg(p.full_name order by x.created_at)
                      from public.responses x join public.profiles p on p.id = x.user_id
                      where x.beacon_id = p_beacon_id), '[]'::json))
  end;
$$;
grant execute on function public.beacon_summary(uuid) to authenticated;
