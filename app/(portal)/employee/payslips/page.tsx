import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { PayslipsPanel } from "./payslips-panel";

export const dynamic = "force-dynamic";

export default async function EmployeePayslipsPage() {
  const session = await requireSession();
  const lang = await getLang();
  const employee = await prisma.employee.findUnique({
    where: { id: session.sub },
    select: { firstName: true, lastName: true },
  });
  const raw = await prisma.payslip.findMany({
    where: { employeeId: session.sub },
    orderBy: { month: "desc" },
    select: {
      id: true,
      month: true,
      baseSalary: true,
      allowances: true,
      overtimePay: true,
      grossEarnings: true,
      pfEmployee: true,
      esicEmployee: true,
      professionalTax: true,
      lwf: true,
      tds: true,
      lateFines: true,
      loanDeduction: true,
      deductions: true,
      netSalary: true,
      status: true,
      presentDays: true,
      lateDays: true,
      absentDays: true,
      overtimeHours: true,
      workedHours: true,
      adjustments: true,
    },
  });
  const payslips = raw.map((p) => ({
    ...p,
    adjustments: (p.adjustments ?? null) as unknown as { label: string; amount: number }[] | null,
  }));

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
