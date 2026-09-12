import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import api from './api';

/**
 * Configure how notifications appear when app is in foreground
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Register for push notifications and send token to server
 * @param {string} userId - Current user ID
 * @returns {Promise<string|null>} Push token or null if failed
 */
export async function registerForPushNotifications(userId) {
  try {
    // Only works on physical devices
    if (!Device.isDevice) {
      console.log('Push notifications require a physical device');
      return null;
    }

    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permissions if not already granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permission not granted');
      return null;
    }

    // Get the push token
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const pushToken = tokenData.data;

    // Send token to server
    if (pushToken) {
      await sendTokenToServer(pushToken, userId);
    }

    // Android requires a notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('hrms-default', {
        name: 'HRMS Notifications',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#1C64F2',
      });
    }

    return pushToken;
  } catch (error) {
    console.error('Failed to register for push notifications:', error);
    return null;
  }
}

/**
 * Send push token to server for storage
 */
async function sendTokenToServer(pushToken, userId) {
  try {
    await api.post('/notifications/register-token', {
      token: pushToken,
      userId,
      platform: Platform.OS,
      deviceInfo: {
        brand: Device.brand,
        model: Device.modelName,
        osVersion: Device.osVersion,
      },
    });
  } catch (error) {
    console.error('Failed to send push token to server:', error);
  }
}

/**
 * Add listener for notifications received while app is in foreground
 */
export function addNotificationListener(handler) {
  return Notifications.addNotificationReceivedListener(handler);
}

/**
 * Add listener for notification tap events
 */
export function addNotificationResponseListener(handler) {
  return Notifications.addNotificationResponseReceivedListener(handler);
}

/**
 * Clear all notifications
 */
export async function clearAllNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Set badge count
 */
export async function setBadgeCount(count) {
  await Notifications.setBadgeCountAsync(count);
}
