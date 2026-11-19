import Link from "next/link";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { PayrollNavigation } from "@/components/payroll-navigation";
import { SettingsWorkspace } from "@/components/settings-workspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { isMonthKey } from "@/lib/dates";
import { managerLocationId } from "@/lib/location-scope";
import { canApprovePayrollRun, PAYROLL_QUEUE_STAGES, payrollQueueStage, payrollQueueStages, payrollScopeHref } from "@/lib/payroll-work-queue";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const queuePath = "/admin/payroll/queue";
const monthLabel = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" });

export default async function PayrollQueuePage({ searchParams }: {
  searchParams: Promise<{ stage?: string; location?: string; period?: string }>;
}) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) redirect("/login");
  if (session.role !== "admin" && session.role !== "location_manager") redirect("/employee");

  const [params, assignedLocationId] = await Promise.all([searchParams, managerLocationId(session)]);
  const canManageSettings = session.role === "admin";
  const locations = await prisma.location.findMany({
    where: { tenantId: session.tenantId, isActive: true, ...(!canManageSettings ? { id: assignedLocationId ?? "" } : {}) },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const selectedLocation = locations.find((location) => location.id === (canManageSettings ? params.location : assignedLocationId));
  const locationId = selectedLocation?.id ?? null;
  const period = params.period && isMonthKey(params.period) ? params.period : null;
  const stage = payrollQueueStage(params.stage);
  const scope = { locationId, period };
  const locationsById = new Map(locations.map((location) => [location.id, location.name]));
  const runs = locations.length ? await prisma.payrollRun.findMany({
    where: {
      tenantId: session.tenantId,
      locationId: locationId ?? { in: [...locationsById.keys()] },
      status: { in: payrollQueueStages },
      ...(period ? { month: period } : {}),
    },
    select: {
      id: true, createdBy: true, locationId: true, month: true, status: true,
      _count: { select: { payslips: true, members: { where: { exception: { not: null } } } } },
    },
    orderBy: [{ month: "desc" }, { createdAt: "asc" }],
  }) : [];
  const visibleRuns = stage ? runs.filter((run) => run.status === stage) : runs;

  return (
    <SettingsWorkspace title="Payroll work queue" description="Find open payroll runs and continue their next step.">
      <div className="space-y-5">
        <PayrollNavigation active="queue" canManageSettings={canManageSettings} {...scope} />
        <form action={queuePath} className="flex flex-wrap items-end gap-3 rounded-xl border border-edge bg-card p-4">
          {stage && <input type="hidden" name="stage" value={stage} />}
          {canManageSettings && (
            <Field label="Location" className="min-w-44 flex-1">
              <Select aria-label="Payroll queue location" name="location" defaultValue={locationId ?? ""}>
                <option value="">All active locations</option>
                {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </Select>
            </Field>
          )}
          {!canManageSettings && selectedLocation && <p className="text-sm text-muted-foreground">Location <strong className="ml-1 text-foreground">{selectedLocation.name}</strong></p>}
          <Field label="Pay month" className="min-w-36 flex-1">
            <Input name="period" type="month" defaultValue={period ?? ""} />
          </Field>
          <Button type="submit" variant="outline">Apply filters</Button>
          {(period || (canManageSettings && locationId)) && (
            <Link className="inline-flex min-h-10 items-center text-sm font-medium text-primary hover:underline" href={payrollScopeHref(queuePath, { stage })}>Clear filters</Link>
          )}
        </form>
        <nav aria-label="Open payroll stages" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[null, ...payrollQueueStages].map((filter) => {
            const label = filter ? PAYROLL_QUEUE_STAGES[filter].label : "All open runs";
            const count = filter ? runs.filter((run) => run.status === filter).length : runs.length;
            return (
              <Link
                key={filter ?? "all"}
                href={payrollScopeHref(queuePath, { ...scope, stage: filter })}
                aria-current={stage === filter ? "page" : undefined}
                className={`rounded-xl border p-3 text-left focus-visible:ring-2 focus-visible:ring-ring ${stage === filter ? "border-primary/40 bg-primary/10" : "border-edge bg-card hover:bg-tint"}`}
              >
                <span className="block text-sm text-muted-foreground">{label}</span>
                <strong className="mt-1 block text-xl tabular-nums">{count.toLocaleString()}</strong>
              </Link>
            );
          })}
        </nav>
        {visibleRuns.length ? (
          <ul aria-label="Open payroll runs" className="divide-y divide-edge rounded-xl border border-edge bg-card">
            {visibleRuns.map((run) => {
              const details = PAYROLL_QUEUE_STAGES[run.status as keyof typeof PAYROLL_QUEUE_STAGES];
              const waitingOnAnotherReviewer = run.status === "reviewed" && !canApprovePayrollRun(run.createdBy, session.sub);
              return (
                <li key={run.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{locationsById.get(run.locationId ?? "")}</h2>
                      <Badge tone={run.status === "reviewed" ? "warning" : "neutral"}>{details.statusLabel}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{monthLabel.format(new Date(`${run.month}-01T12:00:00Z`))} · {run._count.payslips} {run._count.payslips === 1 ? "payslip" : "payslips"}</p>
                    {run._count.members > 0 && <p className="mt-1 text-sm text-muted-foreground">{run._count.members} {run._count.members === 1 ? "employee needs" : "employees need"} attention.</p>}
                    {waitingOnAnotherReviewer && <p className="mt-1 text-sm text-muted-foreground">Waiting for another authorized reviewer.</p>}
                  </div>
                  <Link href={payrollScopeHref("/admin/payroll", { locationId: run.locationId, period: run.month, runId: run.id })} className="inline-flex min-h-10 w-fit items-center gap-2 text-sm font-semibold text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring">
                    {waitingOnAnotherReviewer ? "View reviewed run" : details.action}
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-xl border border-edge bg-card px-5 py-10 text-center">
            <ClipboardCheck aria-hidden="true" className="mx-auto mb-3 size-7 text-muted-foreground" />
            <h2 className="font-semibold">{locations.length ? "No open runs in this view" : "No active payroll location"}</h2>
            {locations.length === 0 && <p className="mt-2 text-sm text-muted-foreground">{canManageSettings ? "Create or activate a location in Company settings." : "Ask a workspace administrator to assign an active payroll location."}</p>}
            {locations.length > 0 && <Link href={payrollScopeHref("/admin/payroll", scope)} className="mt-3 inline-flex text-sm font-semibold text-primary hover:underline">Open monthly payroll</Link>}
          </div>
        )}
      </div>
    </SettingsWorkspace>
  );
}
