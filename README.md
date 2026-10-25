# Beacon

Know when your mates are free. Nobody sees your status unless you match, then it opens WhatsApp.

## Setup (one-off)
Done for project `kwkkqtghpihpxzuzjyag`:
1. **Database:** `supabase/migrations/0001_init.sql` run in the SQL Editor.
2. **Anonymous sign-ins:** Authentication > Sign In / Providers > on.
3. **Invite code:** set with
   `update app_settings set value = 'your-code' where key = 'invite_code';`

The app has the project URL and publishable key built in (safe to ship). Override in `.env` to use another project.

## Run
Builds and previews run in the cloud through EAS. No local installs needed.
