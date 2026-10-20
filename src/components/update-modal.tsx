import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { doc, getDoc } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { db } from '../firebase'; // <-- بدّل المسار إلا كان ملف Firebase عندك فمكان آخر

type Info = { minVersion?: string; latestVersion?: string; apkUrl?: string };

function cmp(a: string, b: string) {
  const x = a.split('.').map((n) => parseInt(n, 10) || 0);
  const y = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0) ? -1 : 1;
  }
  return 0;
}

export default function UpdateModal() {
  const [info, setInfo] = useState<Info>({});
  const [dismissed, setDismissed] = useState(false);
  const current = Constants.expoConfig?.version ?? '0.0.0';

  const load = useCallback(async () => {
    try {
      const snap = await getDoc(doc(db, 'config', 'app'));
      if (snap.exists()) setInfo(snap.data() as Info);
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') load();
    });
    return () => sub.remove();
  }, [load]);

  // EAS Update (تعديلات الكود بلا APK جديد)
  useEffect(() => {
    if (__DEV__) return;
    (async () => {
      try {
        const r = await Updates.checkForUpdateAsync();
        if (r.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch {}
    })();
  }, []);

  const forced = !!info.minVersion && cmp(current, info.minVersion) < 0;
  const optional =
    !!info.latestVersion && cmp(current, info.latestVersion) < 0 && !dismissed;
  const visible = forced || optional;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!forced) setDismissed(true);
      }}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Update available</Text>
          <Text style={styles.body}>
            {forced
              ? 'This version is no longer supported. Please update to continue.'
              : 'A new version is available.'}
          </Text>
          <Text style={styles.ver}>
            {current} → {info.latestVersion ?? info.minVersion}
          </Text>
          <Pressable
            style={styles.btn}
            onPress={() => info.apkUrl && Linking.openURL(info.apkUrl)}
          >
            <Text style={styles.btnText}>Download</Text>
          </Pressable>
          {!forced && (
            <Pressable onPress={() => setDismissed(true)} style={styles.later}>
              <Text style={styles.laterText}>Later</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 24, width: '100%' },
  title: { fontSize: 20, fontWeight: '800', color: '#18181B', marginBottom: 8 },
  body: { fontSize: 15, color: '#3F3F46', marginBottom: 8 },
  ver: { fontSize: 13, color: '#8E8E93', marginBottom: 16 },
  btn: {
    backgroundColor: '#7DE2C0',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: { fontSize: 16, fontWeight: '800', color: '#18181B' },
  later: { alignItems: 'center', paddingVertical: 12 },
  laterText: { fontSize: 14, color: '#8E8E93' },
});