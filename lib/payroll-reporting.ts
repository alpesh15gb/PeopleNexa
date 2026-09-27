export const FINANCIAL_HISTORY_RUN_STATUSES = ["finalized", "paid"] as const;

export function isFinancialHistoryRun(status: string) {
  return (FINANCIAL_HISTORY_RUN_STATUSES as readonly string[]).includes(status);
}

export type PayrollVarianceSlip = {
  employeeId: string;
  grossEarnings: number;
  deductions: number;
  netSalary: number;
};

export function comparePayrollRuns(reference: PayrollVarianceSlip[], current: PayrollVarianceSlip[]) {
  const referenceByEmployee = new Map(reference.map((slip) => [slip.employeeId, slip]));
  const currentByEmployee = new Map(current.map((slip) => [slip.employeeId, slip]));
  const employeeIds = new Set([...referenceByEmployee.keys(), ...currentByEmployee.keys()]);
  const rows = [...employeeIds].map((employeeId) => {
    const before = referenceByEmployee.get(employeeId);
    const after = currentByEmployee.get(employeeId);
    return {
      employeeId,
      reference: before ?? null,
      current: after ?? null,
      grossDelta: (after?.grossEarnings ?? 0) - (before?.grossEarnings ?? 0),
      deductionsDelta: (after?.deductions ?? 0) - (before?.deductions ?? 0),
      netDelta: (after?.netSalary ?? 0) - (before?.netSalary ?? 0),
    };
  });
  const totals = rows.reduce((total, row) => ({
    grossDelta: total.grossDelta + row.grossDelta,
    deductionsDelta: total.deductionsDelta + row.deductionsDelta,
    netDelta: total.netDelta + row.netDelta,
  }), { grossDelta: 0, deductionsDelta: 0, netDelta: 0 });
  return { rows, totals };
}
