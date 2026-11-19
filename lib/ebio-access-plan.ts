type Policy = { deviceId: string; allowed: boolean; commandStatus: string };

// "sent" means acknowledged by eBio, not verified on the physical machine.
// Failed/pending policies must remain retryable even when their value matches.
export function needsEbioAccessCommand(previous: Policy | undefined, allowed: boolean) {
  return !previous || previous.allowed !== allowed || previous.commandStatus !== "sent";
}

// Lifecycle commands stamp pending attempts before calling eBio. A stale pending
// row can be retried after an interrupted request.
export const EBIO_BLOCK_RETRY_LEASE_MS = 2 * 60 * 1000;

export function canRetryEbioBlock(policy: Pick<Policy, "allowed" | "commandStatus"> & { lastCommandAt: Date | null }, now = new Date()) {
  return !policy.allowed && (policy.commandStatus === "failed" || (
    policy.commandStatus === "pending" && (!policy.lastCommandAt || policy.lastCommandAt.getTime() <= now.getTime() - EBIO_BLOCK_RETRY_LEASE_MS)
  ));
}
