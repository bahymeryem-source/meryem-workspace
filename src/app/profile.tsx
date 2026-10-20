import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import { deleteField, doc, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../auth';
import { Button } from '../components/ui';
import { db } from '../firebase';
import {
  isPushEnabled,
  setPushEnabled,
  unregisterPushNotifications,
} from '../push-notifications';
import {
  getSavedAccounts,
  removeSavedAccount,
  updateSavedProfile,
} from '../saved-accounts';

const C = {
  bg: '#F7F7F3',
  ink: '#18181B',
  mint: '#7DE2C0',
  lavender: '#B9A7FF',
  muted: '#777780',
  red: '#C0392B',
  white: '#FFFFFF',
  green: '#1E8E6A',
};

function message(text: string) {
  if (Platform.OS === 'web') {
    window.alert(text);
  } else {
    Alert.alert('MERYEM WORKSPACE', text);
  }
}

export default function ProfileScreen() {
  const { user, profile, logout } = useAuth();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const [showLogout, setShowLogout] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);

  const [pushOn, setPushOn] = useState(true);
  const [pushBusy, setPushBusy] = useState(false);

  const initial = (
    profile?.fullName || profile?.username || '?'
  ).charAt(0).toUpperCase();

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    isPushEnabled().then((value) => {
      if (!cancelled) setPushOn(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function togglePush(value: boolean) {
    if (pushBusy) return;
    setError('');
    setPushBusy(true);
    setPushOn(value);

    try {
      const ok = await setPushEnabled(value);
      if (value && !ok) {
        setPushOn(false);
        await setPushEnabled(false);
        message(
          'Notifications could not be turned on. Please allow notifications for this app in your phone settings.',
        );
      }
    } catch (e: any) {
      setPushOn(!value);
      setError(e?.message ?? 'Could not change the notification setting.');
    } finally {
      setPushBusy(false);
    }
  }

  async function pickPhoto() {
    if (!user || busy) return;
    setError('');

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });

      if (result.canceled) return;

      setBusy(true);

      const small = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 256 } }],
        {
          compress: 0.6,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        },
      );

      const photo = `data:image/jpeg;base64,${small.base64}`;

      await updateDoc(doc(db, 'users', user.uid), { photo });
    } catch (e: any) {
      setError(e?.message ?? 'Could not change your photo.');
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto() {
    if (!user || busy) return;
    setError('');
    setBusy(true);

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        photo: deleteField(),
      });
    } catch (e: any) {
      setError(e?.message ?? 'Could not remove your photo.');
    } finally {
      setBusy(false);
    }
  }

  async function changePassword() {
    if (!user || busy) return;

    setError('');

    if (!currentPassword) {
      setError('Enter your current password.');
      return;
    }

    if (newPassword.length < 6) {
      setError('The new password must contain at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }

    if (currentPassword === newPassword) {
      setError('Choose a password different from your current one.');
      return;
    }

    if (!user.email) {
      setError('This account has no email address.');
      return;
    }

    setBusy(true);

    try {
      const credential = EmailAuthProvider.credential(
        user.email,
        currentPassword,
      );

      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordForm(false);

      message('Your password has been changed successfully.');
    } catch (e: any) {
      if (
        e?.code === 'auth/wrong-password' ||
        e?.code === 'auth/invalid-credential'
      ) {
        setError('Your current password is incorrect.');
      } else if (e?.code === 'auth/weak-password') {
        setError('Choose a stronger password with at least 6 characters.');
      } else if (e?.code === 'auth/requires-recent-login') {
        setError('Please sign in again, then try changing your password.');
      } else {
        setError(e?.message ?? 'Could not change the password.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function openLogout() {
    if (!user || busy) return;
    setError('');

    try {
      const list = await getSavedAccounts();
      const acc = list.find((a) => a.uid === user.uid);
      setPasswordSaved(!!acc?.remember);
    } catch {
      setPasswordSaved(false);
    }

    setShowLogout(true);
  }

  async function keepAndLogout() {
    if (!user || busy) return;
    setShowLogout(false);
    setBusy(true);

    try {
      // Refresh the saved name and photo. The saved password is not touched.
      await updateSavedProfile(user.uid, {
        fullName: profile?.fullName,
        username: profile?.username,
        photo: profile?.photo ?? '',
      });
    } catch {
      // Not critical: sign out anyway.
    }

    if (Platform.OS !== 'web') {
      await unregisterPushNotifications();
    }

    try {
      await logout();
    } catch (e: any) {
      setError(e?.message ?? 'Could not sign out.');
    } finally {
      setBusy(false);
    }
  }

  async function removeAndLogout() {
    if (!user || busy) return;
    setShowLogout(false);
    setBusy(true);

    try {
      await removeSavedAccount(user.uid);
    } catch {
      // Not critical: sign out anyway.
    }

    if (Platform.OS !== 'web') {
      await unregisterPushNotifications();
    }

    try {
      await logout();
    } catch (e: any) {
      setError(e?.message ?? 'Could not sign out.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.avatarWrap}>
        {profile?.photo ? (
          <Image
            source={{ uri: profile.photo }}
            style={styles.avatar}
          />
        ) : (
          <View style={[styles.avatar, styles.placeholder]}>
            <Text style={styles.initial}>{initial}</Text>
          </View>
        )}

        {busy ? (
          <View style={styles.overlay}>
            <ActivityIndicator color={C.ink} />
          </View>
        ) : null}
      </View>

      <Text style={styles.name}>
        {profile?.fullName || 'User'}
      </Text>

      <Text style={styles.sub}>
        @{profile?.username || 'username'} · {profile?.role || 'member'}
      </Text>

      <Text style={styles.email}>
        {user?.email || profile?.email || ''}
      </Text>

      <Pressable
        style={styles.primaryButton}
        onPress={pickPhoto}
        disabled={busy}
      >
        <Text style={styles.primaryText}>
          {profile?.photo ? 'Change photo' : 'Add photo'}
        </Text>
      </Pressable>

      {profile?.photo ? (
        <Pressable
          style={styles.textButton}
          onPress={removePhoto}
          disabled={busy}
        >
          <Text style={styles.removeText}>Remove photo</Text>
        </Pressable>
      ) : null}

      <View style={styles.divider} />

      <Pressable
        style={styles.option}
        onPress={() => {
          setError('');
          setShowPasswordForm((value) => !value);
        }}
      >
        <Text style={styles.optionTitle}>Change password</Text>
        <Text style={styles.optionSubtitle}>
          Update your account password
        </Text>
      </Pressable>

      {showPasswordForm ? (
        <View style={styles.passwordCard}>
          <Text style={styles.label}>Current password</Text>
          <TextInput
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry={!showCurrent}
            autoCapitalize="none"
            placeholder="Current password"
            placeholderTextColor={C.muted}
            style={styles.input}
          />

          <Pressable onPress={() => setShowCurrent((value) => !value)}>
            <Text style={styles.toggleText}>
              {showCurrent ? 'Hide password' : 'Show password'}
            </Text>
          </Pressable>

          <Text style={styles.label}>New password</Text>
          <TextInput
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry={!showNew}
            autoCapitalize="none"
            placeholder="At least 6 characters"
            placeholderTextColor={C.muted}
            style={styles.input}
          />

          <Text style={styles.label}>Confirm new password</Text>
          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showNew}
            autoCapitalize="none"
            placeholder="Repeat new password"
            placeholderTextColor={C.muted}
            style={styles.input}
          />

          <Pressable onPress={() => setShowNew((value) => !value)}>
            <Text style={styles.toggleText}>
              {showNew ? 'Hide password' : 'Show passwords'}
            </Text>
          </Pressable>

          <Pressable
            style={styles.primaryButton}
            onPress={changePassword}
            disabled={busy}
          >
            <Text style={styles.primaryText}>
              {busy ? 'Please wait...' : 'Update password'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {Platform.OS !== 'web' ? (
        <View style={[styles.option, styles.switchRow]}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.optionTitle}>Notifications</Text>
            <Text style={styles.optionSubtitle}>
              Get alerts for new messages and missions
            </Text>
          </View>
          <Switch
            value={pushOn}
            onValueChange={togglePush}
            disabled={pushBusy}
            trackColor={{ false: '#D4D4D8', true: C.mint }}
            thumbColor={C.white}
          />
        </View>
      ) : null}

      <Pressable
        style={styles.logoutButton}
        onPress={() => void openLogout()}
        disabled={busy}
      >
        <Text style={styles.logoutText}>
          {busy ? 'Please wait...' : 'Log out'}
        </Text>
      </Pressable>

      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : null}

      <Modal
        visible={showLogout}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogout(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowLogout(false)}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalIcon}>
              <Ionicons name="log-out-outline" size={26} color={C.ink} />
            </View>
            <Text style={styles.modalTitle}>Log out</Text>
            <Text style={styles.modalSub}>
              {passwordSaved
                ? 'Password saved on this device. You can sign in again without typing it.'
                : 'Password required. You will need to type it when you sign in again.'}
            </Text>

            <Button
              label="Keep account"
              onPress={() => void keepAndLogout()}
              fullWidth
            />
            <View style={{ height: 10 }} />
            <Pressable
              style={styles.dangerButton}
              onPress={() => void removeAndLogout()}
            >
              <Text style={styles.dangerText}>Remove from this device</Text>
            </Pressable>
            <View style={{ height: 10 }} />
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => setShowLogout(false)}
              fullWidth
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    paddingTop: 36,
    paddingBottom: 32,
    paddingHorizontal: 20,
  },
  avatarWrap: {
    width: 112,
    height: 112,
    borderRadius: 56,
    overflow: 'hidden',
    marginBottom: 14,
  },
  avatar: {
    width: 112,
    height: 112,
    borderRadius: 56,
  },
  placeholder: {
    backgroundColor: C.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontSize: 44,
    fontWeight: '800',
    color: C.ink,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255,255,255,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: 21,
    fontWeight: '800',
    color: C.ink,
  },
  sub: {
    fontSize: 14,
    color: C.muted,
    marginTop: 5,
  },
  email: {
    fontSize: 13,
    color: C.muted,
    marginTop: 5,
    marginBottom: 18,
  },
  primaryButton: {
    backgroundColor: C.mint,
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderRadius: 13,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryText: {
    color: C.ink,
    fontWeight: '800',
  },
  textButton: {
    padding: 12,
  },
  removeText: {
    color: C.red,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: '#E7E7E1',
    width: '100%',
    maxWidth: 420,
    marginVertical: 20,
  },
  option: {
    width: '100%',
    maxWidth: 420,
    padding: 16,
    borderRadius: 14,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: '#ECECE6',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  optionTitle: {
    color: C.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  optionSubtitle: {
    color: C.muted,
    fontSize: 12,
    marginTop: 5,
  },
  passwordCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: C.white,
    padding: 16,
    borderRadius: 14,
    marginTop: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: C.ink,
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#E3E3DC',
    borderRadius: 12,
    paddingHorizontal: 12,
    color: C.ink,
    backgroundColor: C.bg,
  },
  toggleText: {
    color: '#5C4CA1',
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 4,
  },
  logoutButton: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: C.ink,
    borderRadius: 13,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  logoutText: {
    color: C.white,
    fontWeight: '800',
  },
  error: {
    color: C.red,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 14,
    maxWidth: 420,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(24,24,27,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: C.white,
    borderRadius: 28,
    padding: 22,
    alignItems: 'center',
  },
  modalIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.lavender,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: C.ink,
    textAlign: 'center',
  },
  modalSub: {
    fontSize: 13,
    color: C.muted,
    marginTop: 8,
    marginBottom: 18,
    textAlign: 'center',
    lineHeight: 18,
  },
  dangerButton: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    backgroundColor: '#FDECEC',
    borderWidth: 1,
    borderColor: '#F5C2C2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerText: {
    color: '#A32626',
    fontWeight: '800',
    fontSize: 14,
  },
});