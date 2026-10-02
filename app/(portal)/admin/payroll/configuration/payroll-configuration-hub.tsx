"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Edit3,
  ExternalLink,
  Eye,
  FileText,
  Info,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Field, Input, NumberInput } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { payrollPolicyDraft } from "@/lib/configuration";
import { payrollFieldMappings } from "@/lib/payroll-field-mapping";
import {
  payrollPolicyEditorDraft,
  payrollScheduleExample,
  resolvePayrollPolicyEditorSource,
  type PayrollComponentBandEditor,
  type PayrollComponentEditor,
  type PayrollPolicyEditorDraft,
  type PayrollPolicyEditorRecord,
  type PayrollStatutoryRuleEditor,
} from "@/lib/payroll-policy-editor";

type Profile = {
  legalName: string | null;
  displayName: string | null;
  address: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  taxId: string | null;
  registrationNo: string | null;
} | null;

type Location = { id: string; name: string; code: string; profile: Profile };
type PolicyRecord = PayrollPolicyEditorRecord & {
  location: { name: string } | null;
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
  createdBy: string;
  activatedBy: string | null;
};
type Organization = {
  name: string;
  address: string | null;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  registrationNo: string | null;
};
type SectionKey = "schedule" | "statutory" | "components" | "tax" | "advanced";
type FieldErrors = Record<string, string>;
type PreviewResult = {
  affectedEmployees: number;
  resolvedStoredSource: string;
  currentBehaviorSource: string;
  effectiveFrom: string;
  payroll: Array<{ label: string; current: unknown; proposed: unknown; changed: boolean }>;
};

const SECTIONS: Array<{ key: SectionKey; label: string }> = [
  { key: "schedule", label: "Pay Schedule" },
  { key: "statutory", label: "Statutory Components" },
  { key: "components", label: "Salary Components" },
  { key: "tax", label: "Tax Details" },
  { key: "advanced", label: "Advanced" },
];

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function PayrollConfigurationHub({
  locations,
  records,
  baseline,
  organization,
}: {
  locations: Location[];
  records: PolicyRecord[];
  baseline: PayrollPolicyEditorDraft;
  organization: Organization;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedLocation = searchParams.get("location");
  const selectedScope = requestedLocation === "tenant"
    ? "tenant"
    : locations.some((location) => location.id === requestedLocation)
      ? requestedLocation!
      : locations[0]?.id ?? "tenant";
  const requestedSection = searchParams.get("section");
  const section = SECTIONS.some((item) => item.key === requestedSection) ? requestedSection as SectionKey : "schedule";
  const [effectiveFrom, setEffectiveFrom] = useState(todayKey);
  const selectedLocation = locations.find((location) => location.id === selectedScope) ?? null;
  const selectedLocationId = selectedScope === "tenant" ? null : selectedScope;
  const source = resolvePayrollPolicyEditorSource(records, selectedLocationId, effectiveFrom);
  const draft = payrollPolicyEditorDraft(source.record?.payload, baseline);

  function replaceQuery(values: Partial<{ section: SectionKey; location: string }>) {
    const next = new URLSearchParams(searchParams.toString());
    if (values.section) next.set("section", values.section);
    if (values.location) next.set("location", values.location);
    router.replace(`/admin/payroll/configuration?${next.toString()}`, { scroll: false });
  }

  const sourceLabel = source.kind === "location_override"
    ? `${selectedLocation?.name ?? "Location"} override`
    : source.kind === "tenant_fallback"
      ? "Inherited tenant template"
      : source.kind === "tenant_template"
        ? "Tenant default template"
        : "Tenant configuration baseline";

  return (
    <main id="payroll-policy-editor" className="payroll-canvas animate-fade-up pb-10">
      <header className="rounded-xl border border-edge bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <p className="payroll-eyebrow">PeopleNexa payroll</p>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">Payroll policy</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Set the rules used when future monthly payroll drafts are generated. Finalized and paid payroll keeps its saved snapshot.</p>
          </div>
          <div className="grid w-full gap-3 sm:grid-cols-2 xl:max-w-2xl">
            <Field label="Required payroll location" hint={selectedScope === "tenant" ? "Template context only. Payroll processing still requires an active location." : "The policy resolves for this active location."}>
              <Select
                required
                aria-label="Required payroll location"
                value={selectedScope}
                onChange={(event) => replaceQuery({ location: event.target.value })}
              >
                {locations.length > 0 && <optgroup label="Operational locations">
                  {locations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}
                </optgroup>}
                <optgroup label="Templates only">
                  <option value="tenant">Tenant default template (not a payroll run scope)</option>
                </optgroup>
              </Select>
            </Field>
            <Field label="Effective from" error={!effectiveFrom ? "Choose the first date this draft should apply." : undefined} hint="Monthly payroll resolves policy on the first day of its month; use that date for a monthly change.">
              <Input aria-label="Policy effective from" type="date" required value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} />
            </Field>
          </div>
        </div>
        <div className="mt-5 grid gap-3 border-t border-edge pt-4 text-sm lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 inline-flex shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${source.record ? "border-emerald-600/30 bg-emerald-500/10 text-emerald-300" : "border-amber-600/30 bg-amber-500/10 text-amber-300"}`}>
              {source.record ? `Active v${source.record.version}` : "Baseline"}
            </span>
            <div><p className="font-semibold text-foreground">{sourceLabel}</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{source.record ? `Effective ${dateLabel(source.record.effectiveFrom)}${source.record.effectiveTo ? ` to ${dateLabel(source.record.effectiveTo)}` : " onward"}. Editing starts a new draft; this version is never mutated.` : "Inherited from the existing tenant configuration resolver. It is an operating baseline, not a legal or published default."}</p></div>
          </div>
          <div className="flex items-start gap-2 rounded-lg bg-tint px-3 py-2.5 text-xs leading-5 text-muted-foreground">
            <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p><strong className="text-foreground">Future impact only.</strong> Saving creates an inactive draft. Publishing remains explicit in Advanced. Existing finalized and paid payslips, calculations, and snapshots are unchanged.</p>
          </div>
        </div>
        {locations.length === 0 && <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-sm text-foreground"><AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />Create an active location before processing payroll. You can prepare only the tenant template here.</div>}
      </header>

      <nav aria-label="Payroll policy sections" className="mt-4 flex gap-1 overflow-x-auto rounded-xl border border-edge bg-card p-1.5 shadow-sm">
        {SECTIONS.map((item) => {
          const active = item.key === section;
          return <button key={item.key} type="button" aria-current={active ? "page" : undefined} onClick={() => replaceQuery({ section: item.key })} className={`min-h-11 shrink-0 rounded-lg px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-tint hover:text-foreground"}`}>{item.label}</button>;
        })}
      </nav>

      <PolicyEditor
        key={`${selectedScope}:${effectiveFrom}:${source.record?.id ?? "baseline"}`}
        section={section}
        initialDraft={draft}
        sourceRecord={source.record as PolicyRecord | null}
        selectedLocation={selectedLocation}
        selectedLocationId={selectedLocationId}
        effectiveFrom={effectiveFrom}
        records={records}
        organization={organization}
        onSectionChange={(next) => replaceQuery({ section: next })}
      />
    </main>
  );
}

function PolicyEditor({
  section,
  initialDraft,
  sourceRecord,
  selectedLocation,
  selectedLocationId,
  effectiveFrom,
  records,
  organization,
  onSectionChange,
}: {
  section: SectionKey;
  initialDraft: PayrollPolicyEditorDraft;
  sourceRecord: PolicyRecord | null;
  selectedLocation: Location | null;
  selectedLocationId: string | null;
  effectiveFrom: string;
  records: PolicyRecord[];
  organization: Organization;
  onSectionChange: (section: SectionKey) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const errorRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<PayrollPolicyEditorDraft>(() => initialDraft);
  const [effectiveTo, setEffectiveTo] = useState(() => sourceRecord?.effectiveTo ? dateKey(sourceRecord.effectiveTo) : "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingVersion, setPendingVersion] = useState<PolicyRecord | null>(null);

  function change(next: PayrollPolicyEditorDraft, clear: string[] = []) {
    setDraft(next);
    setNotice(null);
    if (clear.length) setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !clear.includes(key))));
  }

  async function request(body: unknown, method: "POST" | "PATCH" = "POST") {
    const response = await fetch("/api/configuration", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "Could not update payroll policy.");
    return data;
  }

  function validate() {
    const next = validatePolicy(draft, effectiveFrom, effectiveTo);
    setErrors(next);
    if (Object.keys(next).length) {
      window.requestAnimationFrame(() => errorRef.current?.focus());
      return false;
    }
    return true;
  }

  async function submit(action: "preview" | "save") {
    if (!validate()) return;
    setBusy(action);
    setNotice(null);
    try {
      const data = await request({
        ...(action === "preview" ? { action: "preview" } : {}),
        kind: "payroll_policy",
        locationId: selectedLocationId,
        effectiveFrom,
        effectiveTo: effectiveTo || null,
        payload: draft,
      });
      if (action === "preview") {
        setPreview({
          affectedEmployees: data.affectedEmployees ?? 0,
          resolvedStoredSource: data.resolvedStoredSource ?? "current policy",
          currentBehaviorSource: data.currentBehaviorSource ?? "current operating default",
          effectiveFrom: data.effectiveFrom ?? effectiveFrom,
          payroll: data.payroll ?? [],
        });
        setNotice("Preview ready. Nothing was saved.");
        onSectionChange("advanced");
        toast("success", "Policy preview ready. Nothing was saved.");
      } else {
        setNotice("Draft saved. Publish it from Advanced after review.");
        toast("success", "Payroll policy draft saved.");
        router.refresh();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update payroll policy.";
      setErrors({ form: message });
      window.requestAnimationFrame(() => errorRef.current?.focus());
      toast("error", message);
    } finally {
      setBusy(null);
    }
  }

  async function toggleVersion(record: PolicyRecord) {
    setPendingVersion(null);
    setBusy(record.id);
    try {
      await request({ id: record.id, active: !record.active }, "PATCH");
      setNotice(record.active ? `Version ${record.version} deactivated.` : `Version ${record.version} published for future payroll drafts.`);
      toast("success", record.active ? "Policy version deactivated." : "Policy version published.");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update policy version.";
      setErrors({ form: message });
      window.requestAnimationFrame(() => errorRef.current?.focus());
      toast("error", message);
    } finally {
      setBusy(null);
    }
  }

  const errorMessages = [...new Set(Object.values(errors))];

  return <div className="mt-4 space-y-4">
    {errorMessages.length > 0 && <div ref={errorRef} tabIndex={-1} role="alert" aria-labelledby="policy-error-title" className="rounded-xl border border-rose-500/35 bg-rose-500/10 p-4 text-sm text-foreground focus:outline-none">
      <p id="policy-error-title" className="font-semibold">Review the policy before continuing</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{errorMessages.map((message) => <li key={message}>{message}</li>)}</ul>
    </div>}

    {section === "schedule" && <ScheduleSection draft={draft} effectiveMonth={effectiveFrom.slice(0, 7)} errors={errors} onChange={change} />}
    {section === "statutory" && <StatutorySection draft={draft} selectedLocation={selectedLocation} errors={errors} onChange={change} onAdvanced={() => onSectionChange("advanced")} />}
    {section === "components" && <SalaryComponentsSection draft={draft} selectedLocation={selectedLocation} errors={errors} onChange={change} />}
    {section === "tax" && <TaxDetailsSection draft={draft} selectedLocation={selectedLocation} organization={organization} errors={errors} onChange={change} />}
    {section === "advanced" && <AdvancedSection
      draft={draft}
      effectiveFrom={effectiveFrom}
      effectiveTo={effectiveTo}
      setEffectiveTo={(value) => { setEffectiveTo(value); setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== "effectiveTo" && key !== "form"))); }}
      selectedLocation={selectedLocation}
      selectedLocationId={selectedLocationId}
      records={records}
      preview={preview}
      busy={busy}
      errors={errors}
      onChange={change}
      onRequestToggle={setPendingVersion}
    />}

    <div className="bottom-3 z-10 flex flex-col gap-3 rounded-xl border border-edge-strong bg-card/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between md:sticky">
      <div aria-live="polite" className="min-h-5 text-xs leading-5 text-muted-foreground">
        {notice ?? <>Both actions use this complete draft across all sections. {selectedLocation ? `Saving updates the current ${selectedLocation.name} draft.` : "Saving updates the tenant template draft, not an operational payroll scope."}</>}
      </div>
      <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row">
        <Button type="button" variant="outline" loading={busy === "preview"} disabled={Boolean(busy && busy !== "preview")} onClick={() => void submit("preview")}><Eye aria-hidden="true" className="h-4 w-4" />Preview changes</Button>
        <Button type="button" loading={busy === "save"} disabled={Boolean(busy && busy !== "save")} onClick={() => void submit("save")}><Save aria-hidden="true" className="h-4 w-4" />Save draft</Button>
      </div>
    </div>

    <ConfirmDialog
      open={Boolean(pendingVersion)}
      title={pendingVersion?.active ? `Deactivate policy v${pendingVersion.version}?` : `Publish policy v${pendingVersion?.version}?`}
      description={pendingVersion?.active ? "New payroll drafts will stop resolving this version. Existing payroll snapshots remain unchanged." : "Publishing replaces the currently published version in this scope. If this version starts in the future, earlier payroll months may have no published policy. Existing payroll snapshots remain unchanged."}
      confirmLabel={pendingVersion?.active ? "Deactivate" : "Publish version"}
      tone={pendingVersion?.active ? "danger" : "success"}
      onCancel={() => setPendingVersion(null)}
      onConfirm={() => { if (pendingVersion) void toggleVersion(pendingVersion); }}
    />
  </div>;
}

