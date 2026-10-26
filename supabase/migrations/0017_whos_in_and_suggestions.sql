-- Charlotte's feedback, 26 Oct (open questions 21 and 22, decision 63).
-- 1. Friends see how many a beacon went to and who's in, by first name. Never who it went to,
--    who hasn't answered, or anyone's number (principles 3 and 4, decision 28).
-- 2. A friend who's in can suggest one place of their own. It joins the owner's places
--    (tagged with their name) so everyone can pick it as a favourite. No replies, no thread.

-- 1. Who's in -------------------------------------------------------------------------

create or replace function public.beacon_summary(p_beacon_id uuid)
returns json language sql stable security definer set search_path = public
as $$
  select case when public.owns_beacon(p_beacon_id) or public.received_beacon(p_beacon_id) then
    json_build_object(
      'sent', (select count(*) from public.beacon_recipients where beacon_id = p_beacon_id),
      'in', coalesce((select json_agg(p.full_name order by x.created_at)
                      from public.responses x join public.profiles p on p.id = x.user_id
                      where x.beacon_id = p_beacon_id), '[]'::json))
  end;
$$;
grant execute on function public.beacon_summary(uuid) to authenticated;

-- 2. Suggested places -------------------------------------------------------------------

-- Owner's places stay at 1 to 3; suggestions take 4 to 12, one per person.
alter table public.beacon_places drop constraint if exists beacon_places_position_check;
alter table public.beacon_places add constraint beacon_places_position_check check (position between 1 and 12);
alter table public.beacon_places add column if not exists suggested_by uuid references public.profiles(id) on delete cascade;
create unique index if not exists beacon_places_one_suggestion_each on public.beacon_places (beacon_id, suggested_by) where suggested_by is not null;

alter table public.place_prefs drop constraint if exists place_prefs_position_check;
alter table public.place_prefs add constraint place_prefs_position_check check (position between 1 and 12);

-- Suggest (or replace your) place. p_name is only for the owner's notification, never stored.
create or replace function public.suggest_place(p_beacon_id uuid, p_place_id text, p_label text, p_name text)
returns void language plpgsql security definer set search_path = public
as $$
declare pos smallint; owner uuid; acts text[]; me_name text; tok text; is_new boolean;
begin
  if not exists (select 1 from public.responses where beacon_id = p_beacon_id and user_id = auth.uid()) then
    raise exception 'Say you''re in first';
  end if;
  if not exists (select 1 from public.beacons where id = p_beacon_id and is_active and end_time > now()) then
    raise exception 'That beacon has gone out';
  end if;
  if (nullif(trim(p_place_id), '') is null) = (nullif(trim(p_label), '') is null) then
    raise exception 'Pick a place or type one';
  end if;

  select position into pos from public.beacon_places where beacon_id = p_beacon_id and suggested_by = auth.uid();
  is_new := pos is null;
  if is_new then
    select min(g)::smallint into pos from generate_series(4, 12) g
      where not exists (select 1 from public.beacon_places where beacon_id = p_beacon_id and position = g);
    if pos is null then raise exception 'That beacon has enough places'; end if;
    insert into public.beacon_places (beacon_id, position, place_id, label, starred, suggested_by)
    values (p_beacon_id, pos, nullif(trim(p_place_id), ''), left(nullif(trim(p_label), ''), 40), false, auth.uid());
  else
    update public.beacon_places set place_id = nullif(trim(p_place_id), ''), label = left(nullif(trim(p_label), ''), 40)
    where beacon_id = p_beacon_id and position = pos;
  end if;

  -- You suggested it, so it's your favourite.
  insert into public.place_prefs (beacon_id, user_id, position) values (p_beacon_id, auth.uid(), pos)
  on conflict (beacon_id, user_id) do update set position = excluded.position, updated_at = now();

  -- One buzz to the owner, the first time only.
  if is_new then
    select owner_id, activities into owner, acts from public.beacons where id = p_beacon_id;
    select full_name into me_name from public.profiles where id = auth.uid();
    select expo_push_token into tok from public.profiles where id = owner;
    perform public.send_push(array[tok], 'Beacon',
      me_name || ' suggested ' || coalesce(nullif(left(trim(p_name), 40), ''), left(trim(p_label), 40), 'somewhere') ||
        ' for ' || public.activity_phrase(acts) || '.',
      jsonb_build_object('type', 'suggestion', 'beacon_id', p_beacon_id));
  end if;
end;
$$;
revoke execute on function public.suggest_place(uuid, text, text, text) from anon, public;
grant execute on function public.suggest_place(uuid, text, text, text) to authenticated;

-- Take back your suggestion (and your favourite, if it was that place).
create or replace function public.remove_suggestion(p_beacon_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare pos smallint;
begin
  delete from public.beacon_places where beacon_id = p_beacon_id and suggested_by = auth.uid() returning position into pos;
  if pos is not null then
    update public.place_prefs set position = null, updated_at = now() where beacon_id = p_beacon_id and position = pos;
  end if;
end;
$$;
grant execute on function public.remove_suggestion(uuid) to authenticated;

-- Favourites can now point at suggestions too.
create or replace function public.set_place_pref(p_beacon_id uuid, p_position smallint)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.responses where beacon_id = p_beacon_id and user_id = auth.uid()) then
    raise exception 'Say you''re in first';
  end if;
  if p_position is not null and not exists (select 1 from public.beacon_places where beacon_id = p_beacon_id and position = p_position) then
    raise exception 'That place is not on this beacon';
  end if;
  insert into public.place_prefs (beacon_id, user_id, position) values (p_beacon_id, auth.uid(), p_position)
  on conflict (beacon_id, user_id) do update set position = excluded.position, updated_at = now();
end;
$$;
