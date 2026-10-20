import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { Tabs, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../auth';
import { BadgeProvider, useBadges } from '../badges';
import AuthScreen from '../components/auth-screen';
import PendingScreen from '../components/pending-screen';
import AnimatedSplash from '../components/splash';
import UpdateModal from '../components/update-modal';
import { usePresenceHeartbeat } from '../presence';

function badgeValue(n: number) {
  if (n <= 0) return undefined;
  return n >= 50 ? '50+' : n;
}

function NotificationRouter({ ready }: { ready: boolean }) {
  const router = useRouter();
  const lastResponse = Notifications.useLastNotificationResponse();
  const handledId = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !lastResponse) return;

    const id = lastResponse.notification.request.identifier;
    if (handledId.current === id) return;
    handledId.current = id;

    const data = lastResponse.notification.request.content.data as
      | { screen?: string }
      | undefined;

    if (data?.screen === 'chat') {
      router.push('/chat');
    } else if (data?.screen === 'missions') {
      router.push('/missions');
    } else if (data?.screen === 'project') {
      router.push('/project');
    } else {
      router.push('/notifications');
    }
  }, [ready, lastResponse, router]);

  return null;
}

function Gate() {
  const { user, profile, loading, can } = useAuth();
  const { chat, missions, admin } = useBadges();
  const [splashDone, setSplashDone] = useState(false);
  const insets = useSafeAreaInsets();
  usePresenceHeartbeat();
  const showAdmin = can('viewRoles') || can('manageRoles') || can('approveUsers');
  const appReady = !loading && !!user && profile?.status === 'active';

  let cover = null;
  if (loading) {
    cover = (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#18181B" />
      </View>
    );
  } else if (!user) {
    cover = <AuthScreen />;
  } else if (!profile || profile.status !== 'active') {
    cover = <PendingScreen />;
  }

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#18181B',
          tabBarInactiveTintColor: '#8E8E93',
          tabBarActiveBackgroundColor: '#7DE2C0',
          tabBarStyle: {
            backgroundColor: '#FFFFFF',
            borderTopWidth: 0,
            height: 64 + insets.bottom,
            paddingBottom: 6 + insets.bottom,
          },
          tabBarItemStyle: { borderRadius: 16, marginHorizontal: 4, marginTop: 6 },
          tabBarBadgeStyle: {
            backgroundColor: '#D14343',
            color: '#FFFFFF',
            fontSize: 11,
            fontWeight: '800',
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="project"
          options={{
            title: 'Projects',
            tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="missions"
          options={{
            title: 'Missions',
            tabBarBadge: badgeValue(missions),
            tabBarIcon: ({ color, size }) => <Ionicons name="checkmark-circle-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            title: 'Chat',
            tabBarBadge: badgeValue(chat),
            tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="team"
          options={{
            title: 'Team',
            tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="admin"
          options={{
            title: 'Admin',
            href: showAdmin ? undefined : null,
            tabBarBadge: badgeValue(admin),
            tabBarIcon: ({ color, size }) => <Ionicons name="shield-checkmark-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen name="roles" options={{ href: null }} />
        <Tabs.Screen name="approvals" options={{ href: null }} />
        <Tabs.Screen name="explore" options={{ href: null }} />
        <Tabs.Screen name="profile" options={{ href: null }} />
        <Tabs.Screen name="notifications" options={{ href: null }} />
      </Tabs>
      {cover && <View style={StyleSheet.absoluteFill}>{cover}</View>}
      {!splashDone && <AnimatedSplash ready={!loading} onDone={() => setSplashDone(true)} />}
      <UpdateModal />
      {Platform.OS !== 'web' && <NotificationRouter ready={appReady} />}
    </View>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <BadgeProvider>
        <Gate />
      </BadgeProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: '#F7F7F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
});