function SectionPanel({ title, description, action, children }: { title: string; description: string; action?: ReactNode; children: ReactNode }) {
  return <section aria-labelledby={`section-${title.toLowerCase().replace(/\s+/g, "-")}`} className="rounded-xl border border-edge bg-card shadow-sm">
    <div className="flex flex-col gap-3 border-b border-edge px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
      <div><h2 id={`section-${title.toLowerCase().replace(/\s+/g, "-")}`} className="font-display text-lg font-semibold">{title}</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p></div>
      {action}
    </div>
    <div className="p-4 sm:p-5">{children}</div>
  </section>;
}

function ScheduleSection({ draft, effectiveMonth, errors, onChange }: { draft: PayrollPolicyEditorDraft; effectiveMonth: string; errors: FieldErrors; onChange: (draft: PayrollPolicyEditorDraft, clear?: string[]) => void }) {
  const [year, month] = effectiveMonth.split("-").map(Number);
  const calendarDivisor = year && month ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 30;
  const selectedDivisor = draft.salaryDivisorMethod === "calendar_days" ? calendarDivisor : draft.monthlyDivisor;
  const example = payrollScheduleExample(30_000, 2, selectedDivisor, draft.deductLossOfPay, draft.earnedSalaryRounding);
  const schedule = draft.schedule;
  const hasCutoff = [schedule.attendanceCutoffDay, schedule.adjustmentCutoffDay, schedule.reimbursementCutoffDay].some((value) => value !== null && value !== undefined);

  function changeSchedule(patch: Partial<PayrollPolicyEditorDraft["schedule"]>, clear: string[] = []) {
    onChange({ ...draft, schedule: { ...schedule, ...patch } }, clear);
  }

  function setPayDateRule(value: "last_day" | "fixed_day") {
    if (value === "last_day") {
      const { payDay: _payDay, ...rest } = schedule;
      onChange({ ...draft, schedule: { ...rest, payDateRule: value } }, ["payDay"]);
    } else {
      changeSchedule({ payDateRule: value, payDay: schedule.payDay ?? 1 }, ["payDay"]);
    }
  }

  return <SectionPanel title="Pay Schedule" description="A short set of inputs the current payroll engine actually resolves for monthly staff. Pay-date and cutoff fields are retained as planning metadata; they do not trigger payment or lock attendance automatically.">
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,.8fr)]">
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Payroll frequency" hint="PeopleNexa currently generates monthly payroll runs."><Input value="Monthly" readOnly aria-readonly="true" /></Field>
          <Field label="Salary calculation" hint="Choose the divisor used for monthly LOP, component proration, and monthly overtime."><Select value={draft.salaryDivisorMethod} onChange={(event) => onChange({ ...draft, salaryDivisorMethod: event.target.value as PayrollPolicyEditorDraft["salaryDivisorMethod"] }, ["form"])}><option value="fixed_divisor">Fixed divisor</option><option value="calendar_days">Actual calendar days</option></Select></Field>
          {draft.salaryDivisorMethod === "fixed_divisor" && <Field label="Fixed salary divisor" error={errors.monthlyDivisor} hint="Used for monthly LOP and the monthly overtime hourly base.">
            <NumberInput min="1" max="366" step="1" value={draft.monthlyDivisor} aria-invalid={Boolean(errors.monthlyDivisor)} onValueChange={(monthlyDivisor) => onChange({ ...draft, monthlyDivisor: monthlyDivisor as number }, ["monthlyDivisor", "form"])} />
          </Field>}
          <Field label="Earned-salary rounding" hint="Applied after monthly salary is prorated. Components can optionally override this."><Select value={draft.earnedSalaryRounding} onChange={(event) => onChange({ ...draft, earnedSalaryRounding: event.target.value as PayrollPolicyEditorDraft["earnedSalaryRounding"] }, ["form"])}><option value="two_decimals">Two decimals</option><option value="floor_rupee">Round down to whole rupee</option><option value="nearest_rupee">Nearest whole rupee</option></Select></Field>
          <Field label="Component rounding total" hint="Choose whether payable-day earning components are rounded individually and then summed, or adjusted to one rounded total."><Select value={draft.earnedSalaryAggregation} onChange={(event) => onChange({ ...draft, earnedSalaryAggregation: event.target.value as PayrollPolicyEditorDraft["earnedSalaryAggregation"] }, ["form"])}><option value="rounded_total">Round total after proration</option><option value="sum_rounded_components">Round each component, then sum</option></Select></Field>
          <Field label="Overtime multiplier" error={errors.overtimeMultiplier} hint="Applied to the engine's pay-mode-specific hourly rate.">
            <NumberInput min="0" max="10" step="0.01" value={draft.overtimeMultiplier} aria-invalid={Boolean(errors.overtimeMultiplier)} onValueChange={(overtimeMultiplier) => onChange({ ...draft, overtimeMultiplier: overtimeMultiplier as number }, ["overtimeMultiplier", "form"])} />
          </Field>
          <Field label="Pay date" error={errors.payDay} hint="Scheduling reference saved with this policy version.">
            <Select value={schedule.payDateRule} aria-invalid={Boolean(errors.payDay)} onChange={(event) => setPayDateRule(event.target.value as "last_day" | "fixed_day")}><option value="last_day">Last day of the month</option><option value="fixed_day">Fixed day of the month</option></Select>
          </Field>
          {schedule.payDateRule === "fixed_day" && <Field label="Fixed pay day" error={errors.payDay}><NumberInput min="1" max="31" step="1" value={schedule.payDay} aria-invalid={Boolean(errors.payDay)} onValueChange={(payDay) => changeSchedule({ payDay: payDay as number }, ["payDay", "form"])} /></Field>}
        </div>
        <SwitchRow checked={draft.deductLossOfPay} label="Deduct loss of pay" description="For monthly staff, payable days equal the selected divisor minus absences, half-day fractions, and unpaid leave. Approved paid leave remains payable." onChange={(checked) => onChange({ ...draft, deductLossOfPay: checked }, ["form"])} />
        <div className="grid gap-4 sm:grid-cols-2"><Field label="No-shift attendance window" error={errors.noShiftAttendanceWindowHours} hint="For employees without a rostered or default shift, first and last punches in this window are paired to the same workday. After it closes, an IN-only day uses the treatment below."><NumberInput min="1" max="24" step="1" value={draft.attendanceTreatment.noShiftAttendanceWindowHours} onValueChange={(noShiftAttendanceWindowHours) => onChange({ ...draft, attendanceTreatment: { ...draft.attendanceTreatment, noShiftAttendanceWindowHours: noShiftAttendanceWindowHours as number } }, ["noShiftAttendanceWindowHours", "form"])} /></Field><Field label="Finalized IN-only punch" hint="Applied automatically after the attendance window closes and no OUT punch arrives. The day remains flagged for HR review."><Select value={draft.attendanceTreatment.missingOutPunch} onChange={(event) => onChange({ ...draft, attendanceTreatment: { ...draft.attendanceTreatment, missingOutPunch: event.target.value as PayrollPolicyEditorDraft["attendanceTreatment"]["missingOutPunch"] } }, ["form"])}><option value="review">Review only</option><option value="half_day">Deduct half day</option><option value="full_day">Deduct full day</option></Select></Field><Field label="No IN and no OUT punch" hint="No-punch days are treated as a full-day LOP by payroll."><Input value="Deduct full day" readOnly aria-readonly="true" /></Field></div>
        <details className="rounded-lg border border-edge bg-tint/30 p-4" open={hasCutoff || undefined}>
          <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Optional cutoff days</summary>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">These dates are stored for payroll planning and review. The current engine does not enforce a lock at these cutoffs.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <CutoffField label="Attendance cutoff" value={schedule.attendanceCutoffDay} error={errors.attendanceCutoffDay} onChange={(value) => changeSchedule({ attendanceCutoffDay: value }, ["attendanceCutoffDay", "form"])} />
            <CutoffField label="Adjustment cutoff" value={schedule.adjustmentCutoffDay} error={errors.adjustmentCutoffDay} onChange={(value) => changeSchedule({ adjustmentCutoffDay: value }, ["adjustmentCutoffDay", "form"])} />
            <CutoffField label="Reimbursement cutoff" value={schedule.reimbursementCutoffDay} error={errors.reimbursementCutoffDay} onChange={(value) => changeSchedule({ reimbursementCutoffDay: value }, ["reimbursementCutoffDay", "form"])} />
          </div>
        </details>
      </div>
      <aside aria-label="LOP calculation example" className="rounded-xl border border-primary/20 bg-primary/5 p-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><WalletCards aria-hidden="true" className="h-5 w-5" /></div>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-primary">Live example</p>
        <h3 className="mt-1 font-display text-lg font-semibold">₹30,000 salary · 2 LOP days</h3>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">₹30,000 × ({selectedDivisor} − 2) ÷ {selectedDivisor}</p>
        <dl className="mt-4 space-y-3 border-t border-primary/15 pt-4 text-sm">
          <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">LOP deduction</dt><dd className="font-semibold tabular-nums">{money(example.deduction)}</dd></div>
          <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">Salary after LOP</dt><dd className="font-semibold tabular-nums">{money(example.salaryAfterLop)}</dd></div>
        </dl>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">Before statutory and other deductions. {draft.deductLossOfPay ? `${draft.salaryDivisorMethod === "calendar_days" ? `${effectiveMonth} has ${calendarDivisor} calendar days` : `The fixed divisor is ${draft.monthlyDivisor}`}; earned salary uses ${roundingLabel(draft.earnedSalaryRounding).toLowerCase()}.` : "LOP deduction is currently switched off."}</p>
      </aside>
    </div>
  </SectionPanel>;
}

