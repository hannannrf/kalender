// S10: phone notifications through the service worker (FR-09, C-05). Reminders always show inside Kalender too.
import { api, ApiError } from './api';

export type PushState = 'unavailable' | 'add-to-home-screen' | 'not-set-up' | 'blocked' | 'off' | 'on';

const ID_KEY = 'kalender.pushSubscriptionId'; // the server's id for this phone's subscription, needed to remove it

const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export function registerServiceWorker(): void {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {}); // the app works without it
}

/** This phone's subscription. getRegistration answers at once, so sign-out never waits on a worker that failed to install. */
async function current(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
}

/** Saves this phone's subscription for the signed-in User (the same phone keeps one row on the server). */
async function save(subscription: PushSubscription): Promise<void> {
  const { id } = await api<{ id: string }>('/push-subscriptions', { method: 'POST', body: subscription.toJSON() });
  localStorage.setItem(ID_KEY, id);
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return isIos() && !standalone() ? 'add-to-home-screen' : 'unavailable';
  try {
    await api('/push/public-key');
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return 'not-set-up';
    throw err;
  }
  if (Notification.permission === 'denied') return 'blocked';
  const subscription = Notification.permission === 'granted' ? await current() : null;
  if (!subscription) return 'off';
  if (!localStorage.getItem(ID_KEY)) await save(subscription); // subscribed before, but this User's row is not known here
  return 'on';
}

const keyBytes = (base64url: string) => Uint8Array.from(atob(base64url.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** Asks the phone for permission, subscribes, and saves the subscription. Answers the new state. */
export async function turnOn(): Promise<PushState> {
  if ((await Notification.requestPermission()) !== 'granted') return Notification.permission === 'denied' ? 'blocked' : 'off';
  const { publicKey } = await api<{ publicKey: string }>('/push/public-key');
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  await save(subscription);
  return 'on';
}

/** Removes this phone's subscription on the server and in the browser. */
export async function turnOff(): Promise<PushState> {
  const id = localStorage.getItem(ID_KEY);
  if (id) {
    await api(`/push-subscriptions/${id}`, { method: 'DELETE' }).catch((err) => {
      if (!(err instanceof ApiError && err.status === 404)) throw err; // already gone is fine
    });
    localStorage.removeItem(ID_KEY);
  }
  if (supported()) await (await current())?.unsubscribe();
  return 'off';
}

/** S10 decision 4: signing out, or deleting the account, stops this phone's notifications. Never blocks the sign-out. */
export async function forgetThisPhone(): Promise<void> {
  const id = localStorage.getItem(ID_KEY);
  localStorage.removeItem(ID_KEY);
  if (id) await api(`/push-subscriptions/${id}`, { method: 'DELETE' }).catch(() => {}); // after account deletion the row is already gone
  if (supported()) await current().then((s) => s?.unsubscribe()).catch(() => {});
}
