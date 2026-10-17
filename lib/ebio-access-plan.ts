type Policy = { deviceId: string; allowed: boolean; commandStatus: string };

// "sent" means acknowledged by eBio, not verified on the physical machine.
// Failed/pending policies must remain retryable even when their value matches.
export function needsEbioAccessCommand(previous: Policy | undefined, allowed: boolean) {
  return !previous || previous.allowed !== allowed || previous.commandStatus !== "sent";
}
