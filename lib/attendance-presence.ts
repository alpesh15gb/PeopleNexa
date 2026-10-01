export const AUTHORIZED_PUNCH_STATUSES = ["auto", "approved"] as const;

/** Raw Punch rows that count toward real-time presence for an IST day. */
export function authorizedPunchDayFilter(start: Date, end: Date) {
  return {
    punchTime: { gte: start, lt: end },
    authStatus: { in: [...AUTHORIZED_PUNCH_STATUSES] },
  };
}
