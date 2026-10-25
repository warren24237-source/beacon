import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Publishable keys are designed to ship inside apps; row level security protects the data.
// Override with EXPO_PUBLIC_* variables in .env if you point at a different project.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://kwkkqtghpihpxzuzjyag.supabase.co';
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_iG1a32e5ohh-eLTr6Irytg_ykDCzXCV';

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: AsyncStorage as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export type Profile = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  expo_push_token: string | null;
};
