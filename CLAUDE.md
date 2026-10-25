# Beacon (working title)

Read `AGENTS.md` too: it has the Expo rules (SDK 58, check versioned docs, `npx expo install`).

## What this is
A quiet app that tells close friends when they're both free, then opens WhatsApp. Solo fun project by Warren Porter. Warren is not learning to code: Claude writes the code, Warren tests on his Android phone and steers the product.

Project docs (brief, decisions, roadmap, open questions) live in Warren's OneDrive Beacon folder, not this repo.

## Product rules (don't break without a logged decision)
1. No in-app chat. All conversation hands off to WhatsApp via `https://wa.me/<digits>?text=...`.
2. 5 seconds per session, max. Fewer screens, fewer taps.
3. Low frequency by design. No streaks, nags or feeds.
4. Quiet by default. Beacons are private; only a mutual overlap notifies anyone.

## Decided so far
- Expo (SDK 58, Expo Router, TypeScript) + Supabase. Android first.
- One shared group, gated by one invite code (`app_settings.invite_code`, checked in `join_group()`).
- Sign-in: Supabase email one-time code. WhatsApp number typed once, stored as digits only.
- No location in v1. Push notifications on a match (needs an EAS development build, not Expo Go).

## Layout
- `src/app/`: screens (Expo Router). `sign-in` → `join` → `index` (home), guarded in `_layout.tsx`.
- `src/lib/`: Supabase client, auth context, phone formatting, shared UI.
- `supabase/migrations/`: SQL, run by hand in the Supabase SQL Editor, in order.

## Working rules
- Warren can't install desktop software. Builds go through EAS in the cloud.
- Run `npx tsc --noEmit` and `npx expo lint` before every commit.
- Never commit `.env`.
- Never use em dashes in copy or docs. Use a full stop or a comma.
