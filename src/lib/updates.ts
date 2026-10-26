import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { AppState } from 'react-native';

// New versions: on launch, fetch and switch straight away. Coming back to the app,
// fetch quietly and only switch if it was away for more than 5 minutes, so popping
// out to WhatsApp and back never restarts Beacon under your thumb.
const AWAY_LONG_ENOUGH = 5 * 60 * 1000;

async function check(reload: boolean) {
  if (__DEV__ || !Updates.isEnabled) return;
  try {
    const res = await Updates.checkForUpdateAsync();
    if (!res.isAvailable) return;
    await Updates.fetchUpdateAsync();
    if (reload) await Updates.reloadAsync();
  } catch {}
}

export function useLiveUpdates() {
  useEffect(() => {
    check(true);
    let leftAt = 0;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') leftAt = Date.now();
      if (s === 'active') check(leftAt > 0 && Date.now() - leftAt > AWAY_LONG_ENOUGH);
    });
    return () => sub.remove();
  }, []);
}
