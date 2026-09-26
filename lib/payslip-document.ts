export type PayslipComponent = {
  code: string; label: string; category: "earning" | "deduction" | "employer_benefit" | "reimbursement";
  contractual: number | null; earned: number; includeInGross: boolean; visibleOnPayslip: boolean; nonCash: boolean;
};
export type PayslipDocumentSnapshot = {
  version: 1; generatedAt: string; policy: { id: string | null; version: number | null; source: string };
  branding: { legalName: string; displayName: string; address: string | null; contact: string | null; logoUrl: string | null };
  employee: { name: string; employeeNumber: string; designation: string | null; department: string | null; joiningDate: string | null; bankName: string | null; accountMasked: string | null; panMasked: string | null; uan: string | null; esiIpNumber: string | null };
  period: string; days: { payable: number; paid: number; lop: number }; components: PayslipComponent[]; totals: { gross: number; deductions: number; net: number };
};
export const mask = (value: string | null | undefined, keep = 4) => value ? `${"*".repeat(Math.max(0, value.length - keep))}${value.slice(-keep)}` : null;
export function documentSnapshotForResponse(snapshot: unknown): PayslipDocumentSnapshot | null {
  return snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? snapshot as PayslipDocumentSnapshot : null;
}
export function payslipReconciliation(snapshot: Pick<PayslipDocumentSnapshot, "components" | "totals">): string[] {
  const round = (n: number) => Math.round(n * 100) / 100;
  const gross = round(snapshot.components.filter((r) => r.category === "earning" && r.visibleOnPayslip && r.includeInGross && !r.nonCash).reduce((s, r) => s + r.earned, 0));
  const deductions = round(snapshot.components.filter((r) => r.category === "deduction" && r.visibleOnPayslip).reduce((s, r) => s + r.earned, 0));
  return [gross !== round(snapshot.totals.gross) ? `Visible gross earnings ${gross.toFixed(2)} do not reconcile to gross ${round(snapshot.totals.gross).toFixed(2)}.` : null, deductions !== round(snapshot.totals.deductions) ? `Visible deductions ${deductions.toFixed(2)} do not reconcile to total deductions ${round(snapshot.totals.deductions).toFixed(2)}.` : null].filter((v): v is string => Boolean(v));
}
