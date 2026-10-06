import type { TrackerStore } from "../state/store";
import type { CloudSyncController } from "./cloud-sync";

export function pushSupportMessage(): string | null {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "This browser does not support push. On iPhone, use the Home Screen app on iOS 16.4 or later.";
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS && !window.matchMedia("(display-mode: standalone)").matches && !(navigator as Navigator & { standalone?: boolean }).standalone) return "On iPhone, open Routine Command from its Home Screen icon to enable push.";
  if (Notification.permission === "denied") return "Notifications are blocked. Allow Routine Command in your phone or browser notification settings.";
  return null;
}

export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const registration = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
  return registration?.pushManager.getSubscription() ?? null;
}

export async function enablePushNotifications(store: TrackerStore, cloud: CloudSyncController): Promise<void> {
  const unsupported = pushSupportMessage();
  if (unsupported) throw new Error(unsupported);
  if (!["synced", "syncing"].includes(cloud.snapshot.phase)) throw new Error("Sign in to device sync before enabling push.");
  // Request permission immediately from the user's tap, before any network awaits (required by iOS).
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted.");
  const config = await cloud.pushRequest<{ configured: boolean; publicKey: string }>({ action: "config" });
  if (!config.configured || !config.publicKey) throw new Error("Push is still being configured. Try again shortly.");
  await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}service-worker.js`);
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const key = config.publicKey.replaceAll("-", "+").replaceAll("_", "/");
    const bytes = Uint8Array.from(atob(key + "=".repeat((4 - key.length % 4) % 4)), (character) => character.charCodeAt(0));
    subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
  }
  await cloud.pushRequest({ action: "subscribe", subscription: subscription.toJSON() });
  const current = store.snapshot.settings.notifications;
  store.updateSettings({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, notifications: { ...current, enabled: true, enabledAt: current.enabled ? current.enabledAt ?? new Date().toISOString() : new Date().toISOString() } });
  await cloud.dispatchAccountability();
}

export async function removeDevicePush(cloud: CloudSyncController): Promise<void> {
  const subscription = await currentPushSubscription();
  if (!subscription) return;
  try { await cloud.pushRequest({ action: "unsubscribe", endpoint: subscription.endpoint }); }
  finally { await subscription.unsubscribe(); }
}

export async function sendTestPush(cloud: CloudSyncController): Promise<void> {
  const subscription = await currentPushSubscription();
  if (!subscription) throw new Error("Enable push notifications on this device first.");
  await cloud.pushRequest({ action: "test", endpoint: subscription.endpoint, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
}
