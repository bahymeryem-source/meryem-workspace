import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    Easing,
    Image,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from 'react-native';
import { useAuth } from '../auth';
import { Button, FadeIn, PageHeader, Press } from '../components/ui';
import { db } from '../firebase';
import { formatLastSeen, isOnline, useNow, usePresenceMap } from '../presence';

const C = {
  bg: '#F7F7F3',
  ink: '#18181B',
  mint: '#7DE2C0',
  lavender: '#B9A7FF',
  red: '#D14343',
  green: '#2FBF71',
  card: '#FFFFFF',
  muted: '#6B6B73',
  line: '#E4E4E7',
};

type Member = {
  id: string;
  fullName: string;
  username: string;
  role: string;
  status: string;
  photo: string;
};

type RoleLite = { id: string; name: string };
type ProjectLite = { id: string; name: string; memberIds: string[] };
type ZoomState = { uri: string; name: string; x: number; y: number; w: number; h: number };

export default function Team() {
  const router = useRouter();
  const { user, isAdmin, isOwner } = useAuth();
  const uid = user?.uid;
  const presence = usePresenceMap();
  const now = useNow(30000);
  const win = useWindowDimensions();

  const [users, setUsers] = useState<Member[]>([]);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [roles, setRoles] = useState<RoleLite[]>([]);
  const [openId, setOpenId] = useState('');
  const [profileId, setProfileId] = useState('');
  const [error, setError] = useState('');

  // Zoom ديال الصورة الكبيرة
  const [zoom, setZoom] = useState<ZoomState | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const bigRef = useRef<View>(null);
  const overlayRef = useRef<View>(null);

  useEffect(() => {
    if (!uid) return;
    const base = collection(db, 'projects');
    const q = isAdmin ? base : query(base, where('memberIds', 'array-contains', uid));
    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => {
          const x = d.data();
          return {
            id: d.id,
            name: (x.name ?? '') as string,
            memberIds: (Array.isArray(x.memberIds) ? x.memberIds : []) as string[],
          } as ProjectLite;
        });
        setProjects(rows);
      },
      (e) => setError(e.message),
    );
  }, [uid, isAdmin]);

  useEffect(() => {
    return onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const rows = snap.docs.map((d) => {
          const x = d.data();
          return {
            id: d.id,
            fullName: x.fullName ?? '',
            username: x.username ?? '',
            role: x.role ?? 'member',
            status: x.status ?? '',
            photo: x.photo ?? '',
          } as Member;
        });
        setUsers(rows.filter((m) => m.status === 'active' && m.role !== 'owner'));
      },
      (e) => setError(e.message),
    );
  }, []);

  useEffect(() => {
    return onSnapshot(
      collection(db, 'roles'),
      (snap) => {
        const rows = snap.docs.map((d) => ({
          id: d.id,
          name: (d.data().name as string) || d.id,
        }));
        const ids = new Set(rows.map((r) => r.id));
        if (!ids.has('admin')) rows.push({ id: 'admin', name: 'admin' });
        if (!ids.has('member')) rows.push({ id: 'member', name: 'member' });
        rows.sort((a, b) => a.name.localeCompare(b.name));
        setRoles(rows);
      },
      () => {},
    );
  }, []);

  // إيلا تسد البروفيل، تسد الـ zoom
  useEffect(() => {
    if (!profileId) setZoom(null);
  }, [profileId]);

  const sharedProjects = useMemo(() => {
    const map: Record<string, string[]> = {};
    projects.forEach((p) => {
      p.memberIds.forEach((id) => {
        if (!map[id]) map[id] = [];
        map[id].push(p.name);
      });
    });
    return map;
  }, [projects]);

  const members = useMemo(() => {
    if (isAdmin) return users;
    return users.filter((m) => m.id === uid || (sharedProjects[m.id]?.length ?? 0) > 0);
  }, [users, isAdmin, uid, sharedProjects]);

  const sorted = useMemo(() => {
    return [...members].sort((a, b) => {
      const oa = isOnline(presence[a.id], now) ? 1 : 0;
      const ob = isOnline(presence[b.id], now) ? 1 : 0;
      if (oa !== ob) return ob - oa;
      return a.fullName.localeCompare(b.fullName);
    });
  }, [members, presence, now]);

  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? id;

  async function changeRole(m: Member, roleId: string) {
    setError('');
    if (m.role === roleId) return;
    try {
      await updateDoc(doc(db, 'users', m.id), { role: roleId });
      setOpenId('');
    } catch (e: any) {
      setError(e?.message ?? 'Could not change the role.');
    }
  }

  function openChat(id: string) {
    setProfileId('');
    router.push({ pathname: '/chat', params: { dm: id } });
  }

  // كتحل الصورة من بلاصتها
  function openZoom(uri: string, name: string) {
    const src = bigRef.current;
    if (!src || !uri) return;
    src.measureInWindow((x, y, w, h) => {
      const start = (ox: number, oy: number) => {
        progress.setValue(0);
        setZoom({ uri, name, x: x - ox, y: y - oy, w, h });
        Animated.timing(progress, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start();
      };
      const ov = overlayRef.current;
      if (ov) ov.measureInWindow((ox, oy) => start(ox, oy));
      else start(0, 0);
    });
  }

  // كترجع الصورة لبلاصتها وتسد
  function closeZoom() {
    Animated.timing(progress, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: false,
    }).start(() => setZoom(null));
  }

  const profileMember = members.find((m) => m.id === profileId) ?? null;

  function statusText(id: string) {
    const info = presence[id];
    if (isOnline(info, now)) return 'Online';
    return info?.lastSeenMs ? `Last seen ${formatLastSeen(info.lastSeenMs)}` : 'Offline';
  }

  const zoomSize = Math.min(win.width - 32, win.height * 0.68);
  const zoomTx = (win.width - zoomSize) / 2;
  const zoomTy = (win.height - zoomSize) / 2;

  return (
    <>
      <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={styles.content}>
        <View style={styles.wrap}>
          <PageHeader title="Team" />
          <Text style={styles.sub}>
            {members.length} members · {members.filter((m) => isOnline(presence[m.id], now)).length} online
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {sorted.map((m, i) => {
            const online = isOnline(presence[m.id], now);
            const isMe = m.id === uid;
            const name = m.fullName || m.username || 'Unknown';
            const canChange = isAdmin && !isMe;
            const shared = sharedProjects[m.id] ?? [];
            return (
              <FadeIn key={m.id} delay={60 + Math.min(i, 6) * 60} style={styles.card}>
                <Press scaleTo={0.98} onPress={() => setProfileId(m.id)}>
                  <View style={styles.row}>
                    <View style={{ width: 48, height: 48 }}>
                      {m.photo ? (
                        <Image source={{ uri: m.photo }} style={styles.avatar} />
                      ) : (
                        <View style={[styles.avatar, styles.avatarEmpty]}>
                          <Text style={styles.avatarLetter}>{name.charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                      {online ? <View style={styles.badge} /> : null}
                    </View>

                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.name} numberOfLines={1}>
                        {name}
                        {isMe ? ' (you)' : ''}
                      </Text>
                      <Text style={styles.meta} numberOfLines={1}>
                        @{m.username || 'user'} · {online ? 'Online' : 'Offline'}
                      </Text>
                    </View>

                    <View style={[styles.roleTag, m.role === 'admin' && { backgroundColor: C.lavender }]}>
                      <Text style={styles.roleText}>{roleName(m.role)}</Text>
                    </View>
                  </View>

                  {shared.length > 0 ? (
                    <View style={styles.projChips}>
                      {shared.map((n, idx) => (
                        <View key={`${n}-${idx}`} style={styles.projChip}>
                          <Text style={styles.projChipText} numberOfLines={1}>
                            {n}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : isAdmin ? (
                    <Text style={[styles.meta, { marginTop: 10 }]}>Not in any project yet</Text>
                  ) : null}
                </Press>

                {canChange ? (
                  <Press
                    outerStyle={styles.changeOuter}
                    scaleTo={0.92}
                    style={styles.changeBtn}
                    onPress={() => setOpenId(openId === m.id ? '' : m.id)}
                  >
                    <Ionicons name="swap-horizontal" size={16} color={C.ink} />
                    <Text style={styles.changeText}>{openId === m.id ? 'Close' : 'Change role'}</Text>
                  </Press>
                ) : null}

                {canChange && openId === m.id ? (
                  <View style={styles.chips}>
                    {roles.map((r) => (
                      <Press
                        key={r.id}
                        outerStyle={styles.chipOuter}
                        scaleTo={0.9}
                        style={[styles.chip, m.role === r.id && styles.chipOn]}
                        onPress={() => changeRole(m, r.id)}
                      >
                        <Text style={styles.chipText}>{r.name}</Text>
                      </Press>
                    ))}
                  </View>
                ) : null}
              </FadeIn>
            );
          })}

          {sorted.length === 0 ? <Text style={styles.sub}>No members yet.</Text> : null}
        </View>
      </ScrollView>

      <Modal
        visible={!!profileMember}
        transparent
        animationType="fade"
        onRequestClose={() => (zoom ? closeZoom() : setProfileId(''))}
      >
        <View style={{ flex: 1 }}>
          <Pressable style={styles.backdrop} onPress={() => setProfileId('')}>
            {profileMember ? (
              <Pressable style={styles.sheet} onPress={() => {}}>
                {(() => {
                  const pm = profileMember;
                  const pname = pm.fullName || pm.username || 'Unknown';
                  const pOnline = isOnline(presence[pm.id], now);
                  const pShared = sharedProjects[pm.id] ?? [];
                  const pMe = pm.id === uid;
                  return (
                    <>
                      <Pressable disabled={!pm.photo} onPress={() => openZoom(pm.photo, pname)}>
                        <View ref={bigRef} collapsable={false} style={styles.bigWrap}>
                          {pm.photo ? (
                            <Image source={{ uri: pm.photo }} style={styles.bigAvatar} />
                          ) : (
                            <View style={[styles.bigAvatar, styles.avatarEmpty]}>
                              <Text style={styles.bigLetter}>{pname.charAt(0).toUpperCase()}</Text>
                            </View>
                          )}
                          {pOnline ? <View style={styles.bigBadge} /> : null}
                        </View>
                      </Pressable>

                      <Text style={styles.pName} numberOfLines={2}>
                        {pname}
                        {pMe ? ' (you)' : ''}
                      </Text>
                      <Text style={styles.pUser}>@{pm.username || 'user'}</Text>

                      <View style={styles.pTags}>
                        <View style={[styles.roleTag, pm.role === 'admin' && { backgroundColor: C.lavender }]}>
                          <Text style={styles.roleText}>{roleName(pm.role)}</Text>
                        </View>
                        <Text style={[styles.pStatus, pOnline && { color: C.green, fontWeight: '800' }]}>
                          {statusText(pm.id)}
                        </Text>
                      </View>

                      {pShared.length > 0 ? (
                        <View style={[styles.projChips, { justifyContent: 'center' }]}>
                          {pShared.map((n, idx) => (
                            <View key={`${n}-${idx}`} style={styles.projChip}>
                              <Text style={styles.projChipText} numberOfLines={1}>
                                {n}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : null}

                      <View style={styles.pActions}>
                        {!pMe && !isOwner ? (
                          <Button label="Message" onPress={() => openChat(pm.id)} fullWidth />
                        ) : null}
                        <View style={{ height: 10 }} />
                        <Button label="Close" variant="secondary" onPress={() => setProfileId('')} fullWidth />
                      </View>
                    </>
                  );
                })()}
              </Pressable>
            ) : null}
          </Pressable>

          {/* الصورة الكبيرة */}
          <View
            ref={overlayRef}
            collapsable={false}
            pointerEvents={zoom ? 'auto' : 'none'}
            style={StyleSheet.absoluteFill}
          >
            {zoom ? (
              <>
                <Animated.View style={[styles.zoomBackdrop, { opacity: progress }]}>
                  <Pressable style={StyleSheet.absoluteFill} onPress={closeZoom} />
                </Animated.View>
                <Animated.Text style={[styles.zoomName, { opacity: progress }]} numberOfLines={1}>
                  {zoom.name}
                </Animated.Text>
                <Animated.View
                  style={{
                    position: 'absolute',
                    overflow: 'hidden',
                    backgroundColor: C.lavender,
                    left: progress.interpolate({ inputRange: [0, 1], outputRange: [zoom.x, zoomTx] }),
                    top: progress.interpolate({ inputRange: [0, 1], outputRange: [zoom.y, zoomTy] }),
                    width: progress.interpolate({ inputRange: [0, 1], outputRange: [zoom.w, zoomSize] }),
                    height: progress.interpolate({ inputRange: [0, 1], outputRange: [zoom.h, zoomSize] }),
                    borderRadius: progress.interpolate({ inputRange: [0, 1], outputRange: [zoom.w / 2, 18] }),
                  }}
                >
                  <Pressable style={{ flex: 1 }} onPress={closeZoom}>
                    <Image source={{ uri: zoom.uri }} style={{ width: '100%', height: '100%' }} />
                  </Pressable>
                </Animated.View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 56, paddingBottom: 40 },
  wrap: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  sub: { color: C.muted, fontSize: 14, marginBottom: 6 },
  error: { color: C.red, fontSize: 13, marginVertical: 8 },
  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: C.line,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarEmpty: { backgroundColor: C.lavender, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 20, fontWeight: '800', color: C.ink },
  badge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: C.green,
    borderWidth: 2,
    borderColor: C.card,
  },
  name: { fontSize: 16, fontWeight: '800', color: C.ink },
  meta: { fontSize: 12, color: C.muted, marginTop: 2 },
  roleTag: { backgroundColor: '#F0F0EA', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  roleText: { fontSize: 12, fontWeight: '800', color: C.ink },
  projChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  projChip: {
    backgroundColor: '#E8FAF3',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  projChipText: { fontSize: 12, fontWeight: '700', color: '#1B7F4B' },
  changeOuter: { alignSelf: 'flex-start', marginTop: 12 },
  changeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  changeText: { fontSize: 13, fontWeight: '800', color: C.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  chipOuter: { marginRight: 8, marginBottom: 6 },
  chip: { backgroundColor: '#F0F0EA', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  chipOn: { backgroundColor: C.mint },
  chipText: { color: C.ink, fontWeight: '700', fontSize: 13 },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(24,24,27,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: C.card,
    borderRadius: 28,
    padding: 22,
    alignItems: 'center',
  },
  bigWrap: { width: 128, height: 128, marginBottom: 14 },
  bigAvatar: { width: 128, height: 128, borderRadius: 64 },
  bigLetter: { fontSize: 52, fontWeight: '800', color: C.ink },
  bigBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.green,
    borderWidth: 3,
    borderColor: C.card,
  },
  pName: { fontSize: 22, fontWeight: '800', color: C.ink, textAlign: 'center' },
  pUser: { fontSize: 14, color: C.muted, marginTop: 2 },
  pTags: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  pStatus: { fontSize: 13, color: C.muted, fontWeight: '600' },
  pActions: { width: '100%', marginTop: 20 },

  zoomBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.92)' },
  zoomName: {
    position: 'absolute',
    top: 64,
    left: 20,
    right: 20,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
});