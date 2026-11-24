export type PayrollIssue = {
  code: "pending-leave" | "mixed-source" | "workbook-members" | "adjustments-changed" | "attendance-changed" | "source-invalid" | "no-payslips" | "pay-totals" | "policy-snapshot" | "payslip-snapshot";
  message: string;
  employeeId?: string;
};

export function unreconciledPayAmounts(payslip: { grossEarnings: number; deductions: number; netSalary: number }) {
  const { grossEarnings, deductions, netSalary } = payslip;
  return ![grossEarnings, deductions, netSalary].every(Number.isFinite)
    || netSalary < 0 || deductions < 0 || deductions > grossEarnings
    || Math.abs(grossEarnings - deductions - netSalary) > 0.005;
}
