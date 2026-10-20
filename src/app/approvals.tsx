import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../auth';
import { db } from '../firebase';

const C = {
  bg: '#F7F7F3',
  ink: '#18181B',
  mint: '#7DE2C0',
  lavender: '#B9A7FF',
  red: '#D14343',
  card: '#FFFFFF',
};

type UserRow = { id: string; fullName: string; email: string; username: string };

export default function ApprovalsScreen() {
  const { can } = useAuth();
  const allowed = can('approveUsers');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roleIds, setRoleIds] = useState<string[]>(['member']);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  useEffect(() => {
    if (!allowed) return;
    return onSnapshot(
      query(collection(db, 'users'), where('status', '==', 'pending')),
      (snap) => {
        setUsers(
          snap.docs.map((d) => {
            const x = d.data();
            return {
              id: d.id,
              fullName: x.fullName ?? '',
              email: x.email ?? '',
              username: x.username ?? '',
            };
          }),
        );
      },
      (e) => setError(e.message),
    );
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    return onSnapshot(
      collection(db, 'roles'),
      (snap) => {
        const ids = snap.docs.map((d) => d.id).filter((id) => id !== 'member');
        setRoleIds(['member', ...ids]);
      },
      (e) => setError(e.message),
    );
  }, [allowed]);

  async function decide(id: string, status: 'active' | 'rejected') {
    setError('');
    try {
      const data: Record<string, string> = { status };
      if (status === 'active') data.role = chosen[id] ?? 'member';
      await updateDoc(doc(db, 'users', id), data);
    } catch (e: any) {
      setError(e?.message ?? 'Could not update this account.');
    }
  }

  if (!allowed) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Approvals</Text>
        <Text style={styles.muted}>You do not have access to this page.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={styles.content}>
      <View style={styles.wrap}>
        <Text style={styles.title}>Account approvals</Text>
        <Text style={styles.muted}>
          New accounts wait here. Choose a role, then approve or reject.
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {users.length === 0 ? <Text style={styles.muted}>No pending accounts.</Text> : null}

        {users.map((u) => {
          const current = chosen[u.id] ?? 'member';
          return (
            <View key={u.id} style={styles.card}>
              <Text style={styles.name}>{u.fullName || u.username || 'No name'}</Text>
              <Text style={styles.email}>{u.email}</Text>

              <Text style={styles.label}>Role</Text>
              <View style={styles.chips}>
                {roleIds.map((r) => (
                  <TouchableOpacity
                    key={r}
                    onPress={() => setChosen((p) => ({ ...p, [u.id]: r }))}
                    style={[styles.chip, current === r && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, current === r && styles.chipTextOn]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.actions}>
                <TouchableOpacity style={styles.approve} onPress={() => decide(u.id, 'active')}>
                  <Text style={styles.approveText}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.reject} onPress={() => decide(u.id, 'rejected')}>
                  <Text style={styles.rejectText}>Reject</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 20, paddingTop: 56, paddingBottom: 40 },
  wrap: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: C.ink, marginBottom: 6 },
  muted: { color: '#6B6B73', fontSize: 14, marginBottom: 16 },
  error: { color: C.red, fontSize: 13, marginBottom: 12 },
  card: { backgroundColor: C.card, borderRadius: 20, padding: 16, marginBottom: 14 },
  name: { fontSize: 18, fontWeight: '800', color: C.ink },
  email: { fontSize: 13, color: '#6B6B73', marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '700', color: C.ink, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: C.bg },
  chipOn: { backgroundColor: C.lavender },
  chipText: { color: C.ink, fontSize: 13, fontWeight: '600' },
  chipTextOn: { fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 10 },
  approve: { flex: 1, height: 46, borderRadius: 14, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' },
  approveText: { color: C.ink, fontWeight: '800', fontSize: 15 },
  reject: { flex: 1, height: 46, borderRadius: 14, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  rejectText: { color: C.red, fontWeight: '800', fontSize: 15 },
});