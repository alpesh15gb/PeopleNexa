"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { ManualAttendancePanel } from "./manual-attendance-panel";
import { PayrollNavigation } from "@/components/payroll-navigation";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Check,
  Download,
  Landmark,
  Search,
  Users,
  RefreshCw,
} from "lucide-react";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { formatMoney } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { useHydrated } from "@/components/use-hydrated";
import type { PayslipDocumentSnapshot } from "@/lib/payslip-document";
import { payrollGenerationReason, type PayrollGenerationResult } from "@/lib/payroll-generation-results";
import { unreconciledPayAmounts, type PayrollIssue } from "@/lib/payroll-issue";
import { type PayrollReviewScope } from "@/lib/payroll-review-links";
import { ReadinessSummary, payrollEmployeeFixHref, type PayrollReadiness } from "./payroll-readiness";
import { canApprovePayrollRun, payrollScopeHref } from "@/lib/payroll-work-queue";
import {
  PAYROLL_WIZARD_STEPS, ReviewVariance, VariablePay,
  type PayrollAdjustment, type PayrollStatutoryTotals,
  type PayrollVarianceEntry, type PayrollWizardStage,
} from "./payroll-wizard-details";

type Employee = {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  hasBankDetails: boolean;
  hasCurrentBank: boolean;
  hasCurrentPan: boolean;
  missingPan: boolean;
  canEditPaymentRecord: boolean;
  inLocation: boolean;
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
  canRecalculate: boolean;
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
  financialIssues,
  totals,
  generated,
  notIncludedCount,
  canManageSettings,
  payrollSettingsRequired,
  generationUnavailableReason,
  attendanceSource,
  workbookUploadId,
  preparation,
  readiness,
  adjustments,
  adjustableEmployees,
  referenceMonth,
  referencePayslips,
  statutory,
  actorId,
  canRecoverLegacyMess,
  payroll,
}: {
  month: string;
  locationLabel: string;
  locationId: string | null;
  locations: { id: string; name: string }[];
  runs: PayrollRunOption[];
  rows: Row[];
  financialIssues: PayrollIssue[];
  totals: { gross: number; deductions: number; net: number; paid: number };
  generated: number;
  notIncludedCount: number;
  canManageSettings: boolean;
  payrollSettingsRequired: boolean;
  generationUnavailableReason: string | null;
  attendanceSource: "recorded" | "workbook" | null;
  workbookUploadId: string | null;
  preparation: { eligible: number; missingSalary: number } | null;
  readiness: PayrollReadiness;
  adjustments: PayrollAdjustment[];
  adjustableEmployees: string[];
  referenceMonth: string;
  referencePayslips: PayrollVarianceEntry[];
  statutory: PayrollStatutoryTotals;
  actorId: string;
  canRecoverLegacyMess: boolean;
  payroll: Payroll | null;
}) {
  const [search, setSearch] = useState("");
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [confirmation, setConfirmation] = useState<
    "paid" | "cancelled" | "finalized" | "draft" | null
  >(null);
  const router = useRouter();
  const selectedStage = useSearchParams().get("stage");
  const [openingScope, startScopeTransition] = useTransition();
  const [refreshingRun, startRunRefresh] = useTransition();
  const hydrated = useHydrated();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const pendingStage = useRef<{ id: string; status: string; stage: PayrollWizardStage } | null>(null);
  const [detailsEmployeeId, setDetailsEmployeeId] = useState<string | null>(null);
  const details = rows.find((row) => row.employee.id === detailsEmployeeId) ?? null;
  const canGenerate = Boolean(locationId && !payrollSettingsRequired && !generationUnavailableReason);
  const [sourceChoice, setSourceChoice] = useState<"recorded" | "workbook">("recorded");
  const isWorkbookSource = attendanceSource === "workbook" || (!payroll && sourceChoice === "workbook");
  const canGenerateRecorded = canGenerate && !isWorkbookSource && Boolean(payroll || preparation?.eligible !== 0);
  const canAddEmployees = canGenerateRecorded && payroll?.status === "draft";
  const waitingForApproval = payroll?.status === "reviewed" && !canApprovePayrollRun(payroll.createdBy, actorId);
  const [bank, setBank] = useState("generic");
  const [selectionMode, setSelectionMode] = useState<
    "all_eligible" | "selected"
  >("all_eligible");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sourceIssues, setSourceIssues] = useState<PayrollIssue[]>([]);
  const [inputsChecked, setInputsChecked] = useState(false);
  const [confirmationError, setConfirmationError] = useState("");
  const [transitionError, setTransitionError] = useState("");
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
    setSourceChoice("recorded");
    setPickerOpen(false);
    setSourceIssues([]);
    setInputsChecked(false);
    setGenerationIssues([]);
    setDetailsEmployeeId(null);
    setConfirmation(null);
    setSearch("");
    setOnlyIssues(false);
  }, [month, locationId]);
  useEffect(() => {
    setSourceIssues([]);
    setInputsChecked(false);
    setTransitionError("");
  }, [payroll?.id, payroll?.status]);
  useEffect(() => setConfirmationError(""), [confirmation]);
  const amountIssues: PayrollIssue[] = rows.filter(({ payslip }) => payslip && unreconciledPayAmounts(payslip)).map(({ employee }) => ({
    code: "pay-totals", employeeId: employee.id, message: "Gross pay, deductions, and net pay need to reconcile before approval.",
  }));
  const approvalIssues = Array.from(new Map([
    ...amountIssues, ...financialIssues, ...sourceIssues.filter(({ code }) => ["pay-totals", "policy-snapshot", "payslip-snapshot"].includes(code)),
  ].map(issue => [`${issue.code}:${issue.employeeId}:${issue.message}`, issue])).values());
  const sourceBlockers = sourceIssues.filter(issue => !["pay-totals", "policy-snapshot", "payslip-snapshot"].includes(issue.code));
  const payoutWarnings = rows.filter(({ payslip, employee }) => payslip && !employee.hasBankDetails);
  const taxWarnings = rows.filter(({ payslip, employee }) => payslip && employee.missingPan);
  const excludedMembers = (payroll?.members ?? []).filter(member => member.exception && !rows.some(row => row.employee.id === member.employee.id));
  const issueEmployeeIds = new Set([
    ...approvalIssues.flatMap(({ employeeId }) => employeeId ? [employeeId] : []),
    ...sourceIssues.flatMap(({ employeeId }) => employeeId ? [employeeId] : []),
    ...[...payoutWarnings, ...taxWarnings].map(({ employee }) => employee.id),
  ]);
  const issueFor = (employeeId: string) => issueEmployeeIds.has(employeeId);
  const changeScope = (nextMonth = month, nextLocation = locationId) => {
    const query = new URLSearchParams({ period: nextMonth });
    if (nextLocation) query.set("location", nextLocation);
    startScopeTransition(() => router.push(`/admin/payroll?${query}`));
  };
  async function create(addToDraft = false) {
    if (!canGenerateRecorded || stageBusy) return;
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
        startRunRefresh(() => router.refresh());
        return;
      }
      const counts = `${data.created} created${data.skipped ? `, ${data.skipped} skipped` : ""}${data.totals?.failed ? `, ${data.totals.failed} failed` : ""}`;
      toast(
        data.totals?.failed ? "info" : "success",
        addToDraft
          ? `Employees added: ${counts}.`
          : `Payroll ready for review: ${counts}.`,
      );
      startScopeTransition(() => router.push(
        `/admin/payroll?${new URLSearchParams({ period: month, location: locationId ?? "", run: data.runId })}`,
      ));
    } catch {
      toast("error", "Could not confirm payroll generation. Refresh and check the run before retrying.");
    } finally {
      setBusy(null);
    }
  }
  async function recalculateDraft(payslipId: string) {
    setBusy("recalculate");
    try {
      const response = await fetch(`/api/payroll/${encodeURIComponent(payslipId)}/regenerate`, { method: "POST" });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error ?? "Could not recalculate this payslip.");
      }
      toast("success", "Draft payslip recalculated.");
      setSourceIssues([]);
      setInputsChecked(false);
      startRunRefresh(() => router.refresh());
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Could not recalculate this payslip.");
    } finally {
      setBusy(null);
    }
  }
  async function checkPayrollInputs() {
    if (!payroll || !locationId || stageBusy) return;
    setBusy("check-inputs");
    setInputsChecked(false);
    try {
      const response = await fetch(`/api/payroll/runs/${encodeURIComponent(payroll.id)}/preflight?${new URLSearchParams({ locationId })}`, { cache: "no-store" });
      const result = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(result?.issues)) throw new Error(result?.error ?? "Could not check payroll inputs.");
      setSourceIssues(Array.isArray(result.details) ? result.details : result.issues.map((message: string) => ({ code: "source-invalid", message })));
      setInputsChecked(true);
      startRunRefresh(() => router.refresh());
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Could not check payroll inputs.");
    } finally {
      setBusy(null);
    }
  }
  async function transition(
    status: string,
    evidence: Record<string, unknown> = {},
  ) {
    if (!payroll || stageBusy) return;
    setBusy(status);
    setConfirmationError("");
    setTransitionError("");
    setInputsChecked(false);
    try {
      const response = await fetch(`/api/payroll/runs/${payroll.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, locationId, ...evidence }),
      });
      const data = await response.json();
      if (!response.ok) {
        const error = data.error ?? "Could not update monthly payroll.";
        const detailed = Array.isArray(data.preflightDetails) ? data.preflightDetails as PayrollIssue[] : null;
        if (!detailed && !Array.isArray(data.preflight)) {
          if (confirmation === status) setConfirmationError(error);
          else setTransitionError(error);
          return;
        }
        if (confirmation === status) setConfirmation(null);
        setInputsChecked(Boolean(detailed || Array.isArray(data.preflight)));
        setSourceIssues(detailed ?? (Array.isArray(data.preflight) ? data.preflight : [error]).map((message: string) => ({ code: "source-invalid", message })));
        return toast("error", "Payroll needs attention. Review the issues shown on this page.");
      }
      setSourceIssues([]);
      setConfirmation(null);
      const nextStage = status === "reviewed" ? "review" : ["approved", "finalized", "paid", "cancelled"].includes(status) ? "payment" : status === "draft" ? "adjustments" : null;
      if (nextStage) pendingStage.current = { id: payroll.id, status, stage: nextStage };
      toast("success", "Monthly payroll updated.");
      startRunRefresh(() => router.refresh());
    } catch {
      const message = "Could not confirm the update. Refresh to check the run before retrying.";
      if (confirmation === status) setConfirmationError(message);
      else toast("error", message);
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
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        return toast("error", result?.error ?? "Could not export this bank file.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `salary-${month}.csv`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast("error", "Could not download this bank file. Try again.");
    } finally {
      setBusy(null);
    }
  }
  function exportAllPayslips() {
    if (!payroll) return;
    setBusy("payslips");
    const link = document.createElement("a");
    link.href = `/api/payroll/payslips?${new URLSearchParams({ month, runId: payroll.id, locationId: locationId ?? "" })}`;
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
      startRunRefresh(() => router.refresh());
    } finally {
      setBusy(null);
    }
  }
  const missingTerminalPayslips = Boolean(
    payroll &&
    ["finalized", "paid"].includes(payroll.status) &&
    generated === 0,
  );
  const emptyRun = Boolean(payroll && generated === 0);
  const needsPayslips = emptyRun && ["draft", "reviewed", "approved"].includes(payroll?.status ?? "");
  const activeRun = payroll && ["draft", "reviewed", "approved"].includes(payroll.status);
  const pendingLeaveBlocksRun = Boolean(activeRun && readiness.pendingLeaves > 0);
  const inputsNeedCorrection = pendingLeaveBlocksRun || sourceBlockers.length > 0;
  const state = !locationId
    ? "Choose a payroll location"
    : !payroll
      ? (generationUnavailableReason ? "Payroll generation unavailable" : payrollSettingsRequired ? "Set up payroll for this location" : isWorkbookSource ? "Prepare attendance workbook" : "Prepare draft payroll")
      : missingTerminalPayslips
        ? "Payroll record needs attention"
        : payroll.status === "cancelled"
          ? "Cancelled"
          : payroll.status === "reversed"
            ? "Reversed"
            : approvalIssues.length
              ? "Needs attention"
              : payroll.status === "draft"
                ? "Draft ready for review"
                : payroll.status === "reviewed"
                  ? (waitingForApproval ? "Awaiting independent approval" : "Ready to approve")
                  : payroll.status === "approved"
                    ? "Ready to finalize"
                    : payroll.status === "finalized"
                      ? "Ready to record payment"
                      : "Paid";
  const nextTransition = !locationId || emptyRun
    ? null
    : !payroll
      ? (canGenerateRecorded ? { label: "Create draft payroll", onClick: () => create(), busy: "create" } : null)
      : payroll.status === "draft"
        ? {
            label: "Complete review",
            onClick: () => transition("reviewed"),
            busy: "reviewed",
          }
        : payroll.status === "reviewed" && !waitingForApproval
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
  const issueCount = issueEmployeeIds.size;
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
  const runStatus = payroll?.status;
  const maximumStep = !payroll || (needsPayslips && runStatus === "draft") ? 0 : ["draft", "reviewed"].includes(runStatus ?? "") ? 2 : 3;
  const defaultStep = maximumStep === 0 ? 0 : runStatus === "draft" ? 1 : runStatus === "reviewed" ? 2 : 3;
  const requestedStep = PAYROLL_WIZARD_STEPS.findIndex(({ id }) => id === selectedStage);
  const currentStep = requestedStep >= 0 && requestedStep <= maximumStep ? requestedStep : defaultStep;
  const stage = PAYROLL_WIZARD_STEPS[currentStep];
  const stageBusy = !hydrated || Boolean(busy) || adjusting || openingScope || refreshingRun;
  function openScope(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (stageBusy) return;
    const form = new FormData(event.currentTarget);
    const period = String(form.get("period") || month);
    const selectedLocation = canManageSettings ? String(form.get("location") || "") || null : locationId;
    changeScope(period, selectedLocation);
  }
  function setStage(next: PayrollWizardStage, replace = false, focus = true) {
    const query = new URLSearchParams({ period: month });
    if (locationId) query.set("location", locationId);
    if (payroll) query.set("run", payroll.id);
    query.set("stage", next);
    const url = `/admin/payroll?${query}`;
    if (replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
    if (focus) requestAnimationFrame(() => document.getElementById("payroll-stage")?.focus());
  }
  useEffect(() => {
    const next = pendingStage.current;
    if (!next || refreshingRun) return;
    pendingStage.current = null;
    if (payroll?.id === next.id && runStatus === next.status) setStage(next.stage, true, false);
  }, [payroll?.id, runStatus, refreshingRun]);
  const action = nextTransition && (
    (stage.id === "inputs" && nextTransition.busy === "create") ||
    (stage.id === "review" && ["reviewed", "approved"].includes(nextTransition.busy)) ||
    (stage.id === "payment" && ["finalized", "paid"].includes(nextTransition.busy))
  ) ? nextTransition : null;
  const blockedBySource = Boolean(action && inputsNeedCorrection && ["reviewed", "approved", "finalized"].includes(action.busy));
  const blockedByPay = Boolean(action && approvalIssues.length && ["approved", "finalized", "paid"].includes(action.busy));
  const blockedAction = blockedBySource || blockedByPay;
  const bankFileBlocked = payoutWarnings.some(({ employee, payslip }) => employee.inLocation && payslip?.status === runStatus);
  const remediationScope: PayrollReviewScope | null = locationId ? { locationId, period: month, runId: payroll?.id, stage: stage.id } : null;
  const readOnlyRun = !activeRun;
  const canReturnToDraft = runStatus === "reviewed" || runStatus === "approved";
  const activeStatus = needsPayslips ? (runStatus === "draft" ? "Add employees to this draft" : "This run has no payslips")
    : inputsNeedCorrection ? "Resolve payroll inputs" : state;
  const actualProgress = runStatus === "paid" ? 4 : runStatus === "finalized" || runStatus === "approved" ? 3
    : runStatus === "reviewed" ? 2 : runStatus === "draft" && !needsPayslips ? 1 : 0;
  const nextStage = currentStep < maximumStep ? PAYROLL_WIZARD_STEPS[currentStep + 1] : null;
  const showReviewExports = Boolean(payroll && ["draft", "reviewed", "approved"].includes(payroll.status) && generated > 0);
  const adjustable = new Set(adjustableEmployees);
  const payees = rows.flatMap(({ employee, payslip }) => payslip ? [{
    employeeId: employee.id, employeeNumber: employee.employeeNumber, name: name(employee), netSalary: payslip.netSalary,
    payslipId: payslip.id, editable: adjustable.has(employee.id), recorded: payslip.adjustments ?? [],
  }] : []);
  return (
    <div className="payroll-workspace mx-auto max-w-6xl space-y-5 pb-6" aria-busy={openingScope}>
        <PageHeader title="Monthly payroll" />
        <PayrollNavigation active="payroll" canManageSettings={canManageSettings} locationId={locationId} period={month} />
        <section aria-label="Payroll period" className="rounded-xl border border-edge bg-card p-4">
          <form key={`${month}:${locationId}`} action="/admin/payroll" onSubmit={openScope} className="flex flex-wrap items-end gap-3">
            {canManageSettings ? (
              <Field label="Location" className="min-w-36 flex-1">
                <Select name="location" defaultValue={locationId ?? ""} required disabled={stageBusy}>
                  <option value="" disabled>Select location</option>
                  {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                </Select>
              </Field>
            ) : (
              <div className="min-w-36 flex-1">
                <p className="text-sm font-medium">Location</p>
                <p className="mt-1 flex min-h-11 items-center break-words text-sm">{locationLabel}</p>
              </div>
            )}
            <Field label="Pay month" className="min-w-36 flex-1">
              <Input type="month" name="period" defaultValue={month} required disabled={stageBusy} />
            </Field>
            <Button type="submit" variant={locationId ? "outline" : "primary"} loading={openingScope} disabled={stageBusy || (canManageSettings && !locations.length)}>Open payroll</Button>
          </form>
          {canManageSettings && !locations.length && <p className="mt-3 text-sm text-muted-foreground">
            <a className="font-medium text-primary underline" href="/admin/locations">Create or activate a location</a> to begin payroll.
          </p>}
          {canManageSettings && locations.length > 0 && !locationId && <p className="mt-3 text-sm text-muted-foreground">Choose an active location and pay month to open payroll.</p>}
          {locationId && runs.length > 1 && payroll && (
            <Field label="Payroll run" className="mt-3 max-w-sm border-t border-edge pt-3">
              <Select value={payroll.id} disabled={stageBusy} onChange={(event) => {
                const href = payrollScopeHref("/admin/payroll", { period: month, locationId, runId: event.target.value });
                startScopeTransition(() => router.push(href));
              }}>
                {runs.map((run) => (
                  <option key={run.id} value={run.id}>{run.status} · {run.payslipCount} {run.payslipCount === 1 ? "payslip" : "payslips"}</option>
                ))}
              </Select>
            </Field>
          )}
        </section>
        {locationId && <>
        <nav aria-label="Payroll wizard stages">
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PAYROLL_WIZARD_STEPS.map((item, index) => {
              const current = currentStep === index;
              const complete = index < actualProgress;
              return (
                <li key={item.id}>
                  <button type="button" aria-current={current ? "step" : undefined}
                    disabled={stageBusy || index > maximumStep} onClick={() => setStage(item.id)}
                    className={`flex min-h-12 w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring ${current ? "border-primary/40 bg-primary/10 text-primary" : "border-edge bg-card hover:bg-tint disabled:bg-tint disabled:text-muted-foreground"}`}>
                    <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-tint text-xs">
                      {complete ? <Check className="size-3.5 text-success" /> : index + 1}
                    </span>
                    <span>{item.title}{complete && <span className="sr-only"> completed</span>}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
        <section className="rounded-xl border border-edge bg-card p-4 sm:p-5" aria-labelledby="payroll-stage">
          <div className="max-w-2xl">
              <p className="text-xs font-medium text-muted-foreground">Step {currentStep + 1} of 4 · {locationLabel} · {monthName(month)}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <h2 id="payroll-stage" tabIndex={-1} className="scroll-mt-24 font-display text-xl font-semibold outline-none">{stage.title}</h2>
                {payroll && <Badge tone={runStatus === "paid" ? "success" : "neutral"} className="capitalize">{runStatus}</Badge>}
              </div>
              <p className="mt-1 text-sm font-medium">{activeStatus}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {emptyRun && payroll?.status === "draft" && !isWorkbookSource
                    ? "Choose employees to generate payslips before submitting this draft for review."
                  : needsPayslips && payroll?.status !== "draft"
                    ? "Return this run to draft to prepare employee payslips."
                  : inputsNeedCorrection
                    ? "Review the input check below. After correcting the listed items, check payroll inputs again."
                  : missingTerminalPayslips
                    ? "This finalized payroll has no linked payslips. Contact an administrator to resolve the record."
                    : inputsNeedCorrection || approvalIssues.length
                      ? "See which items to resolve before continuing."
                      : !payroll
                        ? (generationUnavailableReason ?? (payrollSettingsRequired
                          ? "An administrator needs to publish payroll settings for this location and month."
                          : isWorkbookSource ? "Review the worksheet below, then generate a draft from the reviewed upload."
                            : preparation?.eligible === 0 ? "Add a salary for at least one employee in this location and month before creating a draft."
                              : "Confirm the attendance source and employees before creating a draft."))
                        : stage.id === "inputs" && payroll.status === "draft"
                          ? "This draft records its attendance source, leave, overtime and payroll rules. Check inputs before continuing."
                          : stage.id === "adjustments" && payroll.status === "draft"
                          ? "Save variable pay and check the recalculated net pay before you review."
                          : payroll.status === "draft"
                          ? "Review net pay changes and employee payslips before sending this run for independent approval."
                          : payroll.status === "reviewed"
                            ? waitingForApproval ? "A different authorized reviewer must approve this run." : "Review is complete. Approve the totals when you are ready."
                            : payroll.status === "approved"
                              ? "Finalize to lock salaries and prepare the bank file."
                              : payroll.status === "finalized"
                                ? "Download the bank file, pay your employees, then record the payment details."
                                : payroll.status === "paid"
                                  ? "Payment is recorded. Payslips and the salary register are ready to download."
                                  : "This historical run is closed."}
              </p>
          </div>
        {stage.id === "inputs" && canGenerate && !payroll && (
          <fieldset className="mt-4 rounded-xl border border-edge bg-card p-4">
            <legend className="px-2 font-semibold">Attendance source</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-edge p-4">
                <input className="mt-1" type="radio" name="attendance-source" checked={!isWorkbookSource} disabled={Boolean(busy)} onChange={() => setSourceChoice("recorded")} />
                <span><strong className="block text-sm">Recorded attendance</strong><span className="mt-1 block text-sm text-muted-foreground">Use attendance and approved leave in PeopleNexa.</span></span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-edge p-4">
                <input className="mt-1" type="radio" name="attendance-source" checked={isWorkbookSource} disabled={Boolean(busy)} onChange={() => setSourceChoice("workbook")} />
                <span><strong className="block text-sm">Attendance workbook</strong><span className="mt-1 block text-sm text-muted-foreground">Upload daily attendance marks and review the worksheet before calculation.</span></span>
              </label>
            </div>
            {preparation && !isWorkbookSource && (
              <p className="mt-3 text-sm text-muted-foreground">
                {preparation.eligible} {preparation.eligible === 1 ? "employee has" : "employees have"} a recorded salary for this month.
                {preparation.missingSalary > 0 && <> {preparation.missingSalary} will be left out until a starting salary is set. <a className="font-medium text-primary underline" href={`/admin/payroll?${new URLSearchParams({ location: locationId ?? "", period: month, stage: "inputs", view: "missing-salaries" })}`}>View employees missing a salary</a></>}
              </p>
            )}
          </fieldset>
        )}
          {stage.id === "inputs" && !payroll && canGenerateRecorded && (
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
          {payroll && stage.id !== "inputs" && (
            <section aria-label="Payroll summary" className="mt-4 rounded-xl border border-edge bg-card px-4 py-3">
              <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                {[
                  ["Employees in this run", generated],
                  ["Gross pay", formatMoney(totals.gross)],
                  ["Deductions", formatMoney(totals.deductions)],
                  [["approved", "finalized", "paid"].includes(payroll.status) ? "Approved net payout" : "Estimated net payout", formatMoney(totals.net)],
                ].map(([label, value]) => <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-1 font-semibold tabular-nums">{value}</dd>
                </div>)}
              </dl>
              {notIncludedCount > 0 && <p className="mt-3 text-xs text-muted-foreground">{notIncludedCount} active employees outside this run</p>}
              {issueCount > 0 && stage.id !== "adjustments" && <a href="#payroll-issues" className="mt-2 inline-block text-sm text-primary underline">Review issues for {issueCount} {issueCount === 1 ? "employee" : "employees"}</a>}
            </section>
          )}
          {stage.id === "inputs" && preparation && !isWorkbookSource && selectionMode === "selected" && <p className="mt-3 text-sm text-muted-foreground">Payroll checks will use the employees included in the draft.</p>}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {stage.id === "inputs" && emptyRun && canAddEmployees && <Button onClick={() => { setSelectionMode("selected"); setPickerOpen(true); }}>Choose employees for draft</Button>}
            {stage.id === "inputs" && needsPayslips && payroll?.status !== "draft" && <Button disabled={Boolean(busy)} onClick={() => setConfirmation("draft")}>Return to draft for corrections</Button>}
            {action?.busy === "create" && (
              <Button disabled={stageBusy || (selectionMode === "selected" && !selectedEmployeeIds.length)} loading={busy === "create"} onClick={action.onClick}>
                {action.label}<ArrowRight aria-hidden="true" className="size-4" />
              </Button>
            )}
            {stage.id === "inputs" && payroll && ["draft", "reviewed", "approved"].includes(payroll.status) && (
              <Button variant="outline" loading={busy === "check-inputs"} disabled={stageBusy} onClick={() => void checkPayrollInputs()}>
                Check payroll inputs
              </Button>
            )}
            {stage.id === "payment" && payroll && ["cancelled", "reversed"].includes(payroll.status) && (
              <Button variant="outline" onClick={() => changeScope()}>
                Return to monthly payroll
              </Button>
            )}
            {stage.id === "inputs" && !payroll && payrollSettingsRequired && !generationUnavailableReason && canManageSettings && locationId && (
              <Button onClick={() => router.push(`/admin/payroll/configuration?${new URLSearchParams({ location: locationId, period: month })}`)}>
                Review payroll settings
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Button>
            )}
          </div>
          {stage.id === "review" && payroll?.status === "reviewed" && (
            <p className="mt-4 text-sm text-muted-foreground">
              Approval requires a different authorized reviewer from the person who created this payroll.
              {waitingForApproval && <a className="ml-2 font-medium text-primary underline" href={payrollScopeHref("/admin/payroll/queue", { locationId, period: month, stage: "reviewed" })}>Open approval queue</a>}
            </p>
          )}
        </section>
        {stage.id === "inputs" && attendanceSource && payroll && (
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-edge bg-card p-4 text-sm">
            <div>
              <p className="font-semibold">{attendanceSource === "workbook" ? "Reviewed workbook" : "Recorded attendance"}</p>
              <p className="mt-1 text-muted-foreground">{payroll.status === "draft" ? "The draft uses this source for every payslip." : "Attendance source recorded for this run."}</p>
            </div>
        {payroll.status === "draft" && canGenerate && <Button variant="ghost" size="sm" disabled={Boolean(busy)} onClick={() => setConfirmation("cancelled")}>Change source by cancelling draft</Button>}
          </div>
        )}
        {remediationScope && ((stage.id === "inputs" && preparation && !isWorkbookSource && selectionMode !== "selected") || activeRun) &&
          <ReadinessSummary scope={remediationScope} readiness={readiness}>
            {pendingLeaveBlocksRun && <Button variant="outline" loading={busy === "check-inputs"} disabled={stageBusy} onClick={() => void checkPayrollInputs()}>Refresh payroll checks</Button>}
          </ReadinessSummary>}
        {sourceBlockers.length > 0 && (
          <section id="payroll-input-issues" role="region" aria-label="Payroll input blockers" className="scroll-mt-24 rounded-xl border border-destructive/30 bg-card p-4 sm:p-5">
            <h2 className="font-semibold">Resolve before continuing</h2>
            <ul className="mt-3 divide-y divide-edge">
              {sourceBlockers.map((issue, index) => {
                const row = rows.find(({ employee }) => employee.id === issue.employeeId);
                return <li key={`${issue.code}:${issue.employeeId ?? index}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-42 flex-1"><Badge tone="danger">Blocks review</Badge><p className="mt-1 break-words">{issue.message}</p>{row && <p className="text-xs text-muted-foreground">{row.employee.employeeNumber}</p>}</div>
                  {issue.code === "pending-leave" && readiness.pendingLeaves > 0 && <a href="#payroll-cohort-checks" className="text-sm font-medium text-primary underline">Open pending leave list</a>}
                  {(issue.code === "workbook-members" || issue.code === "no-payslips") && stage.id !== "inputs" && <Button size="sm" variant="outline" onClick={() => setStage("inputs")}>Open payroll inputs</Button>}
                  {issue.code === "mixed-source" && runStatus === "draft" && <Button size="sm" variant="outline" disabled={stageBusy} onClick={() => setConfirmation("cancelled")}>Cancel draft to change source</Button>}
                  {row?.payslip?.canRecalculate && <Button size="sm" variant="outline" disabled={stageBusy} onClick={() => setDetailsEmployeeId(row.employee.id)}>Open payslip <span className="sr-only">{name(row.employee)}</span></Button>}
                  {row && !row.payslip?.canRecalculate && !canReturnToDraft && <span className="text-xs text-muted-foreground">Ask a payroll administrator to check this draft</span>}
                </li>;
              })}
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {canReturnToDraft && sourceBlockers.some(({ code }) => code !== "pending-leave") && <Button variant="outline" disabled={stageBusy} onClick={() => setConfirmation("draft")}>Return to draft for corrections</Button>}
              <Button variant="outline" loading={busy === "check-inputs"} disabled={stageBusy} onClick={() => void checkPayrollInputs()}>Recheck payroll inputs</Button>
            </div>
          </section>
        )}
        {inputsChecked && sourceIssues.length === 0 && !pendingLeaveBlocksRun && <p role="status" className="rounded-xl border border-edge bg-card p-4 text-sm">The payroll check found no source or approval blockers for these payslips.</p>}
        {generationUnavailableReason && payroll?.status === "draft" && <p className="text-sm text-muted-foreground">{generationUnavailableReason}</p>}
        {stage.id === "inputs" && locationId && isWorkbookSource && (payroll || canGenerate) && <ManualAttendancePanel key={`${locationId}:${month}:${payroll?.id ?? "new"}`} month={month} locationId={locationId} runId={payroll?.id} runUploadId={workbookUploadId} includedEmployeeIds={rows.filter(row => row.payslip).map(row => row.employee.id)} editable={!payroll || payroll.status === "draft"} canGenerate={canGenerate} />}
        {generationIssues.length > 0 && (
          <section role="alert" aria-label="Payroll generation issues" className="rounded-2xl border border-warning/30 bg-card p-4 sm:p-5">
            <h2 className="font-semibold text-foreground">Some employees have no new payslip</h2>
            <p className="mt-1 text-sm text-muted-foreground">Resolve these reasons before retrying the affected employees. Payslips that were created remain in the draft.</p>
            <div className="mt-4 overflow-x-auto">
              <Table>
                <THead><TR><TH>Employee</TH><TH>Result</TH><TH>Reason</TH><TH>Next step</TH></TR></THead>
                <TBody>{generationIssues.map((result) => (
                  <TR key={result.employeeId}>
                    <TD>{result.employeeName}</TD>
                    <TD><Badge tone={result.error ? "danger" : "warning"}>{result.error ? "Failed" : "Skipped"}</Badge></TD>
                    <TD className="min-w-48 whitespace-normal break-words">{payrollGenerationReason(result)}</TD>
                    <TD className="min-w-40 whitespace-normal break-words">
                      {result.skipped === "missing-salary" ? canManageSettings && remediationScope
                        ? <a href={payrollEmployeeFixHref(remediationScope, result.employeeId, "salary")} className="font-medium text-primary underline">Set starting salary</a>
                        : "Ask a payroll administrator"
                        : result.skipped === "not-joined" && remediationScope
                          ? <a href={payrollEmployeeFixHref(remediationScope, result.employeeId, "joining")} className="font-medium text-primary underline">Check joining date</a>
                          : result.skipped === "already-included" && rows.some(({ employee }) => employee.id === result.employeeId)
                            ? <Button size="sm" variant="outline" onClick={() => setDetailsEmployeeId(result.employeeId)}>Open payslip</Button>
                            : "Review the employee’s payroll inputs before retrying"}
                    </TD>
                  </TR>
                ))}</TBody>
              </Table>
            </div>
          </section>
        )}
        {(approvalIssues.length > 0 || payoutWarnings.length > 0 || taxWarnings.length > 0 || excludedMembers.length > 0) && (
          <section id="payroll-issues" aria-label="Payroll issues" className="scroll-mt-24 rounded-xl border border-edge bg-card p-4 sm:p-5">
            <h2 className="font-semibold">Issues by employee</h2>
            <ul className="mt-3 divide-y divide-edge">
              {approvalIssues.map((issue, index) => {
                const row = rows.find(({ employee }) => employee.id === issue.employeeId);
                return <li key={`${issue.employeeId ?? "run"}:${issue.code}:${index}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-42 flex-1">
                    {row && <p className="font-semibold">{name(row.employee)} <span className="text-xs font-normal text-muted-foreground">{row.employee.employeeNumber}</span></p>}
                    <p><Badge tone="danger">{readOnlyRun ? "Saved payroll issue" : "Blocks approval"}</Badge> {issue.message}</p>
                  </div>
                  {issue.code === "pay-totals" && row?.payslip?.canRecalculate && <Button size="sm" variant="outline" disabled={stageBusy} onClick={() => setDetailsEmployeeId(row.employee.id)}>Open payslip <span className="sr-only">{name(row.employee)}</span></Button>}
                  {runStatus === "draft" && (issue.code === "payslip-snapshot" || issue.code === "policy-snapshot") &&
                    <Button size="sm" variant="outline" disabled={stageBusy} onClick={() => setConfirmation("cancelled")}>Recreate draft</Button>}
                  {readOnlyRun && <span className="text-xs text-muted-foreground">Ask a payroll administrator to review the locked record</span>}
                </li>;
              })}
              {excludedMembers.map(({ id, exception, employee }) => <li key={id} className="py-2 text-sm">
                <p className="font-semibold">{name(employee)} <span className="text-xs font-normal text-muted-foreground">{employee.employeeNumber}</span></p>
                <p><Badge tone="warning">Excluded from this run</Badge> {exception}</p>
              </li>)}
              {[...payoutWarnings.map(row => ({ ...row, field: "bank" as const })), ...taxWarnings.map(row => ({ ...row, field: "pan" as const }))].map(({ employee, payslip, field }) => {
                const bankIssue = field === "bank";
                const currentDetails = bankIssue ? employee.hasCurrentBank : employee.hasCurrentPan;
                return <li key={`${employee.id}:${field}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-42 flex-1">
                    <p className="font-semibold">{name(employee)} <span className="text-xs font-normal text-muted-foreground">{employee.employeeNumber}</span></p>
                    <p><Badge tone="warning">{bankIssue ? "Bank export only" : "Review item"}</Badge> {bankIssue ? "Missing bank details in the saved payslip." : "Missing PAN in the saved payslip with TDS enabled."}</p>
                    {readOnlyRun && bankIssue && <p className="text-xs text-muted-foreground">The finalized snapshot is locked. If payment has been completed separately, record the actual settlement.</p>}
                  </div>
                  {runStatus === "draft" && currentDetails && payslip && <div className="flex max-w-56 flex-col items-start">
                    <span className="text-xs text-muted-foreground">The employee record is ready. A new draft will capture it.</span>
                    <Button className="mt-1" variant="outline" size="sm" disabled={stageBusy} onClick={() => setConfirmation("cancelled")}>
                      Recreate draft <span className="sr-only">to include {name(employee)}’s saved {bankIssue ? "bank details" : "PAN"}</span>
                    </Button>
                  </div>}
                  {!readOnlyRun && !currentDetails && employee.canEditPaymentRecord && remediationScope && <a href={payrollEmployeeFixHref(remediationScope, employee.id, field)}
                    className="inline-flex min-h-10 items-center text-sm font-medium text-primary underline">{bankIssue ? "Edit employee bank details" : "Edit employee PAN"} <span className="sr-only">{name(employee)}</span></a>}
                  {!readOnlyRun && !currentDetails && !employee.canEditPaymentRecord && <span className="text-xs text-muted-foreground">Ask a payroll administrator</span>}
                </li>;
              })}
            </ul>
            {canReturnToDraft && (approvalIssues.length > 0 || payoutWarnings.length > 0 || taxWarnings.length > 0) &&
              <Button className="mt-3" variant="outline" disabled={stageBusy} onClick={() => setConfirmation("draft")}>Return to draft for corrections</Button>}
          </section>
        )}
        {stage.id === "adjustments" && payroll && (
          <VariablePay key={payroll.id} month={month} payees={payees} adjustments={adjustments}
            onRefresh={() => { setInputsChecked(false); setSourceIssues([]); startRunRefresh(() => router.refresh()); }} onBusyChange={setAdjusting} />
        )}
        {stage.id === "review" && payroll && (
          <ReviewVariance key={payroll.id} referenceMonth={referenceMonth} previous={referencePayslips} current={payees} statutory={statutory} />
        )}
        {stage.id === "review" && payroll && (
          <section id="payroll-employee-review" className="scroll-mt-24 overflow-hidden rounded-2xl border border-edge bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge p-5">
              <div>
                <h2 className="font-semibold">Employee review</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Only employees in this monthly payroll run are shown. Open a
                  payslip for the full breakdown.
                </p>
              </div>
              {canAddEmployees && !emptyRun && (
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
                    onClick={() => setDetailsEmployeeId(row.employee.id)}
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
                          onClick={() => setDetailsEmployeeId(row.employee.id)}
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
        {stage.id === "payment" && payroll && !["cancelled", "reversed"].includes(payroll.status) && (
          <section className="rounded-xl border border-edge bg-card p-4 sm:p-5">
            <h2 className="font-semibold">Payment files and payslips</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {runStatus === "approved" ? "Finalizing publishes payslips and unlocks the bank file."
                : runStatus === "finalized" ? "Payslips are published. Complete settlement outside PeopleNexa and record the payment here once it settles."
                  : runStatus === "paid" ? "Payment has been recorded. Payslips and available files can be downloaded for your records."
                    : "Cancelled and reversed runs are closed."}
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
                    disabled={bankFileBlocked}
                    aria-describedby={bankFileBlocked ? "payroll-bank-unavailable" : undefined}
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
            {bankFileBlocked && <p id="payroll-bank-unavailable" className="mt-2 text-sm text-muted-foreground">The bank file needs complete <a href="#payroll-issues" className="font-medium text-primary underline">saved bank details</a>. The payment can still be recorded after external settlement.</p>}
          </section>
        )}
        {stage.id === "review" && payroll && showReviewExports && (
          <details className="rounded-xl border border-edge bg-card p-4">
            <summary className="cursor-pointer font-medium">Review tools and files</summary>
            <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" loading={busy === "check-inputs"} disabled={stageBusy} onClick={() => void checkPayrollInputs()}>
              Check payroll inputs
            </Button>
            <Button variant="outline" disabled={stageBusy} onClick={exportAllPayslips}>
              <Download aria-hidden="true" className="size-4" /> Export draft payslips
            </Button>
            <a href={`/api/payroll/runs/${payroll.id}/register?${new URLSearchParams({ locationId: locationId ?? "" })}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-edge bg-card px-3 text-sm font-medium hover:bg-tint">
              <Download aria-hidden="true" className="size-4" /> Download Excel register
            </a>
          </div>
          </details>
        )}
        {transitionError && <p role="alert" className="rounded-xl border border-destructive/30 bg-card p-4 text-sm">{transitionError}</p>}
        {maximumStep > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-edge bg-card p-4">
            {currentStep > 0 ? <Button variant="ghost" disabled={stageBusy} onClick={() => setStage(PAYROLL_WIZARD_STEPS[currentStep - 1].id)}>Back</Button> : <span />}
            <div className="min-w-0">
              {action && action.busy !== "create" ? (
                <>
                  {blockedAction && <p id="payroll-action-blockers" className="mb-2 text-sm text-muted-foreground">
                    Resolve the <a href={blockedBySource ? (sourceBlockers.length ? "#payroll-input-issues" : "#payroll-cohort-checks") : "#payroll-issues"} className="font-medium text-primary underline">listed issues</a> before continuing.
                  </p>}
                  <Button disabled={stageBusy || blockedAction} loading={busy === action.busy} onClick={action.onClick}
                    aria-describedby={blockedAction ? "payroll-action-blockers" : undefined}>
                    {action.label}<ArrowRight aria-hidden="true" className="size-4" />
                  </Button>
                </>
              ) : nextStage && <Button onClick={() => setStage(nextStage.id)} disabled={stageBusy}>
                {currentStep === 0 ? "Continue to adjustments" : currentStep === 1 ? "Continue to review" : "Continue to finalization"}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Button>}
            </div>
          </div>
        )}
        {(payroll || (canManageSettings && canGenerate)) && (
          <details className="mt-4 rounded-xl border border-edge bg-card p-4">
            <summary className="cursor-pointer font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Advanced tools
            </summary>
            <div className="mt-4 flex flex-wrap gap-2">
              {canManageSettings && locationId && (
                <>
                  {canRecoverLegacyMess && (
                    <Button
                      variant="outline"
                      loading={busy === "mess_backdate"}
                      onClick={() => void previewRecovery("mess_backdate")}
                    >
                      Preview legacy Mess plan recovery
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    loading={busy === "attendance_reprocess"}
                    onClick={() => void previewRecovery("attendance_reprocess")}
                  >
                    Preview IN-only attendance recovery
                  </Button>
                </>
              )}
              {stage.id !== "review" && canAddEmployees && !emptyRun && (
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
              {payroll && !needsPayslips && ["reviewed", "approved"].includes(payroll.status) && (
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
        </>}
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
                Record the payment after completing it outside PeopleNexa.
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
          {confirmationError && <p role="alert" className="rounded-lg border border-warning/30 p-3 text-sm">{confirmationError}</p>}
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
        key={`${payroll?.id ?? "none"}:${detailsEmployeeId ?? "closed"}`}
        row={details}
        payrollId={payroll?.id ?? null}
        month={month}
        recalculating={busy === "recalculate"}
        onRecalculate={recalculateDraft}
        onClose={() => setDetailsEmployeeId(null)}
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
        runId={payroll?.status === "draft" ? payroll.id : undefined}
        month={month}
        selectedIds={selectedEmployeeIds}
        onChange={setSelectedEmployeeIds}
        onAdd={() => (payroll ? void create(true) : setPickerOpen(false))}
        adding={busy === "create"}
        draft={Boolean(payroll)}
      />
    </div>
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
  runId,
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
  runId?: string;
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
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open || !locationId) return;
    const controller = new AbortController();
    setLoading(true);
    setData(null);
    setError("");
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/payroll/employees?${new URLSearchParams({ locationId, month, page: String(page), search, ...(runId ? { runId } : {}) })}`,
          { signal: controller.signal },
        );
        const next = await response.json();
        if (!response.ok) throw new Error(next.error ?? "Could not load employees.");
        setData(next);
      } catch (failure) {
        if (!controller.signal.aborted) {
          setData(null);
          setError(failure instanceof Error ? failure.message : "Could not load employees.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, locationId, runId, month, page, search, retry]);
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
      {error && <div role="alert" className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {error}
        <Button size="sm" variant="outline" onClick={() => setRetry((attempt) => attempt + 1)}>Retry</Button>
      </div>}
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
function EmployeeModal({
  row,
  payrollId,
  month,
  recalculating,
  onRecalculate,
  onClose,
}: {
  row: Row | null;
  payrollId: string | null;
  month: string;
  recalculating: boolean;
  onRecalculate: (payslipId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [confirmRecalculation, setConfirmRecalculation] = useState(false);
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
      onClose={() => { if (!recalculating) onClose(); }}
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
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={recalculating}
            onClick={() => {
              window.location.href = `/api/payroll/payslips?${new URLSearchParams({ month, employeeIds: row.employee.id, runId: payrollId })}`;
            }}
          >
            <Download aria-hidden="true" className="h-4 w-4" />
            Download payslip
          </Button>
          {row.payslip.canRecalculate && !confirmRecalculation && (
            <Button variant="outline" onClick={() => setConfirmRecalculation(true)}>
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              Recalculate draft
            </Button>
          )}
        </div>
      )}
      {row.payslip?.canRecalculate && confirmRecalculation && (
        <div className="mt-4 rounded-xl border border-edge bg-tint p-4">
          <p className="text-sm">Recalculate this draft from updated attendance and adjustments using its recorded payroll policy?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" disabled={recalculating} onClick={() => setConfirmRecalculation(false)}>Cancel</Button>
            <Button loading={recalculating} onClick={async () => {
              await onRecalculate(row.payslip!.id);
              setConfirmRecalculation(false);
            }}>Recalculate payslip</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
