import { istStartOfDay } from "./ist";
import { effectiveShiftForDay, punchDayForShift, shiftWindow } from "./reconcile";
import type { Employee } from "@/generated/prisma/client";

/**
 * Resolve the attendance day for a punch using the roster, not only the
 * employee's default shift. The previous day's night roster is checked first
 * so a 06:00 OUT correctly attaches to yesterday's 22:00 shift.
 */
export async function punchDayForEmployee(
  employee: Pick<Employee, "id" | "shiftId" | "tenantId">,
  instant: Date
): Promise<Date> {
  const today = istStartOfDay(instant);
  const previous = new Date(today.getTime() - 86400000);

  const previousShift = await effectiveShiftForDay(employee, previous);
  if (previousShift?.isNightShift) {
    const window = shiftWindow(previous, previousShift);
    if (instant.getTime() >= window.start.getTime() && instant.getTime() < window.end.getTime()) {
      return previous;
    }
  }

  const todayShift = await effectiveShiftForDay(employee, today);
  return punchDayForShift(instant, todayShift);
}
