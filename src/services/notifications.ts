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

/* ── Android: cancel notifications for a single assignment ──────────────── */

/**
 * Cancel all pending notifications for one assignment.
 * Call this when an assignment is completed (progress === 100) or deleted.
 * Safe to call even if no notifications exist for that assignment.
 */
export async function cancelNotificationsForAssignment(assignmentId: string): Promise<void> {
  if (!isAndroid) return;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const { notifications: pending } = await LocalNotifications.getPending();

  // Find IDs that belong to this assignment by re-computing the stable IDs
  const offsets = [-3, -1, 0, 1];
  const ids = offsets.map((o) => ({ id: stableId(`${assignmentId}:${o}`) }));
  const toCancel = ids.filter((n) => pending.some((p) => p.id === n.id));
  if (toCancel.length) {
    await LocalNotifications.cancel({ notifications: toCancel });
  }
}

/* ── Android: check whether exact alarms are permitted ──────────────────── */

/**
 * Returns true if the app can schedule exact alarms.
 * On Android 12 (API 31–32) the user must grant "Alarms & Reminders"
 * in Special App Access — this check lets us warn them if they haven't.
 * On Android 13+ (USE_EXACT_ALARM) this always returns true.
 */
export async function canScheduleExactAlarms(): Promise<boolean> {
  if (!isAndroid) return true;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    // checkExactNotificationSchedulePermission was added in @capacitor/local-notifications 5.x
    if (typeof (LocalNotifications as unknown as { checkExactNotificationSchedulePermission?: () => Promise<{exact: string}> }).checkExactNotificationSchedulePermission === 'function') {
      const { exact } = await (LocalNotifications as unknown as { checkExactNotificationSchedulePermission: () => Promise<{exact: string}> }).checkExactNotificationSchedulePermission();
      return exact === 'granted';
    }
  } catch { /* not supported on this Capacitor version */ }
  return true; // assume ok if API unavailable
}

/* ── Public entry point ──────────────────────────────────────────────────── */

/**
 * Fire (web) or schedule (Android) notifications for all active assignments.
 *
 * Call this:
 *   • On app launch                          → already done in App.tsx
 *   • When notifications are enabled/toggled → already done in Settings.tsx
 *   • After adding / editing an assignment   → AssignmentForm.tsx
 *   • After bulk-importing assignments       → ImportOutline.tsx
 *   • After deleting an assignment           → AssignmentDetail.tsx (via cancelNotificationsForAssignment)
 *   • When an assignment reaches 100%        → AssignmentDetail.tsx (via cancelNotificationsForAssignment)
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

/**
 * Convenience wrapper: read current settings and reschedule everything.
 * Use this in screens that mutate assignments but don't have settings in scope.
 */
export function rescheduleAll(assignments: Assignment[]): void {
  try {
    // Dynamically read the latest settings without importing the store at module level
    const raw = localStorage.getItem('am_settings');
    const settings = raw ? (JSON.parse(raw) as { notificationsEnabled?: boolean }) : {};
    checkAndNotify(assignments, settings.notificationsEnabled ?? false);
  } catch { /* non-critical */ }
}
