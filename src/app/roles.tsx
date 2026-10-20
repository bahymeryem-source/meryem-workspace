import {
    collection,
    deleteDoc,
    doc,
    getDocs,
    onSnapshot,
    query,
    setDoc,
    updateDoc,
    where,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../auth';
import { db } from '../firebase';
import { PERMISSIONS } from '../permissions';

const C = {
  bg: '#F7F7F3',
  ink: '#18181B',
  mint: '#7DE2C0',
  lavender: '#B9A7FF',
  red: '#D14343',
  card: '#FFFFFF',
};

const GROUPS = Array.from(new Set(PERMISSIONS.map((p) => p.group)));
const PROTECTED_ROLES = ['member', 'admin', 'owner'];

type RoleDoc = { id: string; permissions: Record<string, boolean> };

export default function RolesScreen() {
  const { profile, isAdmin, can } = useAuth();
  const [roles, setRoles] = useState<RoleDoc[]>([]);
  const [newRole, setNewRole] = useState('');
  const [confirmId, setConfirmId] = useState('');
  const [error, setError] = useState('');

  const canView = can('viewRoles') || can('manageRoles');
  const canManage = can('manageRoles');

  useEffect(() => {
    if (!canView) return;
    return onSnapshot(
      collection(db, 'roles'),
      (snap) => {
        setRoles(
          snap.docs.map((d) => ({
            id: d.id,
            permissions: (d.data().permissions ?? {}) as Record<string, boolean>,
          })),
        );
      },
      (e) => setError(e.message),
    );
  }, [canView]);

  async function addRole() {
    setError('');
    const id = newRole.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
      setError('Use letters only (e.g. manager). No spaces.');
      return;
    }
    if (id === 'admin') {
      setError('"admin" is reserved.');
      return;
    }
    if (id === 'owner') {
      setError('This role name is not available.');
      return;
    }
    if (roles.some((r) => r.id === id)) {
      setError('This role already exists.');
      return;
    }
    try {
      const permissions: Record<string, boolean> = {};
      PERMISSIONS.forEach((p) => (permissions[p.key] = false));
      await setDoc(doc(db, 'roles', id), { permissions });
      setNewRole('');
    } catch (e: any) {
      setError(e?.message ?? 'Could not create the role.');
    }
  }

  async function toggle(roleId: string, key: string, value: boolean) {
    setError('');
    try {
      await updateDoc(doc(db, 'roles', roleId), { [`permissions.${key}`]: value });
    } catch (e: any) {
      setError(e?.message ?? 'Could not update the permission.');
    }
  }

  async function removeRole(id: string) {
    setError('');
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    try {
      const used = await getDocs(query(collection(db, 'users'), where('role', '==', id)));
      if (!used.empty) {
        setError(
          `${used.size} user(s) still have the role "${id}". Change their role in Team first.`,
        );
        setConfirmId('');
        return;
      }
      await deleteDoc(doc(db, 'roles', id));
      setConfirmId('');
    } catch (e: any) {
      setError(e?.message ?? 'Could not delete the role.');
      setConfirmId('');
    }
  }

  if (!canView) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Roles</Text>
        <Text style={styles.muted}>You do not have access to this page.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={styles.content}>
      <View style={styles.wrap}>
        <Text style={styles.title}>Control panel</Text>
        <Text style={styles.muted}>
          {canManage
            ? 'Admin always has full access. Create roles and choose what each one can do.'
            : 'Read only. You can see roles but not change them.'}
        </Text>

        {canManage ? (
          <View style={styles.card}>
            <Text style={styles.label}>New role</Text>
            <TextInput
              value={newRole}
              onChangeText={setNewRole}
              placeholder="e.g. manager"
              placeholderTextColor="#9A9AA0"
              autoCapitalize="none"
              style={styles.input}
            />
            <TouchableOpacity style={styles.button} onPress={addRole}>
              <Text style={styles.buttonText}>Add role</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {roles.length === 0 ? <Text style={styles.muted}>No roles yet.</Text> : null}

        {roles.map((r) => {
          const ownRole = !isAdmin && r.id === profile?.role;
          const editable = canManage && !ownRole;
          const canDelete = canManage && !ownRole && !PROTECTED_ROLES.includes(r.id);
          return (
            <View key={r.id} style={styles.card}>
              <View style={styles.roleHeader}>
                <Text style={styles.roleName}>{r.id}</Text>
                {canDelete ? (
                  <TouchableOpacity onPress={() => removeRole(r.id)}>
                    <Text style={styles.deleteText}>
                      {confirmId === r.id ? 'Tap again to confirm' : 'Delete'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {ownRole ? <Text style={styles.note}>This is your role. You cannot edit it.</Text> : null}
              {GROUPS.map((g) => (
                <View key={g}>
                  <Text style={styles.group}>{g}</Text>
                  {PERMISSIONS.filter((p) => p.group === g).map((p) => (
                    <View key={p.key} style={styles.row}>
                      <Text style={styles.rowLabel}>{p.label}</Text>
                      <Switch
                        value={r.permissions[p.key] === true}
                        disabled={!editable}
                        onValueChange={(v) => toggle(r.id, p.key, v)}
                        trackColor={{ true: C.mint, false: '#D9D9DE' }}
                        thumbColor="#FFFFFF"
                      />
                    </View>
                  ))}
                </View>
              ))}
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
  note: { color: '#6B6B73', fontSize: 12, marginBottom: 6 },
  card: { backgroundColor: C.card, borderRadius: 20, padding: 16, marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '700', color: C.ink, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#E4E4E7',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    color: C.ink,
    backgroundColor: C.bg,
    marginBottom: 12,
  },
  button: { backgroundColor: C.mint, borderRadius: 16, height: 48, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: C.ink, fontWeight: '800', fontSize: 15 },
  error: { color: C.red, fontSize: 13, marginBottom: 12 },
  roleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  roleName: { fontSize: 18, fontWeight: '800', color: C.ink },
  deleteText: { color: C.red, fontWeight: '700', fontSize: 13 },
  group: { fontSize: 12, fontWeight: '800', color: '#6B6B73', textTransform: 'uppercase', marginTop: 10, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  rowLabel: { color: C.ink, fontSize: 14, flex: 1, paddingRight: 12 },
});