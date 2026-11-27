import { LIMITS } from './limits';

/** Injectable so tests can move time and a wrong phone clock can be simulated. */
export type Clock = () => number;
export const systemClock: Clock = () => Date.now();

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;

export const offerExpiry = (at: number): number => at + LIMITS.offerHoursAfter * HOUR;

export type AskUntil = 'today' | 'week';

export function askExpiry(now: number, until: AskUntil): number {
  if (until === 'week') return now + 7 * DAY;
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return end.getTime();
}

/** Local day `daysAhead` from today at "HH:MM". Returns null for an unreadable time. */
export function offerAt(now: number, daysAhead: number, clockTime: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clockTime.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  if (!Number.isInteger(daysAhead) || daysAhead < 0 || daysAhead > LIMITS.offerDaysAhead) return null;
  const day = new Date(now);
  // setDate keeps the wall-clock time right across a daylight-saving change.
  day.setDate(day.getDate() + daysAhead);
  day.setHours(hours, minutes, 0, 0);
  return day.getTime();
}

/** What the form proposes: two hours ahead on the hour, which late in the evening is tomorrow. */
export function defaultWhen(now: number): { day: 'today' | 'tomorrow'; time: string } {
  const soon = new Date(now + 2 * HOUR);
  const day = soon.getDate() === new Date(now).getDate() ? 'today' : 'tomorrow';
  return { day, time: `${String(soon.getHours()).padStart(2, '0')}:00` };
}

/** Days from today to a date field's "YYYY-MM-DD"; -1 when it cannot be read. */
export function daysFrom(now: number, date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return -1;
  return daysBetween(now, new Date(year, month - 1, day).getTime());
}

/** Whole local days between two moments (0 = same day, 1 = next day). */
export function daysBetween(from: number, to: number): number {
  const a = new Date(from);
  const b = new Date(to);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY);
}

export const clockText = (at: number, lang: string): string =>
  new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit', hour12: false }).format(at);

export const dateText = (at: number, lang: string): string =>
  new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'short' }).format(at);
