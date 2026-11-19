import { redirect } from "next/navigation";
import { isMonthKey } from "@/lib/dates";
import { payrollScopeHref } from "@/lib/payroll-work-queue";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Legacy operational URL. The monthly workflow has one canonical route. */
export default async function ProcessPayrollPage({ searchParams }: { searchParams: Promise<{ month?: string | string[]; period?: string | string[]; location?: string | string[]; run?: string | string[] }> }) {
  const session = await requireSession();
  if (session.role !== "admin" && session.role !== "location_manager") redirect("/employee");
  const params = await searchParams;
  const period = [params.period, params.month].find((value): value is string => typeof value === "string" && isMonthKey(value));
  redirect(payrollScopeHref("/admin/payroll", {
    period,
    locationId: typeof params.location === "string" ? params.location : null,
    runId: typeof params.run === "string" ? params.run : undefined,
  }));
}
