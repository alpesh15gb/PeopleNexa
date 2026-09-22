export function carryForwardCandidate(legacyRemaining: number, enabled: boolean, limit: number | null) {
  if (!enabled || limit === null) return 0;
  return Math.max(0, Math.min(legacyRemaining, limit));
}

export function periodBalance(entitlement: number | null, carryForward: number, used: number) {
  return entitlement === null ? null : Math.max(entitlement + carryForward - used, 0);
}
