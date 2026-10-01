export function hasExplicitPaidValue(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function canDeleteLeaveType(dependencies: readonly number[]) {
  return dependencies.every((count) => count === 0);
}
