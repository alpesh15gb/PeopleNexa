export function isTransactionWriteConflict(error: unknown): boolean {
  const conflict = error as { code?: string; cause?: { kind?: string } } | null | undefined;
  return conflict?.code === "P2034" || conflict?.cause?.kind === "TransactionWriteConflict";
}
