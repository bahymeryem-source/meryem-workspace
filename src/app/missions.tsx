import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../auth';
import { Button, FadeIn, PageHeader, Press } from '../components/ui';
import { db } from '../firebase';
import { notify } from '../notify';

const C = {
  bg: '#F7F7F3',
  ink: '#18181B',
  mint: '#7DE2C0',
  lavender: '#B9A7FF',
  red: '#D14343',
  green: '#2FBF71',
  amber: '#F5A524',
  card: '#FFFFFF',
  muted: '#6B6B73',
  line: '#E4E4E7',
};

type Status = 'todo' | 'progress' | 'review' | 'changes' | 'done';
type Priority = 'low' | 'medium' | 'high';

const STATUSES: { key: Status; label: string }[] = [
  { key: 'todo', label: 'To do' },
  { key: 'progress', label: 'In progress' },
  { key: 'review', label: 'Pending review' },
  { key: 'changes', label: 'Needs changes' },
  { key: 'done', label: 'Done' },
];

const PRIORITIES: { key: Priority; label: string; color: string }[] = [
  { key: 'low', label: 'Low', color: '#9AA0A6' },
  { key: 'medium', label: 'Medium', color: '#F5A524' },
  { key: 'high', label: 'High', color: '#D14343' },
];

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

// Accepts "YYYY-MM-DDTHH:mm" (new) and "YYYY-MM-DD" (old, treated as end of day)
function parseDue(s: string): Date | null {
  if (!s) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 23, 59);
  return null;
}

