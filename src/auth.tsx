import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { auth, db } from './firebase';

export type Profile = {
  fullName: string;
  username: string;
  email: string;
  role: string;
  status: 'pending' | 'active' | 'rejected' | 'suspended';
  photo?: string; // data:image/jpeg;base64,...
};

type AuthState = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  can: (permission: string) => boolean;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  user: null,
  profile: null,
  loading: true,
  isOwner: false,
  isAdmin: false,
  can: () => false,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [rolePerms, setRolePerms] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let stop: () => void = () => {};

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      stop();
      stop = () => {};
      setUser(u);

      if (!u) {
        setProfile(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      stop = onSnapshot(
        doc(db, 'users', u.uid),
        (snap) => {
          setProfile(snap.exists() ? (snap.data() as Profile) : null);
          setLoading(false);
        },
        () => {
          setProfile(null);
          setLoading(false);
        },
      );
    });

    return () => {
      unsubAuth();
      stop();
    };
  }, []);

  const roleId = profile?.role;
  const isActive = profile?.status === 'active';
  const isOwner = isActive && roleId === 'owner';
  const isAdmin = isActive && (roleId === 'admin' || roleId === 'owner');

  useEffect(() => {
    if (!roleId || !isActive || roleId === 'admin' || roleId === 'owner') {
      setRolePerms({});
      return;
    }
    return onSnapshot(
      doc(db, 'roles', roleId),
      (snap) => {
        const data = snap.exists() ? snap.data() : null;
        setRolePerms((data?.permissions ?? {}) as Record<string, boolean>);
      },
      () => setRolePerms({}),
    );
  }, [roleId, isActive]);

  const uid = user?.uid;

  useEffect(() => {
    if (!uid || !isActive || Platform.OS === 'web') return;

    let cancelled = false;

    (async () => {
      try {
        const { registerPushNotifications } = await import('./push-notifications');
        if (cancelled) return;
        await registerPushNotifications();
      } catch (error) {
        console.log('Push setup skipped:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uid, isActive]);

  const can = (permission: string) => isAdmin || (isActive && rolePerms[permission] === true);

  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ user, profile, loading, isOwner, isAdmin, can, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);