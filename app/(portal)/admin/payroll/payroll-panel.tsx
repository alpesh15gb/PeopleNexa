"use client";

import { useEffect, useState } from "react";
import { PayrollNavigation } from "@/components/payroll-navigation";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Download,
  Landmark,
  Settings2,
  Check,
  Search,
  Wallet,
  Users,
  CircleAlert,
} from "lucide-react";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { formatMoney } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import type { PayslipDocumentSnapshot } from "@/lib/payslip-document";
import { payrollGenerationReason, type PayrollGenerationResult } from "@/lib/payroll-generation-results";

type Employee = {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  accountNumber: string | null;
  ifscCode: string | null;
  department: { name: string } | null;
};
type Payslip = {
  id: string;
  grossEarnings: number;
  deductions: number;
  netSalary: number;
  status: string;
  adjustments: { label: string; amount: number }[] | null;
  document: PayslipDocumentSnapshot | null;
};
type Row = { employee: Employee; payslip: Payslip | null };
type Payroll = {
  id: string;
  month: string;
  status: string;
  createdBy: string;
  _count: { payslips: number; members?: number };
  members?: {
    id: string;
    exception: string | null;
    employee: {
      id: string;
      employeeNumber: string;
      firstName: string;
      lastName: string;
    };
  }[];
};
type PayrollRunOption = { id: string; status: string; payslipCount: number };
type PickerEmployee = {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  position: string | null;
  salary: number | null;
  joiningDate: string | null;
  department: { name: string } | null;
  eligible: boolean;
  eligibility: string;
};

