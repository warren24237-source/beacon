import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from './supabase';

// Show match alerts even when the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type PushResult = 'enabled' | 'denied' | 'unavailable';

/**
 * Ask for notification permission (only if not already decided) and save this
 * phone's Expo push address to the user's profile. Call it at a moment where the
 * reason is obvious, e.g. when lighting a beacon for the first time.
 */
export async function enableMatchAlerts(userId: string): Promise<PushResult> {
  if (!Device.isDevice) return 'unavailable';

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('matches', {
      name: 'Beacons',
      description: 'When a friend lights a beacon or says they are in',
      importance: AndroidImportance.HIGH,
    });
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== 'granted') return 'denied';

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.from('profiles').update({ expo_push_token: token }).eq('id', userId);
    return 'enabled';
  } catch {
    return 'unavailable';
  }
}
