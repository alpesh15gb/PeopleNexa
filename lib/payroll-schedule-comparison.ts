import { unpaidAttendanceDays, type AttendanceSummary } from "./payroll";

export type PayrollScheduleTotals = {
  workingDays: number;
  absentDays: number;
  unpaidDays: number;
};

type PayrollScheduleComparisonRow = {
  employeeNumber: string;
  employeeName: string;
  legacy: PayrollScheduleTotals;
  shiftBased: PayrollScheduleTotals;
};

export type PayrollScheduleComparison = {
  month: string;
  legacy: PayrollScheduleTotals;
  shiftBased: PayrollScheduleTotals;
  compared: number;
  affected: PayrollScheduleComparisonRow[];
  needsReview: { employeeNumber: string; employeeName: string; reason: string }[];
  liveUsesShiftWeeklyOffs: boolean;
};

export function payrollScheduleTotals(summary: AttendanceSummary): PayrollScheduleTotals {
  return {
    workingDays: summary.workingDays,
    absentDays: summary.absentDays,
    unpaidDays: unpaidAttendanceDays(summary),
  };
}

export function totalPayrollSchedule(rows: PayrollScheduleTotals[]): PayrollScheduleTotals {
  return rows.reduce(
    (total, row) => ({
      workingDays: total.workingDays + row.workingDays,
      absentDays: total.absentDays + row.absentDays,
      unpaidDays: total.unpaidDays + row.unpaidDays,
    }),
    { workingDays: 0, absentDays: 0, unpaidDays: 0 },
  );
}
