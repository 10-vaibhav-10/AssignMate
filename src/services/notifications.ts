import type { Assignment } from '../types';
import { getDaysUntilDue, formatDueDate, isAndroid } from '../utils';
import { parseISO, addDays, setHours, setMinutes, setSeconds, isFuture } from 'date-fns';

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * Notifications — platform-aware
 *
 * On web / PWA  : uses the Web Notifications API.  Fires immediately when the
 *   app is open; one per assignment per day (throttled via localStorage).
 *
 * On Android (Capacitor build, MODE === 'android'):
 *   Uses @capacitor/local-notifications to schedule REAL system notifications
 *   that appear at 09:00 on the relevant days even when the app is closed.
 *   Four triggers per assignment: 3 days before · 1 day before · day of · overdue.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const NOTIFIED_KEY     = 'am_notified';           // web: { [key]: "YYYY-MM-DD" }
const ANDROID_PERM_KEY = 'am_android_notif_perm'; // Android: cached permission state
const CHANNEL_ID       = 'assignmate-deadlines';

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadNotified(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(NOTIFIED_KEY) ?? '{}') as Record<string, string>; }
  catch { return {}; }
}

function saveNotified(map: Record<string, string>): void {
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify(map));
}

/** Stable integer ID derived from a string, safe for Android int32 range. */
function stableId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 2_000_000_000;
}

/* ── Android channel setup ───────────────────────────────────────────────── */

/**
 * Create the Android notification channel.
 * Call once on app launch (idempotent — safe to call every time).
 */
export async function setupAndroidNotificationChannel(): Promise<void> {
  if (!isAndroid) return;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await LocalNotifications.createChannel({
    id:          CHANNEL_ID,
    name:        'Assignment Deadlines',
    description: 'Reminders for upcoming and overdue assignments',
    importance:  4,  // IMPORTANCE_HIGH
    visibility:  1,  // VISIBILITY_PUBLIC
    vibration:   true,
    sound:       'default',
  });
}

/* ── Android permission ──────────────────────────────────────────────────── */

/**
 * Read the cached Android permission state (synchronous).
 * Refresh the cache with refreshAndroidPermission() when the Settings screen
 * opens so we pick up changes made in system settings.
 */
export function getNotificationPermission(): NotificationPermission {
  if (isAndroid) {
    return (localStorage.getItem(ANDROID_PERM_KEY) as NotificationPermission) ?? 'default';
  }
  if (!('Notification' in window)) return 'denied';
  return Notification.permission;
}

/**
 * Async: read the actual system permission and refresh the cache.
 * Call on Settings screen mount and after requesting permission.
 */
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

async function scheduleAndroidNotifications(assignments: Assignment[]): Promise<void> {
  const { LocalNotifications } = await import('@capacitor/local-notifications');

  // Clear stale scheduled notifications before rebuilding
  const { notifications: pending } = await LocalNotifications.getPending();
  if (pending.length) {
    await LocalNotifications.cancel({ notifications: pending });
  }

  type NotifSchema = Parameters<typeof LocalNotifications.schedule>[0]['notifications'][number];
  const toSchedule: NotifSchema[] = [];

  for (const a of assignments) {
    if (a.progress >= 100) continue;

    const due = parseISO(a.dueDate);

    // Four timed triggers per assignment — all fire at 09:00 on the relevant day
    const triggers: Array<{ offset: number; title: string; body: string }> = [
      {
        offset: -3,
        title: `📌 Due in 3 days: ${a.title}`,
        body:  `${a.subject} — due ${formatDueDate(a.dueDate)}. ${a.progress}% done.`,
      },
      {
        offset: -1,
        title: `📅 Due tomorrow: ${a.title}`,
        body:  `${a.subject} is due tomorrow. ${a.progress}% done — get started!`,
      },
      {
        offset: 0,
        title: `📚 Due today: ${a.title}`,
        body:  `${a.subject} is due today! ${a.progress}% done — keep going!`,
      },
      {
        offset: 1,
        title: `⚠️ Overdue: ${a.title}`,
        body:  `${a.subject} was due ${formatDueDate(a.dueDate)}. Submit ASAP!`,
      },
    ];

    for (const t of triggers) {
      const fireAt = setSeconds(setMinutes(setHours(addDays(due, t.offset), 9), 0), 0);
      if (!isFuture(fireAt)) continue;

      toSchedule.push({
        id:        stableId(`${a.id}:${t.offset}`),
        title:     t.title,
        body:      t.body,
        schedule:  { at: fireAt },
        channelId: CHANNEL_ID,
        smallIcon: 'ic_stat_notification',
        extra:     { assignmentId: a.id },
      });
    }
  }

  if (toSchedule.length > 0) {
    await LocalNotifications.schedule({ notifications: toSchedule });
  }
}

/* ── Web: fire immediate notifications ───────────────────────────────────── */

function fireWebNotifications(assignments: Assignment[]): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const today    = todayDate();
  const notified = loadNotified();
  let   changed  = false;

  const fire = (key: string, title: string, body: string) => {
    if (notified[key] === today) return;
    new Notification(title, { body, tag: key, icon: '/favicon.svg' });
    notified[key] = today;
    changed = true;
  };

  for (const a of assignments) {
    if (a.progress >= 100) continue;
    const days = getDaysUntilDue(a.dueDate);

    if (days < 0) {
      fire(`overdue-${a.id}`,
        `⚠️ Overdue: ${a.title}`,
        `${a.subject} was due on ${formatDueDate(a.dueDate)}. ${a.progress}% complete.`);
    } else if (days === 0) {
      fire(`today-${a.id}`,
        `📚 Due today: ${a.title}`,
        `${a.subject} is due today! ${a.progress}% complete — keep going!`);
    } else if (days === 1) {
      fire(`tomorrow-${a.id}`,
        `📅 Due tomorrow: ${a.title}`,
        `${a.subject} is due tomorrow. ${a.progress}% complete.`);
    } else if (days <= 3) {
      fire(`soon-${a.id}-${a.dueDate}`,
        `📌 Coming up in ${days} days: ${a.title}`,
        `${a.subject} is due on ${formatDueDate(a.dueDate)}. ${a.progress}% complete.`);
    }
  }

  if (changed) saveNotified(notified);
}

/* ── Public entry point ──────────────────────────────────────────────────── */

/**
 * Fire (web) or schedule (Android) notifications for all active assignments.
 * Called on app launch and whenever assignments or settings change.
 */
export function checkAndNotify(assignments: Assignment[], enabled: boolean): void {
  if (!enabled) return;
  if (isAndroid) {
    if (getNotificationPermission() !== 'granted') return;
    scheduleAndroidNotifications(assignments).catch(console.error);
  } else {
    fireWebNotifications(assignments);
  }
}
