import type { Assignment, Task } from '../types';
import { getDaysUntilDue, formatDueDate, isAndroid, todayStr } from '../utils';
import { parseISO, addDays, setHours, setMinutes, setSeconds, isFuture } from 'date-fns';

/*
 * Notifications — platform-aware
 *
 * Web/PWA  : fires immediately when the app is open, once per key per day.
 * Android  : schedules real system notifications that fire even when the app
 *            is closed — at the user's chosen reminder time each day.
 *
 * Two layers of reminders:
 *   Assignment-level  — 3 days before · 1 day before · day of · overdue
 *   Task-level        — day before task due · day task is due
 *   Daily digest      — a morning nudge summarising pending work this week
 */

const NOTIFIED_KEY     = 'am_notified';
const ANDROID_PERM_KEY = 'am_android_notif_perm';
const CHANNEL_ID       = 'assignmate-deadlines';

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function loadNotified(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(NOTIFIED_KEY) ?? '{}') as Record<string, string>; }
  catch { return {}; }
}

function saveNotified(map: Record<string, string>): void {
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify(map));
}

function stableId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 2_000_000_000;
}

/* ── Android channel setup ───────────────────────────────────────────────── */

export async function setupAndroidNotificationChannel(): Promise<void> {
  if (!isAndroid) return;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await LocalNotifications.createChannel({
    id:          CHANNEL_ID,
    name:        'Assignment Reminders',
    description: 'Keeps you on top of deadlines and daily tasks',
    importance:  4,
    visibility:  1,
    vibration:   true,
    sound:       'default',
  });
}

/* ── Android permission ──────────────────────────────────────────────────── */

export function getNotificationPermission(): NotificationPermission {
  if (isAndroid) {
    return (localStorage.getItem(ANDROID_PERM_KEY) as NotificationPermission) ?? 'default';
  }
  if (!('Notification' in window)) return 'denied';
  return Notification.permission;
}

export async function refreshAndroidPermission(): Promise<NotificationPermission> {
  if (!isAndroid) return getNotificationPermission();
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const { display } = await LocalNotifications.checkPermissions();
  const perm: NotificationPermission =
    display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'default';
  localStorage.setItem(ANDROID_PERM_KEY, perm);
  return perm;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (isAndroid) {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const { display } = await LocalNotifications.requestPermissions();
    const perm: NotificationPermission =
      display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'default';
    localStorage.setItem(ANDROID_PERM_KEY, perm);
    return perm;
  }
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

/* ── Android: schedule native system notifications ───────────────────────── */

async function scheduleAndroidNotifications(
  assignments: Assignment[],
  tasks: Task[],
  hour: number = 9,
  minute: number = 0,
): Promise<void> {
  const { LocalNotifications } = await import('@capacitor/local-notifications');

  const { notifications: pending } = await LocalNotifications.getPending();
  if (pending.length) {
    await LocalNotifications.cancel({ notifications: pending });
  }

  type NotifSchema = Parameters<typeof LocalNotifications.schedule>[0]['notifications'][number];
  const toSchedule: NotifSchema[] = [];

  const schedule = (id: string, offset: number, due: Date, title: string, body: string, extra: Record<string, string>) => {
    const fireAt = setSeconds(setMinutes(setHours(addDays(due, offset), hour), minute), 0);
    if (!isFuture(fireAt)) return;
    toSchedule.push({
      id:        stableId(id),
      title,
      body,
      schedule:  { at: fireAt },
      channelId: CHANNEL_ID,
      smallIcon: 'ic_stat_notification',
      extra,
    });
  };

  /* ── Assignment-level notifications ─────── */
  for (const a of assignments) {
    if (a.progress >= 100) continue;
    const due = parseISO(a.dueDate);

    schedule(`${a.id}:-3`, -3, due,
      `📌 ${a.title} is due in 3 days`,
      `${a.subject} — due ${formatDueDate(a.dueDate)}. You're ${a.progress}% there.`,
      { assignmentId: a.id });

    schedule(`${a.id}:-1`, -1, due,
      `📅 ${a.title} is due tomorrow`,
      `${a.subject} — ${a.progress}% done. One more push!`,
      { assignmentId: a.id });

    schedule(`${a.id}:0`, 0, due,
      `📚 ${a.title} is due today`,
      `${a.subject} — ${a.progress}% done. You've got this!`,
      { assignmentId: a.id });

    schedule(`${a.id}:1`, 1, due,
      `⚠️ ${a.title} is overdue`,
      `${a.subject} was due ${formatDueDate(a.dueDate)}. Get it submitted ASAP.`,
      { assignmentId: a.id });
  }

  /* ── Task-level notifications ───────────── */
  for (const t of tasks) {
    if (t.completed || !t.dueDate) continue;
    const a = assignments.find(x => x.id === t.assignmentId);
    if (!a || a.progress >= 100) continue;
    const due = parseISO(t.dueDate);

    schedule(`task:${t.id}:-1`, -1, due,
      `📋 Do this tomorrow: ${t.title}`,
      `Part of "${a.title}" · ${a.subject}`,
      { taskId: t.id, assignmentId: a.id });

    schedule(`task:${t.id}:0`, 0, due,
      `✅ Task due today: ${t.title}`,
      `For "${a.title}" — knock it out!`,
      { taskId: t.id, assignmentId: a.id });
  }

  if (toSchedule.length > 0) {
    await LocalNotifications.schedule({ notifications: toSchedule });
  }
}

/* ── Web: fire immediate notifications ───────────────────────────────────── */

function fireWebNotifications(assignments: Assignment[], tasks: Task[]): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const today    = todayStr();
  const notified = loadNotified();
  let   changed  = false;

  const fire = (key: string, title: string, body: string) => {
    if (notified[key] === today) return;
    new Notification(title, { body, tag: key, icon: '/favicon.svg' });
    notified[key] = today;
    changed = true;
  };

  /* Assignment-level */
  for (const a of assignments) {
    if (a.progress >= 100) continue;
    const days = getDaysUntilDue(a.dueDate);

    if (days < 0) {
      fire(`overdue-${a.id}`,
        `⚠️ Still overdue: ${a.title}`,
        `${a.subject} was due on ${formatDueDate(a.dueDate)}. ${a.progress}% done — let's get it submitted.`);
    } else if (days === 0) {
      fire(`today-${a.id}`,
        `📚 Due today: ${a.title}`,
        `${a.subject} is due today! ${a.progress}% done — you've got this!`);
    } else if (days === 1) {
      fire(`tomorrow-${a.id}`,
        `📅 Due tomorrow: ${a.title}`,
        `${a.subject} is due tomorrow. ${a.progress}% done — almost there!`);
    } else if (days <= 3) {
      fire(`soon-${a.id}-${a.dueDate}`,
        `📌 Coming up in ${days} days: ${a.title}`,
        `${a.subject} is due on ${formatDueDate(a.dueDate)}. ${a.progress}% done.`);
    }
  }

  /* Task-level */
  for (const t of tasks) {
    if (t.completed) continue;
    const a = assignments.find(x => x.id === t.assignmentId);
    if (!a || a.progress >= 100 || !t.dueDate) continue;
    const days = getDaysUntilDue(t.dueDate);

    if (days < 0) {
      fire(`task-overdue-${t.id}`,
        `⚠️ Overdue task: ${t.title}`,
        `For "${a.title}" · ${a.subject}`);
    } else if (days === 0) {
      fire(`task-today-${t.id}`,
        `✅ Do this today: ${t.title}`,
        `Part of "${a.title}" — knock it out!`);
    } else if (days === 1) {
      fire(`task-tomorrow-${t.id}`,
        `📋 Tomorrow: ${t.title}`,
        `For "${a.title}" · ${a.subject}`);
    }
  }

  /* Daily digest — pending tasks across assignments due this week */
  const pendingThisWeek = tasks.filter(t => {
    if (t.completed) return false;
    const a = assignments.find(x => x.id === t.assignmentId);
    if (!a || a.progress >= 100) return false;
    const d = getDaysUntilDue(a.dueDate);
    return d >= 0 && d <= 7;
  });
  if (pendingThisWeek.length > 0) {
    fire('daily-digest',
      `📝 ${pendingThisWeek.length} task${pendingThisWeek.length !== 1 ? 's' : ''} to work through this week`,
      `Stay on top of it — open AssignMate to see what needs doing.`);
  }

  if (changed) saveNotified(notified);
}

