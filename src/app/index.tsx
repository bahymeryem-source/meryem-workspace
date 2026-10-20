import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '../auth';
import { FadeIn, PageHeader, Press } from '../components/ui';
import { db } from '../firebase';

const C = {
  bg: '#F7F7F3',
  ink: '#18181B',
  mint: '#7DE2C0',
  lavender: '#B9A7FF',
  card: '#FFFFFF',
  muted: '#8E8E93',
  line: '#ECECE6',
  red: '#D14343',
};

const PR_COLOR: Record<string, string> = {
  low: '#9AA0A6',
  medium: '#F5A524',
  high: '#D14343',
};

const PR_RANK: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

// كيتذكر آخر دخول تعرض فيه الترحيب، باش ما يعاودش يبان بلا سبب
let welcomedSignIn = '';

type ProjectLite = {
  id: string;
  name: string;
  logo: string;
  memberIds: string[];
};

type MissionLite = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  priority: string;
  dueDate: string;
  status: string;
  assigneeId: string;
};

function dueText(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s);
  if (!m) return s;
  return `${+m[3]}/${+m[2]}/${m[1]} ${m[4]}:${m[5]}`;
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
}) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={20} color={C.ink} />
      <Text style={styles.statNumber}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning,';
  if (h < 18) return 'Good afternoon,';
  return 'Good evening,';
}

function WelcomeBanner({
  name,
  isNew,
  onDone,
}: {
  name: string;
  isNew: boolean;
  onDone: () => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(-14)).current;

  useEffect(() => {
    const enter = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slide, {
        toValue: 0,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    enter.start();

    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 450,
        useNativeDriver: true,
      }).start(() => onDone());
    }, 4000);

    return () => {
      clearTimeout(timer);
      enter.stop();
    };
  }, [opacity, slide, onDone]);

  return (
    <Animated.View
      style={[
        styles.welcome,
        { opacity, transform: [{ translateY: slide }] },
      ]}
    >
      <View style={styles.welcomeIcon}>
        <Ionicons name="hand-right-outline" size={20} color={C.ink} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.welcomeTitle} numberOfLines={2}>
          {isNew
            ? 'Welcome to MERYEM WORKSPACE'
            : name
              ? `Welcome back, ${name}`
              : 'Welcome back'}
        </Text>
        <Text style={styles.welcomeSub}>
          {isNew ? 'Glad to have you on the team.' : 'Good to see you again.'}
        </Text>
      </View>
    </Animated.View>
  );
}

function AnimatedGreeting({ name }: { name: string }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(-24)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const entrance = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 750,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(translateX, {
        toValue: 0,
        friction: 8,
        tension: 48,
        useNativeDriver: true,
      }),
    ]);

    const glowAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    entrance.start();
    glowAnimation.start();

    return () => {
      entrance.stop();
      glowAnimation.stop();
    };
  }, [opacity, translateX, glow]);

  return (
    <View style={styles.greetingContainer}>
      <Text style={styles.hello}>{greeting()}</Text>

      <Animated.View
        style={{
          opacity,
          transform: [{ translateX }],
        }}
      >
        <Text style={styles.name}>{name || 'Welcome back'}</Text>

        <View style={styles.greetingAccent}>
          <Animated.View
            style={[
              styles.accentMint,
              {
                opacity: glow.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.55, 1],
                }),
                transform: [
                  {
                    scaleX: glow.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.7, 1],
                    }),
                  },
                ],
              },
            ]}
          />
          <View style={styles.accentLavender} />
        </View>
      </Animated.View>
    </View>
  );
}

