/** Prisma query failures and adapter-level COMMIT failures have different shapes. */
export function isAttendanceWriteConflict(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    const item = current as { code?: string; originalCode?: string; kind?: string; cause?: unknown; meta?: { driverAdapterError?: unknown } };
    if (["P2002", "P2034", "40001", "40P01"].includes(item.code ?? "") || ["40001", "40P01"].includes(item.originalCode ?? "") || item.kind === "TransactionWriteConflict") return true;
    current = item.cause ?? item.meta?.driverAdapterError;
  }
  return false;
}
