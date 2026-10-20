import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
} from 'react-native';
import { useAuth } from '../auth';
import { FadeIn, PageHeader, Press } from '../components/ui';
import { db } from '../firebase';
import { notify } from '../notify';
import { formatLastSeen, isOnline, useNow, usePresenceMap } from '../presence';

const C = {
  bg: '#F7F7F3',
  ink: '#18181B',
  mint: '#7DE2C0',
  lavender: '#B9A7FF',
  red: '#D14343',
  card: '#FFFFFF',
  green: '#2FBF71',
  muted: '#6B6B73',
  line: '#E4E4E7',
};

// الـ Rules كتقبل الصورة حتى 400000 حرف، كنخليو هامش
const MAX_IMAGE_CHARS = 380000;

type ProjectLite = { id: string; name: string; logo: string; memberIds: string[] };

type Message = {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  image: string;
  time: string;
  createdMs: number;
  deleted: boolean;
};

type DeletedInfo = { text: string; image: string; deletedByName: string };
type ReadInfo = { userName: string; lastReadMs: number };
type UserLite = { fullName: string; username: string; photo: string; role: string; status: string };
type DmChat = { id: string; members: string[] };

function formatTime(value: any) {
  try {
    const d = value?.toDate ? value.toDate() : null;
    if (!d) return '';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch {
    return '';
  }
}

function previewOf(t: string) {
  return t ? t.slice(0, 120) : 'Sent a photo';
}

// ---------------- Image helpers ----------------

async function renderBase64(uri: string, width: number, quality: number): Promise<string> {
  const IM: any = ImageManipulator;
  const format = IM.SaveFormat?.JPEG ?? 'jpeg';

  // الـ API الجديد
  if (IM.ImageManipulator?.manipulate) {
    const ctx = IM.ImageManipulator.manipulate(uri);
    ctx.resize({ width });
    const ref = await ctx.renderAsync();
    const out = await ref.saveAsync({ compress: quality, format, base64: true });
    if (!out?.base64) throw new Error('Could not process the image.');
    return out.base64 as string;
  }

  // الـ API القديم
  if (IM.manipulateAsync) {
    const out = await IM.manipulateAsync(uri, [{ resize: { width } }], {
      compress: quality,
      format,
      base64: true,
    });
    if (!out?.base64) throw new Error('Could not process the image.');
    return out.base64 as string;
  }

  throw new Error('Image tools are not available.');
}

async function pickCompressedImage(): Promise<string> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
  });
  if (res.canceled || !res.assets || res.assets.length === 0) return '';
  const asset = res.assets[0];
  const steps = [
    { width: 900, q: 0.55 },
    { width: 700, q: 0.4 },
    { width: 500, q: 0.3 },
    { width: 360, q: 0.25 },
  ];
  for (const s of steps) {
    const width = asset.width ? Math.min(s.width, asset.width) : s.width;
    const b64 = await renderBase64(asset.uri, width, s.q);
    const dataUri = `data:image/jpeg;base64,${b64}`;
    if (dataUri.length <= MAX_IMAGE_CHARS) return dataUri;
  }
  throw new Error('This image is too large. Try another one.');
}

// ---------------- Small components ----------------

function ProjectAvatar({ logo, name, size }: { logo: string; name: string; size: number }) {
  const box = { width: size, height: size, borderRadius: size * 0.28 };
  if (logo) {
    return <Image source={{ uri: logo }} style={box} />;
  }
  return (
    <View style={[box, styles.avatarEmpty]}>
      <Text style={[styles.userLetter, { fontSize: size * 0.28 }]} numberOfLines={1} adjustsFontSizeToFit>
        {(name || '?').split(' ')[0]}
      </Text>
    </View>
  );
}

