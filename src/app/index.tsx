import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Body, Button, Screen, Title } from '@/lib/ui';

export default function Home() {
  const { profile } = useAuth();

  return (
    <Screen>
      <Title>Hi {profile?.full_name}</Title>
      <Body muted>You are in. Setting your free window arrives in the next phase.</Body>
      <Button label="Sign out" secondary onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