function CutoffField({ label, value, error, onChange }: { label: string; value: number | null | undefined; error?: string; onChange: (value: number | null) => void }) {
  return <Field label={label} error={error}><NumberInput min="1" max="31" step="1" placeholder="Not set" value={value} aria-invalid={Boolean(error)} onValueChange={onChange} /></Field>;
}

type StatutoryKey = "pf" | "esi" | "pt" | "lwf" | "tds";

function StatutorySection({ draft, selectedLocation, errors, onChange, onAdvanced }: { draft: PayrollPolicyEditorDraft; selectedLocation: Location | null; errors: FieldErrors; onChange: (draft: PayrollPolicyEditorDraft, clear?: string[]) => void; onAdvanced: () => void }) {
  const [selected, setSelected] = useState<StatutoryKey>("pf");
  const statutory = draft.statutory;
  const cards: Array<{ key: StatutoryKey; label: string; enabled: boolean; summary: string }> = [
    { key: "pf", label: "PF", enabled: statutory.pfEnabled, summary: `Wage ceiling ${money(statutory.pfWageCeiling)}` },
    { key: "esi", label: "ESI", enabled: statutory.esicEnabled, summary: `Gross ceiling ${money(statutory.esicGrossCeiling)}` },
    { key: "pt", label: "Professional Tax", enabled: statutory.professionalTaxEnabled, summary: statutory.professionalTaxState || "No jurisdiction set" },
    { key: "lwf", label: "Labour Welfare Fund", enabled: statutory.labourWelfareFundEnabled, summary: statutory.professionalTaxState || "Uses PT jurisdiction" },
    { key: "tds", label: "TDS", enabled: statutory.tdsEnabled, summary: `${statutory.tdsRegime === "old" ? "Old" : "New"} regime` },
  ];

  function update(patch: Partial<PayrollPolicyEditorDraft["statutory"]>, clear: string[] = []) {
    onChange({ ...draft, statutory: { ...statutory, ...patch } }, clear);
  }

  return <SectionPanel title="Statutory Components" description="Operational calculator switches and thresholds only. These inputs do not certify legal rates, registrations, returns, or filing readiness." action={<Button type="button" size="sm" variant="ghost" onClick={onAdvanced}><FileText aria-hidden="true" className="h-4 w-4" />Sources & review</Button>}>
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-5" aria-label="Statutory component selector">
      {cards.map((card) => <button key={card.key} type="button" aria-pressed={selected === card.key} onClick={() => setSelected(card.key)} className={`min-h-24 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected === card.key ? "border-primary bg-primary/5" : "border-edge hover:bg-tint"}`}>
        <span className="flex items-center justify-between gap-2"><strong className="text-sm">{card.label}</strong><span className={`h-2 w-2 rounded-full ${card.enabled ? "bg-emerald-500" : "bg-muted-foreground/40"}`} aria-hidden="true" /></span>
        <span className="mt-2 block text-xs leading-5 text-muted-foreground">{card.enabled ? "Enabled" : "Disabled"} · {card.summary}</span>
      </button>)}
    </div>
    <div className="mt-4 rounded-xl border border-edge bg-tint/30 p-4 sm:p-5">
      {selected === "pf" && <div className="space-y-4"><SwitchRow checked={statutory.pfEnabled} label="Enable PF calculation" description="Applies the payroll engine's PF calculator to eligible employees." onChange={(checked) => update({ pfEnabled: checked }, ["form"])} /><div className="max-w-sm"><Field label="PF wage ceiling" error={errors.pfWageCeiling} hint="Operational wage ceiling used by the calculator."><NumberInput min="0" step="1" value={statutory.pfWageCeiling} aria-invalid={Boolean(errors.pfWageCeiling)} onValueChange={(pfWageCeiling) => update({ pfWageCeiling: pfWageCeiling as number }, ["pfWageCeiling", "form"])} /></Field></div><RateNotice name="PF" /></div>}
      {selected === "esi" && <div className="space-y-4"><SwitchRow checked={statutory.esicEnabled} label="Enable ESI calculation" description="Applies the payroll engine's ESI calculator to eligible employees." onChange={(checked) => update({ esicEnabled: checked }, ["form"])} /><div className="max-w-sm"><Field label="ESI gross ceiling" error={errors.esicGrossCeiling} hint="Operational gross ceiling used by the calculator."><NumberInput min="0" step="1" value={statutory.esicGrossCeiling} aria-invalid={Boolean(errors.esicGrossCeiling)} onValueChange={(esicGrossCeiling) => update({ esicGrossCeiling: esicGrossCeiling as number }, ["esicGrossCeiling", "form"])} /></Field></div><RateNotice name="ESI" /></div>}
      {selected === "pt" && <div className="space-y-4"><SwitchRow checked={statutory.professionalTaxEnabled} label="Enable Professional Tax calculation" description={`Applied for ${selectedLocation?.name ?? "the tenant template"} using the jurisdiction below.`} onChange={(checked) => update({ professionalTaxEnabled: checked }, ["form"])} /><div className="max-w-md"><Field label="State or jurisdiction" error={errors.professionalTaxState} hint={`Selected policy context: ${selectedLocation?.name ?? "Tenant default template"}.`}><Input value={statutory.professionalTaxState} maxLength={80} aria-invalid={Boolean(errors.professionalTaxState)} placeholder="Enter the operating jurisdiction" onChange={(event) => update({ professionalTaxState: event.target.value }, ["professionalTaxState", "form"])} /></Field></div></div>}
      {selected === "lwf" && <div className="space-y-4"><SwitchRow checked={statutory.labourWelfareFundEnabled} label="Enable Labour Welfare Fund calculation" description="The current engine uses the Professional Tax jurisdiction for LWF lookup." onChange={(checked) => update({ labourWelfareFundEnabled: checked }, ["form"])} /><div className="rounded-lg border border-edge bg-card px-4 py-3 text-sm"><p className="font-semibold">Jurisdiction</p><p className="mt-1 text-muted-foreground">{statutory.professionalTaxState || "Not set in Professional Tax"}</p></div><RateNotice name="LWF" /></div>}
      {selected === "tds" && <div className="space-y-4"><SwitchRow checked={statutory.tdsEnabled} label="Enable TDS calculation" description="Applies the current payroll TDS calculator to eligible employees." onChange={(checked) => update({ tdsEnabled: checked }, ["form"])} /><div className="max-w-sm"><Field label="Tax regime"><Select value={statutory.tdsRegime} onChange={(event) => update({ tdsRegime: event.target.value as "new" | "old" }, ["form"])}><option value="new">New regime</option><option value="old">Old regime</option></Select></Field></div><p className="text-xs leading-5 text-muted-foreground">This is an operational calculation setting. It does not claim Form 16 or return-filing readiness.</p></div>}
    </div>
  </SectionPanel>;
}

function RateNotice({ name }: { name: string }) {
  return <div className="flex items-start gap-2 rounded-lg border border-sky-500/25 bg-sky-500/10 p-3 text-xs leading-5 text-foreground"><Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" /><p>Employer and employee {name} rates are payroll-engine calculator defaults and are not configurable in this policy. No rate shown here should be treated as certified legal guidance.</p></div>;
}

const COMPONENT_CATEGORIES: Array<{ key: PayrollComponentEditor["kind"]; label: string }> = [
  { key: "earning", label: "Earnings" },
  { key: "deduction", label: "Deductions" },
  { key: "employer_benefit", label: "Employer Benefits" },
  { key: "reimbursement", label: "Reimbursements" },
];

