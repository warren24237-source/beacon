# Beacon

Know when your mates are free. Nobody sees your status unless you match, then it opens WhatsApp.

## Setup (one-off)
1. **Supabase project:** create one at supabase.com (region: London).
2. **Database:** Supabase > SQL Editor > paste `supabase/migrations/0001_init.sql` > Run.
3. **Invite code:** in the SQL Editor run
   `update app_settings set value = 'your-code' where key = 'invite_code';`
4. **Email code:** Authentication > Emails > "Magic Link" template, add `{{ .Token }}` to the body so emails show a code.
5. **App settings:** copy `.env.example` to `.env` with your project URL and publishable key.

## Run
Builds and previews run in the cloud through EAS. No local installs needed.
