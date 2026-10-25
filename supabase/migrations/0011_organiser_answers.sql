-- Find a date: the organiser is a participant too (Warren, 25 Oct). They answer like everyone else,
-- count in the totals, and are never notified about their own answer.

create or replace function public.create_poll(p_title text, p_dates date[], p_time_label text, p_all boolean, p_circle_ids uuid[], p_user_ids uuid[],
                                              p_start_minute int default null, p_end_minute int default null)
returns json language plpgsql security definer set search_path = public
as $$
declare pid uuid; n int; me_name text; tokens text[];
begin
  if not public.is_member() then raise exception 'Join Beacon first'; end if;
  if coalesce(cardinality(p_dates), 0) = 0 then raise exception 'Pick at least one date'; end if;

  insert into public.polls (owner_id, title, dates, time_label, start_minute, end_minute)
  values (auth.uid(), trim(p_title), (select array_agg(distinct d order by d) from unnest(p_dates) d), trim(p_time_label), p_start_minute, p_end_minute)
  returning id into pid;

  insert into public.poll_invitees (poll_id, user_id)
  select distinct pid, f.friend_id from public.friendships f
  where f.user_id = auth.uid()
    and (p_all
      or f.friend_id = any(coalesce(p_user_ids, '{}'))
      or exists (
        select 1 from public.circle_members cm join public.circles c on c.id = cm.circle_id
        where c.owner_id = auth.uid() and cm.member_id = f.friend_id and c.id = any(coalesce(p_circle_ids, '{}'))));
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Nobody to ask. Pick some friends or a circle with people in it.'; end if;

  select full_name into me_name from public.profiles where id = auth.uid();
  select array_agg(p.expo_push_token) into tokens
    from public.poll_invitees i join public.profiles p on p.id = i.user_id where i.poll_id = pid;
  perform public.send_push(tokens, 'Beacon',
    me_name || ' wants to find a date for ' || trim(p_title) || '. Tap when you''re free.',
    jsonb_build_object('type', 'poll', 'poll_id', pid));

  -- The organiser joins in after the notifications have gone.
  insert into public.poll_invitees (poll_id, user_id) values (pid, auth.uid()) on conflict do nothing;

  return json_build_object('poll_id', pid, 'invitees', n);
end;
$$;

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

  -- Tell the organiser once, on someone else's first answer only.
  if first_time and owner <> auth.uid() then
    select full_name into me_name from public.profiles where id = auth.uid();
    select expo_push_token into tok from public.profiles where id = owner;
    perform public.send_push(array[tok], 'Beacon',
      me_name || ' answered ' || ttl || case when n = 0 then ': none of the dates work.' when n = 1 then ': free on 1 date.' else ': free on ' || n || ' dates.' end,
      jsonb_build_object('type', 'poll', 'poll_id', p_poll_id));
  end if;
end;
$$;

-- Organisers of existing polls join in too.
insert into public.poll_invitees (poll_id, user_id) select id, owner_id from public.polls on conflict do nothing;