function SalaryComponentsSection({ draft, selectedLocation, errors, onChange }: { draft: PayrollPolicyEditorDraft; selectedLocation: Location | null; errors: FieldErrors; onChange: (draft: PayrollPolicyEditorDraft, clear?: string[]) => void }) {
  const [category, setCategory] = useState<PayrollComponentEditor["kind"]>("earning");
  const [editor, setEditor] = useState<{ index: number | null; value: PayrollComponentEditor } | null>(null);
  const [removeIndex, setRemoveIndex] = useState<number | null>(null);
  const [assignmentComponent, setAssignmentComponent] = useState<PayrollComponentEditor | null>(null);
  const [messPlans, setMessPlans] = useState<PayrollComponentEditor[] | null>(null);
  const components = draft.components;
  const visible = components.map((component, index) => ({ component, index })).filter(({ component }) => component.kind === category);
  const planGroup = (component: PayrollComponentEditor) => components.filter((candidate) => candidate.applicability === "assigned_employees" && candidate.label.trim().toLowerCase() === component.label.trim().toLowerCase());
  const isPlanGroup = (component: PayrollComponentEditor) => planGroup(component).length > 1;
  const isPlanLead = (component: PayrollComponentEditor) => planGroup(component)[0]?.code === component.code;

  function saveComponent(index: number | null, component: PayrollComponentEditor) {
    const next = index === null ? [...components, component] : components.map((current, currentIndex) => currentIndex === index ? component : current);
    onChange({ ...draft, components: next }, ["components", "form"]);
    setEditor(null);
  }

  function removeComponent() {
    if (removeIndex === null) return;
    onChange({ ...draft, components: components.filter((_, index) => index !== removeIndex) }, ["components", "form"]);
    setRemoveIndex(null);
  }

  return <SectionPanel title="Salary Components" description="Review one component category at a time. Existing effective-policy components are loaded here, and edits remain part of this single new policy draft." action={<Button type="button" size="sm" disabled={components.length >= 30} onClick={() => setEditor({ index: null, value: blankComponent(category) })}><Plus aria-hidden="true" className="h-4 w-4" />Add component</Button>}>
    {errors.components && <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-foreground">{errors.components}</p>}
    <div className="flex gap-1 overflow-x-auto border-b border-edge" aria-label="Salary component categories">
      {COMPONENT_CATEGORIES.map((item) => {
        const count = components.filter((component) => component.kind === item.key).length;
        return <button key={item.key} type="button" aria-pressed={category === item.key} onClick={() => setCategory(item.key)} className={`min-h-11 shrink-0 border-b-2 px-3 text-sm font-semibold ${category === item.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{item.label} <span className="ml-1 text-xs">({count})</span></button>;
      })}
    </div>
    {category === "employer_benefit" || category === "reimbursement" ? <div className="mt-4 flex items-start gap-2 rounded-lg border border-sky-500/25 bg-sky-500/10 p-3 text-xs leading-5 text-foreground"><Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />These entries are preserved in the policy catalog and payslip presentation metadata. The current engine does not silently add them to payroll amounts.</div> : null}

    {visible.length === 0 ? <div className="mt-4 rounded-lg border border-dashed border-edge p-8 text-center"><p className="font-semibold">No {COMPONENT_CATEGORIES.find((item) => item.key === category)?.label.toLowerCase()} configured</p><p className="mt-1 text-sm text-muted-foreground">Add one only if it is part of this location's salary policy.</p></div> : <>
      <div className="mt-4 hidden overflow-hidden rounded-lg border border-edge md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-tint text-xs uppercase tracking-wide text-muted-foreground"><tr><th scope="col" className="px-4 py-3">Name</th><th scope="col" className="px-4 py-3">Calculation</th><th scope="col" className="px-4 py-3">Included in</th><th scope="col" className="px-4 py-3">Effective</th><th scope="col" className="px-4 py-3">Status</th><th scope="col" className="px-4 py-3 text-right">Actions</th></tr></thead>
          <tbody className="divide-y divide-edge">{visible.map(({ component, index }) => <tr key={`${component.code}:${index}`} className="align-top hover:bg-tint/40"><td className="px-4 py-3"><p className="font-semibold">{component.label}</p><p className="mt-0.5 text-xs text-muted-foreground">{component.code}</p></td><td className="px-4 py-3 text-muted-foreground">{componentCalculation(component)}</td><td className="px-4 py-3"><InclusionList component={component} /></td><td className="px-4 py-3 text-xs text-muted-foreground">{component.effectiveFrom ? dateLabel(component.effectiveFrom) : "Policy date"}{component.effectiveTo ? ` to ${dateLabel(component.effectiveTo)}` : " onward"}</td><td className="px-4 py-3"><StatusLabel active={component.active !== false} /></td><td className="px-4 py-2"><div className="flex justify-end gap-1">{isPlanLead(component) && selectedLocation && <Button type="button" size="sm" variant="ghost" onClick={() => setMessPlans(planGroup(component))}><Users aria-hidden="true" className="h-4 w-4" />Manage {component.label} plans</Button>}{component.applicability === "assigned_employees" && !isPlanGroup(component) && selectedLocation && <Button type="button" size="sm" variant="ghost" onClick={() => setAssignmentComponent(component)}><Users aria-hidden="true" className="h-4 w-4" />Manage employees</Button>}<Button type="button" size="icon" variant="ghost" aria-label={`Edit ${component.label}`} onClick={() => setEditor({ index, value: cloneValue(component) })}><Edit3 aria-hidden="true" className="h-4 w-4" /></Button><Button type="button" size="icon" variant="ghost" aria-label={`Remove ${component.label}`} onClick={() => setRemoveIndex(index)}><Trash2 aria-hidden="true" className="h-4 w-4" /></Button></div></td></tr>)}</tbody>
        </table>
      </div>
      <div className="mt-4 space-y-3 md:hidden">{visible.map(({ component, index }) => <article key={`${component.code}:${index}`} className="rounded-lg border border-edge p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{component.label}</h3><p className="mt-0.5 text-xs text-muted-foreground">{component.code} · {componentCalculation(component)}</p></div><StatusLabel active={component.active !== false} /></div><div className="mt-3"><InclusionList component={component} /></div><p className="mt-3 text-xs text-muted-foreground">Effective {component.effectiveFrom ? dateLabel(component.effectiveFrom) : "with policy"}{component.effectiveTo ? ` to ${dateLabel(component.effectiveTo)}` : " onward"}</p><div className="mt-3 flex flex-wrap gap-2">{isPlanLead(component) && selectedLocation && <Button type="button" size="sm" variant="outline" onClick={() => setMessPlans(planGroup(component))}><Users aria-hidden="true" className="h-4 w-4" />Manage {component.label} plans</Button>}{component.applicability === "assigned_employees" && !isPlanGroup(component) && selectedLocation && <Button type="button" size="sm" variant="outline" onClick={() => setAssignmentComponent(component)}><Users aria-hidden="true" className="h-4 w-4" />Manage employees</Button>}<Button type="button" size="sm" variant="outline" onClick={() => setEditor({ index, value: cloneValue(component) })}><Edit3 aria-hidden="true" className="h-4 w-4" />Edit</Button><Button type="button" size="sm" variant="ghost" onClick={() => setRemoveIndex(index)}><Trash2 aria-hidden="true" className="h-4 w-4" />Remove</Button></div></article>)}</div>
    </>}

    <ComponentDialog editor={editor} components={components} onClose={() => setEditor(null)} onSave={saveComponent} />
    <AssignmentDialog component={assignmentComponent} location={selectedLocation} onClose={() => setAssignmentComponent(null)} />
    <MessPlanDialog components={messPlans} location={selectedLocation} onClose={() => setMessPlans(null)} />
    <ConfirmDialog open={removeIndex !== null} title="Remove salary component?" description={removeIndex !== null ? `${components[removeIndex]?.label ?? "This component"} will be removed only from this unsaved draft.` : undefined} onCancel={() => setRemoveIndex(null)} onConfirm={removeComponent} />
  </SectionPanel>;
}

function ComponentDialog({ editor, components, onClose, onSave }: { editor: { index: number | null; value: PayrollComponentEditor } | null; components: PayrollComponentEditor[]; onClose: () => void; onSave: (index: number | null, component: PayrollComponentEditor) => void }) {
  if (!editor) return null;
  return <ComponentDialogContent key={`${editor.index ?? "new"}:${editor.value.code}`} editor={editor} components={components} onClose={onClose} onSave={onSave} />;
}

function ComponentDialogContent({ editor, components, onClose, onSave }: { editor: { index: number | null; value: PayrollComponentEditor }; components: PayrollComponentEditor[]; onClose: () => void; onSave: (index: number | null, component: PayrollComponentEditor) => void }) {
  const [value, setValue] = useState<PayrollComponentEditor>(() => cloneValue(editor.value));
  const [errors, setErrors] = useState<FieldErrors>({});
  const availableBases = components.filter((component, index) => index !== editor.index && (editor.index === null || index < editor.index) && component.code);

  function update(patch: Partial<PayrollComponentEditor>, clear: string[] = []) {
    setValue((current) => ({ ...current, ...patch }));
    if (clear.length) setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !clear.includes(key))));
  }

  function setKind(kind: PayrollComponentEditor["kind"]) {
    update({
      kind,
      ...(kind === "reimbursement" ? { reimbursementFrequency: value.reimbursementFrequency ?? "monthly" } : { reimbursementFrequency: null }),
      ...(kind !== "earning" ? { pfWageBase: false, includeInGross: false } : {}),
    }, ["kind", "reimbursementFrequency"]);
  }

  function setFormula(formula: PayrollComponentEditor["formula"]) {
    const next = { ...value, formula };
    if (formula === "percent_of_component") {
      delete next.bands;
      next.basisComponentCode = value.basisComponentCode ?? availableBases[0]?.code ?? "";
    } else if (formula === "salary_band_fixed") {
      delete next.basisComponentCode;
      next.bands = value.bands?.length ? value.bands : [{ minCtc: 0, maxCtc: null, amount: 0 }];
    } else {
      delete next.basisComponentCode;
      delete next.bands;
    }
    if (formula === "variable" || formula === "one_time") next.amount = 0;
    setValue(next);
    setErrors({});
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = validateComponent(value, components, editor.index);
    setErrors(next);
    if (Object.keys(next).length) return;
    onSave(editor.index, { ...value, code: value.code.trim().toUpperCase(), label: value.label.trim() });
  }

  function updateBand(index: number, patch: Partial<PayrollComponentBandEditor>) {
    update({ bands: (value.bands ?? []).map((band, current) => current === index ? { ...band, ...patch } : band) }, ["bands"]);
  }

  return <Modal open onClose={onClose} title={editor.index === null ? "Add salary component" : `Edit ${editor.value.label}`} description="Only fields supported by the current policy payload are shown. Unchanged hidden payload keys are retained." size="lg">
    <form onSubmit={save} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Component name" error={errors.label}><Input autoFocus value={value.label} maxLength={80} aria-invalid={Boolean(errors.label)} onChange={(event) => update({ label: event.target.value }, ["label"])} /></Field>
        <Field label="Code" error={errors.code} hint="Uppercase letters, numbers, and underscores; starts with a letter."><Input value={value.code} maxLength={30} aria-invalid={Boolean(errors.code)} onChange={(event) => update({ code: event.target.value.toUpperCase() }, ["code"])} /></Field>
        <Field label="Category" error={errors.kind}><Select value={value.kind} onChange={(event) => setKind(event.target.value as PayrollComponentEditor["kind"])}>{COMPONENT_CATEGORIES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</Select></Field>
        <Field label="Calculation" error={errors.formula}><Select value={value.formula} onChange={(event) => setFormula(event.target.value as PayrollComponentEditor["formula"])}><option value="fixed">Fixed monthly amount</option><option value="percent_of_ctc">Percentage of monthly salary</option><option value="percent_of_component">Percentage of another component</option><option value="salary_band_fixed">Fixed amount by salary band</option><option value="variable">Variable (catalog only)</option><option value="one_time">One-time (catalog only)</option></Select></Field>
        {!(["variable", "one_time", "salary_band_fixed"] as string[]).includes(value.formula) && <Field label={value.formula.startsWith("percent") ? "Percentage" : "Monthly amount"} error={errors.amount}><NumberInput min="0" max="10000000" step="0.01" value={value.amount} aria-invalid={Boolean(errors.amount)} onValueChange={(amount) => update({ amount: amount as number }, ["amount"])} /></Field>}
        {value.formula === "percent_of_component" && <Field label="Base component" error={errors.basisComponentCode} hint="Components are calculated in list order."><Select value={value.basisComponentCode ?? ""} aria-invalid={Boolean(errors.basisComponentCode)} onChange={(event) => update({ basisComponentCode: event.target.value }, ["basisComponentCode"])}><option value="" disabled>Select an earlier component</option>{availableBases.map((component) => <option key={component.code} value={component.code}>{component.label} ({component.code})</option>)}</Select></Field>}
        <Field label="Proration" error={errors.prorationBasis} hint="Payable days exclude LOP. Present days include present, late, permission, and half-day fractions."><Select value={value.prorationBasis} onChange={(event) => update({ prorationBasis: event.target.value as PayrollComponentEditor["prorationBasis"], ...(event.target.value === "none" ? { prorationRounding: undefined } : {}) }, ["prorationBasis"])}><option value="none">None</option><option value="payable_days">Payable days</option><option value="present_days">Present days</option></Select></Field>
        <Field label="Applicability" error={errors.applicability} hint="Selected employees are managed from the component row after the policy draft is saved."><Select value={value.applicability} onChange={(event) => update({ applicability: event.target.value as PayrollComponentEditor["applicability"] }, ["applicability"])}><option value="all">All employees</option><option value="assigned_employees">Selected employees</option></Select></Field>
        {value.prorationBasis !== "none" && <Field label="Proration rounding" error={errors.prorationRounding} hint="Payable-day earnings inherit the policy setting unless overridden."><Select value={value.prorationRounding ?? ""} onChange={(event) => update({ prorationRounding: event.target.value ? event.target.value as NonNullable<PayrollComponentEditor["prorationRounding"]> : undefined }, ["prorationRounding"])}><option value="">Use policy/default rounding</option><option value="two_decimals">Two decimals</option><option value="floor_rupee">Round down to whole rupee</option><option value="nearest_rupee">Nearest whole rupee</option></Select></Field>}
        <Field label="Effective from" error={errors.componentDates}><Input type="date" value={value.effectiveFrom ?? ""} aria-invalid={Boolean(errors.componentDates)} onChange={(event) => update({ effectiveFrom: event.target.value || undefined }, ["componentDates"])} /></Field>
        <Field label="Effective until" error={errors.componentDates}><Input type="date" value={value.effectiveTo ?? ""} aria-invalid={Boolean(errors.componentDates)} onChange={(event) => update({ effectiveTo: event.target.value || null }, ["componentDates"])} /></Field>
      </div>

      {value.formula === "salary_band_fixed" && <div className="rounded-lg border border-edge p-4"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Salary bands</h3><p className="mt-1 text-xs text-muted-foreground">Ranges cannot overlap.</p></div><Button type="button" size="sm" variant="outline" onClick={() => update({ bands: [...(value.bands ?? []), { minCtc: 0, maxCtc: null, amount: 0 }] }, ["bands"])}><Plus aria-hidden="true" className="h-4 w-4" />Add band</Button></div>{errors.bands && <p role="alert" className="mt-2 text-xs text-destructive">{errors.bands}</p>}<div className="mt-3 space-y-3">{(value.bands ?? []).map((band, index) => <div key={index} className="grid gap-2 rounded-lg bg-tint p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"><Field label="Salary from"><NumberInput aria-label={`Band ${index + 1} salary from`} min="0" value={band.minCtc} onValueChange={(minCtc) => updateBand(index, { minCtc: minCtc as number })} /></Field><Field label="Salary to"><NumberInput aria-label={`Band ${index + 1} salary to`} min="0" placeholder="No limit" value={band.maxCtc} onValueChange={(maxCtc) => updateBand(index, { maxCtc })} /></Field><Field label="Amount"><NumberInput aria-label={`Band ${index + 1} amount`} min="0" value={band.amount} onValueChange={(amount) => updateBand(index, { amount: amount as number })} /></Field><Button type="button" size="icon" variant="ghost" className="self-end" aria-label={`Remove salary band ${index + 1}`} onClick={() => update({ bands: (value.bands ?? []).filter((_, current) => current !== index) }, ["bands"])}><Trash2 aria-hidden="true" className="h-4 w-4" /></Button></div>)}</div></div>}

      <details className="rounded-lg border border-edge p-4">
        <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Eligibility and presentation</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Minimum monthly salary" error={errors.eligibility}><NumberInput min="0" placeholder="No minimum" value={value.minCtc} aria-invalid={Boolean(errors.eligibility)} onValueChange={(minCtc) => update({ minCtc }, ["eligibility"])} /></Field>
          <Field label="Maximum monthly salary" error={errors.eligibility}><NumberInput min="0" placeholder="No maximum" value={value.maxCtc} aria-invalid={Boolean(errors.eligibility)} onValueChange={(maxCtc) => update({ maxCtc }, ["eligibility"])} /></Field>
          {value.kind === "reimbursement" && <><Field label="Reimbursement limit" error={errors.reimbursementLimit}><NumberInput min="0" value={value.reimbursementLimit} aria-invalid={Boolean(errors.reimbursementLimit)} onValueChange={(reimbursementLimit) => update({ reimbursementLimit }, ["reimbursementLimit"])} /></Field><Field label="Limit frequency" error={errors.reimbursementFrequency}><Select value={value.reimbursementFrequency ?? "monthly"} onChange={(event) => update({ reimbursementFrequency: event.target.value as PayrollComponentEditor["reimbursementFrequency"] }, ["reimbursementFrequency"])}><option value="monthly">Monthly</option><option value="annual">Annual</option><option value="per_claim">Per claim</option></Select></Field></>}
          <Field label="Register presentation"><Select value={value.registerPresentation ?? "included"} onChange={(event) => update({ registerPresentation: event.target.value as PayrollComponentEditor["registerPresentation"] })}><option value="included">Included in register</option><option value="separate">Separate register line</option><option value="hidden">Hidden from register</option></Select></Field>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2"><OptionCheck checked={value.active !== false} label="Active component" onChange={(checked) => update({ active: checked })} /><OptionCheck checked={value.visibleOnPayslip} label="Visible on payslip" onChange={(checked) => update({ visibleOnPayslip: checked })} />{value.kind === "earning" && <><OptionCheck checked={value.includeInGross} label="Included in gross" onChange={(checked) => update({ includeInGross: checked })} /><OptionCheck checked={value.pfWageBase} label="PF wage base" onChange={(checked) => update({ pfWageBase: checked }, ["pfWageBase"])} /><OptionCheck checked={value.esicWageBase === true} label="Included in ESI wage base metadata" onChange={(checked) => update({ esicWageBase: checked })} /><OptionCheck checked={value.taxWageBase === true} label="Included in tax wage base metadata" onChange={(checked) => update({ taxWageBase: checked })} /></>}</div>
        {errors.pfWageBase && <p role="alert" className="mt-2 text-xs text-destructive">{errors.pfWageBase}</p>}
      </details>

      {errors.form && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-foreground">{errors.form}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit">{editor.index === null ? "Add component" : "Save component"}</Button></div>
    </form>
  </Modal>;
}

type AssignmentEmployee = {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  department: { name: string } | null;
  payrollComponentAssignments: Array<{ id: string; effectiveFrom: string; effectiveTo: string | null; active: boolean }>;
};

function AssignmentDialog({ component, location, onClose }: { component: PayrollComponentEditor | null; location: Location | null; onClose: () => void }) {
  if (!component || !location) return null;
  return <AssignmentDialogContent key={`${location.id}:${component.code}`} component={component} location={location} onClose={onClose} />;
}

function AssignmentDialogContent({ component, location, onClose }: { component: PayrollComponentEditor; location: Location; onClose: () => void }) {
  const toast = useToast();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [employees, setEmployees] = useState<AssignmentEmployee[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [effectiveFrom, setEffectiveFrom] = useState(`${todayKey().slice(0, 7)}-01`);
  const [effectiveTo, setEffectiveTo] = useState("");
  const [busy, setBusy] = useState<"load" | "save" | null>("load");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ locationId: location.id, componentCode: component.code, page: String(page), ...(search ? { search } : {}) });
    setBusy("load");
    setError(null);
    fetch(`/api/payroll/component-assignments?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Could not load employees.");
        setEmployees(data.employees ?? []);
        setPagination(data.pagination ?? { page: 1, pages: 1, total: 0 });
      })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load employees."); })
      .finally(() => { if (!controller.signal.aborted) setBusy(null); });
    return () => controller.abort();
  }, [component.code, location.id, page, reload, search]);

  function toggle(employeeId: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(employeeId); else next.delete(employeeId);
      return next;
    });
  }

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected.size) return setError("Select at least one employee.");
    setBusy("save");
    setError(null);
    try {
      const response = await fetch("/api/payroll/component-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId: location.id, componentCode: component.code, employeeIds: [...selected], effectiveFrom, effectiveTo: effectiveTo || null }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not assign employees.");
      toast("success", `${selected.size} employee${selected.size === 1 ? "" : "s"} assigned.`);
      setSelected(new Set());
      setReload((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not assign employees.");
    } finally {
      setBusy(null);
    }
  }

  return <Modal open onClose={onClose} title={`Manage employees · ${component.label}`} description={`${location.name} · ${component.code} · assignments resolve on the first day of each payroll month`} size="xl">
    <div className="space-y-4">
      <form onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(searchInput.trim()); }} role="search" className="flex flex-col gap-2 sm:flex-row">
        <Field label="Search employees" className="flex-1"><Input value={searchInput} placeholder="Name or employee number" onChange={(event) => setSearchInput(event.target.value)} /></Field>
        <Button type="submit" variant="outline" className="sm:mt-6"><Search aria-hidden="true" className="h-4 w-4" />Search</Button>
      </form>

      {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-foreground">{error}</p>}
      <p aria-live="polite" className="text-xs text-muted-foreground">{busy === "load" ? "Loading employees..." : `${pagination.total} matching employee${pagination.total === 1 ? "" : "s"}. ${selected.size} selected.`}</p>

      <div className="overflow-x-auto rounded-lg border border-edge">
        <table className="w-full min-w-[42rem] text-left text-sm">
          <thead className="bg-tint text-xs uppercase tracking-wide text-muted-foreground"><tr><th scope="col" className="w-12 px-4 py-3">Select</th><th scope="col" className="px-4 py-3">Employee</th><th scope="col" className="px-4 py-3">Department</th><th scope="col" className="px-4 py-3">Existing assignments</th></tr></thead>
          <tbody className="divide-y divide-edge">{employees.map((employee) => <tr key={employee.id} className="align-top"><td className="px-4 py-3"><input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" aria-label={`Select ${employee.firstName} ${employee.lastName}`} checked={selected.has(employee.id)} onChange={(event) => toggle(employee.id, event.target.checked)} /></td><td className="px-4 py-3"><p className="font-semibold">{employee.firstName} {employee.lastName}</p><p className="text-xs text-muted-foreground">{employee.employeeNumber}</p></td><td className="px-4 py-3 text-muted-foreground">{employee.department?.name ?? "Not assigned"}</td><td className="px-4 py-3 text-xs text-muted-foreground">{employee.payrollComponentAssignments.length ? employee.payrollComponentAssignments.map((assignment) => <span key={assignment.id} className="mb-1 block">{dateLabel(assignment.effectiveFrom)} to {assignment.effectiveTo ? dateLabel(assignment.effectiveTo) : "ongoing"}</span>) : "None"}</td></tr>)}</tbody>
        </table>
        {!busy && employees.length === 0 && <div className="p-8 text-center"><p className="font-semibold">No matching employees</p><p className="mt-1 text-sm text-muted-foreground">Try a different name or employee number in this location.</p></div>}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Page {pagination.page} of {pagination.pages}</p>
        <div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={page <= 1 || busy === "load"} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button><Button type="button" size="sm" variant="outline" disabled={page >= pagination.pages || busy === "load"} onClick={() => setPage((value) => value + 1)}>Next</Button></div>
      </div>

      <form onSubmit={assign} className="rounded-lg border border-edge bg-tint/30 p-4">
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Effective from" hint="Use the first day of the first payroll month."><Input type="date" required value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></Field><Field label="Effective until (optional)"><Input type="date" min={effectiveFrom} value={effectiveTo} onChange={(event) => setEffectiveTo(event.target.value)} /></Field></div>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end"><Button type="button" variant="ghost" onClick={onClose}>Close</Button><Button type="submit" loading={busy === "save"} disabled={!selected.size || busy === "load"}><Users aria-hidden="true" className="h-4 w-4" />Assign selected</Button></div>
      </form>
    </div>
  </Modal>;
}

type PlanEmployee = { id: string; employeeNumber: string; firstName: string; lastName: string; department: { name: string } | null; payrollComponentAssignments: Array<{ componentCode: string }> };

function MessPlanDialog({ components, location, onClose }: { components: PayrollComponentEditor[] | null; location: Location | null; onClose: () => void }) {
  if (!components?.length || !location) return null;
  return <MessPlanDialogContent key={`${location.id}:${components.map((component) => component.code).join(":")}`} components={components} location={location} onClose={onClose} />;
}

function MessPlanDialogContent({ components, location, onClose }: { components: PayrollComponentEditor[]; location: Location; onClose: () => void }) {
  const toast = useToast();
  const [employees, setEmployees] = useState<PlanEmployee[]>([]);
  const [plans, setPlans] = useState<Record<string, string>>({});
  const [initialPlans, setInitialPlans] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPlan, setBulkPlan] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [effectiveMonth, setEffectiveMonth] = useState(todayKey().slice(0, 7));
  const [busy, setBusy] = useState<"load" | "save" | null>("load");
  const [error, setError] = useState<string | null>(null);
  const codes = components.map((component) => component.code);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ locationId: location.id, componentCodes: codes.join(","), page: String(page) });
    setBusy("load"); setError(null);
    fetch(`/api/payroll/component-plans?${query}`, { signal: controller.signal }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not load employee plans.");
      const loaded = data.employees ?? [];
      const current = Object.fromEntries(loaded.map((employee: PlanEmployee) => [employee.id, employee.payrollComponentAssignments[0]?.componentCode ?? ""]));
      setEmployees(loaded); setPagination(data.pagination ?? { page: 1, pages: 1, total: 0 }); setPlans(current); setInitialPlans(current); setSelected(new Set());
    }).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load employee plans."); }).finally(() => { if (!controller.signal.aborted) setBusy(null); });
    return () => controller.abort();
  }, [codes.join(","), location.id, page]);

  const changed = employees.filter((employee) => (plans[employee.id] ?? "") !== (initialPlans[employee.id] ?? ""));
  async function save() {
    if (!changed.length) return;
    setBusy("save"); setError(null);
    try {
      const response = await fetch("/api/payroll/component-plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locationId: location.id, componentCodes: codes, month: effectiveMonth, plans: changed.map((employee) => ({ employeeId: employee.id, componentCode: plans[employee.id] || null })) }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not save employee plans.");
      toast("success", `${changed.length} Mess plan${changed.length === 1 ? "" : "s"} updated.`);
      setInitialPlans(plans);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save employee plans."); } finally { setBusy(null); }
  }

  const visibleIds = new Set(employees.map((employee) => employee.id));
  const allVisibleSelected = employees.length > 0 && employees.every((employee) => selected.has(employee.id));
  function toggleVisible() { setSelected((current) => allVisibleSelected ? new Set([...current].filter((id) => !visibleIds.has(id))) : new Set([...current, ...visibleIds])); }
  function applyBulkPlan() { if (!selected.size) return; setPlans((current) => ({ ...current, ...Object.fromEntries([...selected].filter((id) => visibleIds.has(id)).map((id) => [id, bulkPlan])) })); }

  return <Modal open onClose={onClose} title="Manage Mess plans" description={`${location.name} · assign one Mess plan per employee for a payroll month. No Mess removes the deduction from that month.`} size="xl">
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-foreground">{error}</p>}
      <p aria-live="polite" className="text-xs text-muted-foreground">{busy === "load" ? "Loading employees..." : `${pagination.total} employees. ${selected.size} selected. ${changed.length} changed on this page.`}</p>
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-edge bg-tint/30 p-3"><Button type="button" size="sm" variant="outline" disabled={!employees.length} onClick={toggleVisible}>{allVisibleSelected ? "Clear visible" : "Select visible"}</Button><Button type="button" size="sm" variant="ghost" disabled={!selected.size} onClick={() => setSelected(new Set())}>Clear selection</Button><div className="min-w-52 flex-1"><Field label="Plan for selected employees"><Select aria-label="Mess plan for selected employees" value={bulkPlan} onChange={(event) => setBulkPlan(event.target.value)}><option value="">No Mess</option>{components.map((component) => <option key={component.code} value={component.code}>{component.amount.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })} per month</option>)}</Select></Field></div><Button type="button" size="sm" disabled={!selected.size} onClick={applyBulkPlan}>Apply to selected</Button></div>
      <div className="overflow-x-auto rounded-lg border border-edge"><table className="w-full min-w-[42rem] text-left text-sm"><thead className="bg-tint text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="w-12 px-4 py-3">Select</th><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Department</th><th className="px-4 py-3">Mess plan</th></tr></thead><tbody className="divide-y divide-edge">{employees.map((employee) => <tr key={employee.id}><td className="px-4 py-3"><input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" aria-label={`Select ${employee.firstName} ${employee.lastName}`} checked={selected.has(employee.id)} onChange={(event) => setSelected((current) => { const next = new Set(current); event.target.checked ? next.add(employee.id) : next.delete(employee.id); return next; })} /></td><td className="px-4 py-3"><p className="font-semibold">{employee.firstName} {employee.lastName}</p><p className="text-xs text-muted-foreground">{employee.employeeNumber}</p></td><td className="px-4 py-3 text-muted-foreground">{employee.department?.name ?? "Not assigned"}</td><td className="px-4 py-3"><Select aria-label={`Mess plan for ${employee.firstName} ${employee.lastName}`} value={plans[employee.id] ?? ""} onChange={(event) => setPlans((current) => ({ ...current, [employee.id]: event.target.value }))}><option value="">No Mess</option>{components.map((component) => <option key={component.code} value={component.code}>{component.amount.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })} per month</option>)}</Select></td></tr>)}</tbody></table></div>
      <div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Page {pagination.page} of {pagination.pages}</p><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={page <= 1 || busy === "load"} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button type="button" size="sm" variant="outline" disabled={page >= pagination.pages || busy === "load"} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div>
      <div className="flex flex-col gap-3 rounded-lg border border-edge bg-tint/30 p-4 sm:flex-row sm:items-end sm:justify-between"><div className="w-full sm:max-w-xs"><Field label="Effective payroll month" hint="Assignments take effect on the first day of this month."><Input type="month" required value={effectiveMonth} onChange={(event) => setEffectiveMonth(event.target.value)} /></Field></div><div className="flex gap-2"><Button type="button" variant="ghost" onClick={onClose}>Close</Button><Button type="button" loading={busy === "save"} disabled={!changed.length || busy === "load"} onClick={() => void save()}>Save changed plans</Button></div></div>
    </div>
  </Modal>;
}

