import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
    collection,
    deleteDoc,
    doc,
    limit,
    onSnapshot,
    orderBy,
    query,
    updateDoc,
    where,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../auth';
import { db } from '../firebase';

const C = {
  bg: '#F7F7F3',
  ink: '#18181B',
  mint: '#7DE2C0',
  red: '#D14343',
  card: '#FFFFFF',
  muted: '#6B6B73',
  line: '#E4E4E7',
};

type Notif = {
  id: string;
  title: string;
  body: string;
  fromName: string;
  projectId: string;
  read: boolean;
  createdMs: number;
};

type ProjectLite = { name: string; logo: string };

function ProjectLogo({ logo, name, size }: { logo: string; name: string; size: number }) {
  const box = { width: size, height: size, borderRadius: size * 0.28 };
  if (logo) {
    return <Image source={{ uri: logo }} style={box} />;
  }
  return (
    <View style={[box, { backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ color: C.ink, fontWeight: '800', fontSize: size * 0.4 }}>
        {(name || '?').charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

function timeAgo(ms: number) {
  if (!ms) return '';
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

export default function Notifications() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const uid = user?.uid;
  const [items, setItems] = useState<Notif[]>([]);
  const [projects, setProjects] = useState<Record<string, ProjectLite>>({});
  const [error, setError] = useState('');

  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'users', uid, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(50),
    );
    return onSnapshot(
      q,
      (snap) => {
        setItems(
          snap.docs.map((d) => {
            const x = d.data();
            return {
              id: d.id,
              title: x.title ?? '',
              body: x.body ?? '',
              fromName: x.fromName ?? '',
              projectId: x.projectId ?? '',
              read: x.read === true,
              createdMs: x.createdAt?.toMillis?.() ?? 0,
            };
          }),
        );
      },
      (e) => setError(e.message),
    );
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const base = collection(db, 'projects');
    const q = isAdmin ? base : query(base, where('memberIds', 'array-contains', uid));
    return onSnapshot(
      q,
      (snap) => {
        const map: Record<string, ProjectLite> = {};
        snap.docs.forEach((d) => {
          const x = d.data();
          map[d.id] = { name: (x.name ?? '') as string, logo: (x.logo ?? '') as string };
        });
        setProjects(map);
      },
      () => {},
    );
  }, [uid, isAdmin]);

  async function markRead(n: Notif) {
    if (!uid || n.read) return;
    try {
      await updateDoc(doc(db, 'users', uid, 'notifications', n.id), { read: true });
    } catch (e: any) {
      setError(e?.message ?? 'Could not update.');
    }
  }

  async function markAll() {
    await Promise.all(items.filter((n) => !n.read).map(markRead));
  }

  async function remove(n: Notif) {
    if (!uid) return;
    try {
      await deleteDoc(doc(db, 'users', uid, 'notifications', n.id));
    } catch (e: any) {
      setError(e?.message ?? 'Could not delete.');
    }
  }

  const unread = items.filter((n) => !n.read).length;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={styles.content}>
      <View style={styles.wrap}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={C.ink} />
          </TouchableOpacity>
          <Text style={styles.title}>Notifications</Text>
          {unread > 0 ? (
            <TouchableOpacity onPress={markAll}>
              <Text style={styles.link}>Mark all read</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {items.length === 0 ? (
          <Text style={[styles.muted, { textAlign: 'center', marginTop: 30 }]}>
            No notifications yet.
          </Text>
        ) : null}

        {items.map((n) => {
          const p = n.projectId ? projects[n.projectId] : undefined;
          return (
            <TouchableOpacity
              key={n.id}
              style={[styles.card, !n.read && styles.cardUnread]}
              onPress={() => markRead(n)}
            >
              <View style={styles.row}>
                {p ? (
                  <View style={styles.logoWrap}>
                    <ProjectLogo logo={p.logo} name={p.name} size={42} />
                  </View>
                ) : null}
                <View style={{ flex: 1 }}>
                  <View style={styles.row}>
                    {!n.read ? <View style={styles.dot} /> : null}
                    <Text style={styles.nTitle} numberOfLines={2}>
                      {n.title}
                    </Text>
                    <TouchableOpacity onPress={() => remove(n)} hitSlop={10}>
                      <Ionicons name="close" size={18} color={C.muted} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.nBody}>{n.body}</Text>
                  <Text style={styles.meta}>
                    {[p?.name, n.fromName, timeAgo(n.createdMs)].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 56, paddingBottom: 40 },
  wrap: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  backBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  title: { flex: 1, fontSize: 26, fontWeight: '800', color: C.ink },
  link: { color: C.ink, fontWeight: '800', fontSize: 13 },
  muted: { color: C.muted, fontSize: 14 },
  error: { color: C.red, fontSize: 13, marginVertical: 8 },
  card: {
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: C.line,
  },
  cardUnread: { borderColor: C.mint, backgroundColor: '#F2FCF8' },
  row: { flexDirection: 'row', alignItems: 'center' },
  logoWrap: { marginRight: 12, alignSelf: 'flex-start' },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.mint, marginRight: 8 },
  nTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: C.ink },
  nBody: { fontSize: 14, color: C.ink, marginTop: 6, lineHeight: 20 },
  meta: { fontSize: 12, color: C.muted, marginTop: 8 },
});