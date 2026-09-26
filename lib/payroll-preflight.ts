/**
 * Finalization checks only persisted run inputs. Policy changes made after a
 * draft exists must never reinterpret or mutate its payroll snapshot.
 */
export function payrollRunPreflight(payslips: Array<{ inputSnapshot: unknown }>) {
  if (!payslips.length) return ["Generate at least one payslip before finalization."];
  const missing = payslips.filter(({ inputSnapshot }) => {
    if (!inputSnapshot || typeof inputSnapshot !== "object" || Array.isArray(inputSnapshot)) return true;
    const policy = (inputSnapshot as { policy?: unknown }).policy;
    return !policy || typeof policy !== "object" || Array.isArray(policy) || !(policy as { payrollConfig?: unknown }).payrollConfig;
  }).length;
  return missing ? [`${missing} payslip${missing === 1 ? " is" : "s are"} missing its payroll configuration snapshot. Regenerate the affected draft before finalization.`] : [];
}
