import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { AppState } from 'react-native';

// Pull new versions as soon as the app opens or comes back to the foreground,
// and switch to them straight away, so changes show up on the first reopen.
async function check() {
  if (__DEV__ || !Updates.isEnabled) return;
  try {
    const res = await Updates.checkForUpdateAsync();
    if (res.isAvailable) {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    }
  } catch {}
}

export function useLiveUpdates() {
  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => sub.remove();
  }, []);
}
