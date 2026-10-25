-- Fix: "operator does not exist: date = date[]" when answering (25 Oct).
create or replace function public.answer_poll(p_poll_id uuid, p_days date[])
returns void language plpgsql security definer set search_path = public
as $$
declare owner uuid; ttl text; poll_dates date[]; me_name text; tok text; first_time boolean; n int;
begin
  select answered_at is null into first_time from public.poll_invitees where poll_id = p_poll_id and user_id = auth.uid();
  if first_time is null then raise exception 'You weren''t asked to this one'; end if;
  select owner_id, title, dates into owner, ttl, poll_dates from public.polls where id = p_poll_id;

  delete from public.poll_answers where poll_id = p_poll_id and user_id = auth.uid();
  insert into public.poll_answers (poll_id, user_id, day)
  select p_poll_id, auth.uid(), d from unnest(coalesce(p_days, '{}'::date[])) d
  where d = any(poll_dates)
  on conflict do nothing;
  get diagnostics n = row_count;
  update public.poll_invitees set answered_at = now() where poll_id = p_poll_id and user_id = auth.uid();

  -- Tell the organiser once, on the first answer only.
  if first_time then
    select full_name into me_name from public.profiles where id = auth.uid();
    select expo_push_token into tok from public.profiles where id = owner;
    perform public.send_push(array[tok], 'Beacon',
      me_name || ' answered ' || ttl || case when n = 0 then ': none of the dates work.' when n = 1 then ': free on 1 date.' else ': free on ' || n || ' dates.' end,
      jsonb_build_object('type', 'poll', 'poll_id', p_poll_id));
  end if;
end;
$$;
