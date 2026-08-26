import { savePushSubscription, removePushSubscription } from './pushSubscriptionsApi';

// ---------------------------------------------------------------------------
// Browser-side Web Push logic. Nothing here runs automatically on page
// load — every function is only ever called in direct response to the
// user tapping "Enable notifications" (or "Turn off") in Profile. Actual
// sending happens entirely server-side (see the push-reminders Edge
// Function); this module only ever registers or removes a device.
// ---------------------------------------------------------------------------

export type PushSupportState = 'unsupported' | 'default' | 'granted' | 'denied';

export function getPushSupportState(): PushSupportState {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    return 'unsupported';
  }
  return Notification.permission as PushSupportState;
}

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

/** True if this exact browser/device currently has an active push subscription. */
export async function isEnabledOnThisDevice(): Promise<boolean> {
  const sub = await getExistingSubscription();
  return Boolean(sub);
}

export interface EnableResult {
  ok: boolean;
  error?: string;
}

/**
 * Full opt-in flow, only ever called from an explicit user action:
 * requests permission, registers the service worker, subscribes to push,
 * and saves the subscription for the signed-in user.
 */
export async function enablePushNotifications(userId: string): Promise<EnableResult> {
  const support = getPushSupportState();
  if (support === 'unsupported') {
    return { ok: false, error: 'Push notifications are not supported on this browser/device.' };
  }

  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    return { ok: false, error: 'Notifications are not configured for this deployment yet.' };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return {
        ok: false,
        error:
          permission === 'denied'
            ? 'Notifications are blocked for Timo in your browser settings.'
            : 'Notification permission was not granted.',
      };
    }

    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
    }

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, error: 'Could not read the push subscription details.' };
    }

    await savePushSubscription(userId, {
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      userAgent: navigator.userAgent,
    });

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not enable notifications.',
    };
  }
}

/** Reverses enablePushNotifications: unsubscribes this device and removes its saved subscription. */
export async function disablePushNotifications(): Promise<EnableResult> {
  try {
    const subscription = await getExistingSubscription();
    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await removePushSubscription(endpoint);
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not turn off notifications.',
    };
  }
}
