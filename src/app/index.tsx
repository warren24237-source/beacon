import { useAuth } from '@/lib/auth';
import { Body, Screen, Title } from '@/lib/ui';

export default function Home() {
  const { profile } = useAuth();

  return (
    <Screen>
      <Title>Hi {profile?.full_name}</Title>
      <Body muted>You are in. Setting your free window arrives in the next phase.</Body>
    </Screen>
  );
}
