import { addDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

type NotifyOptions = {
  toId: string;
  fromId: string;
  fromName: string;
  title: string;
  body: string;
  projectId?: string;
  screen?: 'chat' | 'missions' | 'project';
};

async function sendPush(opts: NotifyOptions) {
  const snap = await getDocs(collection(db, 'users', opts.toId, 'devices'));
  const tokens = snap.docs
    .map((d) => d.data().expoPushToken as string | undefined)
    .filter((t): t is string => typeof t === 'string' && t.startsWith('ExponentPushToken'));

  if (tokens.length === 0) return;

  const messages = tokens.map((to) => ({
    to,
    title: opts.title.slice(0, 100),
    body: opts.body.slice(0, 178),
    sound: 'default',
    channelId: 'default',
    priority: 'high',
    data: {
      screen: opts.screen ?? '',
      projectId: opts.projectId ?? '',
      fromId: opts.fromId,
    },
  }));

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });
}

export async function notify(opts: NotifyOptions) {
  if (!opts.toId || opts.toId === opts.fromId) return;

  try {
    await addDoc(collection(db, 'users', opts.toId, 'notifications'), {
      title: opts.title.slice(0, 200),
      body: opts.body.slice(0, 500),
      fromId: opts.fromId,
      fromName: opts.fromName,
      projectId: opts.projectId ?? '',
      createdAt: serverTimestamp(),
      read: false,
    });
  } catch {
    //
  }

  try {
    await sendPush(opts);
  } catch {
    //
  }
}