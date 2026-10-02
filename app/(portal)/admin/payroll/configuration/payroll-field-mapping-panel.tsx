"use client";

import { useState } from "react";
import { ArrowUpRight, Calculator, Info, MapPinned, ShieldAlert } from "lucide-react";
import { payrollFieldMappings, type PayrollFieldMapping } from "@/lib/payroll-field-mapping";
import { leavePolicyDraft, payrollPolicyDraft, resolveConfiguration, type PayrollPolicyDraft } from "@/lib/configuration";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";

type PolicyRecord = { id: string; version: number; active: boolean; locationId: string | null; effectiveFrom: Date; effectiveTo: Date | null; payload: unknown };
type Props = { locations: Array<{ id: string; name: string }>; payrollRecords: PolicyRecord[]; leaveRecords: PolicyRecord[] };

export function PayrollFieldMappingPanel({ locations, payrollRecords, leaveRecords }: Props) {
  const [locationId, setLocationId] = useState("");
  const now = new Date();
  const payrollRecord = resolveConfiguration(payrollRecords, locationId || null, now);
  const leaveRecord = resolveConfiguration(leaveRecords, locationId || null, now);
  const payroll = payrollPolicyDraft(payrollRecord?.payload) ?? null;
  const hasLeavePolicy = Boolean(leavePolicyDraft(leaveRecord?.payload));
  const scope = locationId ? locations.find((location) => location.id === locationId)?.name ?? "Selected location" : "Tenant default";
  const policyStatus = payroll ? `${scope} payroll settings are effective` : `No effective payroll settings for ${scope}`;

  return <section aria-labelledby="payroll-field-mapping-title" className="space-y-4">
    <div className="flex flex-col gap-4 rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-3xl"><div className="flex items-center gap-2 text-primary"><MapPinned aria-hidden="true" className="h-5 w-5" /><p className="text-xs font-semibold uppercase tracking-[0.14em]">Legacy register translation</p></div><h2 id="payroll-field-mapping-title" className="mt-1 font-display text-xl font-semibold text-foreground">Payroll field mapping</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">See where each register column comes from before you run payroll. Calculated fields are read-only in the register and cannot be manually edited.</p></div>
      <label className="grid min-w-56 gap-1.5 text-sm font-medium text-foreground"><span>Policy scope</span><Select aria-label="Payroll field mapping policy scope" value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="">Tenant default</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</Select></label>
    </div>
    <div role="status" className={`flex gap-3 rounded-xl border p-3 text-sm ${payroll ? "border-emerald-500/35 bg-emerald-500/10 text-foreground" : "border-amber-500/40 bg-amber-500/10 text-foreground"}`}><Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>{policyStatus}.</strong> Location overrides take precedence over the tenant policy when they are active for the selected effective date.</span></div>
    <Card className="overflow-hidden"><CardHeader className="border-b border-edge bg-tint/35"><CardTitle className="flex items-center gap-2"><Calculator aria-hidden="true" className="h-4 w-4 text-primary" />Register columns and live configuration</CardTitle><p className="text-sm leading-6 text-muted-foreground">Links open the existing source of record. Statuses reflect the effective policy for the selected scope, not a proposed setting.</p></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm"><thead className="bg-tint/45 text-xs uppercase tracking-wide text-muted-foreground"><tr><th scope="col" className="px-4 py-3 font-semibold">Register column</th><th scope="col" className="px-4 py-3 font-semibold">Source</th><th scope="col" className="px-4 py-3 font-semibold">Current configuration / availability</th><th scope="col" className="px-4 py-3 font-semibold">Action</th></tr></thead><tbody>{["Employee Details", "Attendance", "Earnings", "Deductions", "Result"].map((group) => <FieldGroup key={group} group={group as PayrollFieldMapping["group"]} payroll={payroll} hasLeavePolicy={hasLeavePolicy} />)}</tbody></table></div></CardContent></Card>
    <div className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm leading-6 text-foreground"><ShieldAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" /><p><strong>Hold Salary is not a regular deduction.</strong> It requires a controlled hold/release workflow and is not currently available as a payroll register action. Group Health Insurance is only a deduction when its salary component is configured as a deduction; an employer benefit is shown separately and does not reduce net pay. Paid and unpaid leave configuration drives LOP.</p></div>
  </section>;
}

