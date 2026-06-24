import type { Assignment } from '../types';

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function toICalDate(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

function toICalDateTimeNow(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function escapeIcal(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function buildIcsString(assignments: Assignment[]): string {
  const now    = toICalDateTimeNow();
  const events = assignments.map((a) => {
    const dtstart     = toICalDate(a.dueDate);
    const summary     = escapeIcal(a.title);
    const description = escapeIcal(
      [a.subject, a.details ? a.details.slice(0, 250) : ''].filter(Boolean).join(' — '),
    );
    return [
      'BEGIN:VEVENT',
      `UID:${a.id}@assignmate`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${dtstart}`,
      `DTEND;VALUE=DATE:${dtstart}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      `CATEGORIES:AssignMate`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
    ].join('\r\n');
  });

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AssignMate//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}

/**
 * Export all assignments as an .ics calendar file.
 *
 * On Android / Capacitor: uses the Web Share API which shows the Android
 *   share sheet — user can open directly in Google Calendar, Samsung Calendar,
 *   save to Files, etc.  No blob download is needed.
 *
 * On desktop browsers: falls back to the classic <a download> trick.
 */
export async function downloadICalendar(assignments: Assignment[]): Promise<void> {
  const ics  = buildIcsString(assignments);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const file = new File([blob], 'assignmate.ics', { type: 'text/calendar' });

  // Web Share API with files — works in Android WebView (API 29+) and Chrome mobile.
  // Capacitor's WebView forwards to the Android share sheet.
  if (
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    await navigator.share({
      files: [file],
      title: 'AssignMate Calendar',
      text:  `${assignments.length} assignment${assignments.length !== 1 ? 's' : ''} exported from AssignMate`,
    });
    return;
  }

  // Fallback: classic anchor-download for desktop browsers
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = 'assignmate.ics';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Build a Google Calendar "add event" URL for a single assignment.
 * Opens the Google Calendar event creation form pre-filled.
 * Dates use the YYYYMMDD/YYYYMMDD format (literal slash — not URL-encoded).
 */
export function generateGoogleCalendarUrl(assignment: Assignment): string {
  const start = assignment.dueDate.replace(/-/g, '');
  // All-day events: end date is the following day (Google Calendar convention)
  const endD = new Date(assignment.dueDate + 'T00:00:00');
  endD.setDate(endD.getDate() + 1);
  const end = endD.toISOString().slice(0, 10).replace(/-/g, '');

  const text    = encodeURIComponent(assignment.title);
  const details = encodeURIComponent(
    [assignment.subject, assignment.details?.slice(0, 300)].filter(Boolean).join(' — '),
  );

  return `https://calendar.google.com/calendar/r/eventedit?action=TEMPLATE&text=${text}&dates=${start}/${end}&details=${details}`;
}

/**
 * Share or download a JSON backup of all app data.
 *
 * On Android: triggers the share sheet so the user can save to Drive,
 *   Files, email it, etc.
 * On desktop: downloads the file directly.
 */
export async function shareOrDownloadJson(json: string, filename: string): Promise<void> {
  const blob = new Blob([json], { type: 'application/json' });
  const file = new File([blob], filename, { type: 'application/json' });

  if (
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    await navigator.share({
      files: [file],
      title: 'AssignMate Backup',
      text:  'AssignMate data backup',
    });
    return;
  }

  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