function TaxDetailsSection({ draft, selectedLocation, organization, errors, onChange }: { draft: PayrollPolicyEditorDraft; selectedLocation: Location | null; organization: Organization; errors: FieldErrors; onChange: (draft: PayrollPolicyEditorDraft, clear?: string[]) => void }) {
  const profile = selectedLocation?.profile;
  const details = {
    name: profile?.legalName ?? profile?.displayName ?? organization.name,
    address: profile?.address ?? organization.address,
    email: profile?.contactEmail ?? organization.email,
    phone: profile?.contactPhone ?? organization.phone,
    taxId: profile?.taxId ?? organization.taxId,
    registrationNo: profile?.registrationNo ?? organization.registrationNo,
  };
  function update(patch: Partial<PayrollPolicyEditorDraft["statutory"]>) {
    onChange({ ...draft, statutory: { ...draft.statutory, ...patch } }, ["form"]);
  }

  return <SectionPanel title="Tax Details" description="Company identity already collected in PeopleNexa, plus the operational TDS setting used by payroll. This is not a filing-readiness checklist." action={<Link href="/admin/configuration" className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-primary hover:bg-tint">Open Company Profile<ExternalLink aria-hidden="true" className="h-3.5 w-3.5" /></Link>}>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,.8fr)]">
      <div className="overflow-hidden rounded-xl border border-edge">
        <div className="flex items-center gap-3 border-b border-edge bg-tint p-4"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Building2 aria-hidden="true" className="h-5 w-5" /></span><div><h3 className="font-semibold">{details.name}</h3><p className="text-xs text-muted-foreground">{selectedLocation ? `${selectedLocation.name} profile with company fallback` : "Company profile"}</p></div></div>
        <dl className="grid sm:grid-cols-2">
          <TaxDetail label="Tax identifier" value={details.taxId} />
          <TaxDetail label="Company registration" value={details.registrationNo} />
          <TaxDetail label="Address" value={details.address} />
          <TaxDetail label="Contact" value={[details.email, details.phone].filter(Boolean).join(" · ") || null} />
        </dl>
        <div className="border-t border-edge p-4 text-xs leading-5 text-muted-foreground"><strong className="text-foreground">Not collected yet:</strong> PeopleNexa does not currently provide separate TAN or Assessing Officer code fields. Their absence here is not a statement about registration or Form 16 filing readiness.</div>
      </div>
      <div className="space-y-4 rounded-xl border border-edge bg-tint/30 p-4">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-primary">Operational TDS setting</p><p className="mt-1 text-sm text-muted-foreground">Saved with the same policy draft as schedule, statutory, and salary components.</p></div>
        <SwitchRow checked={draft.statutory.tdsEnabled} label="Enable TDS calculation" description="Uses the selected payroll tax regime for eligible employees." onChange={(checked) => update({ tdsEnabled: checked })} />
        <Field label="Tax regime" error={errors.tdsRegime}><Select value={draft.statutory.tdsRegime} onChange={(event) => update({ tdsRegime: event.target.value as "new" | "old" })}><option value="new">New regime</option><option value="old">Old regime</option></Select></Field>
      </div>
    </div>
  </SectionPanel>;
}

function TaxDetail({ label, value }: { label: string; value: string | null }) {
  return <div className="border-b border-edge p-4 last:border-b-0 sm:odd:border-r sm:[&:nth-last-child(-n+2)]:border-b-0"><dt className="text-xs font-semibold text-muted-foreground">{label}</dt><dd className={`mt-1 text-sm ${value ? "font-medium text-foreground" : "text-amber-300"}`}>{value || "Not collected yet"}</dd></div>;
}

function AdvancedSection({ draft, effectiveFrom, effectiveTo, setEffectiveTo, selectedLocation, selectedLocationId, records, preview, busy, errors, onChange, onRequestToggle }: { draft: PayrollPolicyEditorDraft; effectiveFrom: string; effectiveTo: string; setEffectiveTo: (value: string) => void; selectedLocation: Location | null; selectedLocationId: string | null; records: PolicyRecord[]; preview: PreviewResult | null; busy: string | null; errors: FieldErrors; onChange: (draft: PayrollPolicyEditorDraft, clear?: string[]) => void; onRequestToggle: (record: PolicyRecord) => void }) {
  const [ruleEditor, setRuleEditor] = useState<{ index: number | null; value: PayrollStatutoryRuleEditor } | null>(null);
  const [removeRule, setRemoveRule] = useState<number | null>(null);
  const scopeRecords = records.filter((record) => record.locationId === selectedLocationId);
  const currentPublished = scopeRecords.find((record) => record.active) ?? null;
  const currentDraft = scopeRecords.find((record) => !record.active && (!currentPublished || record.version > currentPublished.version)) ?? null;
  const visibleRecords = [currentDraft, currentPublished].filter((record): record is PolicyRecord => Boolean(record));

  function saveRule(index: number | null, rule: PayrollStatutoryRuleEditor) {
    const next = index === null ? [...draft.statutoryRules, rule] : draft.statutoryRules.map((current, currentIndex) => currentIndex === index ? rule : current);
    onChange({ ...draft, statutoryRules: next }, ["statutoryRules", "form"]);
    setRuleEditor(null);
  }

  function removeSelectedRule() {
    if (removeRule === null) return;
    onChange({ ...draft, statutoryRules: draft.statutoryRules.filter((_, index) => index !== removeRule) }, ["statutoryRules", "form"]);
    setRemoveRule(null);
  }

  return <div className="space-y-4">
    <SectionPanel title="Policy Controls" description="Source provenance, legal review metadata, policy end date, and the current draft preview live here rather than in the day-to-day settings.">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-edge p-4"><p className="text-xs font-semibold text-muted-foreground">Draft scope</p><p className="mt-1 font-semibold">{selectedLocation?.name ?? "Tenant default template"}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{selectedLocation ? "Creates a location-specific draft, even when its seed was inherited from the tenant template." : "Template context only; operational payroll still resolves through a selected location."}</p></div>
        <div className="rounded-lg border border-edge p-4"><p className="text-xs font-semibold text-muted-foreground">Effective from</p><p className="mt-1 font-semibold">{effectiveFrom ? dateLabel(effectiveFrom) : "Not selected"}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">The policy is resolved against each payroll month.</p></div>
        <div className="rounded-lg border border-edge p-4"><Field label="Effective until (optional)" error={errors.effectiveTo} hint="Leave blank for no planned end date."><Input type="date" min={effectiveFrom} value={effectiveTo} aria-invalid={Boolean(errors.effectiveTo)} onChange={(event) => setEffectiveTo(event.target.value)} /></Field></div>
      </div>
    </SectionPanel>

    <SectionPanel title="Statutory Sources" description="Document where an operating threshold or jurisdiction came from and whether it has been reviewed. These records do not certify the policy automatically." action={<Button type="button" size="sm" variant="outline" disabled={draft.statutoryRules.length >= 50} onClick={() => setRuleEditor({ index: null, value: blankRule(effectiveFrom) })}><Plus aria-hidden="true" className="h-4 w-4" />Add source</Button>}>
      {errors.statutoryRules && <p role="alert" className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-foreground">{errors.statutoryRules}</p>}
      {draft.statutoryRules.length === 0 ? <div className="rounded-lg border border-dashed border-edge p-6 text-sm text-muted-foreground">No source metadata has been recorded for this draft. Calculator values remain operating inputs, not verified law.</div> : <div className="divide-y divide-edge overflow-hidden rounded-lg border border-edge">{draft.statutoryRules.map((rule, index) => <article key={`${rule.jurisdiction}:${rule.ruleVersion}:${index}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{rule.jurisdiction} · {rule.establishment}</h3><ReviewStatus status={rule.reviewStatus} /></div><p className="mt-1 text-xs leading-5 text-muted-foreground">Version {rule.ruleVersion} · effective {dateLabel(rule.effectiveFrom)}{rule.effectiveTo ? ` to ${dateLabel(rule.effectiveTo)}` : " onward"}</p><p className="mt-1 break-words text-xs text-muted-foreground">{rule.sourceReference}</p></div><div className="flex gap-1"><Button type="button" size="icon" variant="ghost" aria-label={`Edit source ${rule.jurisdiction}`} onClick={() => setRuleEditor({ index, value: cloneValue(rule) })}><Edit3 aria-hidden="true" className="h-4 w-4" /></Button><Button type="button" size="icon" variant="ghost" aria-label={`Remove source ${rule.jurisdiction}`} onClick={() => setRemoveRule(index)}><Trash2 aria-hidden="true" className="h-4 w-4" /></Button></div></article>)}</div>}
    </SectionPanel>

    <SectionPanel title="Preview Changes" description="A server-side shadow comparison. Preview never creates a configuration record or changes a payroll run.">
      {!preview ? <div className="flex items-start gap-3 rounded-lg border border-dashed border-edge p-5"><Eye aria-hidden="true" className="mt-0.5 h-5 w-5 text-primary" /><div><p className="font-semibold">No preview generated yet</p><p className="mt-1 text-sm text-muted-foreground">Use Preview changes in the action bar to validate the complete draft and compare operating inputs.</p></div></div> : <div className="space-y-4"><div className="rounded-lg border border-sky-500/25 bg-sky-500/10 p-3 text-xs leading-5 text-foreground">Effective {dateLabel(preview.effectiveFrom)} · stored source: <strong>{preview.resolvedStoredSource}</strong> · comparison source: <strong>{preview.currentBehaviorSource}</strong> · {preview.affectedEmployees} active employee{preview.affectedEmployees === 1 ? "" : "s"} in scope.</div><div className="overflow-hidden rounded-lg border border-edge"><div className="hidden grid-cols-[1.2fr_1fr_1fr] bg-tint px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid"><span>Rule</span><span>Current</span><span>Proposed</span></div><div className="divide-y divide-edge">{preview.payroll.map((row) => <div key={row.label} className={`grid gap-1 px-4 py-3 text-sm sm:grid-cols-[1.2fr_1fr_1fr] sm:gap-3 ${row.changed ? "bg-amber-500/5" : ""}`}><strong>{row.label}</strong><span className="text-muted-foreground"><span className="sm:hidden">Current: </span>{previewValue(row.current)}</span><span><span className="sm:hidden">Proposed: </span>{previewValue(row.proposed)}</span></div>)}</div></div></div>}
    </SectionPanel>

    <SectionPanel title="Current Policy" description={`The working draft and current published policy for ${selectedLocation?.name ?? "the tenant default template"}. Intermediate drafts are retained in the audit log, not shown to HR.`}>
      {visibleRecords.length === 0 ? <div className="rounded-lg border border-dashed border-edge p-6 text-sm text-muted-foreground">No policy exists for this scope. Save the current editor as a draft first.</div> : <div className="space-y-2">{visibleRecords.map((record) => <article key={record.id} className="flex flex-col gap-3 rounded-lg border border-edge p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{record.active ? "Current policy" : "Working draft"}</p><StatusLabel active={record.active} activeText="Published" inactiveText="Draft" /></div><p className="mt-1 text-xs leading-5 text-muted-foreground">Effective {dateLabel(record.effectiveFrom)}{record.effectiveTo ? ` to ${dateLabel(record.effectiveTo)}` : " onward"} · {componentCount(record.payload)} component{componentCount(record.payload) === 1 ? "" : "s"} · saved {dateLabel(record.updatedAt ?? record.createdAt)}</p></div><Button type="button" size="sm" variant={record.active ? "outline" : "primary"} loading={busy === record.id} disabled={Boolean(busy && busy !== record.id)} onClick={() => onRequestToggle(record)}>{record.active ? "Deactivate" : <><CheckCircle2 aria-hidden="true" className="h-4 w-4" />Publish policy</>}</Button></article>)}</div>}
    </SectionPanel>

    <details id="register-field-reference" className="rounded-xl border border-edge bg-card p-4 shadow-sm sm:p-5">
      <summary className="cursor-pointer font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Register field reference</summary>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Reference-only mapping for payroll register columns. It does not add settings or change calculations.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[...new Set(payrollFieldMappings.map((field) => field.group))].map((group) => <div key={group} className="rounded-lg border border-edge p-3"><p className="text-xs font-semibold uppercase tracking-wide text-primary">{group}</p><ul className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">{payrollFieldMappings.filter((field) => field.group === group).map((field) => <li key={field.column}>{field.column} · {field.source}</li>)}</ul></div>)}</div>
    </details>

    <RuleDialog editor={ruleEditor} onClose={() => setRuleEditor(null)} onSave={saveRule} />
    <ConfirmDialog open={removeRule !== null} title="Remove source metadata?" description="The source entry will be removed only from this unsaved draft. Calculator values are not changed." onCancel={() => setRemoveRule(null)} onConfirm={removeSelectedRule} />
  </div>;
}

function RuleDialog({ editor, onClose, onSave }: { editor: { index: number | null; value: PayrollStatutoryRuleEditor } | null; onClose: () => void; onSave: (index: number | null, rule: PayrollStatutoryRuleEditor) => void }) {
  if (!editor) return null;
  return <RuleDialogContent key={`${editor.index ?? "new"}:${editor.value.ruleVersion}`} editor={editor} onClose={onClose} onSave={onSave} />;
}

function RuleDialogContent({ editor, onClose, onSave }: { editor: { index: number | null; value: PayrollStatutoryRuleEditor }; onClose: () => void; onSave: (index: number | null, rule: PayrollStatutoryRuleEditor) => void }) {
  const [value, setValue] = useState(() => cloneValue(editor.value));
  const [errors, setErrors] = useState<FieldErrors>({});
  function update(patch: Partial<PayrollStatutoryRuleEditor>) { setValue((current) => ({ ...current, ...patch })); setErrors({}); }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = validateRule(value);
    setErrors(next);
    if (Object.keys(next).length) return;
    onSave(editor.index, { ...value, jurisdiction: value.jurisdiction.trim(), establishment: value.establishment.trim(), ruleVersion: value.ruleVersion.trim(), sourceReference: value.sourceReference.trim() });
  }
  return <Modal open onClose={onClose} title={editor.index === null ? "Add statutory source" : "Edit statutory source"} description="Record provenance and review status without presenting it as certified law." size="lg"><form onSubmit={save} className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><Field label="Jurisdiction" error={errors.jurisdiction}><Input value={value.jurisdiction} maxLength={100} aria-invalid={Boolean(errors.jurisdiction)} onChange={(event) => update({ jurisdiction: event.target.value })} /></Field><Field label="Establishment or entity" error={errors.establishment}><Input value={value.establishment} maxLength={120} aria-invalid={Boolean(errors.establishment)} onChange={(event) => update({ establishment: event.target.value })} /></Field><Field label="Rule version" error={errors.ruleVersion}><Input value={value.ruleVersion} maxLength={80} aria-invalid={Boolean(errors.ruleVersion)} onChange={(event) => update({ ruleVersion: event.target.value })} /></Field><Field label="Legal review status" error={errors.reviewStatus}><Select value={value.reviewStatus} onChange={(event) => update({ reviewStatus: event.target.value as PayrollStatutoryRuleEditor["reviewStatus"] })}><option value="draft">Draft</option><option value="pending_legal_review">Pending legal review</option><option value="verified">Verified</option><option value="superseded">Superseded</option></Select></Field><Field label="Source URL or document identifier" error={errors.sourceReference} className="sm:col-span-2"><Input value={value.sourceReference} maxLength={2048} aria-invalid={Boolean(errors.sourceReference)} onChange={(event) => update({ sourceReference: event.target.value })} /></Field><Field label="Source effective from" error={errors.ruleDates}><Input type="date" value={value.effectiveFrom} aria-invalid={Boolean(errors.ruleDates)} onChange={(event) => update({ effectiveFrom: event.target.value })} /></Field><Field label="Source effective until" error={errors.ruleDates}><Input type="date" value={value.effectiveTo ?? ""} aria-invalid={Boolean(errors.ruleDates)} onChange={(event) => update({ effectiveTo: event.target.value || null })} /></Field></div><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit">Save source</Button></div></form></Modal>;
}

function SwitchRow({ checked, label, description, onChange }: { checked: boolean; label: string; description: string; onChange: (checked: boolean) => void }) {
  return <div className="flex items-center justify-between gap-4 rounded-lg border border-edge bg-card p-3.5"><div><p className="text-sm font-semibold">{label}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p></div><button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className="flex h-11 w-12 shrink-0 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className={`relative h-6 w-11 rounded-full transition-colors ${checked ? "bg-primary" : "bg-muted"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} /></span></button></div>;
}

function OptionCheck({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-edge px-3 text-sm"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />{label}</label>;
}

function InclusionList({ component }: { component: PayrollComponentEditor }) {
  const included = [component.includeInGross && "Gross", component.pfWageBase && "PF", component.esicWageBase && "ESI"].filter(Boolean) as string[];
  return <div className="flex flex-wrap gap-1">{included.length ? included.map((item) => <span key={item} className="rounded-full border border-edge bg-tint px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{item}</span>) : <span className="text-xs text-muted-foreground">Not applicable</span>}</div>;
}

function StatusLabel({ active, activeText = "Active", inactiveText = "Inactive" }: { active: boolean; activeText?: string; inactiveText?: string }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${active ? "border-emerald-600/30 bg-emerald-500/10 text-emerald-300" : "border-edge bg-tint text-muted-foreground"}`}>{active ? activeText : inactiveText}</span>;
}

function ReviewStatus({ status }: { status: PayrollStatutoryRuleEditor["reviewStatus"] }) {
  const labels = { draft: "Draft", verified: "Verified", superseded: "Superseded", pending_legal_review: "Pending legal review" };
  const tone = status === "verified" ? "border-emerald-600/30 bg-emerald-500/10 text-emerald-300" : status === "pending_legal_review" ? "border-amber-600/30 bg-amber-500/10 text-amber-300" : "border-edge bg-tint text-muted-foreground";
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{labels[status]}</span>;
}

function blankComponent(kind: PayrollComponentEditor["kind"]): PayrollComponentEditor {
  return {
    code: "",
    label: "",
    kind,
    formula: "fixed",
    amount: 0,
    minCtc: null,
    maxCtc: null,
    includeInGross: kind === "earning",
    visibleOnPayslip: true,
    pfWageBase: false,
    taxWageBase: false,
    esicWageBase: false,
    active: true,
    reimbursementLimit: null,
    reimbursementFrequency: kind === "reimbursement" ? "monthly" : null,
    registerPresentation: "included",
    prorationBasis: "none",
    applicability: "all",
  };
}

function blankRule(effectiveFrom: string): PayrollStatutoryRuleEditor {
  return { jurisdiction: "", establishment: "", ruleVersion: "", sourceReference: "", reviewStatus: "draft", effectiveFrom, effectiveTo: null };
}

function validatePolicy(draft: PayrollPolicyEditorDraft, effectiveFrom: string, effectiveTo: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) errors.effectiveFrom = "Choose a valid effective-from date.";
  if (effectiveTo && (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveTo) || effectiveTo < effectiveFrom)) errors.effectiveTo = "Effective until must be on or after effective from.";
  if (!Number.isInteger(draft.monthlyDivisor) || draft.monthlyDivisor < 1 || draft.monthlyDivisor > 366) errors.monthlyDivisor = "Enter a whole-number divisor from 1 to 366.";
  if (!(["fixed_divisor", "calendar_days"] as string[]).includes(draft.salaryDivisorMethod)) errors.salaryDivisorMethod = "Choose a supported salary calculation.";
  if (!(["two_decimals", "floor_rupee", "nearest_rupee"] as string[]).includes(draft.earnedSalaryRounding)) errors.earnedSalaryRounding = "Choose a supported earned-salary rounding mode.";
  if (!(["rounded_total", "sum_rounded_components"] as string[]).includes(draft.earnedSalaryAggregation)) errors.earnedSalaryAggregation = "Choose a supported component rounding total.";
  if (!Number.isFinite(draft.overtimeMultiplier) || draft.overtimeMultiplier < 0 || draft.overtimeMultiplier > 10) errors.overtimeMultiplier = "Enter an overtime multiplier from 0 to 10.";
  if (!Number.isInteger(draft.attendanceTreatment.noShiftAttendanceWindowHours) || draft.attendanceTreatment.noShiftAttendanceWindowHours < 1 || draft.attendanceTreatment.noShiftAttendanceWindowHours > 24) errors.noShiftAttendanceWindowHours = "Enter a whole-number attendance window from 1 to 24 hours.";
  if (!Number.isInteger(draft.statutory.pfWageCeiling) || draft.statutory.pfWageCeiling < 0) errors.pfWageCeiling = "Enter a non-negative whole-number PF wage ceiling.";
  if (!Number.isInteger(draft.statutory.esicGrossCeiling) || draft.statutory.esicGrossCeiling < 0) errors.esicGrossCeiling = "Enter a non-negative whole-number ESI gross ceiling.";
  if (draft.statutory.professionalTaxState.length > 80) errors.professionalTaxState = "Keep the Professional Tax jurisdiction within 80 characters.";
  if (!(["new", "old"] as string[]).includes(draft.statutory.tdsRegime)) errors.tdsRegime = "Choose a supported TDS regime.";
  if (draft.schedule.payDateRule === "fixed_day" && !validDay(draft.schedule.payDay)) errors.payDay = "Enter a fixed pay day from 1 to 31.";
  if (draft.schedule.payDateRule === "last_day" && draft.schedule.payDay !== undefined) errors.payDay = "Remove the fixed pay day when using the last day of the month.";
  for (const [key, value] of [["attendanceCutoffDay", draft.schedule.attendanceCutoffDay], ["adjustmentCutoffDay", draft.schedule.adjustmentCutoffDay], ["reimbursementCutoffDay", draft.schedule.reimbursementCutoffDay]] as const) {
    if (value !== null && value !== undefined && !validDay(value)) errors[key] = "Enter a cutoff day from 1 to 31, or leave it blank.";
  }
  if (draft.statutoryRules.some((rule) => Object.keys(validateRule(rule)).length > 0)) errors.statutoryRules = "Complete every statutory source, review status, and effective date range.";
  const precedingCodes = new Set<string>();
  for (const [index, component] of draft.components.entries()) {
    const componentErrors = validateComponent(component, draft.components, index);
    if (Object.keys(componentErrors).length || component.formula === "percent_of_component" && !precedingCodes.has(component.basisComponentCode ?? "")) {
      errors.components = "Review salary components for unique codes, valid calculation values, one PF wage base, and references to earlier components.";
      break;
    }
    precedingCodes.add(component.code);
  }
  if (!payrollPolicyDraft(draft)) {
    errors.form = errors.form ?? "One or more policy or component values are incomplete. Review the highlighted section before saving.";
    if (!errors.components && draft.components.length > 30) errors.components = "A policy can contain at most 30 salary components.";
  }
  return errors;
}

function validateComponent(component: PayrollComponentEditor, components: PayrollComponentEditor[], index: number | null): FieldErrors {
  const errors: FieldErrors = {};
  const code = component.code.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{0,29}$/.test(code)) errors.code = "Use 1 to 30 uppercase letters, numbers, or underscores, starting with a letter.";
  if (components.some((candidate, candidateIndex) => candidateIndex !== index && candidate.code.toUpperCase() === code)) errors.code = "This component code is already in use.";
  if (!component.label.trim() || component.label.trim().length > 80) errors.label = "Enter a component name up to 80 characters.";
  if (!Number.isFinite(component.amount) || component.amount < 0 || component.amount > 10_000_000) errors.amount = "Enter a non-negative amount or percentage.";
  if ((component.formula === "variable" || component.formula === "one_time") && component.amount !== 0) errors.amount = "Variable and one-time catalog entries must keep amount at zero.";
  if (component.formula === "percent_of_component" && !component.basisComponentCode) errors.basisComponentCode = "Choose an earlier base component.";
  if (component.minCtc !== null && (!Number.isFinite(component.minCtc) || component.minCtc < 0) || component.maxCtc !== null && (!Number.isFinite(component.maxCtc) || component.maxCtc < 0) || component.minCtc !== null && component.maxCtc !== null && component.minCtc > component.maxCtc) errors.eligibility = "Enter a valid salary eligibility range.";
  if (component.effectiveFrom && !/^\d{4}-\d{2}-\d{2}$/.test(component.effectiveFrom) || component.effectiveTo && (!/^\d{4}-\d{2}-\d{2}$/.test(component.effectiveTo) || Boolean(component.effectiveFrom && component.effectiveTo < component.effectiveFrom))) errors.componentDates = "Enter a valid component effective date range.";
  if (component.pfWageBase && (component.kind !== "earning" || components.some((candidate, candidateIndex) => candidateIndex !== index && candidate.pfWageBase))) errors.pfWageBase = "Only one earning component can be the PF wage base.";
  if (!(["none", "payable_days", "present_days"] as string[]).includes(component.prorationBasis)) errors.prorationBasis = "Choose a supported proration basis.";
  if (!(["all", "assigned_employees"] as string[]).includes(component.applicability)) errors.applicability = "Choose who receives this component.";
  if (component.prorationRounding && !(["two_decimals", "floor_rupee", "nearest_rupee"] as string[]).includes(component.prorationRounding)) errors.prorationRounding = "Choose a supported proration rounding mode.";
  if (component.kind === "reimbursement" && !(["monthly", "annual", "per_claim"] as unknown[]).includes(component.reimbursementFrequency)) errors.reimbursementFrequency = "Choose a reimbursement limit frequency.";
  if (component.reimbursementLimit !== null && component.reimbursementLimit !== undefined && (!Number.isFinite(component.reimbursementLimit) || component.reimbursementLimit < 0)) errors.reimbursementLimit = "Enter a non-negative reimbursement limit.";
  if (component.formula === "salary_band_fixed") {
    const bands = component.bands ?? [];
    const sorted = [...bands].sort((a, b) => a.minCtc - b.minCtc);
    if (!bands.length || bands.some((band) => ![band.minCtc, band.amount].every((value) => Number.isFinite(value) && value >= 0) || band.maxCtc !== null && (!Number.isFinite(band.maxCtc) || band.maxCtc < band.minCtc)) || sorted.some((band, bandIndex) => bandIndex > 0 && sorted[bandIndex - 1].maxCtc !== null && sorted[bandIndex - 1].maxCtc! >= band.minCtc)) errors.bands = "Add at least one valid, non-overlapping salary band.";
  }
  return errors;
}

function validateRule(rule: PayrollStatutoryRuleEditor): FieldErrors {
  const errors: FieldErrors = {};
  if (!rule.jurisdiction.trim() || rule.jurisdiction.trim().length > 100) errors.jurisdiction = "Enter a jurisdiction up to 100 characters.";
  if (!rule.establishment.trim() || rule.establishment.trim().length > 120) errors.establishment = "Enter an establishment or entity up to 120 characters.";
  if (!rule.ruleVersion.trim() || rule.ruleVersion.trim().length > 80) errors.ruleVersion = "Enter a source rule version up to 80 characters.";
  if (!rule.sourceReference.trim() || rule.sourceReference.trim().length > 2048) errors.sourceReference = "Enter a source URL or document identifier.";
  if (!(["draft", "verified", "superseded", "pending_legal_review"] as string[]).includes(rule.reviewStatus)) errors.reviewStatus = "Choose a legal review status.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rule.effectiveFrom) || rule.effectiveTo && (!/^\d{4}-\d{2}-\d{2}$/.test(rule.effectiveTo) || rule.effectiveTo < rule.effectiveFrom)) errors.ruleDates = "Enter a valid source effective date range.";
  return errors;
}

function componentCalculation(component: PayrollComponentEditor) {
  let calculation: string;
  if (component.formula === "fixed") calculation = `${money(component.amount)} monthly`;
  else if (component.formula === "percent_of_ctc") calculation = `${component.amount}% of monthly salary`;
  else if (component.formula === "percent_of_component") calculation = `${component.amount}% of ${component.basisComponentCode}`;
  else if (component.formula === "salary_band_fixed") calculation = `${component.bands?.length ?? 0} salary band${component.bands?.length === 1 ? "" : "s"}`;
  else if (component.formula === "variable") return "Variable · not auto-calculated";
  else return "One-time · not auto-calculated";
  const proration = component.prorationBasis === "payable_days" ? "payable days" : component.prorationBasis === "present_days" ? "present days" : "not prorated";
  const applicability = component.applicability === "assigned_employees" ? "selected employees" : "all employees";
  return `${calculation} · ${proration} · ${applicability}`;
}

function componentCount(payload: unknown) {
  return payload && typeof payload === "object" && Array.isArray((payload as { components?: unknown }).components) ? (payload as { components: unknown[] }).components.length : 0;
}

function validDay(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 31;
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function dateKey(value: Date | string) {
  return new Date(value).toISOString().slice(0, 10);
}

function dateLabel(value: Date | string) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(`${value}T12:00:00.000Z`) : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function money(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 }).format(value);
}

function roundingLabel(value: PayrollPolicyEditorDraft["earnedSalaryRounding"]) {
  if (value === "floor_rupee") return "Round down to whole rupee";
  if (value === "nearest_rupee") return "Nearest whole rupee";
  return "Two decimals";
}

function previewValue(value: unknown) {
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  if (value === null || value === undefined || value === "") return "Not set";
  return String(value);
}
