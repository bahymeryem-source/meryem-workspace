import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { auth, db } from '../firebase';
import {
  canRememberPassword,
  getSavedAccounts,
  getSavedPassword,
  removeSavedAccount,
  saveAccount,
  type SavedAccount,
} from '../saved-accounts';
import Logo from './logo';
import { Button } from './ui';

const C = {
  bg: '#F7F7F3',
  ink: '#18181B',
  mint: '#7DE2C0',
  lavender: '#B9A7FF',
  card: '#FFFFFF',
  muted: '#8E8E93',
  line: '#ECECE6',
  red: '#D64545',
  green: '#1E8E6A',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function friendlyError(code: string) {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'This email is already registered.';
    case 'auth/invalid-email':
      return 'Invalid email address.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Wrong email or password.';
    case 'auth/network-request-failed':
      return 'No internet connection.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Try again later.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

type FieldProps = TextInputProps & {
  label: string;
  error?: string;
  right?: ReactNode;
};

function Field({ label, error, right, ...props }: FieldProps) {
  const [focus, setFocus] = useState(false);

  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.inputWrap,
          focus && styles.inputFocus,
          !!error && styles.inputError,
        ]}
      >
        <TextInput
          {...props}
          accessibilityLabel={label}
          placeholderTextColor={C.muted}
          style={[
            styles.input,
            Platform.select({ web: { outlineStyle: 'none' } as any }),
          ]}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
        />
        {right}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export default function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [photo, setPhoto] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [rememberPassword, setRememberPassword] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [removeTarget, setRemoveTarget] = useState<SavedAccount | null>(null);

  const isRegister = mode === 'register';
  const initial = (fullName.trim() || '?').charAt(0).toUpperCase();
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 450,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [fade]);

  async function refreshSavedAccounts() {
    setLoadingSaved(true);
    try {
      const accounts = await getSavedAccounts();
      setSavedAccounts(accounts);
    } finally {
      setLoadingSaved(false);
    }
  }

  useEffect(() => {
    void refreshSavedAccounts();
  }, []);

  function clearField(key: string) {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setError('');
  }

  function validate() {
    const e: Record<string, string> = {};

    if (isRegister) {
      if (!fullName.trim()) e.fullName = 'Enter your full name.';
      const u = username.trim();
      if (!u) e.username = 'Choose a username.';
      else if (u.length < 3 || /\s/.test(u)) {
        e.username = 'At least 3 characters, no spaces.';
      }
    }

    const mail = email.trim();
    if (!mail) e.email = 'Enter your email.';
    else if (!EMAIL_RE.test(mail)) e.email = 'Enter a valid email address.';

    if (!password) e.password = 'Enter your password.';
    else if (isRegister && password.length < 6) {
      e.password = 'At least 6 characters.';
    }

    if (isRegister && password && confirm !== password) {
      e.confirm = 'Passwords do not match.';
    }

    return e;
  }

  async function pickPhoto() {
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

      setPhoto(`data:image/jpeg;base64,${small.base64}`);
    } catch {
      setError('Could not load the image.');
    } finally {
      setBusy(false);
    }
  }

  async function signInSaved(account: SavedAccount) {
    if (busy) return;

    setError('');
    setInfo('');
    setEmail(account.email);
    setSelectedAccount(account.uid);

    const storedPassword = await getSavedPassword(account.uid);

    if (storedPassword) {
      setPassword(storedPassword);
      setRememberPassword(true);
      setInfo('Saved password loaded. Tap Sign in to continue.');
    } else {
      setPassword('');
      setRememberPassword(false);
      setInfo('Enter this account password to sign in.');
    }
  }

  function deleteSaved(account: SavedAccount) {
    setRemoveTarget(account);
  }

  async function confirmRemove() {
    const account = removeTarget;
    if (!account) return;
    setRemoveTarget(null);

    try {
      await removeSavedAccount(account.uid);
      await refreshSavedAccounts();

      if (selectedAccount === account.uid) {
        setSelectedAccount(null);
        setPassword('');
        setRememberPassword(false);
      }
      setInfo('Account removed from this device.');
    } catch {
      setError('Could not remove the account.');
    }
  }

  async function submit() {
    if (busy) return;

    setError('');
    setInfo('');

    const problems = validate();
    setFieldErrors(problems);
    if (Object.keys(problems).length > 0) return;

    const mail = email.trim().toLowerCase();
    setBusy(true);

    try {
      if (mode === 'login') {
        const cred = await signInWithEmailAndPassword(auth, mail, password);

        try {
          const accountData = {
            uid: cred.user.uid,
            email: mail,
            fullName: cred.user.displayName || mail.split('@')[0],
            username: mail.split('@')[0],
            photo: '',
          };

          const saved = await getSavedAccounts();
          const existing = saved.find((a) => a.uid === cred.user.uid);

          await saveAccount(
            {
              ...accountData,
              fullName: existing?.fullName || accountData.fullName,
              username: existing?.username || accountData.username,
              photo: existing?.photo || '',
            },
            rememberPassword && canRememberPassword ? password : undefined,
          );

          await refreshSavedAccounts();
        } catch {
          // Authentication remains successful even if saving is unavailable.
        }
      } else {
        const cred = await createUserWithEmailAndPassword(auth, mail, password);

        await setDoc(doc(db, 'users', cred.user.uid), {
          fullName: fullName.trim(),
          username: username.trim().toLowerCase(),
          email: mail,
          role: 'member',
          status: 'pending',
          createdAt: serverTimestamp(),
          ...(photo ? { photo } : {}),
        });
      }
    } catch (e: any) {
      const code = e?.code ?? '';

      if (code === 'auth/email-already-in-use' || code === 'auth/invalid-email') {
        setFieldErrors({ email: friendlyError(code) });
      } else if (code === 'auth/weak-password') {
        setFieldErrors({ password: friendlyError(code) });
      } else {
        setError(friendlyError(code));
      }
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (busy) return;

    setError('');
    setInfo('');

    const mail = email.trim().toLowerCase();
    if (!mail || !EMAIL_RE.test(mail)) {
      setFieldErrors({
        email: 'Type your email here first, then tap "Forgot password?".',
      });
      return;
    }

    setFieldErrors({});
    setBusy(true);

    try {
      await sendPasswordResetEmail(auth, mail);
      setInfo('If this email has an account, a reset link was sent. Check your inbox and spam folder.');
    } catch (e: any) {
      setError(friendlyError(e?.code ?? ''));
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next: 'login' | 'register') {
    if (next === mode) return;
    setError('');
    setInfo('');
    setFieldErrors({});
    setMode(next);
    setSelectedAccount(null);
    setPassword('');
    setRememberPassword(false);
  }

  const eye = (
    <Pressable
      onPress={() => setShowPw((v) => !v)}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={showPw ? 'Hide password' : 'Show password'}
    >
      <Ionicons
        name={showPw ? 'eye-off-outline' : 'eye-outline'}
        size={20}
        color={C.muted}
      />
    </Pressable>
  );

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View pointerEvents="none" style={[styles.blob, styles.blobMint]} />
      <View pointerEvents="none" style={[styles.blob, styles.blobLavender]} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Animated.View
          style={[
            styles.wrap,
            {
              opacity: fade,
              transform: [
                { translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
              ],
            },
          ]}
        >
          <View style={styles.brand}>
            <Logo size={46} />
            <Text style={styles.tagline}>Your Space. Your Progress.</Text>
          </View>

          {!isRegister && savedAccounts.length > 0 && (
            <View style={styles.savedCard}>
              <Text style={styles.savedTitle}>Saved accounts</Text>
              {savedAccounts.map((account) => (
                <View key={account.uid} style={styles.savedRow}>
                  <Pressable
                    style={styles.savedMain}
                    onPress={() => void signInSaved(account)}
                  >
                    {account.photo ? (
                      <Image source={{ uri: account.photo }} style={styles.savedAvatar} />
                    ) : (
                      <View style={[styles.savedAvatar, styles.savedPlaceholder]}>
                        <Text style={styles.savedInitial}>
                          {(account.fullName || account.username || account.email || '?')
                            .charAt(0)
                            .toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.savedName} numberOfLines={1}>
                        {account.fullName || account.username || 'Account'}
                      </Text>
                      <Text style={styles.savedEmail} numberOfLines={1}>
                        {account.email}
                      </Text>
                      <Text style={styles.savedHint}>
                        {account.remember && canRememberPassword
                          ? 'Password saved on this device'
                          : 'Password required'}
                      </Text>
                    </View>
                  </Pressable>

                  <Pressable
                    onPress={() => deleteSaved(account)}
                    style={styles.removeSaved}
                    accessibilityLabel={`Remove ${account.email}`}
                  >
                    <Ionicons name="close-circle-outline" size={23} color={C.red} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          <View style={styles.card}>
            <View style={styles.segment}>
              <Pressable
                style={[styles.segBtn, !isRegister && styles.segOn]}
                onPress={() => switchMode('login')}
              >
                <Text style={[styles.segText, !isRegister && styles.segTextOn]}>
                  Sign in
                </Text>
              </Pressable>
              <Pressable
                style={[styles.segBtn, isRegister && styles.segOn]}
                onPress={() => switchMode('register')}
              >
                <Text style={[styles.segText, isRegister && styles.segTextOn]}>
                  Register
                </Text>
              </Pressable>
            </View>

            <Text style={styles.title}>
              {isRegister ? 'Create account' : 'Welcome back'}
            </Text>
            <Text style={styles.sub}>
              {isRegister
                ? 'Your account will be reviewed by the admin before you can enter.'
                : 'Sign in to continue.'}
            </Text>

            {isRegister && (
              <>
                <View style={styles.photoRow}>
                  <Pressable onPress={pickPhoto} disabled={busy}>
                    {photo ? (
                      <Image source={{ uri: photo }} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatar, styles.avatarEmpty]}>
                        <Text style={styles.avatarLetter}>{initial}</Text>
                      </View>
                    )}
                  </Pressable>
                  <View style={{ marginLeft: 16, flex: 1 }}>
                    <Pressable onPress={pickPhoto} disabled={busy}>
                      <Text style={styles.photoBtn}>
                        {photo ? 'Change photo' : 'Add photo (optional)'}
                      </Text>
                    </Pressable>
                    {photo ? (
                      <Pressable onPress={() => setPhoto('')}>
                        <Text style={styles.photoRemove}>Remove</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                <Field
                  label="Full name"
                  placeholder="Your full name"
                  value={fullName}
                  onChangeText={(v) => {
                    setFullName(v);
                    clearField('fullName');
                  }}
                  error={fieldErrors.fullName}
                  autoComplete="name"
                />

                <Field
                  label="Username"
                  placeholder="Choose a username"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={username}
                  onChangeText={(v) => {
                    setUsername(v);
                    clearField('username');
                  }}
                  error={fieldErrors.username}
                />
              </>
            )}

            <Field
              label="Email"
              placeholder="you@example.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                clearField('email');
              }}
              error={fieldErrors.email}
            />

            <Field
              label="Password"
              placeholder="Your password"
              secureTextEntry={!showPw}
              autoCapitalize="none"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                clearField('password');
              }}
              error={fieldErrors.password}
              right={eye}
              returnKeyType={isRegister ? 'next' : 'go'}
              onSubmitEditing={isRegister ? undefined : submit}
            />

            {!isRegister && canRememberPassword && (
              <Pressable
                style={styles.rememberRow}
                onPress={() => setRememberPassword((v) => !v)}
              >
                <Ionicons
                  name={rememberPassword ? 'checkbox' : 'square-outline'}
                  size={21}
                  color={rememberPassword ? C.green : C.muted}
                />
                <Text style={styles.rememberText}>Remember password on this device</Text>
              </Pressable>
            )}

            {isRegister && (
              <Field
                label="Confirm password"
                placeholder="Repeat your password"
                secureTextEntry={!showPw}
                autoCapitalize="none"
                value={confirm}
                onChangeText={(v) => {
                  setConfirm(v);
                  clearField('confirm');
                }}
                error={fieldErrors.confirm}
                returnKeyType="go"
                onSubmitEditing={submit}
              />
            )}

            {!isRegister && (
              <Pressable
                onPress={resetPassword}
                disabled={busy}
                style={{ alignSelf: 'flex-end' }}
              >
                <Text style={styles.forgot}>Forgot password?</Text>
              </Pressable>
            )}

            {error ? (
              <View style={[styles.notice, styles.noticeError]}>
                <Text style={styles.noticeErrorText}>{error}</Text>
              </View>
            ) : null}

            {info ? (
              <View style={[styles.notice, styles.noticeInfo]}>
                <Text style={styles.noticeInfoText}>{info}</Text>
              </View>
            ) : null}

            {loadingSaved ? (
              <ActivityIndicator color={C.ink} style={{ marginVertical: 8 }} />
            ) : null}

            <Button
              label={busy ? 'Please wait...' : isRegister ? 'Create account' : 'Sign in'}
              onPress={submit}
              loading={busy}
              fullWidth
              style={{ marginTop: 6 }}
            />
          </View>
        </Animated.View>
      </ScrollView>

      <Modal
        visible={!!removeTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setRemoveTarget(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setRemoveTarget(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalIcon}>
              <Ionicons name="person-remove-outline" size={26} color={C.ink} />
            </View>
            <Text style={styles.modalTitle}>Remove this account?</Text>
            <Text style={styles.modalText} numberOfLines={2}>
              {removeTarget?.email}
            </Text>
            <Text style={styles.modalSub}>
              It will be removed from this device only. You can sign in again anytime.
            </Text>
            <Button label="Remove" onPress={() => void confirmRemove()} fullWidth />
            <View style={{ height: 10 }} />
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => setRemoveTarget(null)}
              fullWidth
            />
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  blob: { position: 'absolute', borderRadius: 999 },
  blobMint: { width: 260, height: 260, top: -90, left: -80, backgroundColor: C.mint, opacity: 0.3 },
  blobLavender: { width: 240, height: 240, bottom: -80, right: -70, backgroundColor: C.lavender, opacity: 0.3 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingVertical: 48 },
  wrap: { width: '100%', maxWidth: 440, alignSelf: 'center' },
  brand: { alignItems: 'center', marginBottom: 20 },
  tagline: { marginTop: 2, fontSize: 13, color: C.muted, fontWeight: '600', letterSpacing: 0.3 },
  card: { backgroundColor: C.card, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: C.line },
  savedCard: { backgroundColor: C.card, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: C.line, marginBottom: 16 },
  savedTitle: { fontSize: 16, fontWeight: '800', color: C.ink, marginBottom: 10 },
  savedRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.line },
  savedMain: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  savedAvatar: { width: 48, height: 48, borderRadius: 24, marginRight: 12 },
  savedPlaceholder: { backgroundColor: C.lavender, alignItems: 'center', justifyContent: 'center' },
  savedInitial: { color: C.ink, fontSize: 20, fontWeight: '800' },
  savedName: { color: C.ink, fontSize: 14, fontWeight: '800' },
  savedEmail: { color: C.muted, fontSize: 12, marginTop: 2 },
  savedHint: { color: C.green, fontSize: 11, marginTop: 3 },
  removeSaved: { padding: 8 },
  segment: { flexDirection: 'row', backgroundColor: C.bg, borderRadius: 14, padding: 4, marginBottom: 20 },
  segBtn: { flex: 1, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: C.mint },
  segText: { fontSize: 14, fontWeight: '700', color: C.muted },
  segTextOn: { color: C.ink, fontWeight: '800' },
  title: { fontSize: 26, fontWeight: '800', color: C.ink },
  sub: { fontSize: 14, color: C.muted, marginTop: 6, marginBottom: 20, lineHeight: 20 },
  photoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarEmpty: { backgroundColor: C.lavender, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 30, fontWeight: '800', color: C.ink },
  photoBtn: { color: C.ink, fontSize: 15, fontWeight: '800' },
  photoRemove: { color: C.red, fontSize: 13, fontWeight: '700', marginTop: 6 },
  label: { fontSize: 13, fontWeight: '700', color: C.ink, marginBottom: 6 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderWidth: 1.5, borderColor: C.line, borderRadius: 16, paddingHorizontal: 16, height: 52 },
  inputFocus: { borderColor: C.mint, backgroundColor: C.card },
  inputError: { borderColor: C.red },
  input: { flex: 1, fontSize: 15, color: C.ink, height: '100%' },
  fieldError: { color: C.red, fontSize: 12, marginTop: 5, lineHeight: 16 },
  forgot: { color: C.ink, fontSize: 13, fontWeight: '700', marginBottom: 14 },
  rememberRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14 },
  rememberText: { color: C.ink, fontSize: 13, fontWeight: '600' },
  notice: { borderRadius: 14, padding: 12, marginBottom: 12 },
  noticeError: { backgroundColor: 'rgba(214,69,69,0.08)' },
  noticeErrorText: { color: C.red, fontSize: 13, lineHeight: 18 },
  noticeInfo: { backgroundColor: 'rgba(30,142,106,0.1)' },
  noticeInfoText: { color: C.green, fontSize: 13, lineHeight: 18 },
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
    backgroundColor: C.card,
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
  modalTitle: { fontSize: 20, fontWeight: '800', color: C.ink, textAlign: 'center' },
  modalText: { fontSize: 14, fontWeight: '700', color: C.ink, marginTop: 8, textAlign: 'center' },
  modalSub: { fontSize: 13, color: C.muted, marginTop: 6, marginBottom: 18, textAlign: 'center', lineHeight: 18 },
});