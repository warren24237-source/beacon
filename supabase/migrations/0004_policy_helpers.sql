-- Avoid recursive policies between beacons and beacon_recipients/responses.
create or replace function public.owns_beacon(bid uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.beacons where id = bid and owner_id = auth.uid()); $$;

create or replace function public.received_beacon(bid uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.beacon_recipients where beacon_id = bid and user_id = auth.uid()); $$;

drop policy if exists "See own and received beacons" on public.beacons;
create policy "See own and received beacons" on public.beacons
  for select to authenticated using (owner_id = auth.uid() or public.received_beacon(id));

drop policy if exists "See own recipient rows" on public.beacon_recipients;
create policy "See own recipient rows" on public.beacon_recipients
  for select to authenticated using (user_id = auth.uid() or public.owns_beacon(beacon_id));

drop policy if exists "See responses to own beacons or own responses" on public.responses;
create policy "See responses to own beacons or own responses" on public.responses
  for select to authenticated using (user_id = auth.uid() or public.owns_beacon(beacon_id));
