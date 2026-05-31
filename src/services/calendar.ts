import type { Assignment } from '../types';

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function toICalDate(dateStr: string): string {
  // "YYYY-MM-DD" → "YYYYMMDD"
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

/** Download all assignments as a .ics file compatible with Google Calendar / Apple Calendar / Outlook */
export function downloadICalendar(assignments: Assignment[]): void {
  const now = toICalDateTimeNow();
  const events: string[] = [];

  for (const a of assignments) {
    const dtstart = toICalDate(a.dueDate);
    const summary = escapeIcal(a.title);
    const description = escapeIcal(
      [a.subject, a.details ? a.details.slice(0, 250) : ''].filter(Boolean).join(' — '),
    );

    events.push(
      [
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
      ].join('\r\n'),
    );
  }

  const calendar = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AssignMate//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([calendar], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'assignmate.ics';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
