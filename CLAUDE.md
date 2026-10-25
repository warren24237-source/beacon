# Beacon (working title)

Read `AGENTS.md` too: it has the Expo rules (SDK 58, check versioned docs, `npx expo install`).

## What this is
One tap tells the friends you choose, across separate circles, that you're free. Friends tap "I'm in" and it hands off to WhatsApp. Solo fun project by Warren Porter. Warren is not learning to code: Claude writes the code, Warren tests on his Android phone and steers the product.

Project docs (brief, decisions, roadmap, open questions) and the **current status / next steps** live in Warren's OneDrive Beacon folder `CLAUDE.md`, not this repo. If that folder isn't connected, ask Warren to connect it.

## Product rules (don't break without a logged decision)
1. No in-app chat. All conversation hands off to WhatsApp: `wa.me/<number>?text=` for the person directly, or `wa.me/?text=` for "Other chat or group".
2. 5 seconds per session, max. Fewer screens, fewer taps.
3. Low frequency by design. No streaks, nags or feeds.
4. You choose who hears. A beacon reaches only the friends or circles picked each time. Circles are private to their owner.

## Decided so far
- Expo (SDK 58, Expo Router, TypeScript) + Supabase. Android first.
- Broadcast model (25 Oct): 6-character friend codes make two-way friendships; private circles; beacon audience = Everyone or chosen circles; "I'm in" notifies the owner and opens WhatsApp. Schema in migrations 0003 to 0005. Pushes are sent from Postgres via pg_net to Expo's push API.
- No sign-in screen: joining (invite code `join-me` + first name + required WhatsApp number) creates a Supabase anonymous account. Reinstalling means re-joining. Numbers visible only to friends.
- Friends: codes connect instantly; adding by number or from phone contacts (expo-contacts, numbers matched server-side, never stored) sends a request the other person accepts (migration 0006).
- App version 1.1.0 = runtime 1.1.0 (contacts native module). Bump `version` in app.json whenever a native module is added, so OTA updates never reach a build without it.
- No location in v1. Push notifications on a match (needs an EAS development build, not Expo Go).

## Layout
- `src/app/`: screens (Expo Router). `join` → `phone` (only if missing) → `index` (home) and `friends`, guarded in `_layout.tsx`.
- `src/lib/`: Supabase client, auth context, shared UI.
- `supabase/migrations/`: SQL, applied in order via the Supabase Management API (Claude holds a token per session) or the SQL Editor.
- Updates: `eas update --channel preview --environment preview --platform android`. Native changes need `eas build --profile preview`.

## Working rules
- Warren can't install desktop software. Builds go through EAS in the cloud.
- Run `npx tsc --noEmit` and `npx expo lint` before every commit.
- Never commit `.env`.
- Never use em dashes in copy or docs. Use a full stop or a comma.
