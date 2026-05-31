import type { Assignment } from '../types';
import { getDaysUntilDue, formatDueDate } from '../utils';

const NOTIFIED_KEY = 'am_notified'; // { [notifId]: "YYYY-MM-DD" }

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadNotified(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(NOTIFIED_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function saveNotified(map: Record<string, string>): void {
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify(map));
}

export function getNotificationPermission(): NotificationPermission {
  if (!('Notification' in window)) return 'denied';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

export function checkAndNotify(assignments: Assignment[], enabled: boolean): void {
  if (!enabled) return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const today = todayDate();
  const notified = loadNotified();
  let changed = false;

  for (const a of assignments) {
    if (a.progress === 100) continue;

    const days = getDaysUntilDue(a.dueDate);

    if (days < 0) {
      // Overdue — notify once per day
      const key = `overdue-${a.id}`;
      if (notified[key] !== today) {
        new Notification(`⚠️ Overdue: ${a.title}`, {
          body: `${a.subject} was due on ${formatDueDate(a.dueDate)}. ${a.progress}% complete.`,
          tag: key,
          icon: '/favicon.svg',
        });
        notified[key] = today;
        changed = true;
      }
    } else if (days === 0) {
      // Due today
      const key = `today-${a.id}`;
      if (notified[key] !== today) {
        new Notification(`📚 Due today: ${a.title}`, {
          body: `${a.subject} is due today! ${a.progress}% complete — keep going!`,
          tag: key,
          icon: '/favicon.svg',
        });
        notified[key] = today;
        changed = true;
      }
    } else if (days === 1) {
      // Due tomorrow
      const key = `tomorrow-${a.id}`;
      if (notified[key] !== today) {
        new Notification(`📅 Due tomorrow: ${a.title}`, {
          body: `${a.subject} is due tomorrow. ${a.progress}% complete.`,
          tag: key,
          icon: '/favicon.svg',
        });
        notified[key] = today;
        changed = true;
      }
    } else if (days <= 3) {
      // Due in 2–3 days
      const key = `soon-${a.id}-${a.dueDate}`;
      if (notified[key] !== today) {
        new Notification(`📌 Coming up in ${days} days: ${a.title}`, {
          body: `${a.subject} is due on ${formatDueDate(a.dueDate)}. ${a.progress}% complete.`,
          tag: key,
          icon: '/favicon.svg',
        });
        notified[key] = today;
        changed = true;
      }
    }
  }

  if (changed) saveNotified(notified);
}
