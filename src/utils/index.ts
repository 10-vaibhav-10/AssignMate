import { format, parseISO, addDays, isSameDay } from 'date-fns';
import type { Assignment, Task } from '../types';

/**
 * True when the bundle was compiled with --mode android (i.e. the APK build).
 * Use this to swap browser-specific copy for device-appropriate copy.
 */
export const isAndroid = import.meta.env.MODE === 'android';

export function formatDueDate(dateStr: string): string {
  return format(parseISO(dateStr), 'MMM d, yyyy');
}

/**
 * Days from today until the due date, using calendar-day boundaries.
 *  0  → due today
 * -1  → due yesterday (overdue by 1 day)
 *  1  → due tomorrow
 *
 * Using floor(todayStart to dueStart) avoids the bug where
 * parseISO('YYYY-MM-DD') returns midnight, which isPast() at any point
 * during the same day — incorrectly marking today's work as overdue.
 */
export function getDaysUntilDue(dateStr: string): number {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [y, m, d] = dateStr.split('-').map(Number);
  const dueStart  = new Date(y, m - 1, d);
  return Math.round((dueStart.getTime() - todayStart.getTime()) / 86_400_000);
}

export function formatRelativeDue(dateStr: string): string {
  const days = getDaysUntilDue(dateStr);
  if (days < 0)  return 'Overdue';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

/** An assignment is overdue only after the due calendar day has fully passed. */
export function isOverdue(assignment: Assignment): boolean {
  return getDaysUntilDue(assignment.dueDate) < 0 && assignment.progress < 100;
}

export function calculateProgress(tasks: Task[]): number {
  if (tasks.length === 0) return 0;
  const completed = tasks.filter((t) => t.completed).length;
  return Math.round((completed / tasks.length) * 100);
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function offsetDate(days: number): string {
  return format(addDays(new Date(), days), 'yyyy-MM-dd');
}

export function todayStr(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function isSameDayStr(dateStr: string, date: Date): boolean {
  try {
    return isSameDay(parseISO(dateStr), date);
  } catch {
    return false;
  }
}
