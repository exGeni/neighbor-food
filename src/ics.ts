// A calendar file with an alarm: the only reminder a web page can set without notifications.

export interface CalendarEvent {
  uid: string;
  start: number;
  stamp: number;
  title: string;
  where: string;
}

const utc = (at: number): string => new Date(at).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** RFC 5545 TEXT escaping. */
export const escapeText = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n|\r/g, '\\n');

/** Folds at 75 octets without splitting a character (Cyrillic takes two). */
export function fold(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [''];
  let used = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    // A continuation line starts with a space, which counts towards its 75.
    if (used + size > 75) {
      parts.push(' ');
      used = 1;
    }
    parts[parts.length - 1] += char;
    used += size;
  }
  return parts.join('\r\n');
}

export function calendarFile(event: CalendarEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//neighbor-food//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.uid}@neighbor-food`,
    `DTSTAMP:${utc(event.stamp)}`,
    `DTSTART:${utc(event.start)}`,
    `DTEND:${utc(event.start + 30 * 60 * 1000)}`,
    `SUMMARY:${escapeText(event.title)}`,
    ...(event.where ? [`LOCATION:${escapeText(event.where)}`] : []),
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(event.title)}`,
    'TRIGGER:-PT15M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

export function downloadCalendar(event: CalendarEvent): void {
  const url = URL.createObjectURL(new Blob([calendarFile(event)], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'neighbor-food.ics';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
