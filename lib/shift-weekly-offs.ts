type ShiftWeeklyOffs = {
  weeklyOffDays?: readonly number[];
  sundayWeeklyOff?: boolean;
};

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export function shiftWeeklyOffDays(shift?: ShiftWeeklyOffs | null): readonly number[] {
  const days = shift?.weeklyOffDays ?? [];
  return shift?.sundayWeeklyOff && !days.includes(0) ? [0, ...days] : days;
}

export function isShiftWeeklyOff(shift: ShiftWeeklyOffs | null, dateKey: string) {
  const weekday = new Date(`${dateKey}T12:00:00Z`).getUTCDay();
  return shiftWeeklyOffDays(shift).includes(weekday);
}

export function parseShiftWeeklyOffDays(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length > WEEKDAYS.length || !value.every((day) => Number.isInteger(day) && day >= 0 && day < WEEKDAYS.length)) return null;
  return [...new Set<number>(value)].sort((a, b) => a - b);
}
