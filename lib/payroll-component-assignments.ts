export type PayrollComponentAssignmentRecord = {
  id: string;
  tenantId: string;
  locationId: string;
  employeeId: string;
  componentCode: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  active: boolean;
};

export function normalizePayrollComponentCode(value: unknown): string | null {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z][A-Z0-9_]{0,29}$/.test(code) ? code : null;
}

export function payrollMonthAnchor(month: string): Date {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Payroll month must use YYYY-MM format.");
  return new Date(`${month}-01T12:00:00.000Z`);
}

export function payrollMonthEnd(month: string): Date {
  const start = payrollMonthAnchor(month);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0, 12));
}

/** Assignment ranges are date-inclusive at both ends. */
export function assignmentRangesOverlap(
  first: { effectiveFrom: Date; effectiveTo: Date | null },
  second: { effectiveFrom: Date; effectiveTo: Date | null },
): boolean {
  const firstEnd = first.effectiveTo?.getTime() ?? Number.POSITIVE_INFINITY;
  const secondEnd = second.effectiveTo?.getTime() ?? Number.POSITIVE_INFINITY;
  return first.effectiveFrom.getTime() <= secondEnd && second.effectiveFrom.getTime() <= firstEnd;
}

export function resolveAssignedComponentCodes(
  records: readonly PayrollComponentAssignmentRecord[],
  scope: { tenantId: string; locationId: string; employeeId: string },
  month: string,
): string[] {
  const at = payrollMonthAnchor(month).getTime();
  return [...new Set(records
    .filter((record) => record.active && record.tenantId === scope.tenantId && record.locationId === scope.locationId && record.employeeId === scope.employeeId)
    .filter((record) => record.effectiveFrom.getTime() <= at && (!record.effectiveTo || record.effectiveTo.getTime() >= at))
    .map((record) => record.componentCode.trim().toUpperCase()))]
    .sort();
}
