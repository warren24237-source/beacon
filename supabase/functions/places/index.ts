// Places server function (decision 58). The only thing that talks to Google:
// - keeps the Google key secret (GOOGLE_PLACES_KEY, a Supabase secret, never in the app)
// - only answers signed-in Beacon users (Supabase checks the JWT before this runs)
// - enforces our own daily cap on Google calls (places_take), whatever Google's settings are
//
// POST { action: "search", input, session }  -> { places: [{ id, name, area }] }
// POST { action: "details", ids, session? }   -> { places: { [id]: { id, name, area, mapsUrl } } }
import { createClient } from 'npm:@supabase/supabase-js@2';

const KEY = Deno.env.get('GOOGLE_PLACES_KEY') ?? '';
const DAILY_CAP = Number(Deno.env.get('PLACES_DAILY_CAP') ?? '300');
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// A short in-memory cache, so the same place shown on several cards in a few minutes is one call.
const cache = new Map<string, { at: number; v: Place }>();
const TTL = 10 * 60 * 1000;
type Place = { id: string; name: string; area: string; mapsUrl: string };

async function take(calls: number) {
  const { data, error } = await admin.rpc('places_take', { p_calls: calls, p_daily_cap: DAILY_CAP });
  return !error && data === true;
}

async function search(input: string, session?: string) {
  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY },
    body: JSON.stringify({ input, includedRegionCodes: ['gb'], sessionToken: session }),
  });
  if (!res.ok) throw new Error(`google ${res.status}`);
  const d = await res.json();
  return (d.suggestions ?? [])
    .map((s: any) => s.placePrediction)
    .filter(Boolean)
    .slice(0, 5)
    .map((p: any) => ({
      id: p.placeId,
      name: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
      area: p.structuredFormat?.secondaryText?.text ?? '',
    }));
}

async function details(id: string, session?: string): Promise<Place | null> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL) return hit.v;
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}${session ? `?sessionToken=${encodeURIComponent(session)}` : ''}`;
  const res = await fetch(url, { headers: { 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': 'id,displayName,shortFormattedAddress,googleMapsUri' } });
  if (!res.ok) return null;
  const p = await res.json();
  const v = { id: p.id, name: p.displayName?.text ?? '', area: p.shortFormattedAddress ?? '', mapsUrl: p.googleMapsUri ?? '' };
  cache.set(id, { at: Date.now(), v });
  return v;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!KEY) return json({ error: 'Places is not set up yet' }, 503);
  try {
    const body = await req.json();
    if (body.action === 'search') {
      const input = String(body.input ?? '').trim().slice(0, 60);
      if (input.length < 2) return json({ places: [] });
      if (!(await take(1))) return json({ error: 'Place search is resting for today' }, 429);
      return json({ places: await search(input, body.session) });
    }
    if (body.action === 'details') {
      const ids: string[] = [...new Set((body.ids ?? []).map(String))].slice(0, 12);
      const fresh = ids.filter((id) => !(cache.get(id) && Date.now() - cache.get(id)!.at < TTL));
      if (fresh.length && !(await take(fresh.length))) return json({ error: 'Place search is resting for today' }, 429);
      const out: Record<string, Place> = {};
      await Promise.all(ids.map(async (id) => {
        const p = await details(id, ids.length === 1 ? body.session : undefined);
        if (p) out[id] = p;
      }));
      return json({ places: out });
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
