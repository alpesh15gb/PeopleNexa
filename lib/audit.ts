import { prisma } from "./prisma";
import type { Prisma } from "@/generated/prisma/client";

export interface AppendAuditInput {
  tenantId: string;
  actorId: string;
  actorRole: string;
  action: string;
  entity: string;
  entityId: string;
  summary?: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Best-effort audit write. Never throws — callers must not fail a mutation
 * just because the trail write failed.
 */
export async function appendAudit(input: AppendAuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorId: input.actorId,
        actorRole: input.actorRole,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        summary: input.summary ?? "",
        before:
          input.before === undefined
            ? undefined
            : (input.before as Prisma.InputJsonValue),
        after:
          input.after === undefined
            ? undefined
            : (input.after as Prisma.InputJsonValue),
      },
    });
  } catch (err) {
    console.warn("[audit] appendAudit failed:", err);
  }
}
