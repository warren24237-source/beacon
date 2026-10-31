-- Reminder an hour before a beacon starts (decision 78).
-- Who: the owner and everyone who's in. Never people who haven't answered (principle 3, no nags).
-- Skipped when:
--   * nobody's in (nothing to remind anyone about);
--   * the beacon was lit, or moved, to start within the hour (everyone's just been buzzed);
--   * the beacon is out or over.
-- Changing the time (decision 76) moves the reminder with it: it fires once per start time.
-- Runs every 5 minutes on pg_cron, server only, so every installed version gets it with no update.
--
--   Owner:  "In an hour: your drinks at 7pm. Sam and Kat are in."
--   Friend: "In an hour: drinks with Warren at 7pm. Sam's in too."

create extension if not exists pg_cron;

-- The start time the reminder went out for. Null = not sent.
alter table public.beacons add column if not exists reminded_for timestamptz;

-- Moved (or lit) to start within the hour: mark as reminded so it doesn't follow the change buzz.
create or replace function public.beacon_reminder_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.start_time <= now() + interval '60 minutes'
     and (tg_op = 'INSERT' or new.start_time is distinct from old.start_time) then
    new.reminded_for := new.start_time;
  end if;
  return new;
end;
$$;
drop trigger if exists beacons_reminder_guard on public.beacons;
create trigger beacons_reminder_guard before insert or update of start_time on public.beacons
  for each row execute function public.beacon_reminder_guard();

-- "Sam" / "Sam and Kat" / "Sam, Kat and Dan"
create or replace function public.names_phrase(names text[])
returns text language sql immutable as $$
  select case
    when coalesce(cardinality(names), 0) = 0 then ''
    when cardinality(names) = 1 then names[1]
    else array_to_string(names[1:cardinality(names) - 1], ', ') || ' and ' || names[cardinality(names)]
  end;
$$;

create or replace function public.send_beacon_reminders()
returns void language plpgsql security definer set search_path = public as $$
declare
  b record; person record; what text; at_txt text; owner_name text; others text[]; body text;
begin
  for b in
    select * from public.beacons
    where is_active and end_time > now()
      and start_time > now() + interval '40 minutes'
      and start_time <= now() + interval '60 minutes'
      and reminded_for is distinct from start_time
      and exists (select 1 from public.responses r where r.beacon_id = beacons.id)
    for update skip locked
  loop
    -- Mark first, so a slow push can never send twice.
    update public.beacons set reminded_for = b.start_time where id = b.id;

    what := case when 'Anything' = any(b.activities) then 'meeting up' else public.activity_phrase(b.activities) end;
    at_txt := replace(lower(to_char(b.start_time at time zone 'Europe/London', 'FMHH12:MIam')), ':00', '');
    select full_name into owner_name from public.profiles where id = b.owner_id;

    for person in
      select p.id, p.expo_push_token from public.profiles p
      where p.expo_push_token is not null
        and (p.id = b.owner_id or exists (select 1 from public.responses r where r.beacon_id = b.id and r.user_id = p.id))
    loop
      others := array(
        select p.full_name from public.responses r join public.profiles p on p.id = r.user_id
        where r.beacon_id = b.id and r.user_id <> person.id order by r.created_at);

      if person.id = b.owner_id then
        body := 'In an hour: your ' || what || ' at ' || at_txt || '. ' || public.names_phrase(others) ||
          case when cardinality(others) = 1 then '''s in.' else ' are in.' end;
      else
        body := 'In an hour: ' || what || ' with ' || owner_name || ' at ' || at_txt || '.' ||
          case
            when cardinality(others) = 0 then ''
            when cardinality(others) = 1 then ' ' || others[1] || '''s in too.'
            else ' ' || public.names_phrase(others) || ' are in too.'
          end;
      end if;

      perform public.send_push(array[person.expo_push_token], 'Beacon', body,
        jsonb_build_object('type', 'reminder', 'beacon_id', b.id));
    end loop;
  end loop;
end;
$$;
revoke all on function public.send_beacon_reminders() from public, anon, authenticated;

-- Every 5 minutes. Re-running this migration replaces the job rather than adding a second.
select cron.unschedule(jobid) from cron.job where jobname = 'beacon-reminders';
select cron.schedule('beacon-reminders', '*/5 * * * *', 'select public.send_beacon_reminders()');
