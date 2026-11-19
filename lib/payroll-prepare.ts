export function payrollPreparationEnd(month: string) {
  const periodEnd = new Date(`${month}-01T00:00:00Z`);
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
  return periodEnd;
}
