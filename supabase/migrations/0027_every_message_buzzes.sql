-- Every chat message buzzes, and any chat can be muted (decision 88, Warren 1 Nov).
-- Replaces 80's "one buzz until you open it". Muted chats never buzz; the new-message count still shows.
-- Mute is per person per thread, set from the bell at the top right of the chat.

alter table public.chat_reads add column if not exists muted boolean not null default false;

create or replace function public.set_chat_muted(p_beacon_id uuid, p_poll_id uuid, p_muted boolean)
returns void language plpgsql security definer set search_path = public as $$
declare thread uuid := coalesce(p_beacon_id, p_poll_id);
begin
  if not public.in_chat(p_beacon_id, p_poll_id) then raise exception 'Only people in on this plan can chat'; end if;
  insert into public.chat_reads (user_id, thread_id, muted) values (auth.uid(), thread, coalesce(p_muted, false))
    on conflict (user_id, thread_id) do update set muted = excluded.muted;
end;
$$;
revoke all on function public.set_chat_muted(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_chat_muted(uuid, uuid, boolean) to authenticated;

create or replace function public.send_message(p_beacon_id uuid, p_poll_id uuid, p_body text)
returns json language plpgsql security definer set search_path = public as $$
declare
  txt text := trim(coalesce(p_body, '')); mid bigint; thread uuid := coalesce(p_beacon_id, p_poll_id);
  me_name text; title text; m record;
begin
  if (p_beacon_id is null) = (p_poll_id is null) then raise exception 'Pick one plan'; end if;
  if txt = '' then raise exception 'Say something first'; end if;
  if char_length(txt) > 300 then raise exception 'Keep it under 300 characters'; end if;
  if not public.in_chat(p_beacon_id, p_poll_id) then raise exception 'Only people in on this plan can chat'; end if;
  if not public.chat_open(p_beacon_id, p_poll_id) then raise exception 'This plan has ended'; end if;

  insert into public.messages (beacon_id, poll_id, user_id, body) values (p_beacon_id, p_poll_id, auth.uid(), txt)
    returning id into mid;
  insert into public.chat_reads (user_id, thread_id, last_read_id) values (auth.uid(), thread, mid)
    on conflict (user_id, thread_id) do update set last_read_id = excluded.last_read_id, buzzed = false;

  select full_name into me_name from public.profiles where id = auth.uid();
  if p_beacon_id is not null then
    select initcap(public.activity_phrase(b.activities)) || ', ' || public.when_phrase(b.start_time, b.end_time)
      into title from public.beacons b where b.id = p_beacon_id;
  else
    select p.title into title from public.polls p where p.id = p_poll_id;
  end if;

  for m in
    select u as id, p.expo_push_token from public.chat_members(p_beacon_id, p_poll_id) u
    join public.profiles p on p.id = u
    left join public.chat_reads r on r.user_id = u and r.thread_id = thread
    where u <> auth.uid() and not coalesce(r.muted, false) and not public.blocked_between(u, auth.uid())
  loop
    perform public.send_push(array[m.expo_push_token], title, me_name || ': ' || left(txt, 120),
      jsonb_build_object('type', 'chat', 'beacon_id', p_beacon_id, 'poll_id', p_poll_id));
  end loop;
  return json_build_object('id', mid);
end;
$$;
revoke all on function public.send_message(uuid, uuid, text) from public, anon;
grant execute on function public.send_message(uuid, uuid, text) to authenticated;
