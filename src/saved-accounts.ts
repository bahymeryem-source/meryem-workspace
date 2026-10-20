import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export type SavedAccount = {
  uid: string;
  email: string;
  fullName: string;
  username: string;
  photo: string;
  remember: boolean;
};

const LIST_KEY = 'meryem.savedAccounts.v1';
const MAX_ACCOUNTS = 5;

export const canRememberPassword = Platform.OS !== 'web';

const pwKey = (uid: string) => `meryem.pw.${uid}`;

export async function getSavedAccounts(): Promise<SavedAccount[]> {
  try {
    const raw = await AsyncStorage.getItem(LIST_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? (list as SavedAccount[]) : [];
  } catch {
    return [];
  }
}

async function writeList(list: SavedAccount[]) {
  await AsyncStorage.setItem(
    LIST_KEY,
    JSON.stringify(list.slice(0, MAX_ACCOUNTS)),
  );
}

export async function saveAccount(
  acc: {
    uid: string;
    email: string;
    fullName: string;
    username: string;
    photo: string;
  },
  password?: string,
) {
  let remember = false;

  if (canRememberPassword) {
    try {
      if (password) {
        await SecureStore.setItemAsync(pwKey(acc.uid), password);
        remember = true;
      } else {
        await SecureStore.deleteItemAsync(pwKey(acc.uid));
      }
    } catch {
      remember = false;
    }
  }

  const list = (await getSavedAccounts()).filter(
    (a) => a.uid !== acc.uid,
  );

  list.unshift({ ...acc, remember });
  await writeList(list);
}

export async function getSavedPassword(
  uid: string,
): Promise<string | null> {
  if (!canRememberPassword) return null;

  try {
    return await SecureStore.getItemAsync(pwKey(uid));
  } catch {
    return null;
  }
}

export async function removeSavedAccount(uid: string) {
  if (canRememberPassword) {
    try {
      await SecureStore.deleteItemAsync(pwKey(uid));
    } catch {
      // Ignore secure storage errors.
    }
  }

  const list = (await getSavedAccounts()).filter(
    (a) => a.uid !== uid,
  );

  await writeList(list);
}

export async function updateSavedPassword(
  uid: string,
  password: string,
) {
  if (!canRememberPassword) return;

  try {
    const existing = await SecureStore.getItemAsync(pwKey(uid));
    if (existing !== null) {
      await SecureStore.setItemAsync(pwKey(uid), password);
    }
  } catch {
    // Ignore secure storage errors.
  }
}

// Updates name, username and photo of a saved account.
// Does not touch the saved password.
export async function updateSavedProfile(
  uid: string,
  data: { fullName?: string; username?: string; photo?: string },
): Promise<boolean> {
  const list = await getSavedAccounts();
  const account = list.find((a) => a.uid === uid);

  if (!account) return false;

  if (data.fullName) account.fullName = data.fullName;
  if (data.username) account.username = data.username;
  if (data.photo !== undefined) account.photo = data.photo;

  await writeList(list);
  return true;
}

export async function setRememberPassword(
  uid: string,
  remember: boolean,
  password?: string,
): Promise<boolean> {
  const list = await getSavedAccounts();
  const account = list.find((a) => a.uid === uid);

  if (!account) return false;

  if (!remember || !canRememberPassword) {
    if (canRememberPassword) {
      try {
        await SecureStore.deleteItemAsync(pwKey(uid));
      } catch {
        // Ignore secure storage errors.
      }
    }

    account.remember = false;
  } else {
    if (password) {
      try {
        await SecureStore.setItemAsync(pwKey(uid), password);
        account.remember = true;
      } catch {
        return false;
      }
    } else {
      const existing = await getSavedPassword(uid);
      account.remember = existing !== null;
    }
  }

  await writeList(list);
  return true;
}