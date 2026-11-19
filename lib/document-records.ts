import type { Prisma } from "@/generated/prisma/client";
import { documentExpiryWindow } from "@/lib/document-expiry";
import { prisma } from "@/lib/prisma";
import type { RecordSearchParams } from "@/lib/document-expense-pagination";

export function documentFilters(params: RecordSearchParams, now: Date, searchEmployees = false) {
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const status = params.status === "expired" || params.status === "expiring" || params.status === "current" ? params.status : "";
  const { today, noticeEnd } = documentExpiryWindow(now);
  const where: Prisma.DocumentWhereInput = {
    ...(status === "expired" ? { expiryDate: { lt: today } } : status === "expiring" ? { expiryDate: { gte: today, lt: noticeEnd } } : status === "current" ? { OR: [{ expiryDate: null }, { expiryDate: { gte: noticeEnd } }] } : {}),
    ...(query ? { AND: [{ OR: [
      { name: { contains: query, mode: "insensitive" } },
      { docType: { contains: query, mode: "insensitive" } },
      ...(searchEmployees ? [
        { employee: { employeeNumber: { contains: query, mode: "insensitive" as const } } },
        { employee: { AND: query.split(/\s+/).map((term) => ({ OR: [{ firstName: { contains: term, mode: "insensitive" as const } }, { lastName: { contains: term, mode: "insensitive" as const } }] })) } },
      ] : []),
    ] }] } : {}),
  };
  return { query, status, where };
}

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