function toValue(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDue(d: Date) {
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dueLabel(s: string) {
  const d = parseDue(s);
  return d ? formatDue(d) : s;
}

function timeLeft(d: Date, now: number) {
  const diff = d.getTime() - now;
  const abs = Math.abs(diff);
  const days = Math.floor(abs / 86400000);
  const hours = Math.floor((abs % 86400000) / 3600000);
  const mins = Math.floor((abs % 3600000) / 60000);
  const text = days > 0 ? `${days}d ${hours}h ${mins}m` : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  return { overdue: diff < 0, text };
}

function DuePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const selected = parseDue(value);
  const [open, setOpen] = useState(false);
  const base = selected ?? new Date();
  const [viewY, setViewY] = useState(base.getFullYear());
  const [viewM, setViewM] = useState(base.getMonth());

  const hour = selected ? selected.getHours() : 18;
  const minute = selected ? selected.getMinutes() : 0;

  const firstWeekday = (new Date(viewY, viewM, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function shiftMonth(delta: number) {
    const d = new Date(viewY, viewM + delta, 1);
    setViewY(d.getFullYear());
    setViewM(d.getMonth());
  }

  function pickDay(day: number) {
    onChange(toValue(new Date(viewY, viewM, day, hour, minute)));
  }

  function changeTime(dh: number, dm: number) {
    const total = (((hour * 60 + minute + dh * 60 + dm) % 1440) + 1440) % 1440;
    const nh = Math.floor(total / 60);
    const nm = total % 60;
    const day = selected ? new Date(selected) : new Date();
    day.setHours(nh, nm, 0, 0);
    onChange(toValue(day));
  }

  const nowMs = Date.now();

  return (
    <View>
      <Press
        scaleTo={0.98}
        style={styles.pickerField}
        onPress={() => {
          if (!open && selected) {
            setViewY(selected.getFullYear());
            setViewM(selected.getMonth());
          }
          setOpen(!open);
        }}
      >
        <Ionicons name="calendar-outline" size={18} color={C.ink} />
        <Text style={[styles.pickerFieldText, !selected && { color: '#9A9AA0' }]}>
          {selected ? formatDue(selected) : 'No due date'}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={C.muted} />
      </Press>

      {open ? (
        <View style={styles.pickerPanel}>
          <View style={styles.row}>
            <Press scaleTo={0.85} style={styles.pickerNav} onPress={() => shiftMonth(-1)}>
              <Ionicons name="chevron-back" size={18} color={C.ink} />
            </Press>
            <Text style={styles.pickerMonth}>
              {MONTHS[viewM]} {viewY}
            </Text>
            <Press scaleTo={0.85} style={styles.pickerNav} onPress={() => shiftMonth(1)}>
              <Ionicons name="chevron-forward" size={18} color={C.ink} />
            </Press>
          </View>

          <View style={styles.dayGrid}>
            {WEEKDAYS.map((w, i) => (
              <View key={`w${i}`} style={styles.dayCellWrap}>
                <Text style={styles.weekdayText}>{w}</Text>
              </View>
            ))}
            {cells.map((day, i) => {
              if (day === null) return <View key={`e${i}`} style={styles.dayCellWrap} />;
              const past = new Date(viewY, viewM, day, 23, 59).getTime() < nowMs;
              const on =
                !!selected &&
                selected.getFullYear() === viewY &&
                selected.getMonth() === viewM &&
                selected.getDate() === day;
              return (
                <View key={`d${day}`} style={styles.dayCellWrap}>
                  <Press
                    scaleTo={0.85}
                    disabled={past}
                    style={[styles.dayCell, on && styles.dayCellOn]}
                    onPress={() => pickDay(day)}
                  >
                    <Text style={[styles.dayText, past && styles.dayTextOff, on && { fontWeight: '800' }]}>
                      {day}
                    </Text>
                  </Press>
                </View>
              );
            })}
          </View>

          <Text style={styles.label}>Time</Text>
          <View style={[styles.row, { justifyContent: 'center' }]}>
            <View style={styles.timeCol}>
              <Press scaleTo={0.85} style={styles.timeBtn} onPress={() => changeTime(1, 0)}>
                <Ionicons name="chevron-up" size={18} color={C.ink} />
              </Press>
              <Text style={styles.timeText}>{pad(hour)}</Text>
              <Press scaleTo={0.85} style={styles.timeBtn} onPress={() => changeTime(-1, 0)}>
                <Ionicons name="chevron-down" size={18} color={C.ink} />
              </Press>
            </View>
            <Text style={styles.timeColon}>:</Text>
            <View style={styles.timeCol}>
              <Press scaleTo={0.85} style={styles.timeBtn} onPress={() => changeTime(0, 5)}>
                <Ionicons name="chevron-up" size={18} color={C.ink} />
              </Press>
              <Text style={styles.timeText}>{pad(minute)}</Text>
              <Press scaleTo={0.85} style={styles.timeBtn} onPress={() => changeTime(0, -5)}>
                <Ionicons name="chevron-down" size={18} color={C.ink} />
              </Press>
            </View>
          </View>
          {!selected ? <Text style={[styles.muted, { textAlign: 'center', marginTop: 8 }]}>Pick a day first.</Text> : null}

          <View style={[styles.row, { justifyContent: 'space-between', marginTop: 14 }]}>
            <Press
              scaleTo={0.9}
              onPress={() => {
                onChange('');
                setOpen(false);
              }}
            >
              <Text style={[styles.link, { color: C.red }]}>Clear</Text>
            </Press>
            <Press scaleTo={0.9} onPress={() => setOpen(false)}>
              <Text style={styles.link}>Done</Text>
            </Press>
          </View>
        </View>
      ) : null}
    </View>
  );
}

type ProjectLite = { id: string; name: string; logo: string; memberIds: string[] };

function ProjectLogo({ logo, name, size }: { logo: string; name: string; size: number }) {
  const box = { width: size, height: size, borderRadius: size * 0.28 };
  if (logo) {
    return <Image source={{ uri: logo }} style={box} />;
  }
  return (
    <View style={[box, { backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ color: C.ink, fontWeight: '800', fontSize: size * 0.4 }}>
        {(name || '?').charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

type Submission = { text: string; image: string; byName: string; at: number };
type Feedback = { text: string; byName: string; at: number };

type Mission = {
  id: string;
  title: string;
  description: string;
  assigneeId: string;
  assigneeName: string;
  createdBy: string;
  priority: Priority;
  dueDate: string;
  status: Status;
  submission: Submission | null;
  feedback: Feedback | null;
};

function statusLabel(s: Status) {
  return STATUSES.find((x) => x.key === s)?.label ?? s;
}

function badgeColors(s: Status) {
  if (s === 'done') return { bg: '#D9F5E6', fg: '#1B7F4B' };
  if (s === 'review') return { bg: '#FFF0D1', fg: '#8A5A00' };
  if (s === 'changes') return { bg: '#FBDADA', fg: '#A32626' };
  if (s === 'progress') return { bg: '#E6E0FF', fg: '#4B34B8' };
  return { bg: '#F0F0EA', fg: C.ink };
}

export default function Missions() {
  const { user, profile, isAdmin, can } = useAuth();
  const uid = user?.uid;
  const myName: string =
    (profile as any)?.fullName || (profile as any)?.username || user?.email || 'User';

  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [current, setCurrent] = useState<ProjectLite | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Status | 'all'>('all');
  const [now, setNow] = useState(Date.now());

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [confirmId, setConfirmId] = useState('');

  const [submitFor, setSubmitFor] = useState('');
  const [subText, setSubText] = useState('');
  const [subImage, setSubImage] = useState('');

  const [reviewFor, setReviewFor] = useState('');
  const [reviewComment, setReviewComment] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

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
            logo: (x.logo ?? '') as string,
            memberIds: (Array.isArray(x.memberIds) ? x.memberIds : []) as string[],
          };
        });
        rows.sort((a, b) => a.name.localeCompare(b.name));
        setProjects(rows);
      },
      (e) => setError(e.message),
    );
  }, [uid, isAdmin]);

  const live = current ? projects.find((p) => p.id === current.id) ?? current : null;

  useEffect(() => {
    if (!live) {
      setMissions([]);
      return;
    }
    return onSnapshot(
      collection(db, 'projects', live.id, 'missions'),
      (snap) => {
        const rows = snap.docs.map((d) => {
          const x = d.data();
          const s = x.submission;
          const f = x.feedback;
          return {
            id: d.id,
            title: x.title ?? '',
            description: x.description ?? '',
            assigneeId: x.assigneeId ?? '',
            assigneeName: x.assigneeName ?? '',
            createdBy: x.createdBy ?? '',
            priority: (x.priority ?? 'medium') as Priority,
            dueDate: x.dueDate ?? '',
            status: (x.status ?? 'todo') as Status,
            submission: s
              ? { text: s.text ?? '', image: s.image ?? '', byName: s.byName ?? '', at: s.at ?? 0 }
              : null,
            feedback: f ? { text: f.text ?? '', byName: f.byName ?? '', at: f.at ?? 0 } : null,
          } as Mission;
        });
        setMissions(rows);
      },
      (e) => setError(e.message),
    );
  }, [live?.id]);

  useEffect(() => {
    return onSnapshot(
      collection(db, 'presence'),
      (snap) => {
        const map: Record<string, string> = {};
        snap.docs.forEach((d) => {
          map[d.id] = (d.data().fullName as string) ?? '';
        });
        setNames(map);
      },
      () => {},
    );
  }, []);

  const nameOf = (id: string) => (id === uid ? myName : names[id] || 'Unknown');

  const visible = useMemo(() => {
    const list = filter === 'all' ? missions : missions.filter((m) => m.status === filter);
    const rank = { high: 0, medium: 1, low: 2 } as Record<Priority, number>;
    return [...list].sort((a, b) => rank[a.priority] - rank[b.priority]);
  }, [missions, filter]);

  const progress = useMemo(() => {
    const map: Record<string, { total: number; done: number }> = {};
    missions.forEach((m) => {
      if (!m.assigneeId) return;
      if (!map[m.assigneeId]) map[m.assigneeId] = { total: 0, done: 0 };
      map[m.assigneeId].total += 1;
      if (m.status === 'done') map[m.assigneeId].done += 1;
    });
    return Object.entries(map).sort((a, b) => b[1].done / b[1].total - a[1].done / a[1].total);
  }, [missions]);

  const totalDone = missions.filter((m) => m.status === 'done').length;
  const pendingCount = missions.filter((m) => m.status === 'review').length;

  function resetForm() {
    setShowForm(false);
    setEditingId('');
    setTitle('');
    setDescription('');
    setAssigneeId('');
    setPriority('medium');
    setDueDate('');
  }

  function startEdit(m: Mission) {
    if (m.status === 'done') {
      setError('A completed mission cannot be edited.');
      return;
    }
    setError('');
    setEditingId(m.id);
    setTitle(m.title);
    setDescription(m.description);
    setAssigneeId(m.assigneeId);
    setPriority(m.priority);
    setDueDate(m.dueDate);
    setShowForm(true);
  }

  async function save() {
    setError('');
    const t = title.trim();
    if (!t || !live) {
      setError('Title is required.');
      return;
    }
    const data = {
      title: t,
      description: description.trim(),
      assigneeId,
      assigneeName: assigneeId ? nameOf(assigneeId) : '',
      priority,
      dueDate: dueDate.trim(),
    };
    try {
      if (editingId) {
        const previous = missions.find((x) => x.id === editingId);
        if (previous?.status === 'done') {
          setError('A completed mission cannot be edited.');
          resetForm();
          return;
        }
        await updateDoc(doc(db, 'projects', live.id, 'missions', editingId), data);
        if (assigneeId && assigneeId !== previous?.assigneeId) {
          await notify({
            toId: assigneeId,
            fromId: uid ?? '',
            fromName: myName,
            title: 'New mission assigned to you',
            body: `${t} · ${live.name}`,
            projectId: live.id,
            screen: 'missions',
          });
        }
      } else {
        await addDoc(collection(db, 'projects', live.id, 'missions'), {
          ...data,
          status: 'todo',
          createdBy: uid,
          createdAt: serverTimestamp(),
        });
        if (assigneeId) {
          await notify({
            toId: assigneeId,
            fromId: uid ?? '',
            fromName: myName,
            title: 'New mission assigned to you',
            body: `${t} · ${live.name}`,
            projectId: live.id,
            screen: 'missions',
          });
        }
      }
      resetForm();
    } catch (e: any) {
      setError(e?.message ?? 'Could not save the mission.');
    }
  }

  async function remove(m: Mission) {
    if (!live) return;
    setError('');
    if (confirmId !== m.id) {
      setConfirmId(m.id);
      return;
    }
    try {
      await deleteDoc(doc(db, 'projects', live.id, 'missions', m.id));
      setConfirmId('');
    } catch (e: any) {
      setConfirmId('');
      setError(e?.message ?? 'Could not delete the mission.');
    }
  }

  async function startWork(m: Mission) {
    if (!live) return;
    setError('');
    try {
      await updateDoc(doc(db, 'projects', live.id, 'missions', m.id), { status: 'progress' });
    } catch (e: any) {
      setError(e?.message ?? 'Could not update the mission.');
    }
  }

  function openSubmit(m: Mission) {
    setSubmitFor(m.id);
    setSubText(m.submission?.text ?? '');
    setSubImage(m.submission?.image ?? '');
    setError('');
  }

  function closeSubmit() {
    setSubmitFor('');
    setSubText('');
    setSubImage('');
  }

  async function pickImage() {
    setError('');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
      });
      if (result.canceled) return;
      setBusy(true);
      const small = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 900 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      setSubImage(`data:image/jpeg;base64,${small.base64}`);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load the image.');
    } finally {
      setBusy(false);
    }
  }

  async function submitWork(m: Mission) {
    if (!live) return;
    setError('');
    const t = subText.trim();
    if (!t && !subImage) {
      setError('Write something or add an image.');
      return;
    }
    setBusy(true);
    try {
      await updateDoc(doc(db, 'projects', live.id, 'missions', m.id), {
        status: 'review',
        submission: { text: t, image: subImage, byName: myName, at: Date.now() },
      });
      await notify({
        toId: m.createdBy,
        fromId: uid ?? '',
        fromName: myName,
        title: 'Work submitted for review',
        body: `${myName} submitted "${m.title}" · ${live.name}`,
        projectId: live.id,
        screen: 'missions',
      });
      closeSubmit();
    } catch (e: any) {
      setError(e?.message ?? 'Could not submit.');
    } finally {
      setBusy(false);
    }
  }

  async function approve(m: Mission) {
    if (!live) return;
    setError('');
    try {
      await updateDoc(doc(db, 'projects', live.id, 'missions', m.id), {
        status: 'done',
        feedback: null,
      });
      await notify({
        toId: m.assigneeId,
        fromId: uid ?? '',
        fromName: myName,
        title: 'Mission approved ✓',
        body: `"${m.title}" was approved · ${live.name}`,
        projectId: live.id,
        screen: 'missions',
      });
      setReviewFor('');
      setReviewComment('');
    } catch (e: any) {
      setError(e?.message ?? 'Could not approve.');
    }
  }

  async function requestChanges(m: Mission) {
    if (!live) return;
    setError('');
    const c = reviewComment.trim();
    if (!c) {
      setError('Write a comment so the member knows what to fix.');
      return;
    }
    try {
      await updateDoc(doc(db, 'projects', live.id, 'missions', m.id), {
        status: 'changes',
        feedback: { text: c, byName: myName, at: Date.now() },
      });
      await notify({
        toId: m.assigneeId,
        fromId: uid ?? '',
        fromName: myName,
        title: 'Changes requested',
        body: `"${m.title}": ${c}`,
        projectId: live.id,
        screen: 'missions',
      });
      setReviewFor('');
      setReviewComment('');
    } catch (e: any) {
      setError(e?.message ?? 'Could not send the comment.');
    }
  }

  if (!live) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={styles.content}>
        <View style={styles.wrap}>
          <PageHeader title="Missions" />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {projects.length === 0 ? (
            <Text style={styles.muted}>No projects yet. Ask the admin to add you to a project.</Text>
          ) : null}
          {projects.map((p, i) => (
            <FadeIn key={p.id} delay={80 + Math.min(i, 6) * 70}>
              <Press style={styles.card} onPress={() => setCurrent(p)}>
                <View style={styles.row}>
                  <ProjectLogo logo={p.logo} name={p.name} size={48} />
                  <Text style={[styles.projectName, { marginLeft: 14 }]} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={C.muted} />
                </View>
              </Press>
            </FadeIn>
          ))}
        </View>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.wrap}>
          <FadeIn style={styles.headerRow}>
            <Press
              onPress={() => {
                setCurrent(null);
                resetForm();
                closeSubmit();
                setReviewFor('');
                setFilter('all');
                setConfirmId('');
              }}
              scaleTo={0.88}
              style={styles.backBtn}
            >
              <Ionicons name="chevron-back" size={22} color={C.ink} />
            </Press>
            <ProjectLogo logo={live.logo} name={live.name} size={40} />
            <Text style={[styles.title, { flex: 1, marginBottom: 0, marginLeft: 10, fontSize: 22 }]} numberOfLines={1}>
              {live.name}
            </Text>
            {isAdmin ? (
              <Press
                scaleTo={0.88}
                style={styles.addBtn}
                onPress={() => (showForm ? resetForm() : setShowForm(true))}
              >
                <Ionicons name={showForm ? 'close' : 'add'} size={22} color={C.ink} />
              </Press>
            ) : null}
          </FadeIn>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {showForm ? (
            <FadeIn style={styles.form}>
              <Text style={styles.formTitle}>{editingId ? 'Edit mission' : 'New mission'}</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Title"
                placeholderTextColor="#9A9AA0"
                style={styles.input}
              />
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Description (optional)"
                placeholderTextColor="#9A9AA0"
                style={[styles.input, { height: 80, textAlignVertical: 'top', paddingTop: 12 }]}
                multiline
              />

              <Text style={styles.label}>Assigned to</Text>
              <View style={styles.chips}>
                <Press
                  outerStyle={styles.chipOuter}
                  scaleTo={0.9}
                  style={[styles.chip, assigneeId === '' && styles.chipOn]}
                  onPress={() => setAssigneeId('')}
                >
                  <Text style={styles.chipText}>Nobody</Text>
                </Press>
                {live.memberIds.map((id) => (
                  <Press
                    key={id}
                    outerStyle={styles.chipOuter}
                    scaleTo={0.9}
                    style={[styles.chip, assigneeId === id && styles.chipOn]}
                    onPress={() => setAssigneeId(id)}
                  >
                    <Text style={styles.chipText}>{nameOf(id)}</Text>
                  </Press>
                ))}
              </View>

              <Text style={styles.label}>Priority</Text>
              <View style={styles.chips}>
                {PRIORITIES.map((p) => (
                  <Press
                    key={p.key}
                    outerStyle={styles.chipOuter}
                    scaleTo={0.9}
                    style={[styles.chip, priority === p.key && styles.chipOn]}
                    onPress={() => setPriority(p.key)}
                  >
                    <Text style={styles.chipText}>{p.label}</Text>
                  </Press>
                ))}
              </View>

              <Text style={styles.label}>Due date</Text>
              <DuePicker value={dueDate} onChange={setDueDate} />

              <View style={{ marginTop: 14 }}>
                <Button
                  label={editingId ? 'Save changes' : 'Create mission'}
                  onPress={save}
                  fullWidth
                />
                {editingId ? (
                  <Press outerStyle={{ marginTop: 12, alignSelf: 'center' }} scaleTo={0.9} onPress={resetForm}>
                    <Text style={styles.link}>Cancel</Text>
                  </Press>
                ) : null}
              </View>
            </FadeIn>
          ) : null}

          {missions.length > 0 ? (
            <FadeIn delay={80} style={styles.progressCard}>
              <View style={styles.row}>
                <Text style={styles.progressTitle}>Team progress</Text>
                <Text style={styles.progressCount}>
                  {totalDone}/{missions.length} done
                </Text>
              </View>
              {isAdmin && pendingCount > 0 ? (
                <Text style={styles.pendingNote}>{pendingCount} waiting for your review</Text>
              ) : null}
              {progress.length === 0 ? (
                <Text style={[styles.muted, { marginTop: 8 }]}>No missions assigned yet.</Text>
              ) : null}
              {progress.map(([id, p]) => {
                const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
                const complete = p.done === p.total;
                return (
                  <View key={id} style={{ marginTop: 12 }}>
                    <View style={styles.row}>
                      <Text style={styles.personName} numberOfLines={1}>
                        {nameOf(id)}
                        {id === uid ? ' (you)' : ''}
                      </Text>
                      <Text style={[styles.personState, complete && { color: C.green }]}>
                        {complete ? 'All done ✓' : `${p.done}/${p.total}`}
                      </Text>
                    </View>
                    <View style={styles.track}>
                      <View
                        style={[
                          styles.fill,
                          { width: `${pct}%`, backgroundColor: complete ? C.green : C.mint },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
            </FadeIn>
          ) : null}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 12 }}>
            <Press
              outerStyle={styles.chipOuter}
              scaleTo={0.9}
              style={[styles.chip, filter === 'all' && styles.chipOn]}
              onPress={() => setFilter('all')}
            >
              <Text style={styles.chipText}>All ({missions.length})</Text>
            </Press>
            {STATUSES.map((s) => (
              <Press
                key={s.key}
                outerStyle={styles.chipOuter}
                scaleTo={0.9}
                style={[styles.chip, filter === s.key && styles.chipOn]}
                onPress={() => setFilter(s.key)}
              >
                <Text style={styles.chipText}>
                  {s.label} ({missions.filter((m) => m.status === s.key).length})
                </Text>
              </Press>
            ))}
          </ScrollView>

          {visible.length === 0 ? (
            <Text style={[styles.muted, { textAlign: 'center', marginTop: 24 }]}>
              No missions here yet.
            </Text>
          ) : null}

          {visible.map((m, i) => {
            const pr = PRIORITIES.find((p) => p.key === m.priority) ?? PRIORITIES[1];
            const mine = m.assigneeId === uid;
            const canSeeWork = isAdmin || mine;
            const canEdit = can('editTasks') && m.status !== 'done';
            const canDelete = can('deleteTasks') || mine;
            const bc = badgeColors(m.status);
            const memberCanSubmit = mine && (m.status === 'todo' || m.status === 'progress' || m.status === 'changes');
            const dueObj = parseDue(m.dueDate);
            const dueInfo = dueObj && m.status !== 'done' ? timeLeft(dueObj, now) : null;
            return (
              <FadeIn
                key={m.id}
                delay={120 + Math.min(i, 6) * 70}
                style={[styles.card, m.status === 'done' && styles.cardDone]}
              >
                <View style={styles.row}>
                  <View style={[styles.prDot, { backgroundColor: pr.color }]} />
                  <Text style={styles.missionTitle} numberOfLines={2}>
                    {m.title}
                  </Text>
                  {mine ? (
                    <View style={styles.meTag}>
                      <Text style={styles.meTagText}>You</Text>
                    </View>
                  ) : null}
                </View>
                {m.description ? <Text style={styles.desc}>{m.description}</Text> : null}
                <Text style={styles.meta}>
                  {m.assigneeId ? nameOf(m.assigneeId) : 'Unassigned'}
                  {m.dueDate ? `  ·  Due ${dueLabel(m.dueDate)}` : ''}  ·  {pr.label}
                </Text>

                <View style={[styles.row, { marginTop: 8, flexWrap: 'wrap' }]}>
                  <View style={[styles.badge, { backgroundColor: bc.bg }]}>
                    <Text style={[styles.badgeText, { color: bc.fg }]}>
                      {m.status === 'done' ? 'Done ✓' : statusLabel(m.status)}
                    </Text>
                  </View>
                  {dueInfo ? (
                    <View
                      style={[
                        styles.badge,
                        {
                          marginLeft: 8,
                          backgroundColor: dueInfo.overdue ? '#FBDADA' : '#E3F7EF',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          { color: dueInfo.overdue ? '#A32626' : '#1B7F4B' },
                        ]}
                      >
                        {dueInfo.overdue ? `Overdue ${dueInfo.text}` : `${dueInfo.text} left`}
                      </Text>
                    </View>
                  ) : null}
                  {m.submission?.at ? (
                    <Text style={[styles.meta, { marginTop: 0, marginLeft: 8 }]}>
                      Sent {new Date(m.submission.at).toLocaleDateString()}
                    </Text>
                  ) : null}
                </View>

                {m.status === 'changes' && m.feedback && canSeeWork ? (
                  <View style={styles.feedbackBox}>
                    <Text style={styles.feedbackLabel}>
                      Admin comment{m.feedback.byName ? ` · ${m.feedback.byName}` : ''}
                    </Text>
                    <Text style={styles.workText}>{m.feedback.text}</Text>
                  </View>
                ) : null}

                {m.submission && canSeeWork ? (
                  <View style={styles.workBox}>
                    <Text style={styles.workLabel}>
                      SUBMITTED WORK{m.submission.byName ? ` · ${m.submission.byName}` : ''}
                    </Text>
                    {m.submission.text ? <Text style={styles.workText}>{m.submission.text}</Text> : null}
                    {m.submission.image ? (
                      <Image
                        source={{ uri: m.submission.image }}
                        style={styles.workImage}
                        resizeMode="cover"
                      />
                    ) : null}
                  </View>
                ) : null}

                {isAdmin && m.status === 'review' ? (
                  <View style={styles.reviewBox}>
                    {reviewFor === m.id ? (
                      <>
                        <TextInput
                          value={reviewComment}
                          onChangeText={setReviewComment}
                          placeholder="What should the member fix?"
                          placeholderTextColor="#9A9AA0"
                          style={[styles.input, { height: 90, textAlignVertical: 'top', paddingTop: 12 }]}
                          multiline
                        />
                        <View style={styles.row}>
                          <Press
                            outerStyle={{ flex: 1 }}
                            style={styles.rejectBtn}
                            onPress={() => requestChanges(m)}
                          >
                            <Text style={styles.rejectText}>Send comment</Text>
                          </Press>
                          <Press
                            outerStyle={{ marginLeft: 14 }}
                            scaleTo={0.9}
                            onPress={() => {
                              setReviewFor('');
                              setReviewComment('');
                            }}
                          >
                            <Text style={styles.link}>Cancel</Text>
                          </Press>
                        </View>
                      </>
                    ) : (
                      <View style={styles.row}>
                        <Press outerStyle={{ flex: 1 }} style={styles.approveBtn} onPress={() => approve(m)}>
                          <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                          <Text style={styles.approveText}>Approve</Text>
                        </Press>
                        <Press
                          outerStyle={{ flex: 1, marginLeft: 10 }}
                          style={styles.rejectBtn}
                          onPress={() => {
                            setReviewFor(m.id);
                            setReviewComment('');
                            setError('');
                          }}
                        >
                          <Text style={styles.rejectText}>Request changes</Text>
                        </Press>
                      </View>
                    )}
                  </View>
                ) : null}

                {mine && m.status === 'review' ? (
                  <Text style={[styles.meta, { marginTop: 10 }]}>
                    Waiting for the admin to review your work.
                  </Text>
                ) : null}

                {mine && m.status === 'todo' && submitFor !== m.id ? (
                  <Press outerStyle={{ marginTop: 12 }} style={styles.ghostBtn2} onPress={() => startWork(m)}>
                    <Text style={styles.ghostText}>Start working</Text>
                  </Press>
                ) : null}

                {memberCanSubmit && submitFor !== m.id ? (
                  <Press outerStyle={{ marginTop: 12 }} style={styles.submitBtn} onPress={() => openSubmit(m)}>
                    <Ionicons name="cloud-upload-outline" size={18} color={C.ink} />
                    <Text style={styles.submitText}>
                      {m.status === 'changes' ? 'Resubmit work' : 'Submit work'}
                    </Text>
                  </Press>
                ) : null}

                {mine && submitFor === m.id ? (
                  <FadeIn style={styles.submitForm}>
                    <TextInput
                      value={subText}
                      onChangeText={setSubText}
                      placeholder="Write your article or notes here"
                      placeholderTextColor="#9A9AA0"
                      style={[styles.input, { height: 110, textAlignVertical: 'top', paddingTop: 12 }]}
                      multiline
                    />
                    {subImage ? (
                      <Image source={{ uri: subImage }} style={styles.workImage} resizeMode="cover" />
                    ) : null}
                    <View style={styles.row}>
                      <Press style={styles.ghostBtn} onPress={pickImage} disabled={busy}>
                        <Ionicons name="image-outline" size={18} color={C.ink} />
                        <Text style={styles.ghostText}>{subImage ? 'Change image' : 'Add image'}</Text>
                      </Press>
                      {subImage ? (
                        <Press outerStyle={{ marginLeft: 14 }} scaleTo={0.9} onPress={() => setSubImage('')}>
                          <Text style={[styles.link, { color: C.red }]}>Remove</Text>
                        </Press>
                      ) : null}
                    </View>
                    <View style={[styles.row, { marginTop: 12 }]}>
                      <Button
                        label="Send for review"
                        onPress={() => submitWork(m)}
                        loading={busy}
                        style={{ flex: 1 }}
                      />
                      <Press outerStyle={{ marginLeft: 14 }} scaleTo={0.9} onPress={closeSubmit}>
                        <Text style={styles.link}>Cancel</Text>
                      </Press>
                    </View>
                  </FadeIn>
                ) : null}

                {canEdit || canDelete ? (
                  <View style={[styles.row, { marginTop: 12 }]}>
                    {canEdit ? (
                      <Press scaleTo={0.9} onPress={() => startEdit(m)}>
                        <Text style={styles.link}>Edit</Text>
                      </Press>
                    ) : null}
                    {canDelete ? (
                      <Press
                        outerStyle={{ marginLeft: canEdit ? 18 : 0 }}
                        scaleTo={0.9}
                        onPress={() => remove(m)}
                      >
                        <Text style={[styles.link, { color: C.red }]}>
                          {confirmId === m.id ? 'Tap again to confirm' : 'Delete'}
                        </Text>
                      </Press>
                    ) : null}
                  </View>
                ) : null}
              </FadeIn>
            );
          })}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 56, paddingBottom: 40 },
  wrap: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  title: { fontSize: 28, fontWeight: '800', color: C.ink, marginBottom: 14 },
  muted: { color: C.muted, fontSize: 14 },
  error: { color: C.red, fontSize: 13, marginVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  backBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: C.line,
  },
  cardDone: { borderColor: '#BFEBD3' },
  projectName: { flex: 1, fontSize: 18, fontWeight: '800', color: C.ink },
  prDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  missionTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: C.ink },
  meTag: { backgroundColor: C.lavender, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  meTagText: { fontSize: 11, fontWeight: '800', color: C.ink },
  desc: { color: C.ink, fontSize: 14, marginTop: 6, lineHeight: 20 },
  meta: { color: C.muted, fontSize: 12, marginTop: 8 },
  badge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  chipOuter: { marginRight: 8, marginBottom: 6 },
  chip: {
    backgroundColor: '#F0F0EA',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipOn: { backgroundColor: C.mint },
  chipText: { color: C.ink, fontWeight: '700', fontSize: 13 },
  link: { color: C.ink, fontWeight: '800', fontSize: 13 },
  form: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: C.line,
  },
  formTitle: { fontSize: 16, fontWeight: '800', color: C.ink, marginBottom: 10 },
  label: { fontSize: 12, fontWeight: '800', color: C.muted, marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 46,
    color: C.ink,
    backgroundColor: '#FAFAF7',
    marginBottom: 8,
  },
  pickerField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 46,
    backgroundColor: '#FAFAF7',
  },
  pickerFieldText: { flex: 1, color: C.ink, fontSize: 14, fontWeight: '600' },
  pickerPanel: {
    marginTop: 8,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: '#FAFAF7',
  },
  pickerNav: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F0F0EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerMonth: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '800', color: C.ink },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  dayCellWrap: { width: '14.2857%', alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  weekdayText: { fontSize: 11, fontWeight: '800', color: C.muted, paddingVertical: 4 },
  dayCell: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dayCellOn: { backgroundColor: C.mint },
  dayText: { fontSize: 13, fontWeight: '600', color: C.ink },
  dayTextOff: { color: '#C4C4CA' },
  timeCol: { alignItems: 'center' },
  timeBtn: {
    width: 40,
    height: 30,
    borderRadius: 10,
    backgroundColor: '#F0F0EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeText: { fontSize: 24, fontWeight: '800', color: C.ink, marginVertical: 4, minWidth: 44, textAlign: 'center' },
  timeColon: { fontSize: 24, fontWeight: '800', color: C.ink, marginHorizontal: 8 },
  progressCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: C.line,
  },
  progressTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: C.ink },
  progressCount: { fontSize: 13, fontWeight: '800', color: C.muted },
  pendingNote: { fontSize: 12, fontWeight: '800', color: '#8A5A00', marginTop: 6 },
  personName: { flex: 1, fontSize: 14, fontWeight: '700', color: C.ink, paddingRight: 8 },
  personState: { fontSize: 12, fontWeight: '800', color: C.muted },
  track: { height: 8, borderRadius: 4, backgroundColor: '#ECECE6', marginTop: 6, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  workBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#FAFAF7',
    borderWidth: 1,
    borderColor: C.line,
  },
  workLabel: { fontSize: 11, fontWeight: '800', color: C.muted, marginBottom: 4, letterSpacing: 0.5 },
  workText: { fontSize: 14, color: C.ink, lineHeight: 20 },
  workImage: { width: '100%', height: 180, borderRadius: 12, marginTop: 8, marginBottom: 8 },
  feedbackBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#FDECEC',
    borderWidth: 1,
    borderColor: '#F5C2C2',
  },
  feedbackLabel: { fontSize: 11, fontWeight: '800', color: '#A32626', marginBottom: 4 },
  reviewBox: { marginTop: 12 },
  approveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: C.green,
    borderRadius: 14,
    height: 44,
  },
  approveText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  rejectBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FDECEC',
    borderWidth: 1,
    borderColor: '#F5C2C2',
    borderRadius: 14,
    height: 44,
  },
  rejectText: { color: '#A32626', fontWeight: '800', fontSize: 14 },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.mint,
    borderRadius: 14,
    height: 44,
  },
  submitText: { color: C.ink, fontWeight: '800', fontSize: 14 },
  submitForm: { marginTop: 12 },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0F0EA',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ghostBtn2: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F0EA',
    borderRadius: 14,
    height: 40,
  },
  ghostText: { color: C.ink, fontWeight: '700', fontSize: 13 },
});