function name(employee: Pick<Employee, "firstName" | "lastName">) {
  return `${employee.firstName} ${employee.lastName}`.trim();
}
function monthName(month: string) {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${month}-01T00:00:00`));
}

export function PayrollPanel({
  month,
  locationLabel,
  locationId,
  locations,
  runs,
  rows,
  totals,
  generated,
  notIncludedCount,
  canManageSettings,
  payroll,
  provenance,
}: {
  month: string;
  locationLabel: string;
  locationId: string | null;
  locations: { id: string; name: string }[];
  runs: PayrollRunOption[];
  rows: Row[];
  totals: { gross: number; deductions: number; net: number; paid: number };
  generated: number;
  notIncludedCount: number;
  canManageSettings: boolean;
  payroll: Payroll | null;
  provenance: { source: string } | null;
}) {
  const [search, setSearch] = useState("");
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [confirmation, setConfirmation] = useState<
    "paid" | "cancelled" | "finalized" | "draft" | null
  >(null);
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [details, setDetails] = useState<Row | null>(null);
  const [bank, setBank] = useState("generic");
  const [selectionMode, setSelectionMode] = useState<
    "all_eligible" | "selected"
  >("all_eligible");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sourceIssues, setSourceIssues] = useState<string[]>([]);
  const [generationIssues, setGenerationIssues] = useState<PayrollGenerationResult[]>([]);
  const [recovery, setRecovery] = useState<
    "mess_backdate" | "attendance_reprocess" | null
  >(null);
  const [recoveryPreview, setRecoveryPreview] = useState<{
    count: number;
  } | null>(null);
  useEffect(() => {
    setSelectedEmployeeIds([]);
    setSelectionMode("all_eligible");
    setPickerOpen(false);
    setSourceIssues([]);
    setGenerationIssues([]);
    setDetails(null);
    setConfirmation(null);
    setSearch("");
    setOnlyIssues(false);
  }, [month, locationId]);
  const blockers = [
    ...rows
      .filter(({ payslip }) => payslip && (
        ![payslip.grossEarnings, payslip.deductions, payslip.netSalary].every(globalThis.Number.isFinite) ||
        payslip.deductions < 0 || payslip.deductions > payslip.grossEarnings ||
        Math.abs(payslip.grossEarnings - payslip.deductions - payslip.netSalary) > 0.005
      ))
      .map(({ employee }) => ({
        employeeId: employee.id,
        message: "Payroll amounts do not reconcile. Check deductions and regenerate the draft.",
      })),
    ...rows
      .filter(({ payslip }) => payslip && payslip.netSalary < 0)
      .map(({ employee }) => ({
        employeeId: employee.id,
        message: "Net pay is below zero.",
      })),
    ...rows
      .filter(
        ({ payslip, employee }) =>
          payslip && (!employee.accountNumber || !employee.ifscCode),
      )
      .map(({ employee }) => ({
        employeeId: employee.id,
        message: "Bank details are missing.",
      })),
    ...(payroll?.members ?? [])
      .filter((member) => member.exception)
      .map((member) => ({
        employeeId: member.employee.id,
        message: member.exception!,
      })),
  ];
  const issueFor = (employeeId: string) =>
    blockers.find((issue) => issue.employeeId === employeeId)?.message;
  const changeScope = (nextMonth = month, nextLocation = locationId) => {
    const query = new URLSearchParams({ period: nextMonth });
    if (nextLocation) query.set("location", nextLocation);
    router.push(`/admin/payroll?${query}`);
  };
  async function create(addToDraft = false) {
    if (selectionMode === "selected" && !selectedEmployeeIds.length)
      return toast("error", "Select at least one eligible employee.");
    setBusy("create");
    setGenerationIssues([]);
    try {
      const response = await fetch("/api/payroll/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month,
          locationId,
          selectionMode,
          employeeIds: selectedEmployeeIds,
          ...(addToDraft && payroll ? { runId: payroll.id } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok)
        return toast(
          "error",
          data.error ?? "Could not create monthly payroll.",
        );
      setPickerOpen(false);
      const issues: PayrollGenerationResult[] = (data.results ?? []).filter(
        (result: PayrollGenerationResult) => !result.created,
      );
      setGenerationIssues(issues);
      if (data.cancelled || !data.created) {
        toast(
          "error",
          data.cancelled
            ? "No payslips were created. The empty run was cancelled. See the employee reasons below."
            : "No payslips were created. The current draft was not advanced.",
        );
        router.refresh();
        return;
      }
      const counts = `${data.created} created${data.skipped ? `, ${data.skipped} skipped` : ""}${data.totals?.failed ? `, ${data.totals.failed} failed` : ""}`;
      toast(
        data.totals?.failed ? "info" : "success",
        addToDraft
          ? `Employees added: ${counts}.`
          : `Payroll ready for review: ${counts}.`,
      );
      router.push(
        `/admin/payroll?${new URLSearchParams({ period: month, location: locationId ?? "", run: data.runId })}`,
      );
    } catch {
      toast("error", "Could not confirm payroll generation. Refresh and check the run before retrying.");
    } finally {
      setBusy(null);
    }
  }
  async function transition(
    status: string,
    evidence: Record<string, unknown> = {},
  ) {
    if (!payroll) return;
    setBusy(status);
    try {
      const response = await fetch(`/api/payroll/runs/${payroll.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, locationId, ...evidence }),
      });
      const data = await response.json();
      if (!response.ok) {
        setSourceIssues(Array.isArray(data.preflight) ? data.preflight : [data.error ?? "Could not update monthly payroll."]);
        return toast("error", "Payroll needs attention. Review the issues shown on this page.");
      }
      setSourceIssues([]);
      setConfirmation(null);
      toast("success", "Monthly payroll updated.");
      router.refresh();
    } catch {
      toast("error", "Could not connect. Please try again.");
    } finally {
      setBusy(null);
    }
  }
  async function exportBank() {
    if (!payroll) return;
    setBusy("bank");
    try {
      const response = await fetch(
        `/api/payroll/export?${new URLSearchParams({ month, bank, runId: payroll.id, locationId: locationId ?? "" })}`,
      );
      if (!response.ok) return toast("error", "Bank export failed.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `salary-${month}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(null);
    }
  }
  function exportAllPayslips() {
    if (!payroll) return;
    setBusy("payslips");
    const link = document.createElement("a");
    link.href = `/api/payroll/payslips?${new URLSearchParams({ month, runId: payroll.id, locationId: locationId ?? "" })}`;
    link.download = `payslips-${month}.zip`;
    document.body.append(link);
    link.click();
    link.remove();
    toast("success", "Preparing payslips. Your download will start shortly.");
    window.setTimeout(() => setBusy(null), 500);
  }
  async function previewRecovery(
    action: "mess_backdate" | "attendance_reprocess",
  ) {
    if (!locationId) return;
    setBusy(action);
    try {
      const response = await fetch("/api/payroll/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, month, locationId }),
      });
      const data = await response.json();
      if (!response.ok)
        return toast("error", data.error ?? "Recovery preview failed.");
      setRecovery(action);
      setRecoveryPreview(data);
    } finally {
      setBusy(null);
    }
  }
  async function applyRecovery() {
    if (!locationId || !recovery) return;
    setBusy(recovery);
    try {
      const response = await fetch("/api/payroll/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: recovery,
          month,
          locationId,
          confirm: true,
        }),
      });
      const data = await response.json();
      if (!response.ok) return toast("error", data.error ?? "Recovery failed.");
      toast("success", `${data.changed} record(s) recovered.`);
      setRecovery(null);
      setRecoveryPreview(null);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }
  const missingTerminalPayslips = Boolean(
    payroll &&
    ["finalized", "paid"].includes(payroll.status) &&
    generated === 0,
  );
  const state = !locationId
    ? "Not started"
    : !payroll
      ? "Not started"
      : missingTerminalPayslips
        ? "Payroll record needs attention"
        : payroll.status === "cancelled"
          ? "Cancelled"
          : payroll.status === "reversed"
            ? "Reversed"
            : blockers.length
              ? "Needs attention"
              : payroll.status === "draft"
                ? "Draft ready for review"
                : payroll.status === "reviewed"
                  ? "Ready to approve"
                  : payroll.status === "approved"
                    ? "Ready to finalize"
                    : payroll.status === "finalized"
                      ? "Ready to record payment"
                      : "Paid";
  const action = !locationId
    ? null
    : !payroll
      ? { label: `Create preview`, onClick: () => create(), busy: "create" }
      : payroll.status === "draft"
        ? {
            label: "Complete review",
            onClick: () => transition("reviewed"),
            busy: "reviewed",
          }
        : payroll.status === "reviewed"
          ? {
              label: "Approve payroll",
              onClick: () => transition("approved"),
              busy: "approved",
            }
          : payroll.status === "approved"
            ? {
                label: "Finalize payroll",
                onClick: () => setConfirmation("finalized"),
                busy: "finalized",
              }
            : payroll.status === "finalized" && !missingTerminalPayslips
              ? {
                  label: "Record payment",
                  onClick: () => setConfirmation("paid"),
                  busy: "paid",
                }
              : null;
  const issueCount = new Set(blockers.map((issue) => issue.employeeId)).size;
  const filteredRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    return (
      (!query ||
        `${name(row.employee)} ${row.employee.employeeNumber} ${row.employee.department?.name ?? ""}`
          .toLowerCase()
          .includes(query)) &&
      (!onlyIssues || Boolean(issueFor(row.employee.id)))
    );
  });
  const steps = ["Prepare", "Review", "Approve", "Finalize", "Payment"];
  const currentStep = !payroll
    ? 0
    : ({ draft: 1, reviewed: 2, approved: 3, finalized: 4, paid: 5 }[
        payroll.status
      ] ?? -1);
  return (
    <main className="payroll-canvas payroll-workspace animate-fade-up pb-8">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-primary">
              Pay & people
            </p>
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              Monthly payroll
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Prepare salaries, review the details, and record payment.
            </p>
          </div>
          {canManageSettings && (
            <Button
              variant="outline"
              onClick={() => router.push("/admin/payroll/configuration")}
            >
              <Settings2 aria-hidden="true" className="h-4 w-4" />
              Settings
            </Button>
          )}
        </header>
        <PayrollNavigation active="payroll" canManageSettings={canManageSettings} />
        <section
          aria-label="Payroll period"
          className="flex flex-wrap items-end gap-4 rounded-2xl border border-edge bg-card p-4"
        >
          <Field label="Location" className="min-w-48 flex-1">
            <Select
              value={locationId ?? ""}
              onChange={(event) =>
                changeScope(month, event.target.value || null)
              }
              disabled={!canManageSettings || Boolean(busy)}
            >
              <option value="" disabled>
                Select location
              </option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
              {!canManageSettings && (
                <option value={locationId ?? ""}>{locationLabel}</option>
              )}
            </Select>
          </Field>
          <Field label="Pay month" className="min-w-40 flex-1">
            <Input
              type="month"
              value={month}
              disabled={Boolean(busy)}
              onChange={(event) => {
                if (event.target.value)
                  changeScope(event.target.value, locationId);
              }}
            />
          </Field>
          {runs.length > 1 && payroll && (
            <Field label="Payroll run" className="min-w-48 flex-1">
              <Select
                value={payroll.id}
                disabled={Boolean(busy)}
                onChange={(event) =>
                  router.push(
                    `/admin/payroll?${new URLSearchParams({ period: month, location: locationId ?? "", run: event.target.value })}`,
                  )
                }
              >
                {runs.map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.status} · {run.payslipCount} employees
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Badge
            tone={payroll?.status === "paid" ? "success" : "neutral"}
            className="mb-3 capitalize"
          >
            {payroll?.status ?? "Not started"}
          </Badge>
        </section>
        {sourceIssues.length > 0 && <section role="alert" className="rounded-2xl border border-warning/30 bg-card p-5"><h2 className="font-semibold">Resolve before continuing</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm">{sourceIssues.map((issue, index) => <li key={index}>{issue}</li>)}</ul><p className="mt-3 text-sm text-muted-foreground">For reviewed or approved runs, use Advanced tools to return to draft. Correct the inputs and regenerate affected payslips.</p></section>}
        {generationIssues.length > 0 && (
          <section role="alert" aria-label="Payroll generation issues" className="rounded-2xl border border-warning/30 bg-card p-4 sm:p-5">
            <h2 className="font-semibold text-foreground">Some employees have no new payslip</h2>
            <p className="mt-1 text-sm text-muted-foreground">Resolve these reasons before retrying the affected employees. Payslips that were created remain in the draft.</p>
            <div className="mt-4 overflow-x-auto">
              <Table>
                <THead><TR><TH>Employee</TH><TH>Result</TH><TH>Reason</TH></TR></THead>
                <TBody>{generationIssues.map((result) => (
                  <TR key={result.employeeId}>
                    <TD>{result.employeeName}</TD>
                    <TD><Badge tone={result.error ? "danger" : "warning"}>{result.error ? "Failed" : "Skipped"}</Badge></TD>
                    <TD className="min-w-64 whitespace-normal break-words">{payrollGenerationReason(result)}</TD>
                  </TR>
                ))}</TBody>
              </Table>
            </div>
          </section>
        )}
        <ol
          aria-label="Payroll progress"
          className="grid grid-cols-5 gap-1 rounded-2xl border border-edge bg-card p-3 sm:gap-4 sm:p-5"
        >
          {steps.map((step, index) => (
            <li
              key={step}
              aria-current={index === currentStep ? "step" : undefined}
              className={`flex flex-col items-center gap-2 text-center text-[10px] font-medium sm:flex-row sm:text-sm ${index <= currentStep ? "text-primary" : "text-muted-foreground"}`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${index < currentStep ? "border-primary bg-primary text-primary-foreground" : index === currentStep ? "border-primary bg-primary/10" : "border-edge bg-tint"}`}
              >
                {index < currentStep ? (
                  <Check aria-hidden="true" className="h-4 w-4" />
                ) : (
                  index + 1
                )}
              </span>
              {step}
            </li>
          ))}
        </ol>
        <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                {locationId
                  ? `${locationLabel} · ${monthName(month)}`
                  : "Let's get started"}
              </p>
              <h2 className="mt-2 font-display text-xl font-semibold">
                {state}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {!locationId
                  ? "Choose a location and pay month above to begin."
                  : missingTerminalPayslips
                    ? "This finalized payroll has no linked payslips. Contact an administrator to resolve the record."
                    : blockers.length
                      ? `${issueCount} employee${issueCount === 1 ? " needs" : "s need"} attention. Check the issues below before continuing.`
                      : !payroll
                        ? "Create a salary preview. You can review every employee before approving."
                        : payroll.status === "draft"
                          ? "Check employee salaries below, then complete your review."
                          : payroll.status === "reviewed"
                            ? "Review is complete. Approve the totals when you are ready."
                            : payroll.status === "approved"
                              ? "Finalize to lock salaries and prepare the bank file."
                              : payroll.status === "finalized"
                                ? "Download the bank file, pay your employees, then record the payment details."
                                : payroll.status === "paid"
                                  ? "Payment is recorded. Payslips and the salary register are ready to download."
                                  : "This historical run is closed."}
              </p>
            </div>
            {action && (
              <Button
                disabled={Boolean(busy) || (blockers.length > 0 && ["reviewed", "approved"].includes(action.busy))}
                aria-describedby={blockers.length > 0 && ["reviewed", "approved"].includes(action.busy) ? "payroll-action-blockers" : undefined}
                loading={busy === action.busy}
                onClick={action.onClick}
              >
                {action.label}
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Button>
            )}
          </div>
          {action && blockers.length > 0 && ["reviewed", "approved"].includes(action.busy) && (
            <p id="payroll-action-blockers" className="mt-4 text-sm text-muted-foreground">
              {action.label} is unavailable until the employee issues are resolved.{" "}
              <a href="#payroll-issues" className="font-medium text-primary underline underline-offset-4">
                View issues and how to resolve them
              </a>
            </p>
          )}
          {payroll?.status === "reviewed" && (
            <p className="mt-4 text-sm text-muted-foreground">
              Approval requires a different administrator from the person who created this payroll.
            </p>
          )}
          {locationId && !payroll && (
            <fieldset className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-primary/15 pt-4">
              <legend className="sr-only">Employees to include</legend>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="payroll-selection"
                  checked={selectionMode === "all_eligible"}
                  onChange={() => setSelectionMode("all_eligible")}
                />
                All eligible employees
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="payroll-selection"
                  checked={selectionMode === "selected"}
                  onChange={() => {
                    setSelectionMode("selected");
                    setPickerOpen(true);
                  }}
                />
                Choose employees
              </label>
              {selectionMode === "selected" && (
                <Button variant="outline" onClick={() => setPickerOpen(true)}>
                  {selectedEmployeeIds.length
                    ? `${selectedEmployeeIds.length} selected`
                    : "Select employees"}
                </Button>
              )}
            </fieldset>
          )}
        </section>
        <section
          aria-label="Payroll summary"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3"
        >
          <div className="col-span-2 rounded-2xl border border-edge bg-card p-5 sm:col-span-1">
            <Wallet aria-hidden="true" className="mb-3 h-5 w-5 text-primary" />
            <p className="text-xs text-muted-foreground">
              {["approved", "finalized", "paid"].includes(payroll?.status ?? "")
                ? "Approved net payout"
                : "Estimated net payout"}
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {formatMoney(totals.net)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Gross {formatMoney(totals.gross)} · Deductions{" "}
              {formatMoney(totals.deductions)}
            </p>
          </div>
          <div className="rounded-2xl border border-edge bg-card p-5">
            <Users aria-hidden="true" className="mb-3 h-5 w-5 text-primary" />
            <p className="text-xs text-muted-foreground">
              Employees in this run
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {generated}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {payroll
                ? `${notIncludedCount} active employees not included in this monthly payroll`
                : "Employees appear after creating a preview"}
            </p>
          </div>
          <div className="rounded-2xl border border-edge bg-card p-5">
            <CircleAlert
              aria-hidden="true"
              className={`mb-3 h-5 w-5 ${issueCount ? "text-amber-300" : "text-primary"}`}
            />
            <p className="text-xs text-muted-foreground">
              Employees needing attention
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {issueCount}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {issueCount
                ? "Resolve issues before approval"
                : payroll
                  ? "No employee issues flagged"
                  : "Checks run when the preview is created"}
            </p>
          </div>
        </section>
        {blockers.length > 0 && (
          <section
            id="payroll-issues"
            aria-label="Payroll issues"
            className="rounded-2xl border border-amber-400/30 bg-amber-500/5 p-5"
          >
            <h2 className="font-semibold">Needs your attention</h2>
            <ul className="mt-3 space-y-2">
              {blockers.map((issue, index) => {
                const row = rows.find(
                  (item) => item.employee.id === issue.employeeId,
                );
                const member = payroll?.members?.find(
                  (item) => item.employee.id === issue.employeeId,
                );
                return (
                  <li
                    key={`${issue.employeeId}-${index}`}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <span>
                      <strong>
                        {row
                          ? name(row.employee)
                          : member
                            ? name(member.employee)
                            : "Employee"}
                      </strong>{" "}
                      · {issue.message}
                    </span>
                    {row && issue.message === "Bank details are missing." ? (
                      <a
                        href={`/admin/employee-master?employee=${row.employee.id}`}
                        className="text-sm font-medium text-primary underline underline-offset-4"
                      >
                        Edit employee bank details
                      </a>
                    ) : row && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDetails(row)}
                      >
                        View details
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {payroll && (
          <section className="overflow-hidden rounded-2xl border border-edge bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge p-5">
              <div>
                <h2 className="font-semibold">Employee review</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Only employees in this monthly payroll run are shown. Open a
                  payslip for the full breakdown.
                </p>
              </div>
              {payroll.status === "draft" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectionMode("selected");
                    setPickerOpen(true);
                  }}
                >
                  Add employees
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 border-b border-edge p-4">
              <div className="relative min-w-48 flex-1">
                <Search
                  aria-hidden="true"
                  className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground"
                />
                <Input
                  aria-label="Search payroll employees"
                  placeholder="Search name, employee ID or department"
                  className="pl-9"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <Button
                variant={onlyIssues ? "secondary" : "outline"}
                aria-pressed={onlyIssues}
                onClick={() => setOnlyIssues(!onlyIssues)}
              >
                Needs attention ({issueCount})
              </Button>
              <span
                className="text-xs text-muted-foreground"
                aria-live="polite"
              >
                {filteredRows.length} of {rows.length}
              </span>
            </div>
            <div className="divide-y divide-edge md:hidden">
              {filteredRows.map((row) => (
                <div key={row.employee.id} className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">
                        {name(row.employee)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.employee.employeeNumber} ·{" "}
                        {row.employee.department?.name ?? "No department"}
                      </p>
                    </div>
                    <Badge
                      tone={issueFor(row.employee.id) ? "warning" : "success"}
                    >
                      {issueFor(row.employee.id)
                        ? "Needs attention"
                        : row.payslip?.status === "paid"
                          ? "Paid"
                          : "Calculated"}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 rounded-xl bg-tint p-3 text-xs">
                    <div>
                      <p className="text-muted-foreground">Gross</p>
                      <p className="mt-1 font-medium tabular-nums">
                        {row.payslip
                          ? formatMoney(row.payslip.grossEarnings)
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Deductions</p>
                      <p className="mt-1 font-medium tabular-nums">
                        {row.payslip
                          ? formatMoney(row.payslip.deductions)
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Net pay</p>
                      <p className="mt-1 font-semibold tabular-nums">
                        {row.payslip ? formatMoney(row.payslip.netSalary) : "—"}
                      </p>
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    variant="outline"
                    size="sm"
                    onClick={() => setDetails(row)}
                  >
                    View payslip
                    <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="hidden md:block">
              <Table>
                <THead>
                  <TR>
                    <TH>Employee</TH>
                    <TH>Gross pay</TH>
                    <TH>Deductions</TH>
                    <TH>Net pay</TH>
                    <TH>Status</TH>
                    <TH className="relative">
                      <span className="sr-only">Details</span>
                    </TH>
                  </TR>
                </THead>
                <TBody>
                  {filteredRows.map((row) => (
                    <TR key={row.employee.id}>
                      <TD>
                        <p className="whitespace-nowrap font-medium">
                          {name(row.employee)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {row.employee.employeeNumber} ·{" "}
                          {row.employee.department?.name ?? "No department"}
                        </p>
                      </TD>
                      <TD className="whitespace-nowrap tabular-nums">
                        {row.payslip
                          ? formatMoney(row.payslip.grossEarnings)
                          : "—"}
                      </TD>
                      <TD className="whitespace-nowrap tabular-nums">
                        {row.payslip
                          ? formatMoney(row.payslip.deductions)
                          : "—"}
                      </TD>
                      <TD className="whitespace-nowrap font-semibold tabular-nums">
                        {row.payslip
                          ? formatMoney(row.payslip.netSalary)
                          : "Not calculated"}
                      </TD>
                      <TD>
                        <Badge
                          tone={
                            issueFor(row.employee.id) ? "warning" : "success"
                          }
                        >
                          {issueFor(row.employee.id)
                            ? "Needs attention"
                            : row.payslip?.status === "paid"
                              ? "Paid"
                              : "Calculated"}
                        </Badge>
                      </TD>
                      <TD>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`View payslip for ${name(row.employee)}`}
                          onClick={() => setDetails(row)}
                        >
                          View
                          <ArrowRight
                            aria-hidden="true"
                            className="h-3.5 w-3.5"
                          />
                        </Button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
            {filteredRows.length === 0 && (
              <div className="p-10 text-center">
                <Users
                  aria-hidden="true"
                  className="mx-auto mb-3 h-7 w-7 text-muted-foreground"
                />
                <p className="font-medium">
                  {rows.length
                    ? "No matching employees"
                    : "No payslips in this run"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {rows.length
                    ? "Try a different search or show all employees."
                    : "Check the run issues or select another payroll run."}
                </p>
              </div>
            )}
          </section>
        )}
        {payroll && (
          <section className="rounded-2xl border border-edge bg-card p-5">
            <h2 className="font-semibold">Downloads</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Payslips and salary register. Bank files become available after
              finalization.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {payroll && ["finalized", "paid"].includes(payroll.status) && (
                <>
                  <Select
                    aria-label="Bank export format"
                    value={bank}
                    onChange={(event) => setBank(event.target.value)}
                  >
                    <option value="generic">Generic bank file</option>
                    <option value="hdfc">HDFC eNET</option>
                    <option value="icici">ICICI PAB-SAL</option>
                  </Select>
                  <Button
                    variant="outline"
                    loading={busy === "bank"}
                    onClick={exportBank}
                  >
                    <Landmark aria-hidden="true" className="h-4 w-4" />
                    Export bank file
                  </Button>
                </>
              )}
              {payroll &&
                ["draft", "reviewed", "approved", "finalized", "paid"].includes(
                  payroll.status,
                ) && (
                  <>
                    <Button
                      variant="outline"
                      loading={busy === "payslips"}
                      onClick={exportAllPayslips}
                    >
                      <Download aria-hidden="true" className="h-4 w-4" />
                      Export all payslips
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        window.location.href = `/api/payroll/runs/${payroll.id}/register?${new URLSearchParams({ locationId: locationId ?? "" })}`;
                      }}
                    >
                      <Download aria-hidden="true" className="h-4 w-4" />
                      Download Excel register
                    </Button>
                  </>
                )}
            </div>
          </section>
        )}
        <details className="rounded-xl border border-edge bg-card p-4">
          <summary className="cursor-pointer font-medium focus-visible:ring-2 focus-visible:ring-ring">
            Payroll rules used
          </summary>
          <p className="mt-3 text-sm text-muted-foreground">
            {provenance
              ? "The rules recorded with this monthly payroll are available for audit."
              : "The active payroll rules for this location will be recorded when monthly payroll is created."}
          </p>
        </details>
        {(payroll || canManageSettings) && (
          <details className="mt-4 rounded-xl border border-edge bg-card p-4">
            <summary className="cursor-pointer font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Advanced tools
            </summary>
            <div className="mt-4 flex flex-wrap gap-2">
              {canManageSettings && locationId && (
                <>
                  <Button
                    variant="outline"
                    loading={busy === "mess_backdate"}
                    onClick={() => void previewRecovery("mess_backdate")}
                  >
                    Preview Mess plan recovery
                  </Button>
                  <Button
                    variant="outline"
                    loading={busy === "attendance_reprocess"}
                    onClick={() => void previewRecovery("attendance_reprocess")}
                  >
                    Preview IN-only attendance recovery
                  </Button>
                </>
              )}
              {payroll?.status === "draft" && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectionMode("selected");
                    setPickerOpen(true);
                  }}
                >
                  Add employees to draft payroll
                </Button>
              )}
              {payroll && ["reviewed", "approved"].includes(payroll.status) && (
                <Button variant="outline" disabled={Boolean(busy)} onClick={() => setConfirmation("draft")}>Return to draft for corrections</Button>
              )}
              {payroll &&
                ["draft", "reviewed", "approved"].includes(payroll.status) && (
                  <Button
                    variant="outline"
                    loading={busy === "cancelled"}
                    onClick={() => setConfirmation("cancelled")}
                  >
                    Cancel monthly payroll
                  </Button>
                )}
            </div>
          </details>
        )}
      </div>
      <Modal
        open={confirmation !== null}
        onClose={() => {
          if (!busy) setConfirmation(null);
        }}
        title={
          confirmation === "paid"
            ? "Record salary payment"
            : confirmation === "finalized"
              ? "Finalize payroll?"
              : confirmation === "draft" ? "Return payroll to draft?" : "Cancel this payroll?"
        }
        size="sm"
      >
        <form
          key={confirmation}
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!confirmation) return;
            const form = new FormData(event.currentTarget);
            void transition(
              confirmation,
              confirmation === "paid"
                ? {
                    paymentMethod: form.get("paymentMethod"),
                    settlementDate: form.get("settlementDate"),
                    paymentReference: form.get("paymentReference"),
                    confirmedCount: generated,
                    confirmedNet: totals.net,
                  }
                : ["cancelled", "draft"].includes(confirmation ?? "")
                  ? { reason: form.get("reason") }
                  : {},
            );
          }}
        >
          <div className="rounded-xl bg-tint p-4">
            <p className="text-sm font-semibold">
              {locationLabel} · {monthName(month)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {generated} employees · {formatMoney(totals.net)} net payout
            </p>
          </div>
          {confirmation === "paid" ? (
            <>
              <p className="text-sm text-muted-foreground">
                Record a payment you have already made. This does not transfer
                money.
              </p>
              <Field label="Payment method">
                <Select name="paymentMethod" required>
                  <option value="bank">Bank transfer</option>
                  <option value="upi">UPI</option>
                  <option value="cash">Cash</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
              <Field label="Payment date">
                <Input name="settlementDate" type="date" required />
              </Field>
              <Field label="Payment reference or batch ID">
                <Input
                  name="paymentReference"
                  required
                  maxLength={120}
                  placeholder="e.g. SAL-OCT-2026"
                />
              </Field>
              <label className="flex items-start gap-2 text-sm">
                <input className="mt-1" type="checkbox" required />I confirm
                payment for {generated} employees totaling{" "}
                {formatMoney(totals.net)}.
              </label>
            </>
          ) : confirmation === "cancelled" || confirmation === "draft" ? (
            <Field label={confirmation === "draft" ? "Reason for returning to draft" : "Reason for cancellation"}>
              {confirmation === "draft" && <p className="mb-2 text-sm text-muted-foreground">Returning to draft clears review and approval. Correct the inputs, regenerate affected payslips and send the run through review again.</p>}
              <Textarea name="reason" required minLength={3} maxLength={500} />
            </Field>
          ) : (
            <p className="text-sm text-muted-foreground">
              Finalizing locks this salary run. Check the totals before
              continuing.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(busy)}
              onClick={() => setConfirmation(null)}
            >
              Go back
            </Button>
            <Button
              type="submit"
              variant={confirmation === "cancelled" ? "danger" : "primary"}
              loading={Boolean(busy)}
            >
              {confirmation === "paid"
                ? "Confirm payment"
                : confirmation === "finalized"
                  ? "Finalize payroll"
                  : confirmation === "draft" ? "Return to draft" : "Cancel payroll"}
            </Button>
          </div>
        </form>
      </Modal>
      <EmployeeModal
        row={details}
        payrollId={payroll?.id ?? null}
        month={month}
        onClose={() => setDetails(null)}
      />
      {recovery && (
        <Modal
          open
          onClose={() => {
            setRecovery(null);
            setRecoveryPreview(null);
          }}
          title="Confirm payroll recovery"
          description={`${recoveryPreview?.count ?? 0} record(s) will be changed for ${month}. Finalized or paid payroll is never changed.`}
        >
          <p className="text-sm text-muted-foreground">
            This action is limited to the selected location and writes an audit
            entry for every changed record.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setRecovery(null);
                setRecoveryPreview(null);
              }}
            >
              Cancel
            </Button>
            <Button
              loading={busy === recovery}
              disabled={!recoveryPreview?.count}
              onClick={() => void applyRecovery()}
            >
              Confirm {recoveryPreview?.count ?? 0} changes
            </Button>
          </div>
        </Modal>
      )}
      <EmployeePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        locationId={locationId}
        month={month}
        selectedIds={selectedEmployeeIds}
        onChange={setSelectedEmployeeIds}
        onAdd={() => (payroll ? void create(true) : setPickerOpen(false))}
        adding={busy === "create"}
        draft={Boolean(payroll)}
      />
    </main>
  );
}

function Number({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
function EmployeePicker({
  open,
  onClose,
  locationId,
  month,
  selectedIds,
  onChange,
  onAdd,
  adding,
  draft,
}: {
  open: boolean;
  onClose: () => void;
  locationId: string | null;
  month: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onAdd: () => void;
  adding: boolean;
  draft: boolean;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{
    employees: PickerEmployee[];
    pages: number;
    total: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open || !locationId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/payroll/employees?${new URLSearchParams({ locationId, month, page: String(page), search })}`,
          { signal: controller.signal },
        );
        const next = await response.json();
        if (response.ok) setData(next);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, locationId, month, page, search]);
  if (!open) return null;
  const visibleEligible =
    data?.employees.filter((employee) => employee.eligible) ?? [];
  const visibleIds = new Set(visibleEligible.map((employee) => employee.id));
  const allVisibleSelected =
    visibleEligible.length > 0 &&
    visibleEligible.every((employee) => selectedIds.includes(employee.id));
  const toggle = (id: string) =>
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((selected) => selected !== id)
        : [...selectedIds, id],
    );
  const toggleVisible = () =>
    onChange(
      allVisibleSelected
        ? selectedIds.filter((id) => !visibleIds.has(id))
        : [
            ...new Set([
              ...selectedIds,
              ...visibleEligible.map((employee) => employee.id),
            ]),
          ],
    );
  return (
    <Modal
      open
      onClose={onClose}
      title={
        draft
          ? "Add employees to draft payroll"
          : "Select employees for payroll"
      }
      description="Only eligible employees at this location can be added."
      size="xl"
    >
      <label
        className="block text-sm font-medium"
        htmlFor="payroll-employee-search"
      >
        Search employees
      </label>
      <input
        id="payroll-employee-search"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(1);
        }}
        placeholder="Code, name, department, or designation"
        className="mt-1 h-11 w-full rounded-xl border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleVisible}
            disabled={!visibleEligible.length}
          />
          Select all visible eligible
        </label>
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {selectedIds.length} selected
        </span>
        <Button
          type="button"
          variant="ghost"
          onClick={() => onChange([])}
          disabled={!selectedIds.length}
        >
          Clear selection
        </Button>
      </div>
      <div
        className="mt-3 divide-y divide-edge rounded-xl border border-edge"
        aria-busy={loading}
      >
        {data?.employees.map((employee) => (
          <label
            key={employee.id}
            className="flex min-h-14 cursor-pointer items-center gap-3 p-3 hover:bg-muted/40"
          >
            <input
              type="checkbox"
              checked={selectedIds.includes(employee.id)}
              onChange={() => toggle(employee.id)}
              disabled={!employee.eligible}
              aria-label={`Select ${employee.firstName} ${employee.lastName}`}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {employee.firstName} {employee.lastName}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {employee.employeeNumber} ·{" "}
                {employee.department?.name ?? "No department"} ·{" "}
                {employee.position ?? "No designation"}
              </span>
            </span>
            <span
              className={`shrink-0 text-right text-xs ${employee.eligible ? "text-muted-foreground" : "text-destructive"}`}
            >
              <span className="block">
                {employee.salary != null
                  ? formatMoney(employee.salary)
                  : "No salary"}
              </span>
              <span>{employee.eligibility}</span>
            </span>
          </label>
        ))}
        {!loading && data && !data.employees.length && (
          <p className="p-4 text-sm text-muted-foreground">
            No employees match this search.
          </p>
        )}
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setPage(Math.max(1, page - 1))}
          disabled={page === 1}
        >
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {page} of {data?.pages ?? 1}
        </span>
        <Button
          type="button"
          variant="outline"
          onClick={() => setPage(page + 1)}
          disabled={!data || page >= data.pages}
        >
          Next
        </Button>
      </div>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          loading={adding}
          onClick={onAdd}
          disabled={!selectedIds.length}
        >
          {draft ? "Add selected employees" : "Use selected employees"}
        </Button>
      </div>
    </Modal>
  );
}
function ReviewPayroll({
  month,
  locationLabel,
  locationId,
  rows,
  totals,
  blockers,
  issueFor,
  busy,
  status,
  onReady,
  onApprove,
  onOpen,
}: {
  month: string;
  locationLabel: string;
  locationId: string | null;
  rows: Row[];
  totals: { gross: number; deductions: number; net: number };
  blockers: { employeeId: string; message: string }[];
  issueFor: (employeeId: string) => string | undefined;
  busy: string | null;
  status: string;
  onReady: () => void;
  onApprove: () => void;
  onOpen: (row: Row) => void;
}) {
  const router = useRouter();
  const clear = blockers.length === 0;
  return (
    <main className="payroll-canvas animate-fade-up pb-8">
      <header className="sticky top-0 z-20 border-b border-edge bg-background/95 px-5 py-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">
              {locationLabel} · {monthName(month)}
            </p>
            <h1 className="font-display text-2xl font-semibold">
              Review payroll
            </h1>
          </div>
          <Button
            variant="outline"
            onClick={() =>
              router.push(
                `/admin/payroll?${new URLSearchParams({ period: month, ...(locationId ? { location: locationId } : {}) })}`,
              )
            }
          >
            Back to payroll
          </Button>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-5 py-6 sm:px-6">
        <section className="grid divide-y divide-edge overflow-hidden rounded-xl border border-edge bg-card sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Number label="Gross" value={formatMoney(totals.gross)} />
          <Number label="Deductions" value={formatMoney(totals.deductions)} />
          <Number label="Net payout" value={formatMoney(totals.net)} />
        </section>
        <section className="mt-4 overflow-hidden rounded-xl border border-edge bg-card">
          <div className="border-b border-edge p-4">
            <h2 className="font-semibold">Employees</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Check each employee before approval.
            </p>
          </div>
          <div className="divide-y divide-edge">
            {rows.length ? (
              rows.map((row) => {
                const issue = issueFor(row.employee.id);
                return (
                  <div
                    key={row.employee.id}
                    className="flex flex-wrap items-center gap-3 p-4"
                  >
                    <div className="min-w-40 flex-1">
                      <p className="font-medium">{name(row.employee)}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.employee.employeeNumber}
                      </p>
                    </div>
                    <Badge tone={issue ? "warning" : "success"}>
                      {issue ? "Needs attention" : "Ready"}
                    </Badge>
                    <p className="w-full text-sm text-muted-foreground sm:w-auto sm:flex-1">
                      {issue ?? "No action needed."}
                    </p>
                    {issue && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onOpen(row)}
                      >
                        Resolve
                      </Button>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="p-5 text-sm text-muted-foreground">
                No employees were included in this monthly payroll.
              </p>
            )}
          </div>
        </section>
        {!clear && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm"
          >
            Resolve all employee issues before approval.
          </p>
        )}
        {status === "draft" && (
          <Button
            className="mt-5"
            disabled={!clear}
            loading={busy === "reviewed"}
            onClick={onReady}
          >
            Mark ready to approve
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Button>
        )}
        {status === "reviewed" && clear && (
          <Button
            className="mt-5"
            loading={busy === "approved"}
            onClick={onApprove}
          >
            Approve payroll
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Button>
        )}
      </div>
    </main>
  );
}
function EmployeeModal({
  row,
  payrollId,
  month,
  onClose,
}: {
  row: Row | null;
  payrollId: string | null;
  month: string;
  onClose: () => void;
}) {
  if (!row) return null;
  const document = row.payslip?.document;
  const enhanced = document?.totals.earnedGross !== undefined;
  const earnings =
    document?.components.filter(
      (component) => component.category === "earning",
    ) ?? [];
  const deductions =
    document?.components.filter(
      (component) => component.category === "deduction",
    ) ?? [];
  return (
    <Modal
      open
      onClose={onClose}
      title={name(row.employee)}
      description={row.employee.employeeNumber}
      size={enhanced ? "lg" : "md"}
    >
      {!row.payslip && (
        <p className="text-sm text-muted-foreground">
          This employee has no calculation for this month.
        </p>
      )}
      {row.payslip && !enhanced && (
        <div className="grid grid-cols-3 gap-2">
          <Number
            label="Gross"
            value={formatMoney(row.payslip.grossEarnings)}
          />
          <Number
            label="Deductions"
            value={formatMoney(row.payslip.deductions)}
          />
          <Number label="Net" value={formatMoney(row.payslip.netSalary)} />
        </div>
      )}
      {row.payslip && enhanced && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Number
              label="Contractual gross"
              value={formatMoney(document.totals.gross)}
            />
            <Number
              label="Earned gross"
              value={formatMoney(document.totals.earnedGross!)}
            />
            <Number
              label="Deductions (incl. LOP)"
              value={formatMoney(document.totals.deductions)}
            />
            <Number label="Net" value={formatMoney(document.totals.net)} />
          </div>
          <p className="mt-3 text-sm text-muted-foreground" role="note">
            {
              "Net = contractual gross - deductions. Earned gross already reflects LOP and is not reduced again."
            }
          </p>
          {earnings.length ? (
            <div className="mt-4 overflow-x-auto rounded-lg border border-edge">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <caption className="border-b border-edge bg-tint px-3 py-2 text-left font-medium">
                  Earnings
                </caption>
                <thead className="bg-tint text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Component</th>
                    <th className="px-3 py-2 text-right">Contractual</th>
                    <th className="px-3 py-2 text-right">Earned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {earnings.map((component) => (
                    <tr key={component.code}>
                      <td className="px-3 py-2">
                        <span className="font-medium">{component.label}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {component.code}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {component.contractual === null
                          ? "-"
                          : formatMoney(component.contractual)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoney(component.earned)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {deductions.length ? (
            <div className="mt-4 overflow-x-auto rounded-lg border border-edge">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <caption className="border-b border-edge bg-tint px-3 py-2 text-left font-medium">
                  Deductions
                </caption>
                <thead className="bg-tint text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Component</th>
                    <th className="px-3 py-2 text-right">Deduction</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {deductions.map((component) => (
                    <tr key={component.code}>
                      <td className="px-3 py-2">
                        <span className="font-medium">{component.label}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {component.code}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoney(component.earned)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
      {row.payslip && payrollId && (
        <Button
          variant="outline"
          className="mt-4 w-full"
          onClick={() => {
            window.location.href = `/api/payroll/payslips?${new URLSearchParams({ month, employeeIds: row.employee.id, runId: payrollId })}`;
          }}
        >
          <Download aria-hidden="true" className="h-4 w-4" />
          Download payslip
        </Button>
      )}
    </Modal>
  );
}