function UserAvatar({
  photo,
  name,
  size,
  online,
}: {
  photo?: string;
  name: string;
  size: number;
  online?: boolean;
}) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={{ width: size, height: size }}>
      {photo ? (
        <Image source={{ uri: photo }} style={box} />
      ) : (
        <View style={[box, styles.userEmpty]}>
          <Text style={[styles.userLetter, { fontSize: size * 0.42 }]}>
            {(name || '?').charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      {online ? (
        <View
          style={[
            styles.onlineBadge,
            { width: size * 0.32, height: size * 0.32, borderRadius: size * 0.16 },
          ]}
        />
      ) : null}
    </View>
  );
}

function CountBadge({ n, style }: { n: number; style?: any }) {
  if (n <= 0) return null;
  return (
    <View style={[styles.countBadge, style]}>
      <Text style={styles.countText}>{n >= 50 ? '50+' : String(n)}</Text>
    </View>
  );
}

// كيحسب الرسائل غير المقروءة لشات واحد (مشروع ولا شات خاص)
function UnreadProbe({
  keyId,
  msgPath,
  readPath,
  uid,
  onCount,
}: {
  keyId: string;
  msgPath: string;
  readPath: string;
  uid: string;
  onCount: (k: string, n: number) => void;
}) {
  const [lastRead, setLastRead] = useState<number | null>(null);
  const [rows, setRows] = useState<{ s: string; t: number; d: boolean }[]>([]);

  useEffect(() => {
    return onSnapshot(
      doc(db, readPath),
      (snap) => {
        const x: any = snap.exists() ? snap.data() : null;
        setLastRead(x?.lastReadAt?.toMillis?.() ?? 0);
      },
      () => setLastRead(0),
    );
  }, [readPath]);

  useEffect(() => {
    const q = query(collection(db, msgPath), orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(
      q,
      (snap) => {
        setRows(
          snap.docs.map((d) => {
            const x: any = d.data();
            return {
              s: (x.senderId ?? '') as string,
              t: (x.createdAt?.toMillis?.() ?? 0) as number,
              d: x.deleted === true,
            };
          }),
        );
      },
      () => {},
    );
  }, [msgPath]);

  useEffect(() => {
    if (lastRead === null) return;
    const n = rows.filter((r) => r.s !== uid && !r.d && r.t > lastRead).length;
    onCount(keyId, n);
  }, [lastRead, rows, uid, keyId, onCount]);

  return null;
}

type BubbleProps = {
  m: Message;
  mine: boolean;
  first: boolean;
  gapTop: boolean;
  senderName: string;
  senderPhoto?: string;
  senderOnline?: boolean;
  showSender: boolean;
  deletedInfo?: DeletedInfo;
  canDelete: boolean;
  confirming: boolean;
  onDelete: () => void;
  onOpenImage: (uri: string) => void;
};

function Bubble(p: BubbleProps) {
  const { m, mine, first } = p;
  return (
    <View style={{ marginBottom: first ? 10 : 3, marginTop: first && p.gapTop ? 6 : 0 }}>
      <View style={[styles.bubbleRow, mine && { justifyContent: 'flex-end' }]}>
        {!mine ? (
          <View style={{ width: 32, marginRight: 8, justifyContent: 'flex-end' }}>
            {first ? (
              <UserAvatar photo={p.senderPhoto} name={p.senderName} size={32} online={p.senderOnline} />
            ) : null}
          </View>
        ) : null}

        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
          {!mine && first && p.showSender ? <Text style={styles.sender}>{p.senderName}</Text> : null}

          {m.deleted ? (
            <>
              <Text style={styles.deletedText}>Message deleted</Text>
              {p.deletedInfo ? (
                <View style={styles.adminBox}>
                  <Text style={styles.adminLabel}>
                    Deleted by {p.deletedInfo.deletedByName || 'unknown'}:
                  </Text>
                  {p.deletedInfo.image ? (
                    <Pressable onPress={() => p.onOpenImage(p.deletedInfo!.image)}>
                      <Image source={{ uri: p.deletedInfo.image }} style={styles.msgImage} />
                    </Pressable>
                  ) : null}
                  {p.deletedInfo.text ? <Text style={styles.adminText}>{p.deletedInfo.text}</Text> : null}
                </View>
              ) : null}
            </>
          ) : (
            <>
              {m.image ? (
                <Pressable onPress={() => p.onOpenImage(m.image)}>
                  <Image source={{ uri: m.image }} style={styles.msgImage} />
                </Pressable>
              ) : null}
              {m.text ? <Text style={styles.msgText}>{m.text}</Text> : null}
            </>
          )}

          {m.time ? <Text style={styles.time}>{m.time}</Text> : null}

          {p.canDelete ? (
            <Press scaleTo={0.9} outerStyle={styles.delBtn} onPress={p.onDelete}>
              <Text style={styles.delText}>{p.confirming ? 'Tap again to confirm' : 'Delete'}</Text>
            </Press>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function Composer({
  value,
  onChange,
  image,
  onPickImage,
  onClearImage,
  onSend,
}: {
  value: string;
  onChange: (v: string) => void;
  image: string;
  onPickImage: () => void;
  onClearImage: () => void;
  onSend: () => void;
}) {
  return (
    <View style={styles.inputBar}>
      {image ? (
        <View style={styles.draftRow}>
          <Image source={{ uri: image }} style={styles.draftImg} />
          <Press scaleTo={0.88} style={styles.draftClose} onPress={onClearImage}>
            <Ionicons name="close" size={16} color={C.ink} />
          </Press>
        </View>
      ) : null}
      <View style={styles.inputWrap}>
        <Press scaleTo={0.88} style={styles.attachBtn} onPress={onPickImage}>
          <Ionicons name="image-outline" size={20} color={C.ink} />
        </Press>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="Write a message"
          placeholderTextColor="#9A9AA0"
          style={styles.input}
          maxLength={2000}
          onSubmitEditing={onSend}
          returnKeyType="send"
        />
        <Press scaleTo={0.88} style={styles.sendBtn} onPress={onSend}>
          <Ionicons name="send" size={18} color={C.ink} />
        </Press>
      </View>
    </View>
  );
}

// ---------------- Main screen ----------------

export default function Chat() {
  const router = useRouter();
  const params = useLocalSearchParams<{ dm?: string }>();
  const { user, profile, isAdmin, isOwner } = useAuth();
  const uid = user?.uid;
  const seeAll = isAdmin || isOwner;
  const myName: string =
    (profile as any)?.fullName || (profile as any)?.username || user?.email || 'User';

  const presence = usePresenceMap();
  const now = useNow(30000);

  const [tab, setTab] = useState<'projects' | 'direct'>('projects');

  // Projects chat
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [current, setCurrent] = useState<ProjectLite | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [deletedMap, setDeletedMap] = useState<Record<string, DeletedInfo>>({});
  const [reads, setReads] = useState<Record<string, ReadInfo>>({});
  const [text, setText] = useState('');
  const [draftImage, setDraftImage] = useState('');
  const [showMembers, setShowMembers] = useState(false);

  // Shared
  const [confirmMsgId, setConfirmMsgId] = useState('');
  const [focused, setFocused] = useState(true);
  const [sending, setSending] = useState(false);
  const [viewer, setViewer] = useState('');
  const [error, setError] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  // Users (all)
  const [users, setUsers] = useState<Record<string, UserLite>>({});

  // Direct chat
  const [dmChats, setDmChats] = useState<DmChat[]>([]);
  const [dmId, setDmId] = useState('');
  const [dmMessages, setDmMessages] = useState<Message[]>([]);
  const [dmDeletedMap, setDmDeletedMap] = useState<Record<string, DeletedInfo>>({});
  const [dmReads, setDmReads] = useState<Record<string, ReadInfo>>({});
  const [dmText, setDmText] = useState('');
  const [dmDraftImage, setDmDraftImage] = useState('');

  // Unread counters
  const [counts, setCounts] = useState<Record<string, number>>({});
  const setCount = useCallback((k: string, n: number) => {
    setCounts((prev) => (prev[k] === n ? prev : { ...prev, [k]: n }));
  }, []);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    setConfirmMsgId('');
  }, [dmId, current?.id]);

  // فتح شات خاص مباشرة من Team
  useEffect(() => {
    const peer = typeof params.dm === 'string' ? params.dm : '';
    if (!peer || !uid) return;
    if (peer !== uid) {
      setTab('direct');
      setDmId([uid, peer].sort().join('_'));
      setError('');
    }
    router.setParams({ dm: '' });
  }, [params.dm, uid]);

  // المشاريع
  useEffect(() => {
    if (!uid) return;
    const base = collection(db, 'projects');
    const q = seeAll ? base : query(base, where('memberIds', 'array-contains', uid));
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
  }, [uid, seeAll]);

  // المستخدمين
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const map: Record<string, UserLite> = {};
        snap.docs.forEach((d) => {
          const x = d.data() as any;
          map[d.id] = {
            fullName: x.fullName ?? '',
            username: x.username ?? '',
            photo: x.photo ?? '',
            role: x.role ?? '',
            status: x.status ?? '',
          };
        });
        setUsers(map);
      },
      () => {},
    );
  }, [uid]);

  // لائحة الشاتات الخاصة (الـ owner كيشوف الكل، قراءة فقط)
  useEffect(() => {
    if (!uid) return;
    const base = collection(db, 'dms');
    const q = isOwner ? base : query(base, where('members', 'array-contains', uid));
    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => {
          const x = d.data();
          return {
            id: d.id,
            members: (Array.isArray(x.members) ? x.members : []) as string[],
          } as DmChat;
        });
        setDmChats(rows);
      },
      () => {},
    );
  }, [uid, isOwner]);

  const dmExists = dmChats.some((c) => c.id === dmId);

  // رسائل الشات الخاص
  useEffect(() => {
    if (!dmId || !dmExists) {
      setDmMessages([]);
      return;
    }
    const q = query(collection(db, 'dms', dmId, 'messages'), orderBy('createdAt', 'desc'), limit(100));
    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => {
          const x = d.data();
          return {
            id: d.id,
            senderId: x.senderId ?? '',
            senderName: x.senderName ?? '',
            text: x.text ?? '',
            image: x.image ?? '',
            time: formatTime(x.createdAt),
            createdMs: x.createdAt?.toMillis?.() ?? 0,
            deleted: x.deleted === true,
          } as Message;
        });
        rows.reverse();
        setDmMessages(rows);
      },
      () => {},
    );
  }, [dmId, dmExists]);

  // الممسوح فالشات الخاص (الـ owner غير)
  useEffect(() => {
    if (!dmId || !dmExists || !isOwner) {
      setDmDeletedMap({});
      return;
    }
    return onSnapshot(
      collection(db, 'dms', dmId, 'deletedMessages'),
      (snap) => {
        const map: Record<string, DeletedInfo> = {};
        snap.docs.forEach((d) => {
          const x = d.data();
          map[d.id] = {
            text: x.text ?? '',
            image: x.image ?? '',
            deletedByName: x.deletedByName ?? '',
          };
        });
        setDmDeletedMap(map);
      },
      () => {},
    );
  }, [dmId, dmExists, isOwner]);

  // Seen فالشات الخاص
  useEffect(() => {
    if (!dmId || !dmExists) {
      setDmReads({});
      return;
    }
    return onSnapshot(
      collection(db, 'dms', dmId, 'reads'),
      (snap) => {
        const map: Record<string, ReadInfo> = {};
        snap.docs.forEach((d) => {
          const x = d.data();
          map[d.id] = {
            userName: x.userName ?? '',
            lastReadMs: x.lastReadAt?.toMillis?.() ?? 0,
          };
        });
        setDmReads(map);
      },
      () => {},
    );
  }, [dmId, dmExists]);

  // رسائل المشروع
  useEffect(() => {
    if (!current) {
      setMessages([]);
      return;
    }
    const q = query(
      collection(db, 'projects', current.id, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(100),
    );
    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => {
          const x = d.data();
          return {
            id: d.id,
            senderId: x.senderId ?? '',
            senderName: x.senderName ?? '',
            text: x.text ?? '',
            image: x.image ?? '',
            time: formatTime(x.createdAt),
            createdMs: x.createdAt?.toMillis?.() ?? 0,
            deleted: x.deleted === true,
          } as Message;
        });
        rows.reverse();
        setMessages(rows);
      },
      (e) => setError(e.message),
    );
  }, [current?.id]);

  // الممسوح فالمشروع (admin و owner)
  useEffect(() => {
    if (!current || !seeAll) {
      setDeletedMap({});
      return;
    }
    return onSnapshot(
      collection(db, 'projects', current.id, 'deletedMessages'),
      (snap) => {
        const map: Record<string, DeletedInfo> = {};
        snap.docs.forEach((d) => {
          const x = d.data();
          map[d.id] = {
            text: x.text ?? '',
            image: x.image ?? '',
            deletedByName: x.deletedByName ?? '',
          };
        });
        setDeletedMap(map);
      },
      (e) => setError(e.message),
    );
  }, [current?.id, seeAll]);

  // Seen فالمشروع
  useEffect(() => {
    if (!current) {
      setReads({});
      return;
    }
    return onSnapshot(
      collection(db, 'projects', current.id, 'reads'),
      (snap) => {
        const map: Record<string, ReadInfo> = {};
        snap.docs.forEach((d) => {
          const x = d.data();
          map[d.id] = {
            userName: x.userName ?? '',
            lastReadMs: x.lastReadAt?.toMillis?.() ?? 0,
          };
        });
        setReads(map);
      },
      () => {},
    );
  }, [current?.id]);

  const lastMsgId = messages.length ? messages[messages.length - 1].id : '';
  const lastDmMsgId = dmMessages.length ? dmMessages[dmMessages.length - 1].id : '';

  // علامة "قريت" فالمشروع
  useEffect(() => {
    if (!current || !uid || !focused || isOwner || tab !== 'projects') return;
    setDoc(doc(db, 'projects', current.id, 'reads', uid), {
      userName: myName,
      lastReadAt: serverTimestamp(),
    }).catch(() => {});
  }, [current?.id, uid, focused, lastMsgId, myName, isOwner, tab]);

  // علامة "قريت" فالشات الخاص
  useEffect(() => {
    if (!dmId || !dmExists || !uid || !focused || isOwner || tab !== 'direct') return;
    setDoc(doc(db, 'dms', dmId, 'reads', uid), {
      userName: myName,
      lastReadAt: serverTimestamp(),
    }).catch(() => {});
  }, [dmId, dmExists, uid, focused, lastDmMsgId, myName, isOwner, tab]);

  // ---------------- Actions ----------------

  async function chooseImage(target: 'project' | 'dm') {
    setError('');
    try {
      const uri = await pickCompressedImage();
      if (!uri) return;
      if (target === 'project') setDraftImage(uri);
      else setDmDraftImage(uri);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load the image.');
    }
  }

  function notifyProject(p: ProjectLite, preview: string) {
    if (!uid) return;
    p.memberIds.forEach((id) => {
      if (id === uid || users[id]?.role === 'owner') return;
      void notify({
        toId: id,
        fromId: uid,
        fromName: myName,
        title: p.name || 'Project chat',
        body: `${myName}: ${preview}`,
        projectId: p.id,
        screen: 'chat',
      });
    });
  }

  async function send() {
    setError('');
    const t = text.trim();
    const img = draftImage;
    if ((!t && !img) || !current || !uid || isOwner || sending) return;
    const live = projects.find((p) => p.id === current.id) ?? current;
    setSending(true);
    try {
      setText('');
      setDraftImage('');
      await addDoc(collection(db, 'projects', current.id, 'messages'), {
        senderId: uid,
        senderName: myName,
        text: t,
        image: img,
        createdAt: serverTimestamp(),
      });
      notifyProject(live, previewOf(t));
    } catch (e: any) {
      setText(t);
      setDraftImage(img);
      setError(e?.message ?? 'Could not send the message.');
    } finally {
      setSending(false);
    }
  }

  async function sendDm() {
    setError('');
    const t = dmText.trim();
    const img = dmDraftImage;
    if ((!t && !img) || !dmId || !uid || isOwner || sending) return;
    const peerId = dmId.split('_').find((x) => x !== uid) ?? '';
    setSending(true);
    try {
      setDmText('');
      setDmDraftImage('');
      if (!dmExists) {
        await setDoc(doc(db, 'dms', dmId), {
          members: dmId.split('_'),
          createdAt: serverTimestamp(),
        }).catch(() => {});
      }
      await addDoc(collection(db, 'dms', dmId, 'messages'), {
        senderId: uid,
        senderName: myName,
        text: t,
        image: img,
        createdAt: serverTimestamp(),
      });
      if (peerId) {
        void notify({
          toId: peerId,
          fromId: uid,
          fromName: myName,
          title: myName,
          body: previewOf(t),
          projectId: '',
          screen: 'chat',
        });
      }
    } catch (e: any) {
      setDmText(t);
      setDmDraftImage(img);
      setError(e?.message ?? 'Could not send the message.');
    } finally {
      setSending(false);
    }
  }

  // المشروع: العضو رسائلو، والـ admin كاع
  function canDelete(m: Message) {
    return !m.deleted && !isOwner && (isAdmin || m.senderId === uid);
  }

  // الشات الخاص: غير صاحب الرسالة
  function canDeleteDm(m: Message) {
    return !m.deleted && !isOwner && m.senderId === uid;
  }

  async function removeMessage(m: Message) {
    setError('');
    if (!current || !uid || isOwner) return;
    if (confirmMsgId !== m.id) {
      setConfirmMsgId(m.id);
      return;
    }
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'projects', current.id, 'deletedMessages', m.id), {
        text: m.text,
        image: m.image,
        senderId: m.senderId,
        senderName: m.senderName,
        deletedBy: uid,
        deletedByName: myName,
        deletedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'projects', current.id, 'messages', m.id), {
        text: '',
        image: '',
        deleted: true,
        deletedBy: uid,
      });
      await batch.commit();
      setConfirmMsgId('');
    } catch (e: any) {
      setError(e?.message ?? 'Could not delete the message.');
    }
  }

  async function removeDm(m: Message) {
    setError('');
    if (!dmId || !uid || isOwner) return;
    if (confirmMsgId !== m.id) {
      setConfirmMsgId(m.id);
      return;
    }
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'dms', dmId, 'deletedMessages', m.id), {
        text: m.text,
        image: m.image,
        senderId: m.senderId,
        senderName: m.senderName,
        deletedBy: uid,
        deletedByName: myName,
        deletedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'dms', dmId, 'messages', m.id), {
        text: '',
        image: '',
        deleted: true,
        deletedBy: uid,
      });
      await batch.commit();
      setConfirmMsgId('');
    } catch (e: any) {
      setError(e?.message ?? 'Could not delete the message.');
    }
  }

  function onlineCount(p: ProjectLite) {
    return p.memberIds.filter((id) => id !== uid && isOnline(presence[id], now)).length;
  }

  function nameOf(id: string) {
    return users[id]?.fullName || users[id]?.username || presence[id]?.fullName || 'Unknown';
  }

  function lastSeenText(id: string) {
    const info = presence[id];
    if (isOnline(info, now)) return 'Online';
    return info?.lastSeenMs ? `Last seen ${formatLastSeen(info.lastSeenMs)}` : 'Offline';
  }

  function dmIdFor(other: string) {
    return [uid ?? '', other].sort().join('_');
  }

  // الناس اللي نقدر نتواصل معاهم (الأدمين الكل، والعضو غير اللي معاه فمشروع)
  const people = useMemo(() => {
    const shared = new Set<string>();
    projects.forEach((p) => p.memberIds.forEach((id) => shared.add(id)));
    const chatWith = new Set<string>();
    dmChats.forEach((c) => c.members.forEach((id) => id !== uid && chatWith.add(id)));
    return Object.entries(users)
      .filter(([id, u]) => id !== uid && u.status === 'active' && u.role !== 'owner')
      .filter(([id]) => seeAll || shared.has(id) || chatWith.has(id))
      .map(([id]) => id)
      .sort((a, b) => {
        const ua = counts['d:' + dmIdFor(a)] || 0;
        const ub = counts['d:' + dmIdFor(b)] || 0;
        if ((ua > 0) !== (ub > 0)) return ua > 0 ? -1 : 1;
        const ca = chatWith.has(a) ? 1 : 0;
        const cb = chatWith.has(b) ? 1 : 0;
        if (ca !== cb) return cb - ca;
        const oa = isOnline(presence[a], now) ? 1 : 0;
        const ob = isOnline(presence[b], now) ? 1 : 0;
        if (oa !== ob) return ob - oa;
        return nameOf(a).localeCompare(nameOf(b));
      });
  }, [users, projects, dmChats, presence, now, uid, seeAll, counts]);

  const chatWithSet = useMemo(() => {
    const s = new Set<string>();
    dmChats.forEach((c) => c.members.forEach((id) => id !== uid && s.add(id)));
    return s;
  }, [dmChats, uid]);

  const projectsUnread = projects.reduce((sum, p) => sum + (counts['p:' + p.id] || 0), 0);
  const directUnread = dmChats.reduce((sum, c) => sum + (counts['d:' + c.id] || 0), 0);

  // الـ probes كتحسب العداد حتى والشات مسدود
  const probes =
    uid && !isOwner ? (
      <>
        {projects.map((p) => (
          <UnreadProbe
            key={'p' + p.id}
            keyId={'p:' + p.id}
            msgPath={`projects/${p.id}/messages`}
            readPath={`projects/${p.id}/reads/${uid}`}
            uid={uid}
            onCount={setCount}
          />
        ))}
        {dmChats.map((c) => (
          <UnreadProbe
            key={'d' + c.id}
            keyId={'d:' + c.id}
            msgPath={`dms/${c.id}/messages`}
            readPath={`dms/${c.id}/reads/${uid}`}
            uid={uid}
            onCount={setCount}
          />
        ))}
      </>
    ) : null;

  let view: ReactElement;

  // ---------------- Direct chat view ----------------
  if (tab === 'direct' && dmId) {
    const ids = dmId.split('_');
    const peerId = ids.find((x) => x !== uid) ?? ids[0];
    const title = isOwner ? ids.map((i) => nameOf(i)).join(' & ') : nameOf(peerId);
    const peerOnline = !isOwner && isOnline(presence[peerId], now);
    const lastMineDmId = [...dmMessages].reverse().find((m) => m.senderId === uid && !m.deleted)?.id ?? '';
    const peerReadMs = dmReads[peerId]?.lastReadMs ?? 0;

    view = (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: C.bg }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Press scaleTo={0.88} style={styles.backBtn} onPress={() => setDmId('')}>
            <Ionicons name="chevron-back" size={22} color={C.ink} />
          </Press>
          {isOwner ? (
            <View style={[styles.userEmpty, { width: 40, height: 40, borderRadius: 20 }]}>
              <Ionicons name="people" size={20} color={C.ink} />
            </View>
          ) : (
            <UserAvatar photo={users[peerId]?.photo} name={title} size={40} online={peerOnline} />
          )}
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {title}
            </Text>
            {!isOwner ? (
              <Text style={[styles.headerSub, peerOnline && { color: C.green, fontWeight: '700' }]}>
                {lastSeenText(peerId)}
              </Text>
            ) : (
              <Text style={styles.headerSub}>Read-only</Text>
            )}
          </View>
        </View>

        <View style={styles.notice}>
          <Text style={styles.noticeText}>.</Text>
        </View>

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.messages}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          <View style={styles.wrap}>
            {dmMessages.length === 0 ? (
              <Text style={[styles.muted, { textAlign: 'center', marginTop: 30 }]}>
                {isOwner ? 'No messages yet.' : 'No messages yet. Say hello.'}
              </Text>
            ) : null}
            {dmMessages.map((m, i) => {
              const mine = m.senderId === uid;
              const prev = i > 0 ? dmMessages[i - 1] : null;
              const first = !prev || prev.senderId !== m.senderId;
              const sName = nameOf(m.senderId) !== 'Unknown' ? nameOf(m.senderId) : m.senderName;
              const seen = !isOwner && m.id === lastMineDmId && m.createdMs > 0 && peerReadMs >= m.createdMs;
              return (
                <View key={m.id}>
                  <Bubble
                    m={m}
                    mine={mine}
                    first={first}
                    gapTop={i > 0}
                    senderName={sName}
                    senderPhoto={users[m.senderId]?.photo}
                    showSender={isOwner}
                    deletedInfo={isOwner ? dmDeletedMap[m.id] : undefined}
                    canDelete={canDeleteDm(m)}
                    confirming={confirmMsgId === m.id}
                    onDelete={() => removeDm(m)}
                    onOpenImage={setViewer}
                  />
                  {seen ? <Text style={styles.seen}>Seen</Text> : null}
                </View>
              );
            })}
          </View>
        </ScrollView>

        {error ? <Text style={[styles.error, { paddingHorizontal: 20 }]}>{error}</Text> : null}

        {isOwner ? (
          <View style={styles.inputBar}>
            <Text style={styles.readOnlyText}>You are viewing this chat in read-only mode.</Text>
          </View>
        ) : (
          <Composer
            value={dmText}
            onChange={setDmText}
            image={dmDraftImage}
            onPickImage={() => chooseImage('dm')}
            onClearImage={() => setDmDraftImage('')}
            onSend={sendDm}
          />
        )}
      </KeyboardAvoidingView>
    );
  }

  // ---------------- Lists (Projects / Direct) ----------------
  else if (!current || tab === 'direct') {
    view = (
      <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={styles.content}>
        <View style={styles.wrap}>
          <PageHeader title="Chat" />

          <View style={styles.tabs}>
            <Press
              outerStyle={{ flex: 1 }}
              scaleTo={0.96}
              style={[styles.tab, tab === 'projects' && styles.tabOn]}
              onPress={() => {
                setTab('projects');
                setError('');
              }}
            >
              <View style={styles.tabInner}>
                <Text style={styles.tabText}>Projects</Text>
                <CountBadge n={projectsUnread} style={{ marginLeft: 8, marginRight: 0 }} />
              </View>
            </Press>
            <Press
              outerStyle={{ flex: 1, marginLeft: 8 }}
              scaleTo={0.96}
              style={[styles.tab, tab === 'direct' && styles.tabOn]}
              onPress={() => {
                setTab('direct');
                setCurrent(null);
                setError('');
              }}
            >
              <View style={styles.tabInner}>
                <Text style={styles.tabText}>Direct</Text>
                <CountBadge n={directUnread} style={{ marginLeft: 8, marginRight: 0 }} />
              </View>
            </Press>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {tab === 'projects' ? (
            <>
              {projects.length === 0 ? (
                <Text style={styles.muted}>No projects yet. Ask the admin to add you to a project.</Text>
              ) : null}
              {projects.map((p, i) => {
                const n = onlineCount(p);
                return (
                  <FadeIn key={p.id} delay={60 + Math.min(i, 6) * 60}>
                    <Press
                      style={styles.card}
                      onPress={() => {
                        setError('');
                        setCurrent(p);
                      }}
                    >
                      <View style={styles.cardRow}>
                        <ProjectAvatar logo={p.logo} name={p.name} size={52} />
                        <View style={{ flex: 1, marginLeft: 14 }}>
                          <Text style={styles.projectName} numberOfLines={1}>
                            {p.name}
                          </Text>
                          <View style={styles.onlineRow}>
                            <View style={[styles.dot, { backgroundColor: n > 0 ? C.green : '#C4C4CA' }]} />
                            <Text style={styles.muted}>
                              {p.memberIds.length} members · {n > 0 ? `${n} online` : 'No one online'}
                            </Text>
                          </View>
                        </View>
                        <CountBadge n={counts['p:' + p.id] || 0} />
                        <Ionicons name="chevron-forward" size={18} color={C.muted} />
                      </View>
                    </Press>
                  </FadeIn>
                );
              })}
            </>
          ) : isOwner ? (
            <>
              {dmChats.length === 0 ? <Text style={styles.muted}>No private chats yet.</Text> : null}
              {dmChats.map((c, i) => (
                <FadeIn key={c.id} delay={60 + Math.min(i, 6) * 60}>
                  <Press
                    style={styles.card}
                    onPress={() => {
                      setError('');
                      setDmId(c.id);
                    }}
                  >
                    <View style={styles.cardRow}>
                      <View style={[styles.userEmpty, { width: 46, height: 46, borderRadius: 23 }]}>
                        <Ionicons name="people" size={22} color={C.ink} />
                      </View>
                      <View style={{ flex: 1, marginLeft: 14 }}>
                        <Text style={styles.projectName} numberOfLines={1}>
                          {c.members.map((m) => nameOf(m)).join(' & ')}
                        </Text>
                        <Text style={styles.muted}>Read-only</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={C.muted} />
                    </View>
                  </Press>
                </FadeIn>
              ))}
            </>
          ) : (
            <>
              {people.length === 0 ? <Text style={styles.muted}>No one to message yet.</Text> : null}
              {people.map((id, i) => {
                const online = isOnline(presence[id], now);
                const unread = counts['d:' + dmIdFor(id)] || 0;
                return (
                  <FadeIn key={id} delay={60 + Math.min(i, 6) * 60}>
                    <Press
                      style={styles.card}
                      onPress={() => {
                        if (!uid) return;
                        setError('');
                        setDmId(dmIdFor(id));
                      }}
                    >
                      <View style={styles.cardRow}>
                        <UserAvatar photo={users[id]?.photo} name={nameOf(id)} size={48} online={online} />
                        <View style={{ flex: 1, marginLeft: 14 }}>
                          <Text style={styles.projectName} numberOfLines={1}>
                            {nameOf(id)}
                          </Text>
                          <Text style={[styles.muted, online && { color: C.green, fontWeight: '700' }]}>
                            {lastSeenText(id)}
                            {chatWithSet.has(id) ? '' : ' · New chat'}
                          </Text>
                        </View>
                        {unread > 0 ? (
                          <CountBadge n={unread} />
                        ) : (
                          <Ionicons name="chatbubble-outline" size={18} color={C.muted} />
                        )}
                      </View>
                    </Press>
                  </FadeIn>
                );
              })}
            </>
          )}
        </View>
      </ScrollView>
    );
  }

  // ---------------- Project chat view ----------------
  else {
    const live = projects.find((p) => p.id === current.id) ?? current;
    const visibleIds = live.memberIds.filter((id) => users[id]?.role !== 'owner');
    const headerOnline = onlineCount(live);
    const lastMineId = [...messages].reverse().find((m) => m.senderId === uid)?.id ?? '';

    const sortedMembers = [...visibleIds].sort((a, b) => {
      const oa = isOnline(presence[a], now) ? 1 : 0;
      const ob = isOnline(presence[b], now) ? 1 : 0;
      if (oa !== ob) return ob - oa;
      return nameOf(a).localeCompare(nameOf(b));
    });

    view = (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: C.bg }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Press
            scaleTo={0.88}
            style={styles.backBtn}
            onPress={() => {
              setCurrent(null);
              setShowMembers(false);
            }}
          >
            <Ionicons name="chevron-back" size={22} color={C.ink} />
          </Press>
          <ProjectAvatar logo={live.logo} name={live.name} size={40} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {live.name}
            </Text>
            <View style={styles.onlineRow}>
              <View style={[styles.dot, { backgroundColor: headerOnline > 0 ? C.green : '#C4C4CA' }]} />
              <Text style={styles.headerSub}>
                {visibleIds.length} members · {headerOnline > 0 ? `${headerOnline} online` : 'No one online'}
              </Text>
            </View>
          </View>
          <Press
            scaleTo={0.88}
            style={[styles.membersBtn, showMembers && { backgroundColor: C.mint }]}
            onPress={() => setShowMembers((v) => !v)}
          >
            <Ionicons name="people-outline" size={20} color={C.ink} />
          </Press>
        </View>

        <View style={styles.notice}>
          <Text style={styles.noticeText}>Work chats may be reviewed by the workspace owner.</Text>
        </View>

        {showMembers ? (
          <FadeIn style={styles.membersPanel}>
            <ScrollView style={{ maxHeight: 260 }}>
              <View style={styles.wrap}>
                <Text style={styles.panelTitle}>Members ({visibleIds.length})</Text>
                {sortedMembers.map((id) => {
                  const online = isOnline(presence[id], now);
                  const isMe = id === uid;
                  const nm = nameOf(id);
                  return (
                    <View key={id} style={styles.memberRow}>
                      <UserAvatar photo={users[id]?.photo} name={nm} size={38} online={online} />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.memberName} numberOfLines={1}>
                          {nm}
                          {isMe ? ' (you)' : ''}
                        </Text>
                        <Text style={[styles.memberStatus, online && { color: C.green, fontWeight: '700' }]}>
                          {lastSeenText(id)}
                        </Text>
                      </View>
                      {users[id]?.role === 'admin' ? (
                        <View style={styles.adminTag}>
                          <Text style={styles.adminTagText}>Admin</Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </FadeIn>
        ) : null}

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.messages}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          <View style={styles.wrap}>
            {messages.length === 0 ? (
              <Text style={[styles.muted, { textAlign: 'center', marginTop: 30 }]}>
                {isOwner ? 'No messages yet.' : 'No messages yet. Say hello.'}
              </Text>
            ) : null}
            {messages.map((m, i) => {
              const mine = m.senderId === uid;
              const prev = i > 0 ? messages[i - 1] : null;
              const first = !prev || prev.senderId !== m.senderId;
              const sName = users[m.senderId]?.fullName || m.senderName;
              const seenBy =
                m.id === lastMineId && m.createdMs > 0
                  ? Object.entries(reads)
                      .filter(([u, r]) => u !== uid && r.lastReadMs >= m.createdMs)
                      .map(([, r]) => r.userName || 'Someone')
                  : [];
              return (
                <View key={m.id}>
                  <Bubble
                    m={m}
                    mine={mine}
                    first={first}
                    gapTop={i > 0}
                    senderName={sName}
                    senderPhoto={users[m.senderId]?.photo}
                    senderOnline={!mine && isOnline(presence[m.senderId], now)}
                    showSender
                    deletedInfo={seeAll ? deletedMap[m.id] : undefined}
                    canDelete={canDelete(m)}
                    confirming={confirmMsgId === m.id}
                    onDelete={() => removeMessage(m)}
                    onOpenImage={setViewer}
                  />
                  {seenBy.length > 0 ? <Text style={styles.seen}>Seen by {seenBy.join(', ')}</Text> : null}
                </View>
              );
            })}
          </View>
        </ScrollView>

        {error ? <Text style={[styles.error, { paddingHorizontal: 20 }]}>{error}</Text> : null}

        {isOwner ? (
          <View style={styles.inputBar}>
            <Text style={styles.readOnlyText}>You are viewing this chat in read-only mode.</Text>
          </View>
        ) : (
          <Composer
            value={text}
            onChange={setText}
            image={draftImage}
            onPickImage={() => chooseImage('project')}
            onClearImage={() => setDraftImage('')}
            onSend={send}
          />
        )}
      </KeyboardAvoidingView>
    );
  }

  return (
    <>
      {probes}
      {view}
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer('')}>
        <Pressable style={styles.viewerBackdrop} onPress={() => setViewer('')}>
          {viewer ? <Image source={{ uri: viewer }} style={styles.viewerImage} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 56, paddingBottom: 40 },
  wrap: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  muted: { color: C.muted, fontSize: 14 },
  error: { color: C.red, fontSize: 13, marginVertical: 8 },
  tabs: { flexDirection: 'row', marginBottom: 6 },
  tab: {
    height: 42,
    borderRadius: 14,
    backgroundColor: '#F0F0EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabOn: { backgroundColor: C.mint },
  tabInner: { flexDirection: 'row', alignItems: 'center' },
  tabText: { color: C.ink, fontWeight: '800', fontSize: 14 },
  countBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: C.mint,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  countText: { color: C.ink, fontSize: 12, fontWeight: '800' },
  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: C.line,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  projectName: { fontSize: 17, fontWeight: '800', color: C.ink },
  avatarEmpty: { backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' },
  userEmpty: { backgroundColor: C.lavender, alignItems: 'center', justifyContent: 'center' },
  userLetter: { color: C.ink, fontWeight: '800' },
  onlineBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    backgroundColor: C.green,
    borderWidth: 2,
    borderColor: C.card,
  },
  onlineRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  dot: { width: 9, height: 9, borderRadius: 5, marginRight: 6 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 52,
    paddingBottom: 12,
    backgroundColor: C.card,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  backBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: C.ink },
  headerSub: { color: C.muted, fontSize: 12 },
  membersBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F0F0EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: {
    backgroundColor: '#F0F0EA',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  noticeText: { color: C.muted, fontSize: 11, textAlign: 'center' },
  membersPanel: {
    backgroundColor: C.card,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  panelTitle: { fontSize: 12, fontWeight: '800', color: C.muted, letterSpacing: 1, marginBottom: 4 },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  memberName: { color: C.ink, fontWeight: '700', fontSize: 15 },
  memberStatus: { color: C.muted, fontSize: 12, marginTop: 1 },
  adminTag: { backgroundColor: C.lavender, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  adminTagText: { fontSize: 11, fontWeight: '800', color: C.ink },
  messages: { padding: 16, paddingBottom: 10 },
  bubbleRow: { flexDirection: 'row' },
  bubble: { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleMine: { backgroundColor: C.mint, borderBottomRightRadius: 6 },
  bubbleOther: { backgroundColor: C.card, borderBottomLeftRadius: 6, borderWidth: 1, borderColor: C.line },
  sender: { fontSize: 12, fontWeight: '800', color: '#7A5AF8', marginBottom: 2 },
  msgText: { color: C.ink, fontSize: 15, lineHeight: 21 },
  msgImage: {
    width: 220,
    height: 220,
    borderRadius: 12,
    marginBottom: 4,
    backgroundColor: '#E4E4E7',
  },
  deletedText: { color: C.muted, fontSize: 14, fontStyle: 'italic' },
  adminBox: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.12)',
  },
  adminLabel: { color: C.red, fontSize: 11, fontWeight: '800', marginBottom: 4 },
  adminText: { color: C.ink, fontSize: 14, opacity: 0.8 },
  time: { color: C.muted, fontSize: 11, marginTop: 3, alignSelf: 'flex-end' },
  seen: { color: C.muted, fontSize: 11, marginTop: 3, alignSelf: 'flex-end', maxWidth: '82%' },
  delBtn: { marginTop: 6, alignSelf: 'flex-start' },
  delText: { color: C.red, fontWeight: '700', fontSize: 12 },
  inputBar: {
    backgroundColor: C.card,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  readOnlyText: { color: C.muted, fontSize: 13, textAlign: 'center', paddingVertical: 12 },
  draftRow: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  draftImg: { width: 72, height: 72, borderRadius: 12, backgroundColor: '#E4E4E7' },
  draftClose: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F0F0EA',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  inputWrap: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  attachBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0F0EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    borderRadius: 24,
    paddingHorizontal: 18,
    height: 46,
    color: C.ink,
    backgroundColor: '#F0F0EA',
  },
  sendBtn: {
    backgroundColor: C.mint,
    borderRadius: 23,
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: { width: '100%', height: '100%' },
});