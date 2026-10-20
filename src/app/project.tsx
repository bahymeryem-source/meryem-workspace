import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../auth';
import { Button, FadeIn, PageHeader, Press } from '../components/ui';
import { db } from '../firebase';

const C = {
  bg: '#F7F7F3',
  ink: '#18181B',
  mint: '#7DE2C0',
  lavender: '#B9A7FF',
  red: '#D14343',
  card: '#FFFFFF',
};

const STATUSES = ['active', 'paused', 'done'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const BADGE_BG: Record<string, string> = {
  active: 'rgba(125,226,192,0.4)',
  paused: 'rgba(185,167,255,0.4)',
  done: '#ECECE8',
};

type Project = {
  id: string;
  name: string;
  description: string;
  status: string;
  startDate: string;
  endDate: string;
  ownerId: string;
  logo: string;
  memberIds: string[];
};

type Person = {
  uid: string;
  fullName: string;
  email: string;
  role: string;
};

export default function Projects() {
  const { user, profile, isAdmin, isOwner, can } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('active');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [confirmId, setConfirmId] = useState('');
  const [logoBusyId, setLogoBusyId] = useState('');
  const [openMembersId, setOpenMembersId] = useState('');
  const [editId, setEditId] = useState('');
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [error, setError] = useState('');

  const uid = user?.uid;
  const isActive = profile?.status === 'active';
  const canCreate = can('createProject');

  useEffect(() => {
    if (!uid || !isActive) {
      setProjects([]);
      return;
    }
    const base = collection(db, 'projects');
    const q = isAdmin ? base : query(base, where('memberIds', 'array-contains', uid));
    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => {
          const x = d.data();
          return {
            id: d.id,
            name: x.name ?? '',
            description: x.description ?? '',
            status: x.status ?? 'active',
            startDate: x.startDate ?? '',
            endDate: x.endDate ?? '',
            ownerId: x.ownerId ?? '',
            logo: x.logo ?? '',
            memberIds: Array.isArray(x.memberIds) ? x.memberIds : [],
          } as Project;
        });
        rows.sort((a, b) => a.name.localeCompare(b.name));
        setProjects(rows);
      },
      (e) => setError(e.message),
    );
  }, [uid, isAdmin, isActive]);

  useEffect(() => {
    if (!uid || !isActive || !isAdmin) {
      setPeople([]);
      return;
    }
    const q = query(collection(db, 'users'), where('status', '==', 'active'));
    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((d) => {
            const x = d.data();
            return {
              uid: d.id,
              fullName: x.fullName ?? x.username ?? '',
              email: x.email ?? '',
              role: x.role ?? '',
            } as Person;
          })
          .filter((p) => p.role !== 'owner');
        rows.sort((a, b) => (a.fullName || a.email).localeCompare(b.fullName || b.email));
        setPeople(rows);
      },
      (e) => setError(e.message),
    );
  }, [uid, isAdmin, isActive]);

  function canManage(p: Project) {
    return isAdmin || (can('manageOwnProjects') && p.ownerId === uid);
  }

  function canEditLogo(_p: Project) {
    return isAdmin || can('editProjectLogo');
  }

  function canEditInfo(p: Project) {
    return canManage(p) || can('editProject');
  }

  function startEditProject(p: Project) {
    setError('');
    setEditId(p.id);
    setEditName(p.name);
    setEditDesc(p.description);
  }

  function cancelEditProject() {
    setEditId('');
    setEditName('');
    setEditDesc('');
  }

  async function saveEditProject() {
    setError('');
    const n = editName.trim();
    if (!editId) return;
    if (!n) {
      setError('Project name is required.');
      return;
    }
    setEditBusy(true);
    try {
      await updateDoc(doc(db, 'projects', editId), {
        name: n,
        description: editDesc.trim(),
      });
      cancelEditProject();
    } catch (e: any) {
      setError(e?.message ?? 'Could not save the project.');
    } finally {
      setEditBusy(false);
    }
  }

  async function createProject() {
    setError('');
    const n = name.trim();
    if (!n) {
      setError('Project name is required.');
      return;
    }
    if (startDate && !DATE_RE.test(startDate)) {
      setError('Start date must look like 2026-11-30.');
      return;
    }
    if (endDate && !DATE_RE.test(endDate)) {
      setError('End date must look like 2026-11-30.');
      return;
    }
    if (!uid) return;
    try {
      await addDoc(collection(db, 'projects'), {
        name: n,
        description: description.trim(),
        status,
        startDate,
        endDate,
        ownerId: uid,
        memberIds: isOwner ? [] : [uid],
        createdAt: serverTimestamp(),
      });
      setName('');
      setDescription('');
      setStatus('active');
      setStartDate('');
      setEndDate('');
      setShowForm(false);
    } catch (e: any) {
      setError(e?.message ?? 'Could not create the project.');
    }
  }

  async function removeProject(id: string) {
    setError('');
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    try {
      await deleteDoc(doc(db, 'projects', id));
      setConfirmId('');
    } catch (e: any) {
      setError(e?.message ?? 'Could not delete the project.');
    }
  }

  async function pickLogo(id: string) {
    setError('');
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
      if (picked.canceled || !picked.assets?.length) return;

      setLogoBusyId(id);
      const small = await ImageManipulator.manipulateAsync(
        picked.assets[0].uri,
        [{ resize: { width: 256 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (!small.base64) {
        setError('Could not read the image.');
        return;
      }
      await updateDoc(doc(db, 'projects', id), {
        logo: `data:image/jpeg;base64,${small.base64}`,
      });
    } catch (e: any) {
      setError(e?.message ?? 'Could not update the logo.');
    } finally {
      setLogoBusyId('');
    }
  }

  async function toggleMember(p: Project, personUid: string) {
    setError('');
    if (personUid === p.ownerId) return;
    try {
      await updateDoc(doc(db, 'projects', p.id), {
        memberIds: p.memberIds.includes(personUid) ? arrayRemove(personUid) : arrayUnion(personUid),
      });
    } catch (e: any) {
      setError(e?.message ?? 'Could not update the members.');
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={styles.content}>
      <View style={styles.wrap}>
        <PageHeader title="Projects" />

        {canCreate ? (
          <FadeIn delay={80}>
            <Button
              label={showForm ? 'Close' : 'New project'}
              onPress={() => setShowForm((v) => !v)}
              variant={showForm ? 'secondary' : 'primary'}
              fullWidth
            />
          </FadeIn>
        ) : null}

        {showForm ? (
          <FadeIn style={styles.card}>
            <Text style={styles.label}>Name *</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Project name"
              placeholderTextColor="#9A9AA0"
              style={styles.input}
            />
            <Text style={styles.label}>Description</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="What is this project about?"
              placeholderTextColor="#9A9AA0"
              multiline
              style={[styles.input, { height: 90, paddingTop: 12, textAlignVertical: 'top' }]}
            />
            <Text style={styles.label}>Status</Text>
            <View style={styles.chips}>
              {STATUSES.map((s) => (
                <Press
                  key={s}
                  onPress={() => setStatus(s)}
                  scaleTo={0.9}
                  style={[styles.chip, status === s && styles.chipOn]}
                >
                  <Text style={styles.chipText}>{s}</Text>
                </Press>
              ))}
            </View>
            <Text style={styles.label}>Start date (optional)</Text>
            <TextInput
              value={startDate}
              onChangeText={setStartDate}
              placeholder="2026-11-30"
              placeholderTextColor="#9A9AA0"
              style={styles.input}
            />
            <Text style={styles.label}>End date (optional)</Text>
            <TextInput
              value={endDate}
              onChangeText={setEndDate}
              placeholder="2026-12-31"
              placeholderTextColor="#9A9AA0"
              style={styles.input}
            />
            <Button label="Create project" onPress={createProject} fullWidth />
          </FadeIn>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {projects.length === 0 ? (
          <Text style={styles.muted}>
            {canCreate ? 'No projects yet. Tap New project.' : 'No projects yet.'}
          </Text>
        ) : null}

        {projects.map((p, i) => (
          <FadeIn key={p.id} delay={120 + Math.min(i, 6) * 80} style={styles.card}>
            <View style={styles.rowBetween}>
              <View style={styles.titleRow}>
                {p.logo ? (
                  <Image source={{ uri: p.logo }} style={styles.logo} />
                ) : (
                  <View style={[styles.logo, styles.logoEmpty]}>
                    <Text style={styles.logoLetter}>{p.name.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <Text style={styles.name}>{p.name}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: BADGE_BG[p.status] ?? C.bg }]}>
                <Text style={styles.badgeText}>{p.status}</Text>
              </View>
            </View>
            {p.description ? <Text style={styles.desc}>{p.description}</Text> : null}
            {p.startDate || p.endDate ? (
              <Text style={styles.dates}>
                {p.startDate || '...'} to {p.endDate || '...'}
              </Text>
            ) : null}

            {editId === p.id ? (
              <FadeIn style={styles.editBox}>
                <Text style={styles.label}>Name *</Text>
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Project name"
                  placeholderTextColor="#9A9AA0"
                  style={styles.input}
                />
                <Text style={styles.label}>Description</Text>
                <TextInput
                  value={editDesc}
                  onChangeText={setEditDesc}
                  placeholder="What is this project about?"
                  placeholderTextColor="#9A9AA0"
                  multiline
                  style={[styles.input, { height: 90, paddingTop: 12, textAlignVertical: 'top' }]}
                />
                <Button
                  label="Save"
                  onPress={saveEditProject}
                  loading={editBusy}
                  fullWidth
                />
                <View style={{ height: 10 }} />
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={cancelEditProject}
                  fullWidth
                />
              </FadeIn>
            ) : null}

            <View style={styles.actions}>
              {canEditInfo(p) && editId !== p.id ? (
                <Button
                  size="sm"
                  variant="secondary"
                  label="Edit"
                  onPress={() => startEditProject(p)}
                />
              ) : null}
              {isAdmin ? (
                <Button
                  size="sm"
                  variant="secondary"
                  label={openMembersId === p.id ? 'Close members' : `Members (${p.memberIds.length})`}
                  onPress={() => setOpenMembersId(openMembersId === p.id ? '' : p.id)}
                />
              ) : null}
              {canEditLogo(p) ? (
                <Button
                  size="sm"
                  variant="secondary"
                  label={p.logo ? 'Change logo' : 'Add logo'}
                  loading={logoBusyId === p.id}
                  onPress={() => pickLogo(p.id)}
                />
              ) : null}
              {canManage(p) ? (
                <Button
                  size="sm"
                  variant="danger"
                  label={confirmId === p.id ? 'Tap again to confirm delete' : 'Delete'}
                  onPress={() => removeProject(p.id)}
                />
              ) : null}
            </View>

            {isAdmin && openMembersId === p.id ? (
              <FadeIn style={styles.membersBox}>
                {people.length === 0 ? (
                  <Text style={styles.muted}>No active users yet.</Text>
                ) : null}
                {people.map((person) => {
                  const isCreator = person.uid === p.ownerId;
                  const isIn = p.memberIds.includes(person.uid);
                  return (
                    <View key={person.uid} style={styles.personRow}>
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={styles.personName}>{person.fullName || person.email}</Text>
                        {person.fullName ? <Text style={styles.personEmail}>{person.email}</Text> : null}
                      </View>
                      {isCreator ? (
                        <Text style={styles.ownerTag}>Creator</Text>
                      ) : (
                        <Button
                          size="sm"
                          variant={isIn ? 'secondary' : 'primary'}
                          label={isIn ? 'Remove' : 'Add'}
                          onPress={() => toggleMember(p, person.uid)}
                        />
                      )}
                    </View>
                  );
                })}
              </FadeIn>
            ) : null}
          </FadeIn>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 56, paddingBottom: 40 },
  wrap: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  muted: { color: '#6B6B73', fontSize: 14, marginBottom: 16 },
  error: { color: C.red, fontSize: 13, marginVertical: 10 },
  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 16,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#EFEFEA',
  },
  label: { fontSize: 13, fontWeight: '700', color: C.ink, marginBottom: 6, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#E4E4E7',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    color: C.ink,
    backgroundColor: C.bg,
    marginBottom: 10,
  },
  chips: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: C.bg },
  chipOn: { backgroundColor: C.lavender },
  chipText: { color: C.ink, fontSize: 13, fontWeight: '700' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleRow: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 10 },
  logo: { width: 44, height: 44, borderRadius: 12, marginRight: 12 },
  logoEmpty: { backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' },
  logoLetter: { color: C.ink, fontWeight: '800', fontSize: 18 },
  name: { fontSize: 18, fontWeight: '800', color: C.ink, flex: 1 },
  badge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '800', color: C.ink },
  desc: { color: '#3F3F46', fontSize: 14, marginTop: 8 },
  dates: { color: '#6B6B73', fontSize: 12, marginTop: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  editBox: { marginTop: 14, borderTopWidth: 1, borderTopColor: '#E4E4E7', paddingTop: 10 },
  membersBox: { marginTop: 14, borderTopWidth: 1, borderTopColor: '#E4E4E7', paddingTop: 8 },
  personRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  personName: { color: C.ink, fontWeight: '700', fontSize: 14 },
  personEmail: { color: '#6B6B73', fontSize: 12, marginTop: 2 },
  ownerTag: { color: '#6B6B73', fontWeight: '800', fontSize: 12 },
});