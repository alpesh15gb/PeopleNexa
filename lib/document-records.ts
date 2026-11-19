import type { Prisma } from "@/generated/prisma/client";
import { documentExpiryWindow } from "@/lib/document-expiry";
import { prisma } from "@/lib/prisma";

export async function documentSummary(where: Prisma.DocumentWhereInput, now: Date) {
  const { today, noticeEnd } = documentExpiryWindow(now);
  const [total, expired, expiring, ok] = await Promise.all([
    prisma.document.count({ where }),
    prisma.document.count({ where: { ...where, expiryDate: { lt: today } } }),
    prisma.document.count({ where: { ...where, expiryDate: { gte: today, lt: noticeEnd } } }),
    prisma.document.count({ where: { ...where, expiryDate: { gte: noticeEnd } } }),
  ]);
  return { total, expired, expiring, ok };
}
