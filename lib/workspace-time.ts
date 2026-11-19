import { isDateKey } from "./dates";
import { DEFAULT_WORKSPACE_REGION, type WorkspaceRegion } from "./workspace-region";

const DAY_MS = 86_400_000;
const regionalClocks = new Map<string, Intl.DateTimeFormat>();

function wallClock(date: Date, timeZone: string) {
  let formatter = regionalClocks.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    });
    regionalClocks.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return { dateKey: `${parts.year.padStart(4, "0")}-${parts.month}-${parts.day}`, hours: Number(parts.hour), minutes: Number(parts.minute), seconds: Number(parts.second) };
}

export function dateKeyInTimeZone(date: Date, timeZone: string) {
  return wallClock(date, timeZone).dateKey;
}

export function wallMinutesInTimeZone(date: Date, timeZone: string) {
  const { hours, minutes } = wallClock(date, timeZone);
  return hours * 60 + minutes;
}

export function offsetDateKey(dateKey: string, days: number) {
  return new Date(new Date(`${dateKey}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function wallEpoch(instant: Date, timeZone: string) {
  const parts = wallClock(instant, timeZone);
  return new Date(`${parts.dateKey}T00:00:00Z`).getTime() + ((parts.hours * 60 + parts.minutes) * 60 + parts.seconds) * 1000;
}

/** Resolve a local minute. Pick the earlier overlap or advance through a clock gap. */
export function workspaceWallTime(dateKey: string, minute: number, timeZone: string): Date {
  const desired = new Date(`${dateKey}T00:00:00Z`).getTime() + minute * 60_000;
  if (timeZone === DEFAULT_WORKSPACE_REGION.timeZone) return new Date(desired - 330 * 60_000);
  const offsets = new Set([-1.5, 0, 1.5].map((days) => {
    const sample = desired + days * DAY_MS;
    return wallEpoch(new Date(sample), timeZone) - sample;
  }));
  const candidates = [...offsets].map((offset) => {
    const instant = new Date(desired - offset);
    return { instant, mapped: wallEpoch(instant, timeZone) };
  }).sort((a, b) => a.mapped - b.mapped || a.instant.getTime() - b.instant.getTime());
  return candidates.find((candidate) => candidate.mapped >= desired)?.instant ?? candidates[candidates.length - 1].instant;
}

export function timeZoneDayRange(dateKey: string, timeZone: string) {
  if (!isDateKey(dateKey)) return { start: new Date(NaN), end: new Date(NaN) };
  return { start: workspaceWallTime(dateKey, 0, timeZone), end: workspaceWallTime(offsetDateKey(dateKey, 1), 0, timeZone) };
}

export function parseWorkspaceWallTime(value: string, timeZone: string) {
  const match = /^(\d{4}-\d{2}-\d{2})[T ]([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(value.trim());
  if (!match || !isDateKey(match[1])) return null;
  const minute = Number(match[2]) * 60 + Number(match[3]);
  const instant = workspaceWallTime(match[1], minute, timeZone);
  if (dateKeyInTimeZone(instant, timeZone) !== match[1] || wallMinutesInTimeZone(instant, timeZone) !== minute) return null;
  return new Date(instant.getTime() + Number(match[4] ?? 0) * 1000);
}

export function formatWorkspaceTime(date: Date | null | undefined, region: Pick<WorkspaceRegion, "timeZone" | "locale">) {
  return date ? new Intl.DateTimeFormat(region.locale, { timeZone: region.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date) : "—";
}

export function formatCalendarDate(dateKey: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(`${dateKey}T00:00:00Z`));
}
