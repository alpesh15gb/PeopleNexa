// Calendar dates used for workforce operations are always IST, regardless of
// the container's host timezone.

import { istDateKey, istStartOfDay } from "./ist";

const pad = (n: number) => String(n).padStart(2, "0");

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromDateKey(key: string): Date {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(key)) return new Date(NaN);
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  // Guard against overflow (e.g. 2026-02-30 → Mar 02).
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return new Date(NaN);
  return dt;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export function parseTime(t: string): { hour: number; minute: number } {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(t.trim());
  if (!m) return { hour: 0, minute: 0 };
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

/** Minutes of the day for a given time string like "09:30". */
export function minutesOfDay(t: string): number {
  const { hour, minute } = parseTime(t);
  return hour * 60 + minute;
}

export function formatTime(d: Date | null | undefined): string {
  if (!d) return "—";
  // Pinned to IST: server renders in UTC while browsers render local time,
  // which hydrated mismatched text (React #418). Display-only; logic helpers
  // below intentionally keep local-time semantics — do not "fix" those.
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  }).format(d);
}

export function formatDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  const date = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(d);
  return `${date} ${formatTime(d)}`;
}

/** IST calendar day (YYYY-MM-DD) for display. Deterministic server+client. */
export function formatDateIST(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(dt);
}

export function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return toDateKey(d);
}

export function todayKey(now: Date = new Date()): string {
  return istDateKey(now);
}

export function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** Calendar month in IST, independent of the server's local timezone. */
export function monthKeyIST(d: Date = new Date()): string {
  return istDateKey(d).slice(0, 7);
}

/** True only for a canonical calendar month key such as 2026-08. */
export function isMonthKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000) + 1;
}

export function relativeDay(d: Date): string {
  const today = startOfDay(new Date());
  const diff = Math.round((startOfDay(d).getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  return toDateKey(d);
}

/**
 * IST day window for a calendar key (YYYY-MM-DD).
 * Canonical day-definition: [start, end) where start = IST midnight
 * and end = start + 24h (exclusive upper bound for range queries).
 */
export function dayRangeIST(dateKey: string): { start: Date; end: Date } {
  // Validate the calendar key before Date can normalize an impossible date
  // (for example, 2026-02-30) into a later real day.
  if (!isDateKey(dateKey)) return { start: new Date(NaN), end: new Date(NaN) };
  const start = istStartOfDay(new Date(`${dateKey}T12:00:00Z`));
  const end = new Date(start.getTime() + 86400000);
  return { start, end };
}

/** True only for a real, canonical Gregorian calendar day (YYYY-MM-DD). */
export function isDateKey(value: string): boolean {
  const parsed = fromDateKey(value);
  return !Number.isNaN(parsed.getTime()) && toDateKey(parsed) === value;
}
