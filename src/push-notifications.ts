import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { deleteDoc, doc, setDoc } from "firebase/firestore";
import { AppState, Platform } from "react-native";
import { auth, db } from "./firebase";

const PREF_KEY = "push_enabled";

Notifications.setNotificationHandler({
  handleNotification: async () => {
    const inForeground = AppState.currentState === "active";
    return {
      shouldShowBanner: !inForeground,
      shouldShowList: !inForeground,
      shouldPlaySound: !inForeground,
      shouldSetBadge: false,
    };
  },
});

export async function isPushEnabled(): Promise<boolean> {
  try {
    const value = await SecureStore.getItemAsync(PREF_KEY);
    return value !== "0";
  } catch {
    return true;
  }
}

function getProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId
  );
}

export async function registerPushNotifications(): Promise<string | null> {
  try {
    if (!Device.isDevice) {
      console.log("Push notifications require a physical device.");
      return null;
    }

    const user = auth.currentUser;

    if (!user) {
      console.log("No signed-in user.");
      return null;
    }

    if (!(await isPushEnabled())) {
      return null;
    }

    const permissions = await Notifications.getPermissionsAsync();
    let status = permissions.status;

    if (status !== "granted") {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }

    if (status !== "granted") {
      console.log("Notification permission was not granted.");
      return null;
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Meryem Workspace",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        sound: "default",
      });
    }

    const projectId = getProjectId();

    if (!projectId) {
      console.log("Missing EAS projectId. Configure EAS first.");
      return null;
    }

    const tokenResult = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    const token = tokenResult.data;

    await setDoc(
      doc(db, "users", user.uid, "devices", token),
      {
        expoPushToken: token,
        platform: Platform.OS,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return token;
  } catch (error) {
    console.error("Push notification registration failed:", error);
    return null;
  }
}

export async function unregisterPushNotifications(): Promise<void> {
  try {
    if (!Device.isDevice) return;

    const user = auth.currentUser;
    if (!user) return;

    const projectId = getProjectId();
    if (!projectId) return;

    const tokenResult = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    await deleteDoc(doc(db, "users", user.uid, "devices", tokenResult.data));
  } catch (error) {
    console.log("Push unregister skipped:", error);
  }
}

export async function setPushEnabled(enabled: boolean): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(PREF_KEY, enabled ? "1" : "0");
  } catch {
    // ignore
  }

  if (enabled) {
    const token = await registerPushNotifications();
    return token !== null;
  }

  await unregisterPushNotifications();
  return true;
}