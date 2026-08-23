// PeopleNexa operates in India Standard Time (Asia/Kolkata, UTC+05:30).
// Keep every calendar-day operation explicit and deterministic instead of
// relying on the Node/browser host timezone (Docker commonly runs in UTC).

import { IST_OFFSET_MS, istDateKey, istStartOfDay, parseIST } from "./ist";

const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD in IST for a UTC instant. */
export function toDateKey(d: Date): string {
  return istDateKey(d);
}

/** UTC instant corresponding to IST midnight of YYYY-MM-DD. */
export function fromDateKey(key: string): Date {
  const parsed = parseIST(`${key} 00:00:00`);
  if (!parsed) throw new Error(`Invalid date key: ${key}`);
  return parsed;
}

export function startOfDay(d: Date): Date {
  return istStartOfDay(d);
}

export function endOfDay(d: Date): Date {
  return new Date(istStartOfDay(d).getTime() + 86400000 - 1);
}

export function parseTime(t: string): { hour: number; minute: number } {
  const [hour, minute] = t.split(":").map(Number);
  return { hour: Number.isFinite(hour) ? hour : 0, minute: Number.isFinite(minute) ? minute : 0 };
}

/** Minutes of the day for a given time string like "09:30". */
export function minutesOfDay(t: string): number {
  const { hour, minute } = parseTime(t);
  return hour * 60 + minute;
}

export function formatTime(d: Date | null | undefined): string {
  if (!d) return "—";
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return `${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}`;
}

export function formatDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  return `${toDateKey(d)} ${formatTime(d)}`;
}

export function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return toDateKey(d);
}

export function todayKey(): string {
  return toDateKey(new Date());
}

/** Add IST calendar days without depending on the host timezone. */
export function addDays(d: Date, n: number): Date {
  const start = istStartOfDay(d);
  return new Date(start.getTime() + n * 86400000);
}

export function monthKey(d: Date): string {
  return toDateKey(d).slice(0, 7);
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((istStartOfDay(to).getTime() - istStartOfDay(from).getTime()) / 86400000) + 1;
}

export function relativeDay(d: Date): string {
  const today = istStartOfDay(new Date());
  const diff = Math.round((istStartOfDay(d).getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  return toDateKey(d);
}
