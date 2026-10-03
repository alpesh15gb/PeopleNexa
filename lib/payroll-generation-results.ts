export type PayrollGenerationResult = {
  employeeId: string;
  employeeName: string;
  created: boolean;
  netSalary?: number;
  error?: string;
  skipped?: string;
};

export function payrollGenerationTotals(results: readonly PayrollGenerationResult[]) {
  return {
    created: results.filter((result) => result.created).length,
    failed: results.filter((result) => !result.created && Boolean(result.error)).length,
    skipped: results.filter((result) => !result.created && !result.error).length,
    total: results.length,
  };
}

export function payrollGenerationReason(result: PayrollGenerationResult): string {
  if (result.error) return result.error;
  if (result.skipped === "not-joined") return "Joining date is after this payroll month. Check the employee's joining date or choose a later month.";
  if (result.skipped === "missing-salary") return "Salary is missing or zero. Update the employee's salary before generating payroll.";
  if (result.skipped === "already-included") return "A payslip already exists in this draft. Review the existing payslip.";
  return "No payslip was created for this employee. Check the payroll run before retrying.";
}
