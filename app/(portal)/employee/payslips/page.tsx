import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { PageHeader } from "@/components/ui/card";
import { PayslipsPanel } from "./payslips-panel";
import { documentSnapshotForResponse } from "@/lib/payslip-document";
import { personalPayslipStatus, personalPayslipWhere } from "@/lib/personal-payslips";
import { workspaceRegion } from "@/lib/workspace-region";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function EmployeePayslipsPage() {
  const session = await requireSession();
  const lang = await getLang();
  const [raw, tenant] = await Promise.all([
    prisma.payslip.findMany({
      where: personalPayslipWhere(session.tenantId, session.sub),
      orderBy: [{ month: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      select: { id: true, month: true, status: true, documentSnapshot: true, payrollRun: { select: { status: true } }, grossEarnings: true, deductions: true, netSalary: true },
    }),
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } }),
  ]);
  const payslips = raw.map((row) => {
    const document = documentSnapshotForResponse(row.documentSnapshot);
    return {
      id: row.id,
      month: row.month,
      status: personalPayslipStatus(row.status, row.payrollRun?.status),
      totals: document?.totals ?? { gross: row.grossEarnings, deductions: row.deductions, net: row.netSalary },
      details: document ? {
        name: document.employee.name,
        days: document.days,
        components: document.components.filter((component) => component.visibleOnPayslip && component.category !== "employer_benefit"),
      } : null,
    };
  });

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title={t(lang, "payslips.title")} description={t(lang, "payslips.desc")} actions={<Link href="/employee/tax" className="rounded-lg border border-edge bg-card px-3 py-2 text-sm font-medium text-primary hover:bg-tint">Tax &amp; statutory</Link>} />
      <PayslipsPanel payslips={payslips} locale={workspaceRegion(tenant?.config).locale} lang={lang} />
    </div>
  );
}
