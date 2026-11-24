/**
 * Finalization checks only persisted run inputs. Policy changes made after a
 * draft exists must never reinterpret or mutate its payroll snapshot.
 */
import type { PayrollIssue } from "./payroll-issue";
import { payslipReconciliation } from "@/lib/payslip-document";

type PreflightPayslip = { inputSnapshot: unknown; documentSnapshot?: unknown; employeeId?: string };

function missingPolicy({ inputSnapshot }: PreflightPayslip) {
  if (!inputSnapshot || typeof inputSnapshot !== "object" || Array.isArray(inputSnapshot)) return true;
  const policy = (inputSnapshot as { policy?: unknown }).policy;
  return !policy || typeof policy !== "object" || Array.isArray(policy) || !(policy as { payrollConfig?: unknown }).payrollConfig;
}

function snapshotProblems(documentSnapshot: unknown) {
  if (!documentSnapshot) return [];
  if (typeof documentSnapshot === "object" && !Array.isArray(documentSnapshot) &&
    Array.isArray((documentSnapshot as { components?: unknown }).components) && (documentSnapshot as { totals?: unknown }).totals) {
    return payslipReconciliation(documentSnapshot as Parameters<typeof payslipReconciliation>[0]);
  }
  return ["Payslip has an invalid canonical document snapshot. Regenerate the affected draft before finalization."];
}

export function payrollRunPreflightDetails(payslips: PreflightPayslip[]): PayrollIssue[] {
  if (!payslips.length) return [{ code: "no-payslips", message: "Generate at least one payslip before finalization." }];
  return payslips.flatMap(payslip => [
    ...(missingPolicy(payslip) ? [{ code: "policy-snapshot" as const, employeeId: payslip.employeeId, message: "This payslip has no saved payroll configuration. Recalculate the draft payslip." }] : []),
    ...snapshotProblems(payslip.documentSnapshot).map(message => ({ code: "payslip-snapshot" as const, employeeId: payslip.employeeId, message })),
  ]);
}

export function payrollRunPreflight(payslips: PreflightPayslip[]) {
  const details = payrollRunPreflightDetails(payslips);
  const missing = details.filter(({ code }) => code === "policy-snapshot").length;
  const reconciliation = details.filter(({ code }) => code !== "policy-snapshot").map(({ message }) => message);
  return [...(missing ? [`${missing} payslip${missing === 1 ? " is" : "s are"} missing its payroll configuration snapshot. Regenerate the affected draft before finalization.`] : []), ...reconciliation];
}
