import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { PayslipsPanel } from "./payslips-panel";
import { documentSnapshotForResponse } from "@/lib/payslip-document";

export const dynamic = "force-dynamic";

export default async function EmployeePayslipsPage() {
  const session = await requireSession();
  const lang = await getLang();
  const employee = await prisma.employee.findUnique({
    where: { id: session.sub },
    select: { firstName: true, lastName: true },
  });
  const raw = await prisma.payslip.findMany({
    // Drafts, including historical standalone drafts, are not employee-visible.
    where: { employeeId: session.sub, status: { in: ["finalized", "paid"] } },
    orderBy: { month: "desc" },
    select: {
      id: true,
      month: true,
      status: true,
      documentSnapshot: true,
    },
  });
  // Employee-facing values are exclusively the frozen, PDF-equivalent document.
  const payslips = raw.flatMap((p) => {
    const document = documentSnapshotForResponse(p.documentSnapshot);
    return document ? [{ id: p.id, month: p.month, status: p.status, document }] : [];
  });

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title={t(lang, "payslips.title")} description={t(lang, "payslips.desc")} />
      <Card>
        <CardContent className="p-0 pt-0">
          <PayslipsPanel payslips={payslips} name={`${employee?.firstName ?? ""} ${employee?.lastName ?? ""}`.trim()} lang={lang} />
        </CardContent>
      </Card>
    </div>
  );
}
