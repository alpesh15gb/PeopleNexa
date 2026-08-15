// IST (Asia/Kolkata = UTC+5:30, no DST) helpers for biometric device punches.
// Devices report wall-clock IST; we convert to UTC instants for storage.

export const IST_OFFSET_MS = 5.5 * 3600 * 1000;

/** Parse a device timestamp ("2026-08-12 09:03:12" or "2026-08-12T09:03:12") as IST wall-clock → UTC Date. */
export function parseIST(datetimeStr: string): Date | null {
  const m = datetimeStr.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s = "0"] = m;
  const utcMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)) - IST_OFFSET_MS;
  return new Date(utcMs);
}

/** "YYYY-MM-DD" of the IST calendar day for a Date. */
export function istDateKey(date: Date): string {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** UTC instant of IST midnight for the IST day containing `date`. */
export function istStartOfDay(date: Date): Date {
  const key = istDateKey(date);
  return parseIST(`${key} 00:00:00`)!;
}

/** A Date whose local getHours/getMinutes expose the IST wall clock (for shift/status math). */
export function istWallClock(date: Date): Date {
  return new Date(date.getTime() + IST_OFFSET_MS);
}