/* ── Cancel notifications for one assignment (+ its tasks) ──────────────── */

export async function cancelNotificationsForAssignment(assignmentId: string): Promise<void> {
  if (!isAndroid) return;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const { notifications: pending } = await LocalNotifications.getPending();

  const assignIds = [-3, -1, 0, 1].map(o => ({ id: stableId(`${assignmentId}:${o}`) }));

  const taskIds: { id: number }[] = [];
  try {
    const raw = localStorage.getItem('am_tasks');
    const all = raw ? (JSON.parse(raw) as Array<{ id: string; assignmentId: string }>) : [];
    for (const t of all.filter(t => t.assignmentId === assignmentId)) {
      for (const o of [-1, 0]) taskIds.push({ id: stableId(`task:${t.id}:${o}`) });
    }
  } catch { /* non-critical */ }

  const toCancel = [...assignIds, ...taskIds].filter(n => pending.some(p => p.id === n.id));
  if (toCancel.length) {
    await LocalNotifications.cancel({ notifications: toCancel });
  }
}

/* ── Android: check whether exact alarms are permitted ──────────────────── */

export async function canScheduleExactAlarms(): Promise<boolean> {
  if (!isAndroid) return true;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    if (typeof (LocalNotifications as unknown as { checkExactNotificationSchedulePermission?: () => Promise<{exact: string}> }).checkExactNotificationSchedulePermission === 'function') {
      const { exact } = await (LocalNotifications as unknown as { checkExactNotificationSchedulePermission: () => Promise<{exact: string}> }).checkExactNotificationSchedulePermission();
      return exact === 'granted';
    }
  } catch { /* not supported on this Capacitor version */ }
  return true;
}

/* ── Public entry point ──────────────────────────────────────────────────── */

export function checkAndNotify(
  assignments: Assignment[],
  tasks: Task[],
  enabled: boolean,
  hour: number = 9,
  minute: number = 0,
): void {
  if (!enabled) return;
  if (isAndroid) {
    if (getNotificationPermission() !== 'granted') return;
    scheduleAndroidNotifications(assignments, tasks, hour, minute).catch(console.error);
  } else {
    fireWebNotifications(assignments, tasks);
  }
}

export function rescheduleAll(assignments: Assignment[]): void {
  try {
    const rawSettings = localStorage.getItem('am_settings');
    const s = rawSettings
      ? (JSON.parse(rawSettings) as { notificationsEnabled?: boolean; notificationHour?: number; notificationMinute?: number })
      : {};
    const rawTasks = localStorage.getItem('am_tasks');
    const tasks = rawTasks ? (JSON.parse(rawTasks) as Task[]) : [];
    checkAndNotify(assignments, tasks, s.notificationsEnabled ?? false, s.notificationHour ?? 9, s.notificationMinute ?? 0);
  } catch { /* non-critical */ }
}
