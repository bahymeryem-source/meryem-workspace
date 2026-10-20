import { createAudioPlayer } from 'expo-audio';
import { collection, doc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './auth';
import { db } from './firebase';

type Badges = {
  chat: number;
  missions: number;
  admin: number;
  counts: Record<string, number>;
};

const BadgeContext = createContext<Badges>({ chat: 0, missions: 0, admin: 0, counts: {} });

export function useBadges() {
  return useContext(BadgeContext);
}

// صوت الرسالة الجديدة (مشغل واحد للتطبيق كامل)
let messagePlayer: ReturnType<typeof createAudioPlayer> | null = null;
let lastPlayedAt = 0;

function playMessageSound() {
  const now = Date.now();
  if (now - lastPlayedAt < 1500) return;
  lastPlayedAt = now;
  try {
    if (!messagePlayer) {
      messagePlayer = createAudioPlayer(require('../assets/sounds/message.wav'));
    }
    messagePlayer.seekTo(0);
    messagePlayer.play();
  } catch {
    // إيلا الصوت ما تشغلش، التطبيق كيكمل بلا مشكل
  }
}

// كيحسب الرسائل غير المقروءة لشات واحد (مشروع ولا شات خاص)
function UnreadProbe({
  keyId,
  msgPath,
  readPath,
  uid,
  onCount,
}: {
  keyId: string;
  msgPath: string;
  readPath: string;
  uid: string;
  onCount: (k: string, n: number) => void;
}) {
  const [lastRead, setLastRead] = useState<number | null>(null);
  const [rows, setRows] = useState<{ s: string; t: number; d: boolean }[]>([]);
  const baseline = useRef<number | null>(null);

  useEffect(() => {
    return onSnapshot(
      doc(db, readPath),
      (snap) => {
        const x: any = snap.exists() ? snap.data() : null;
        setLastRead(x?.lastReadAt?.toMillis?.() ?? 0);
      },
      () => setLastRead(0),
    );
  }, [readPath]);

  useEffect(() => {
    const q = query(collection(db, msgPath), orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(
      q,
      (snap) => {
        setRows(
          snap.docs.map((d) => {
            const x: any = d.data();
            return {
              s: (x.senderId ?? '') as string,
              t: (x.createdAt?.toMillis?.() ?? 0) as number,
              d: x.deleted === true,
            };
          }),
        );
      },
      () => {},
    );
  }, [msgPath]);

  useEffect(() => {
    if (lastRead === null) return;
    const n = rows.filter((r) => r.s !== uid && !r.d && r.t > lastRead).length;
    onCount(keyId, n);
  }, [lastRead, rows, uid, keyId, onCount]);

  // الصوت: كيتشغل غير فاش كتوصل رسالة جديدة من شخص آخر
  useEffect(() => {
    const newest = rows.reduce((m, r) => (r.t > m ? r.t : m), 0);
    if (baseline.current === null) {
      baseline.current = newest;
      return;
    }
    const fresh = rows.some((r) => r.s !== uid && !r.d && r.t > (baseline.current as number));
    if (newest > baseline.current) baseline.current = newest;
    if (fresh) playMessageSound();
  }, [rows, uid]);

  return null;
}

// كيحسب المهام المكلف بيها المستخدم فمشروع واحد وباقي خاصو يدير فيها شي حاجة
function MissionProbe({
  keyId,
  projectId,
  uid,
  onCount,
}: {
  keyId: string;
  projectId: string;
  uid: string;
  onCount: (k: string, n: number) => void;
}) {
  useEffect(() => {
    const q = query(collection(db, 'projects', projectId, 'missions'), where('assigneeId', '==', uid));
    return onSnapshot(
      q,
      (snap) => {
        let n = 0;
        snap.docs.forEach((d) => {
          const s = (d.data() as any).status ?? 'todo';
          if (s === 'todo' || s === 'progress' || s === 'changes') n += 1;
        });
        onCount(keyId, n);
      },
      () => onCount(keyId, 0),
    );
  }, [projectId, uid, keyId, onCount]);

  return null;
}

export function BadgeProvider({ children }: { children: ReactNode }) {
  const { user, profile, isAdmin, isOwner, can } = useAuth();
  const uid = user?.uid ?? '';
  const active = !!uid && profile?.status === 'active';
  const seeAll = isAdmin || isOwner;
  const canApprove = active && can('approveUsers');

  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [dmIds, setDmIds] = useState<string[]>([]);
  const [pending, setPending] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const setCount = useCallback((k: string, n: number) => {
    setCounts((prev) => (prev[k] === n ? prev : { ...prev, [k]: n }));
  }, []);

  // المشاريع
  useEffect(() => {
    if (!active || isOwner) {
      setProjectIds([]);
      return;
    }
    const base = collection(db, 'projects');
    const q = seeAll ? base : query(base, where('memberIds', 'array-contains', uid));
    return onSnapshot(
      q,
      (snap) => setProjectIds(snap.docs.map((d) => d.id)),
      () => {},
    );
  }, [active, isOwner, seeAll, uid]);

  // الشاتات الخاصة
  useEffect(() => {
    if (!active || isOwner) {
      setDmIds([]);
      return;
    }
    const q = query(collection(db, 'dms'), where('members', 'array-contains', uid));
    return onSnapshot(
      q,
      (snap) => setDmIds(snap.docs.map((d) => d.id)),
      () => {},
    );
  }, [active, isOwner, uid]);

  // الحسابات اللي كتسنى الموافقة
  useEffect(() => {
    if (!canApprove) {
      setPending(0);
      return;
    }
    const q = query(collection(db, 'users'), where('status', '==', 'pending'));
    return onSnapshot(
      q,
      (snap) => setPending(snap.size),
      () => {},
    );
  }, [canApprove]);

  const value = useMemo<Badges>(() => {
    const chat =
      projectIds.reduce((s, id) => s + (counts['p:' + id] || 0), 0) +
      dmIds.reduce((s, id) => s + (counts['d:' + id] || 0), 0);
    const missions = projectIds.reduce((s, id) => s + (counts['m:' + id] || 0), 0);
    return { chat, missions, admin: pending, counts };
  }, [projectIds, dmIds, counts, pending]);

  return (
    <BadgeContext.Provider value={value}>
      {active && !isOwner ? (
        <>
          {projectIds.map((id) => (
            <UnreadProbe
              key={'p' + id}
              keyId={'p:' + id}
              msgPath={`projects/${id}/messages`}
              readPath={`projects/${id}/reads/${uid}`}
              uid={uid}
              onCount={setCount}
            />
          ))}
          {dmIds.map((id) => (
            <UnreadProbe
              key={'d' + id}
              keyId={'d:' + id}
              msgPath={`dms/${id}/messages`}
              readPath={`dms/${id}/reads/${uid}`}
              uid={uid}
              onCount={setCount}
            />
          ))}
          {projectIds.map((id) => (
            <MissionProbe key={'m' + id} keyId={'m:' + id} projectId={id} uid={uid} onCount={setCount} />
          ))}
        </>
      ) : null}
      {children}
    </BadgeContext.Provider>
  );
}