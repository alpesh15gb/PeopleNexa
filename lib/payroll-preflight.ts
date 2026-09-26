/**
 * Finalization checks only persisted run inputs. Policy changes made after a
 * draft exists must never reinterpret or mutate its payroll snapshot.
 */
import { payslipReconciliation } from "@/lib/payslip-document";

export function payrollRunPreflight(payslips: Array<{ inputSnapshot: unknown; documentSnapshot?: unknown }>) {
  if (!payslips.length) return ["Generate at least one payslip before finalization."];
  const missing = payslips.filter(({ inputSnapshot }) => {
    if (!inputSnapshot || typeof inputSnapshot !== "object" || Array.isArray(inputSnapshot)) return true;
    const policy = (inputSnapshot as { policy?: unknown }).policy;
    return !policy || typeof policy !== "object" || Array.isArray(policy) || !(policy as { payrollConfig?: unknown }).payrollConfig;
  }).length;
  const reconciliation = payslips.flatMap(({ documentSnapshot }) => !documentSnapshot ? [] : typeof documentSnapshot === "object" && !Array.isArray(documentSnapshot) && Array.isArray((documentSnapshot as { components?: unknown }).components) && (documentSnapshot as { totals?: unknown }).totals ? payslipReconciliation(documentSnapshot as Parameters<typeof payslipReconciliation>[0]) : ["Payslip has an invalid canonical document snapshot. Regenerate the affected draft before finalization."]);
  return [...(missing ? [`${missing} payslip${missing === 1 ? " is" : "s are"} missing its payroll configuration snapshot. Regenerate the affected draft before finalization.`] : []), ...reconciliation];
}
