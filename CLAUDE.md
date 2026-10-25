# Beacon (working title)

Read `AGENTS.md` too: it has the Expo rules (SDK 58, check versioned docs, `npx expo install`).

## What this is
One tap tells the friends you choose, across separate circles, that you're free. Friends tap "I'm in" and it hands off to WhatsApp. Solo fun project by Warren Porter. Warren is not learning to code: Claude writes the code, Warren tests on his Android phone and steers the product.

Project docs (brief, decisions, roadmap, open questions) live in Warren's OneDrive Beacon folder, not this repo.

## Product rules (don't break without a logged decision)
1. No in-app chat. All conversation hands off to WhatsApp via `https://wa.me/?text=...` (no number: the user picks the friend).
2. 5 seconds per session, max. Fewer screens, fewer taps.
3. Low frequency by design. No streaks, nags or feeds.
4. You choose who hears. A beacon reaches only the friends or circles picked each time. Circles are private to their owner.

## Decided so far
- Expo (SDK 58, Expo Router, TypeScript) + Supabase. Android first.
- Broadcast model (25 Oct): personal add-me links make two-way friendships; private circles; beacon audience = Everyone or chosen circles; "I'm in" notifies the owner and opens WhatsApp. The current schema (one shared group, invite code, matches table) predates this and needs migrating.
- No sign-in screen: joining (invite code + first name) creates a Supabase anonymous account. Reinstalling means re-joining. No phone numbers stored.
- No location in v1. Push notifications on a match (needs an EAS development build, not Expo Go).

## Layout
- `src/app/`: screens (Expo Router). `join` → `index` (home), guarded in `_layout.tsx`.
- `src/lib/`: Supabase client, auth context, shared UI.
- `supabase/migrations/`: SQL, run by hand in the Supabase SQL Editor, in order.

## Working rules
- Warren can't install desktop software. Builds go through EAS in the cloud.
- Run `npx tsc --noEmit` and `npx expo lint` before every commit.
- Never commit `.env`.
- Never use em dashes in copy or docs. Use a full stop or a comma.
