import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth';

export default function PendingScreen() {
  const { profile, logout } = useAuth();

  let icon: keyof typeof Ionicons.glyphMap = 'time-outline';
  let title = 'Waiting for approval';
  let text = 'Your account was created. The admin will review it soon.';

  if (!profile) {
    title = 'Setting up your account...';
    text = 'If this takes more than a few seconds, sign out and try again.';
  } else if (profile.status === 'rejected') {
    icon = 'close-circle-outline';
    title = 'Request not approved';
    text = 'The admin did not approve this account.';
  } else if (profile.status === 'suspended') {
    icon = 'pause-circle-outline';
    title = 'Account suspended';
    text = 'Please contact the admin.';
  }

  return (
    <View style={styles.screen}>
      <Ionicons name={icon} size={56} color="#18181B" />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.text}>{text}</Text>
      <Pressable style={styles.button} onPress={logout}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7F7F3',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  title: { fontSize: 24, fontWeight: '800', color: '#18181B', marginTop: 16, textAlign: 'center' },
  text: { fontSize: 14, color: '#8E8E93', marginTop: 8, textAlign: 'center', lineHeight: 20 },
  button: {
    backgroundColor: '#7DE2C0',
    borderRadius: 16,
    height: 48,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
  },
  buttonText: { fontSize: 15, fontWeight: '800', color: '#18181B' },
});