function FieldGroup({ group, payroll, hasLeavePolicy }: { group: PayrollFieldMapping["group"]; payroll: PayrollPolicyDraft | null; hasLeavePolicy: boolean }) {
  const fields = payrollFieldMappings.filter((field) => field.group === group);
  return <>{fields.map((field, index) => <tr key={field.column} className="border-t border-edge align-top hover:bg-tint/30"><th scope="row" className="px-4 py-3 font-semibold text-foreground">{index === 0 ? <span className="mb-1.5 block text-xs uppercase tracking-wide text-primary">{group}</span> : null}{field.column}</th><td className="px-4 py-3 text-muted-foreground">{field.source}</td><td className="px-4 py-3"><Status field={field} payroll={payroll} hasLeavePolicy={hasLeavePolicy} /></td><td className="px-4 py-3"><a className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" href={field.actionHref}>{field.actionLabel}<ArrowUpRight aria-hidden="true" className="h-4 w-4" /></a></td></tr>)}</>;
}

function Status({ field, payroll, hasLeavePolicy }: { field: PayrollFieldMapping; payroll: PayrollPolicyDraft | null; hasLeavePolicy: boolean }) {
  const components = payroll?.components ?? [];
  const named = (term: string) => components.find((component) => component.active !== false && `${component.code} ${component.label}`.toLowerCase().includes(term));
  type StatusValue = { tone: "ready" | "attention" | "unavailable" | "info"; text: string };
  const enabled = (value: boolean | undefined, label: string): StatusValue => value ? { tone: "ready", text: `${label} enabled` } : { tone: "attention", text: `${label} not enabled` };
  let status: StatusValue;
  switch (field.availability) {
    case "employee": status = { tone: "ready", text: "Available from Employee Master" }; break;
    case "attendance": status = { tone: "ready", text: "Automatic from approved attendance" }; break;
    case "leave": status = hasLeavePolicy ? { tone: "ready", text: "Effective leave policy available" } : { tone: "attention", text: "No effective leave policy found" }; break;
    case "policy": status = payroll ? enabled(payroll.deductLossOfPay, "LOP deduction") : { tone: "attention", text: "No effective payroll policy" }; break;
    case "tds": status = payroll ? enabled(payroll.statutory.tdsEnabled, "TDS calculator") : { tone: "attention", text: "No effective payroll policy" }; break;
    case "pf": status = payroll ? enabled(payroll.statutory.pfEnabled, "PF calculator") : { tone: "attention", text: "No effective payroll policy" }; break;
    case "pt": status = payroll ? enabled(payroll.statutory.professionalTaxEnabled, "PT calculator") : { tone: "attention", text: "No effective payroll policy" }; break;
    case "welfare": status = payroll ? enabled(payroll.statutory.labourWelfareFundEnabled, "Labour welfare calculator") : { tone: "attention", text: "No effective payroll policy" }; break;
    case "health": { const component = named("health") || named("insurance"); status = !component ? { tone: "attention", text: "No active health insurance component" } : component.kind === "deduction" ? { tone: "ready", text: `${component.label}: deduction` } : component.kind === "employer_benefit" ? { tone: "info", text: `${component.label}: employer benefit, not deducted` } : { tone: "attention", text: `${component.label}: not a deduction or employer benefit` }; break; }
    case "mess": { const component = named("mess"); status = component?.kind === "deduction" ? { tone: "ready", text: `${component.label}: controlled deduction component` } : component ? { tone: "attention", text: `${component.label}: not configured as a deduction` } : { tone: "attention", text: "No active mess deduction component" }; break; }
    case "hold": status = { tone: "unavailable", text: "Unavailable: controlled hold/release workflow required" }; break;
    case "adjustment": status = { tone: "info", text: "Available only through controlled payroll review" }; break;
    default: status = { tone: "info", text: "Calculated automatically; not manually editable" };
  }
  const tones = { ready: "border-emerald-600/35 bg-emerald-500/10 text-foreground", attention: "border-amber-600/35 bg-amber-500/10 text-foreground", unavailable: "border-rose-600/35 bg-rose-500/10 text-foreground", info: "border-sky-600/35 bg-sky-500/10 text-foreground" };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium leading-5 ${tones[status.tone]}`}>{status.text}</span>;
}
