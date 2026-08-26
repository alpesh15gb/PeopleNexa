// Local-timezone date helpers. The whole app reasons in the server's local time
// zone (all times stored as UTC instants but interpreted locally).

const pad = (n: number) => String(n).padStart(2, "0");

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export function parseTime(t: string): { hour: number; minute: number } {
  const [hour, minute] = t.split(":").map(Number);
  return { hour: hour || 0, minute: minute || 0 };
}

/** Minutes of the day for a given time string like "09:30". */
export function minutesOfDay(t: string): number {
  const { hour, minute } = parseTime(t);
  return hour * 60 + minute;
}

export function formatTime(d: Date | null | undefined): string {
  if (!d) return "—";
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

export function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
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
