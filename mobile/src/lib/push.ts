import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";

import { devices } from "@/lib/api";

type NotificationsModule = typeof import("expo-notifications");

// Expo Go on Android has no remote push since SDK 53, and merely importing expo-notifications there throws —
// so the module is only loaded in real (preview/production) builds. In Expo Go every function here is a no-op.
const Notifications: NotificationsModule | null =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient
    ? null
    : // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("expo-notifications") as NotificationsModule);

Notifications?.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: true, shouldShowBanner: true, shouldShowList: true }),
});

let current: string | null = null;

/** Asks for permission and sends this phone's Expo push token to the backend. Best effort: a refusal or an emulator just means no pushes. */
export async function registerForPush(): Promise<void> {
  if (!Notifications || !Device.isDevice) return;
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Messages & orders",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#ec4899",
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== "granted") return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return; // not linked to an EAS project yet (`eas init`)
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await devices.register(data, Platform.OS === "ios" ? "ios" : "android");
    current = data;
  } catch (err) {
    console.warn("push registration failed", err);
  }
}

export async function unregisterPush(): Promise<void> {
  if (!current) return;
  await devices.unregister(current).catch(() => undefined);
  current = null;
}

/** The dashboard page a tapped notification opens (data set by the callers of backend/app/services/push.py). */
export function hrefFor(data: Record<string, unknown> | undefined): string | null {
  if (data?.type === "message" && typeof data.conversation_id === "string") return `/dashboard/inbox?c=${encodeURIComponent(data.conversation_id)}`;
  if (data?.type === "order") return "/dashboard/shop";
  return null;
}

/** Calls `open` with the dashboard path for a tapped notification — including the tap that launched the app. Returns an unsubscribe function. */
export function onNotificationTap(open: (path: string) => void): () => void {
  if (!Notifications) return () => undefined;
  const handle = (r: { notification: { request: { content: { data?: unknown } } } } | null) => {
    const href = hrefFor(r?.notification.request.content.data as Record<string, unknown> | undefined);
    if (href) open(href);
  };
  const last = Notifications.getLastNotificationResponse();
  if (last) {
    handle(last);
    Notifications.clearLastNotificationResponse();
  }
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}
