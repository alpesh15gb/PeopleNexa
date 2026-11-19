export type EffectiveSalaryRevision = { employeeId: string; newSalary: number; effectiveFrom: Date; id: string };

export function salaryRevisionPeriodStart(month: string) {
  return new Date(`${month}-01T00:00:00.000Z`);
}

/** The latest approved revision on or before the draft-run period wins. */
export function resolveSalaryRevision(revisions: EffectiveSalaryRevision[], employeeId: string, month: string) {
  const periodStart = salaryRevisionPeriodStart(month);
  return revisions.filter((revision) => revision.employeeId === employeeId && revision.effectiveFrom <= periodStart)
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0] ?? null;
}
