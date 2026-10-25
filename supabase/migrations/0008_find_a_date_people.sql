-- Find a date: ask individual friends as well as circles (Warren, 25 Oct).
drop function if exists public.create_poll(text, date[], text, boolean, uuid[]);

create function public.create_poll(p_title text, p_dates date[], p_time_label text, p_all boolean, p_circle_ids uuid[], p_user_ids uuid[])
returns json language plpgsql security definer set search_path = public
as $$
declare pid uuid; n int; me_name text; tokens text[];
begin
  if not public.is_member() then raise exception 'Join Beacon first'; end if;
  if coalesce(cardinality(p_dates), 0) = 0 then raise exception 'Pick at least one date'; end if;

  insert into public.polls (owner_id, title, dates, time_label)
  values (auth.uid(), trim(p_title), (select array_agg(distinct d order by d) from unnest(p_dates) d), trim(p_time_label))
  returning id into pid;

  -- Only ever your friends: everyone, members of your chosen circles, or friends picked one by one.
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

  return json_build_object('poll_id', pid, 'invitees', n);
end;
$$;
grant execute on function public.create_poll(text, date[], text, boolean, uuid[], uuid[]) to authenticated;
