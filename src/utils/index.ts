import { format, formatDistanceToNow, isPast, parseISO, addDays, isSameDay } from 'date-fns';
import type { Assignment, Task } from '../types';

export function formatDueDate(dateStr: string): string {
  return format(parseISO(dateStr), 'MMM d, yyyy');
}

export function formatRelativeDue(dateStr: string): string {
  const date = parseISO(dateStr);
  if (isPast(date)) return 'Overdue';
  return `Due ${formatDistanceToNow(date, { addSuffix: true })}`;
}

export function isOverdue(assignment: Assignment): boolean {
  return isPast(parseISO(assignment.dueDate)) && assignment.progress < 100;
}

export function getDaysUntilDue(dateStr: string): number {
  const diff = parseISO(dateStr).getTime() - new Date().getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
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
