import { IST_OFFSET_MS, istStartOfDay } from "./ist";

export interface WorkCalendarConfig {
  weeklyOffDays: number[];
}

/** Sunday=0 ... Saturday=6, interpreted in IST. */
export function istWeekday(date: Date): number {
  return new Date(date.getTime() + IST_OFFSET_MS).getUTCDay();
}

export function getWorkCalendarConfig(tenantConfig: unknown): WorkCalendarConfig {
  const cfg = (tenantConfig ?? {}) as { attendance?: { weeklyOffDays?: unknown } };
  const raw = cfg.attendance?.weeklyOffDays;
  const days = Array.isArray(raw)
    ? raw.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    : [0];
  return { weeklyOffDays: days.length ? [...new Set(days)] : [0] };
}

export function isWeeklyOff(date: Date, config: WorkCalendarConfig): boolean {
  return config.weeklyOffDays.includes(istWeekday(date));
}

export function isBeforeJoining(date: Date, joiningDate?: Date | null): boolean {
  return Boolean(joiningDate && istStartOfDay(date).getTime() < istStartOfDay(joiningDate).getTime());
}

export function isAfterLastWorkingDay(date: Date, lastWorkingDay?: Date | null): boolean {
  return Boolean(lastWorkingDay && istStartOfDay(date).getTime() > istStartOfDay(lastWorkingDay).getTime());
}

export function dateInRange(date: Date, from: Date, to: Date): boolean {
  const t = istStartOfDay(date).getTime();
  return t >= istStartOfDay(from).getTime() && t <= istStartOfDay(to).getTime();
}
