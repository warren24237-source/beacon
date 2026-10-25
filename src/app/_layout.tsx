import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AuthProvider, useAuth } from '@/lib/auth';
import '@/lib/push';
import { useLiveUpdates } from '@/lib/updates';
import { colors } from '@/lib/ui';

SplashScreen.preventAutoHideAsync();

function Routes() {
  const { loading, session, profile } = useAuth();

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  if (loading) return null;

  // No sign-in screen: joining with the invite code creates an anonymous account.
  const joined = !!session && !!profile;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={!joined}>
        <Stack.Screen name="join" />
      </Stack.Protected>
      <Stack.Protected guard={joined}>
        <Stack.Screen name="index" />
        <Stack.Screen name="friends" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  useLiveUpdates();
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Routes />
    </AuthProvider>
  );
}
