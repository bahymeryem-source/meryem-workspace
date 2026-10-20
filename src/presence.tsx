import { collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './auth';
import { db } from './firebase';

export const ONLINE_WINDOW_MS = 150000;

export type PresenceInfo = { fullName: string; lastSeenMs: number };

export function usePresenceHeartbeat() {
  const { user, profile, isOwner } = useAuth();
  const uid = user?.uid;
  const active = (profile as any)?.status === 'active';
  const name: string =
    (profile as any)?.fullName || (profile as any)?.username || user?.email || 'User';

  useEffect(() => {
    if (!uid || !active || isOwner) return;
    const beat = () => {
      setDoc(doc(db, 'presence', uid), {
        fullName: name,
        lastSeen: serverTimestamp(),
      }).catch(() => {});
    };
    beat();
    const id = setInterval(beat, 60000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') beat();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [uid, active, name, isOwner]);
}

export function usePresenceMap(): Record<string, PresenceInfo> {
  const { user } = useAuth();
  const uid = user?.uid;
  const [map, setMap] = useState<Record<string, PresenceInfo>>({});

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      collection(db, 'presence'),
      (snap) => {
        const m: Record<string, PresenceInfo> = {};
        snap.docs.forEach((d) => {
          const x = d.data();
          m[d.id] = {
            fullName: x.fullName ?? '',
            lastSeenMs: x.lastSeen?.toMillis?.() ?? 0,
          };
        });
        setMap(m);
      },
      () => {},
    );
  }, [uid]);

  return map;
}

export function useNow(ms: number = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function isOnline(info: PresenceInfo | undefined, now: number) {
  return !!info && info.lastSeenMs > 0 && now - info.lastSeenMs < ONLINE_WINDOW_MS;
}

export function formatLastSeen(ms: number) {
  if (!ms) return 'never';
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const today = new Date();
  const sameDay =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
  if (sameDay) return `${hh}:${mm}`;
  return `${d.getDate()}/${d.getMonth() + 1} ${hh}:${mm}`;
}