export default function Home() {
  const router = useRouter();
  const { user, profile, isAdmin } = useAuth();
  const uid = user?.uid;
  const displayName = profile?.fullName || profile?.username || '';
  const initial = (displayName || '?').charAt(0).toUpperCase();

  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [missionsByProject, setMissionsByProject] = useState<
    Record<string, MissionLite[]>
  >({});
  const [unread, setUnread] = useState(0);
  const [showWelcome, setShowWelcome] = useState(false);

  const lastSignIn = user?.metadata?.lastSignInTime ?? '';
  const createdAt = user?.metadata?.creationTime ?? '';
  const signInKey = lastSignIn || uid || '';
  const isNewAccount = !!lastSignIn && lastSignIn === createdAt;

  useEffect(() => {
    if (!uid || !signInKey) return;
    if (welcomedSignIn !== signInKey) {
      welcomedSignIn = signInKey;
      setShowWelcome(true);
    }
  }, [uid, signInKey]);

  useEffect(() => {
    if (!uid) {
      setUnread(0);
      return;
    }

    return onSnapshot(
      collection(db, 'users', uid, 'notifications'),
      (snap) =>
        setUnread(snap.docs.filter((d) => d.data().read !== true).length),
      () => {},
    );
  }, [uid]);

  useEffect(() => {
    if (!uid) return;

    const base = collection(db, 'projects');
    const q = isAdmin
      ? base
      : query(base, where('memberIds', 'array-contains', uid));

    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => {
          const x = d.data();
          return {
            id: d.id,
            name: (x.name ?? '') as string,
            logo: (x.logo ?? '') as string,
            memberIds: (Array.isArray(x.memberIds) ? x.memberIds : []) as string[],
          };
        });

        rows.sort((a, b) => a.name.localeCompare(b.name));
        setProjects(rows);
      },
      () => {},
    );
  }, [uid, isAdmin]);

  const projectKey = projects.map((p) => p.id).join(',');

  useEffect(() => {
    if (projects.length === 0) {
      setMissionsByProject({});
      return;
    }

    const unsubs = projects.map((p) =>
      onSnapshot(
        collection(db, 'projects', p.id, 'missions'),
        (snap) => {
          const rows = snap.docs.map((d) => {
            const x = d.data();
            return {
              id: d.id,
              projectId: p.id,
              projectName: p.name,
              title: x.title ?? '',
              priority: x.priority ?? 'medium',
              dueDate: x.dueDate ?? '',
              status: x.status ?? 'todo',
              assigneeId: x.assigneeId ?? '',
            } as MissionLite;
          });

          setMissionsByProject((prev) => ({ ...prev, [p.id]: rows }));
        },
        () => {},
      ),
    );

    return () => unsubs.forEach((u) => u());
  }, [projectKey]);

  const mine = useMemo(() => {
    const all = Object.values(missionsByProject).flat();
    return all.filter((m) => m.assigneeId === uid);
  }, [missionsByProject, uid]);

  const open = mine.filter((m) => m.status !== 'done');
  const done = mine.filter((m) => m.status === 'done');

  const dueSoon = open.filter((m) => {
    if (!m.dueDate) return false;
    const t = new Date(m.dueDate).getTime();
    if (isNaN(t)) return false;
    const diff = (t - Date.now()) / 86400000;
    return diff <= 7;
  });

  const priority = [...open]
    .sort((a, b) => (PR_RANK[a.priority] ?? 1) - (PR_RANK[b.priority] ?? 1))
    .slice(0, 5);

  const pct = mine.length
    ? Math.round((done.length / mine.length) * 100)
    : 0;

  const headerRight = (
    <View style={styles.headerRight}>
      <Press
        onPress={() => router.push('/notifications')}
        style={styles.bell}
        scaleTo={0.92}
      >
        <Ionicons name="notifications-outline" size={22} color={C.ink} />
        {unread > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {unread > 9 ? '9+' : unread}
            </Text>
          </View>
        ) : null}
      </Press>

      <Press onPress={() => router.push('/profile')} scaleTo={0.92}>
        {profile?.photo ? (
          <Image source={{ uri: profile.photo }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
        )}
      </Press>
    </View>
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
    >
      <View style={styles.wrap}>
        <PageHeader title="Home" right={headerRight} />

        {showWelcome ? (
          <WelcomeBanner
            name={displayName}
            isNew={isNewAccount}
            onDone={() => setShowWelcome(false)}
          />
        ) : null}

        <View style={styles.greetBlock}>
          <AnimatedGreeting name={displayName} />
        </View>

        <FadeIn delay={180}>
          <View style={styles.focus}>
            <Text style={styles.focusTag}>YOUR WORKSPACE</Text>
            <Text style={styles.focusTitle}>Make today count.</Text>
            <Text style={styles.focusSub}>
              {mine.length === 0
                ? 'No missions assigned to you yet.'
                : `${done.length} of ${mine.length} missions done.`}
            </Text>
            <Text style={styles.focusLabel}>Daily progress · {pct}%</Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${pct}%` }]} />
            </View>
          </View>
        </FadeIn>

        <FadeIn delay={240}>
          <Text style={styles.section}>Overview</Text>
          <View style={styles.row}>
            <StatCard
              icon="grid-outline"
              label="Projects"
              value={projects.length}
            />
            <StatCard
              icon="checkmark-circle-outline"
              label="Missions"
              value={open.length}
            />
            <StatCard
              icon="time-outline"
              label="Due soon"
              value={dueSoon.length}
            />
          </View>
        </FadeIn>

        <FadeIn delay={300}>
          <Text style={styles.section}>Projects</Text>
          {projects.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons
                name="folder-open-outline"
                size={28}
                color={C.muted}
              />
              <Text style={styles.emptyTitle}>No projects yet</Text>
              <Text style={styles.emptyText}>
                Projects you are part of will appear here.
              </Text>
            </View>
          ) : (
            projects.map((p) => {
              const count = (missionsByProject[p.id] ?? []).length;

              return (
                <Press
                  key={p.id}
                  style={styles.projCard}
                  onPress={() => router.push('/missions')}
                >
                  {p.logo ? (
                    <Image source={{ uri: p.logo }} style={styles.projLogo} />
                  ) : (
                    <View
                      style={[styles.projLogo, styles.projLogoEmpty]}
                    >
                      <Text style={styles.projLetter}>
                        {(p.name || '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}

                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.projName} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text style={styles.projMeta}>
                      {p.memberIds.length} members · {count} missions
                    </Text>
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={C.muted}
                  />
                </Press>
              );
            })
          )}
        </FadeIn>

        <FadeIn delay={360}>
          <Text style={styles.section}>Priority missions</Text>
          {priority.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons
                name="checkmark-done-outline"
                size={28}
                color={C.muted}
              />
              <Text style={styles.emptyTitle}>No missions yet</Text>
              <Text style={styles.emptyText}>
                Your assigned missions will appear here.
              </Text>
            </View>
          ) : (
            priority.map((m) => (
              <Press
                key={`${m.projectId}-${m.id}`}
                style={styles.missionCard}
                onPress={() => router.push('/missions')}
              >
                <View
                  style={[
                    styles.prDot,
                    {
                      backgroundColor: PR_COLOR[m.priority] ?? C.muted,
                    },
                  ]}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.missionTitle} numberOfLines={1}>
                    {m.title}
                  </Text>
                  <Text style={styles.projMeta} numberOfLines={1}>
                    {m.projectName}
                    {m.dueDate ? ` · Due ${dueText(m.dueDate)}` : ''}
                  </Text>
                </View>
              </Press>
            ))
          )}
        </FadeIn>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingTop: 56, paddingBottom: 40 },
  wrap: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  greetBlock: { marginBottom: 16 },
  greetingContainer: { overflow: 'hidden' },
  welcome: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F7EF',
    borderWidth: 1,
    borderColor: C.mint,
    borderRadius: 18,
    padding: 14,
    marginTop: 12,
  },
  welcomeIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeTitle: { fontSize: 15, fontWeight: '800', color: C.ink },
  welcomeSub: { fontSize: 12, color: '#3D6B5A', marginTop: 2 },
  bell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.red,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  hello: { fontSize: 15, color: C.muted },
  name: {
    fontSize: 30,
    fontWeight: '800',
    color: C.ink,
    letterSpacing: -0.6,
  },
  greetingAccent: {
    flexDirection: 'row',
    gap: 5,
    marginTop: 8,
    width: 64,
    height: 4,
  },
  accentMint: {
    width: 38,
    height: 4,
    borderRadius: 4,
    backgroundColor: C.mint,
  },
  accentLavender: {
    flex: 1,
    height: 4,
    borderRadius: 4,
    backgroundColor: C.lavender,
  },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarPlaceholder: {
    backgroundColor: C.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 20, fontWeight: '700', color: C.ink },
  focus: {
    backgroundColor: C.ink,
    borderRadius: 24,
    padding: 20,
    marginTop: 18,
  },
  focusTag: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: C.mint,
  },
  focusTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 8,
  },
  focusSub: { fontSize: 13, color: '#B5B5BA', marginTop: 4 },
  focusLabel: {
    fontSize: 12,
    color: '#B5B5BA',
    marginTop: 18,
    marginBottom: 8,
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2B2B30',
    overflow: 'hidden',
  },
  fill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: C.mint,
  },
  section: {
    fontSize: 18,
    fontWeight: '800',
    color: C.ink,
    marginTop: 26,
    marginBottom: 12,
  },
  row: { flexDirection: 'row', gap: 10 },
  stat: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: C.line,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '800',
    color: C.ink,
    marginTop: 8,
  },
  statLabel: { fontSize: 12, color: C.muted, marginTop: 2 },
  empty: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.line,
    borderStyle: 'dashed',
    padding: 22,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.ink,
    marginTop: 8,
  },
  emptyText: {
    fontSize: 13,
    color: C.muted,
    marginTop: 4,
    textAlign: 'center',
  },
  projCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.line,
  },
  projLogo: { width: 46, height: 46, borderRadius: 13 },
  projLogoEmpty: {
    backgroundColor: C.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  projLetter: { fontSize: 20, fontWeight: '800', color: C.ink },
  projName: { fontSize: 16, fontWeight: '800', color: C.ink },
  projMeta: { fontSize: 12, color: C.muted, marginTop: 2 },
  missionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.line,
  },
  prDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  missionTitle: { fontSize: 15, fontWeight: '800', color: C.ink },
});