"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, NumberInput } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
  leavePolicyDraft,
  resolveConfiguration,
  type LeavePolicyDraft,
} from "@/lib/configuration";
import {
  workingPolicy,
  type PolicyWorkspaceRecord,
} from "@/lib/policy-workspace";
import { istDateKey } from "@/lib/ist";
import { formatDate } from "@/lib/dates";

type RecordItem = PolicyWorkspaceRecord & { locationId: string | null };
type LeaveType = {
  name: string;
  code: string;
  maxDays: number | null;
  paid: boolean | null;
  unlimitedEntitlement: boolean;
  requiresApproval: boolean;
  isCarryForward: boolean;
};
type Rule = LeavePolicyDraft["leaveTypes"][number];
type Props = {
  locations: { id: string; name: string }[];
  types: LeaveType[];
  records: RecordItem[];
  periods: { configurationId: string; balances: number }[];
};

export function LeavePolicyWorkspace(props: Props) {
  const params = useSearchParams();
  const router = useRouter();
  const requested = params.get("location");
  const scope = props.locations.some((location) => location.id === requested)
    ? requested!
    : "tenant";
  const locationId = scope === "tenant" ? null : scope;
  const scopeRecords = props.records.filter(
    (record) => record.locationId === locationId,
  );
  const working = workingPolicy(scopeRecords);
  const current = resolveConfiguration(
    props.records.map((record) => ({
      ...record,
      effectiveFrom: new Date(record.effectiveFrom),
      effectiveTo: record.effectiveTo ? new Date(record.effectiveTo) : null,
    })),
    locationId,
    new Date(),
  );
  const scheduled = scopeRecords
    .filter(
      (record) => record.active && new Date(record.effectiveFrom) > new Date(),
    )
    .sort(
      (a, b) =>
        new Date(a.effectiveFrom).getTime() -
        new Date(b.effectiveFrom).getTime(),
    )[0];
  const source = working ?? scheduled ?? current;
  const parsed = leavePolicyDraft(source?.payload);
  const baseline: LeavePolicyDraft = {
    leaveTypes: props.types
      .slice(0, 30)
      .map((type) => ({
        name: type.name,
        code: type.code,
        annualEntitlement: type.maxDays,
        unlimitedEntitlement: type.unlimitedEntitlement,
        paid: type.paid !== false,
        allowsHalfDay: true,
        requiresApproval: type.requiresApproval,
        carryForward: type.isCarryForward,
        carryForwardLimit: type.isCarryForward ? 0 : null,
      })),
  };
  // Keep fields from supported producers even if this editor does not expose them.
  const raw =
    source?.payload && typeof source.payload === "object"
      ? (source.payload as Record<string, unknown>)
      : {};
  const rawRules = Array.isArray(raw.leaveTypes)
    ? (raw.leaveTypes as Record<string, unknown>[])
    : [];
  const initial = parsed
    ? {
        ...raw,
        ...parsed,
        leaveTypes: parsed.leaveTypes.map((rule) => ({
          ...rawRules.find((item) => item.code === rule.code),
          ...rule,
        })),
      }
    : baseline;
  return (
    <main className="mx-auto max-w-6xl space-y-5 py-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          Time off
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Leave settings
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Set allowances, approval rules and carry forward in one place.
        </p>
      </header>
      <nav
        aria-label="Leave workspace"
        className="flex flex-wrap gap-2 rounded-xl border border-edge bg-card p-2"
      >
        <Link
          className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm hover:bg-tint"
          href="/admin/leaves"
        >
          Requests & balances
        </Link>
        <Link
          aria-current="page"
          className="inline-flex min-h-11 items-center rounded-lg bg-primary/10 px-3 text-sm font-medium text-primary"
          href="/admin/leaves/policies"
        >
          Leave settings
        </Link>
      </nav>
      <Field label="Settings for" className="max-w-sm">
        <Select
          value={scope}
          onChange={(event) =>
            router.replace(
              `/admin/leaves/policies?location=${encodeURIComponent(event.target.value)}`,
            )
          }
        >
          <option value="tenant">Company defaults</option>
          {props.locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </Select>
      </Field>
      <LeavePolicyEditor
        key={`${scope}:${source?.id ?? "new"}`}
        {...props}
        locationId={locationId}
        initial={initial}
        source={source}
        scopeRecords={scopeRecords}
      />
    </main>
  );
}

function LeavePolicyEditor({
  types,
  periods,
  locationId,
  initial,
  source,
  scopeRecords,
}: Props & {
  locationId: string | null;
  initial: LeavePolicyDraft;
  source: RecordItem | null;
  scopeRecords: RecordItem[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState(initial);
  const [date, setDate] = useState(
    source && source.locationId === locationId
      ? new Date(source.effectiveFrom).toISOString().slice(0, 10)
      : istDateKey(new Date()),
  );
  const [tab, setTab] = useState<"rules" | "review">("rules");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{
    affectedEmployees: number;
    eligibleEmployees: {
      employeeId: string;
      employee: string;
      leaveType: string;
      entitlement: number | null;
      carryForwardCandidate: number;
      availableOn?: string | null;
    }[];
  } | null>(null);
  const [confirm, setConfirm] = useState<"apply" | "allocate" | null>(null);
  const [appliedId, setAppliedId] = useState(
    source?.active && source.locationId === locationId ? source.id : "",
  );
  const allocated = periods.find(
    (period) => period.configurationId === appliedId,
  );
  const [selectedCode, setSelectedCode] = useState(
    types.find(
      (type) => !draft.leaveTypes.some((rule) => rule.code === type.code),
    )?.code ?? "",
  );
  function update(index: number, patch: Partial<Rule>) {
    setPreview(null);
    setError("");
    setDraft((value) => ({
      ...value,
      leaveTypes: value.leaveTypes.map((rule, i) =>
        i === index ? { ...rule, ...patch } : rule,
      ),
    }));
  }
  function validate() {
    if (!date || !leavePolicyDraft(draft)) {
      setError(
        "Check allowances (0–366 whole days), carry-forward limits, and accrual ranges. Every leave type needs valid rules.",
      );
      return false;
    }
    if (
      draft.leaveTypes.some(
        (rule) => !types.some((type) => type.code === rule.code),
      )
    ) {
      setError(
        "A policy leave type is missing from your leave catalogue. Add the leave type before applying.",
      );
      return false;
    }
    setError("");
    return true;
  }
  async function save(apply = false) {
    if (!validate()) return;
    setBusy(apply ? "apply" : "save");
    try {
      const response = await fetch("/api/configuration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: apply ? "apply-policy" : undefined,
          kind: "leave_policy",
          locationId,
          effectiveFrom: date,
          effectiveTo: null,
          payload: draft,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not save leave settings.");
      if (apply) setAppliedId(data.record.id);
      setConfirm(null);
      toast(
        "success",
        data.unchanged
          ? "No extra copy created. Settings are already saved."
          : apply
            ? "Leave settings applied. Allocate balances when ready."
            : "Progress saved.",
      );
      router.refresh();
    } catch (reason) {
      setConfirm(null);
      setError(
        reason instanceof Error ? reason.message : "Could not save settings.",
      );
    } finally {
      setBusy(null);
    }
  }
  async function previewBalances() {
    if (!validate()) return;
    setBusy("preview");
    try {
      const response = await fetch("/api/configuration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview",
          kind: "leave_policy",
          locationId,
          effectiveFrom: date,
          effectiveTo: null,
          payload: draft,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not preview balances.");
      setPreview(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Preview failed.");
    } finally {
      setBusy(null);
    }
  }
  async function allocate() {
    setBusy("allocate");
    try {
      const response = await fetch("/api/configuration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "open-leave-period",
          configurationId: appliedId,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not allocate balances.");
      setConfirm(null);
      toast(
        "success",
        data.idempotent
          ? "This period is already allocated."
          : "Leave balances allocated.",
      );
      router.refresh();
    } catch (reason) {
      setConfirm(null);
      setError(reason instanceof Error ? reason.message : "Allocation failed.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-5">
        <div>
          <p className="font-semibold">
            {source
              ? source.active
                ? new Date(source.effectiveFrom) > new Date()
                  ? "Scheduled settings loaded"
                  : "Applied settings loaded"
                : "Saved working copy loaded"
              : "Set up your leave rules"}
          </p>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Save your progress as often as needed. Applying changes leaves
            earlier requests and their recorded policy intact.
          </p>
        </div>
        <Field
          label="Apply from date"
          hint="For an allocated period, choose a later date when changing its rules."
        >
          <Input
            type="date"
            value={date}
            required
            onChange={(event) => {
              setDate(event.target.value);
              setPreview(null);
            }}
          />
        </Field>
      </section>
      <nav aria-label="Leave settings sections" className="flex gap-2">
        <Button
          variant={tab === "rules" ? "secondary" : "ghost"}
          aria-current={tab === "rules" ? "page" : undefined}
          onClick={() => setTab("rules")}
        >
          Allowances & rules
        </Button>
        <Button
          variant={tab === "review" ? "secondary" : "ghost"}
          aria-current={tab === "review" ? "page" : undefined}
          onClick={() => setTab("review")}
        >
          Review & balances
        </Button>
      </nav>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-400/30 bg-rose-500/5 p-4 text-sm"
        >
          {error}
        </p>
      )}
      {tab === "rules" ? (
        <>
          <div className="space-y-4">
            {draft.leaveTypes.map((rule, index) => (
              <section
                key={rule.code}
                className="rounded-2xl border border-edge bg-card p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{rule.name}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {rule.code} · {rule.paid ? "Paid leave" : "Unpaid leave"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={draft.leaveTypes.length === 1}
                    aria-label={`Remove ${rule.name} from this policy`}
                    onClick={() =>
                      setDraft((value) => ({
                        ...value,
                        leaveTypes: value.leaveTypes.filter(
                          (_, i) => i !== index,
                        ),
                      }))
                    }
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Allowance">
                    <Select
                      value={
                        rule.unlimitedEntitlement
                          ? "unlimited"
                          : rule.workedDayAccrual
                            ? "earned"
                            : "annual"
                      }
                      onChange={(event) => {
                        if (event.target.value === "earned")
                          update(index, {
                            unlimitedEntitlement: false,
                            workedDayAccrual: rule.workedDayAccrual ?? {
                              source: "attendance_status",
                              tiers: [
                                { minDays: 0, maxDays: 31, daysEarned: 0 },
                              ],
                              joiningMonthClaimDeferral: "none",
                            },
                          });
                        else
                          update(index, {
                            unlimitedEntitlement:
                              event.target.value === "unlimited",
                            workedDayAccrual: undefined,
                          });
                      }}
                    >
                      <option value="annual">Fixed allowance</option>
                      <option value="earned">Earn from worked days</option>
                      <option value="unlimited">Unlimited</option>
                    </Select>
                  </Field>
                  {!rule.unlimitedEntitlement && !rule.workedDayAccrual && (
                    <Field label="Days allocated for this period">
                      <NumberInput
                        min={0}
                        max={366}
                        step={1}
                        value={rule.annualEntitlement}
                        onValueChange={(annualEntitlement) =>
                          update(index, { annualEntitlement })
                        }
                      />
                    </Field>
                  )}
                  <Field label="Payroll treatment">
                    <Select
                      value={rule.paid ? "paid" : "unpaid"}
                      onChange={(event) =>
                        update(index, { paid: event.target.value === "paid" })
                      }
                    >
                      <option value="paid">Paid leave</option>
                      <option value="unpaid">Unpaid leave (loss of pay)</option>
                    </Select>
                  </Field>
                  <Field label="Approval">
                    <Select
                      value={rule.requiresApproval ? "required" : "automatic"}
                      onChange={(event) =>
                        update(index, {
                          requiresApproval: event.target.value === "required",
                        })
                      }
                    >
                      <option value="required">Manager approval</option>
                      <option value="automatic">Automatic approval</option>
                    </Select>
                  </Field>
                  <Field label="Carry forward">
                    <Select
                      value={rule.carryForward ? "yes" : "no"}
                      onChange={(event) =>
                        update(index, {
                          carryForward: event.target.value === "yes",
                          carryForwardLimit:
                            event.target.value === "yes"
                              ? (rule.carryForwardLimit ?? 0)
                              : null,
                        })
                      }
                    >
                      <option value="no">Do not carry forward</option>
                      <option value="yes">Carry forward up to a limit</option>
                    </Select>
                  </Field>
                  {rule.carryForward && (
                    <Field label="Maximum days carried forward">
                      <NumberInput
                        min={0}
                        max={366}
                        step={1}
                        value={rule.carryForwardLimit}
                        onValueChange={(carryForwardLimit) =>
                          update(index, { carryForwardLimit })
                        }
                      />
                    </Field>
                  )}
                </div>
                <label className="mt-4 flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={rule.allowsHalfDay}
                    onChange={(event) =>
                      update(index, { allowsHalfDay: event.target.checked })
                    }
                  />
                  Allow half-day requests
                </label>
                {rule.workedDayAccrual && (
                  <div className="mt-3 space-y-3 rounded-xl border border-edge bg-tint p-4">
                    <h3 className="text-sm font-semibold">
                      Monthly earning rules
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Present, late and permission count as worked days. Half
                      days count as 0.5. Ranges must not overlap.
                    </p>
                    {rule.workedDayAccrual.tiers.map((tier, tierIndex) => (
                      <div key={tierIndex} className="grid grid-cols-3 gap-2">
                        <Field label="From worked days">
                          <NumberInput
                            min={0}
                            max={31}
                            value={tier.minDays}
                            onValueChange={(value) =>
                              update(index, {
                                workedDayAccrual: {
                                  ...rule.workedDayAccrual!,
                                  tiers: rule.workedDayAccrual!.tiers.map(
                                    (item, i) =>
                                      i === tierIndex
                                        ? { ...item, minDays: value as number }
                                        : item,
                                  ),
                                },
                              })
                            }
                          />
                        </Field>
                        <Field label="To worked days">
                          <NumberInput
                            min={0}
                            max={31}
                            value={tier.maxDays}
                            onValueChange={(value) =>
                              update(index, {
                                workedDayAccrual: {
                                  ...rule.workedDayAccrual!,
                                  tiers: rule.workedDayAccrual!.tiers.map(
                                    (item, i) =>
                                      i === tierIndex
                                        ? { ...item, maxDays: value as number }
                                        : item,
                                  ),
                                },
                              })
                            }
                          />
                        </Field>
                        <Field label="Days earned">
                          <NumberInput
                            min={0}
                            max={31}
                            value={tier.daysEarned}
                            onValueChange={(value) =>
                              update(index, {
                                workedDayAccrual: {
                                  ...rule.workedDayAccrual!,
                                  tiers: rule.workedDayAccrual!.tiers.map(
                                    (item, i) =>
                                      i === tierIndex
                                        ? {
                                            ...item,
                                            daysEarned: value as number,
                                          }
                                        : item,
                                  ),
                                },
                              })
                            }
                          />
                        </Field>
                        <Button
                          className="col-span-3"
                          size="sm"
                          variant="ghost"
                          disabled={rule.workedDayAccrual!.tiers.length === 1}
                          onClick={() =>
                            update(index, {
                              workedDayAccrual: {
                                ...rule.workedDayAccrual!,
                                tiers: rule.workedDayAccrual!.tiers.filter(
                                  (_, i) => i !== tierIndex,
                                ),
                              },
                            })
                          }
                        >
                          Remove range
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={rule.workedDayAccrual.tiers.length >= 31}
                      onClick={() =>
                        update(index, {
                          workedDayAccrual: {
                            ...rule.workedDayAccrual!,
                            tiers: [
                              ...rule.workedDayAccrual!.tiers,
                              { minDays: 0, maxDays: 31, daysEarned: 0 },
                            ],
                          },
                        })
                      }
                    >
                      Add earning range
                    </Button>
                    <Field label="Leave earned in joining month">
                      <Select
                        value={rule.workedDayAccrual.joiningMonthClaimDeferral}
                        onChange={(event) =>
                          update(index, {
                            workedDayAccrual: {
                              ...rule.workedDayAccrual!,
                              joiningMonthClaimDeferral: event.target.value as
                                "none" | "next_month",
                            },
                          })
                        }
                      >
                        <option value="none">
                          Available in the same month
                        </option>
                        <option value="next_month">
                          Available from next month
                        </option>
                      </Select>
                    </Field>
                  </div>
                )}
              </section>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-edge bg-card p-4">
            <Field
              label="Include another leave type"
              className="min-w-40 flex-1"
            >
              <Select
                value={selectedCode}
                onChange={(event) => setSelectedCode(event.target.value)}
              >
                <option value="">Choose a leave type</option>
                {types
                  .filter(
                    (type) =>
                      !draft.leaveTypes.some((rule) => rule.code === type.code),
                  )
                  .map((type) => (
                    <option key={type.code} value={type.code}>
                      {type.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Button
              variant="outline"
              disabled={!selectedCode || draft.leaveTypes.length >= 30}
              onClick={() => {
                const type = types.find((item) => item.code === selectedCode);
                if (
                  !type ||
                  draft.leaveTypes.some((rule) => rule.code === type.code)
                )
                  return;
                setDraft((value) => ({
                  ...value,
                  leaveTypes: [
                    ...value.leaveTypes,
                    {
                      name: type.name,
                      code: type.code,
                      annualEntitlement: type.maxDays,
                      unlimitedEntitlement: type.unlimitedEntitlement,
                      paid: type.paid !== false,
                      allowsHalfDay: true,
                      requiresApproval: type.requiresApproval,
                      carryForward: false,
                      carryForwardLimit: null,
                    },
                  ],
                }));
                setSelectedCode("");
              }}
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              Include type
            </Button>
            <Link
              href="/admin/leaves"
              className="inline-flex min-h-11 items-center text-sm font-medium text-primary"
            >
              Manage leave types
            </Link>
          </div>
        </>
      ) : (
        <section className="space-y-4 rounded-2xl border border-edge bg-card p-5">
          <h2 className="text-lg font-semibold">Review your leave policy</h2>
          <div className="divide-y divide-edge">
            {draft.leaveTypes.map((rule) => (
              <div key={rule.code} className="py-3">
                <p className="text-sm font-semibold">{rule.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {rule.unlimitedEntitlement
                    ? "Unlimited"
                    : rule.workedDayAccrual
                      ? "Earned from worked days"
                      : `${rule.annualEntitlement ?? 0} days`}{" "}
                  · {rule.paid ? "Paid" : "Unpaid"} ·{" "}
                  {rule.requiresApproval
                    ? "Approval required"
                    : "Auto-approved"}{" "}
                  ·{" "}
                  {rule.carryForward
                    ? `Carry forward up to ${rule.carryForwardLimit} days`
                    : "No carry forward"}
                </p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <h3 className="font-semibold">Employee balances</h3>
            <Button
              className="mt-3"
              variant="outline"
              loading={busy === "preview"}
              disabled={Boolean(busy)}
              onClick={() => void previewBalances()}
            >
              Preview employee allocations
            </Button>
            {preview && (
              <div className="mt-4 space-y-3">
                <p className="text-sm">
                  {preview.affectedEmployees} eligible employees. Preview only;
                  no balances have been allocated.
                </p>
                <div className="max-h-72 space-y-2 overflow-y-auto">
                  {preview.eligibleEmployees.map((row) => (
                    <div
                      key={row.employeeId + row.leaveType}
                      className="rounded-lg border border-edge bg-card p-3 text-sm"
                    >
                      <p className="font-medium">
                        {row.employee} · {row.leaveType}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Allowance: {row.entitlement ?? "Unlimited"} · Carry
                        forward: {row.carryForwardCandidate}
                        {row.availableOn
                          ? " · Available " +
                            formatDate(new Date(row.availableOn))
                          : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="mt-1 text-sm text-muted-foreground">
              {allocated
                ? `Balances have been allocated (${allocated.balances} employee/type entries).`
                : "Apply settings first, then explicitly allocate a new balance period. Existing requests and imported balances are retained."}
            </p>
            {appliedId && !allocated && (
              <Button
                className="mt-3"
                variant="outline"
                onClick={() => setConfirm("allocate")}
              >
                Allocate balances
              </Button>
            )}
          </div>
        </section>
      )}
      <details className="rounded-xl border border-edge bg-card p-5">
        <summary className="cursor-pointer font-semibold focus-visible:ring-2 focus-visible:ring-ring">
          Change history
        </summary>
        <div className="mt-3 divide-y divide-edge">
          {scopeRecords.map((record) => (
            <p key={record.id} className="py-3 text-sm">
              {record.active
                ? "Applied settings"
                : record.activatedAt
                  ? "Earlier settings"
                  : "Saved changes"}{" "}
              · from {formatDate(new Date(record.effectiveFrom))}
              {record.effectiveTo
                ? ` through ${formatDate(new Date(record.effectiveTo))}`
                : ""}
            </p>
          ))}
        </div>
      </details>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-edge bg-card p-4 md:sticky md:bottom-3">
        <p className="text-xs text-muted-foreground">
          One working copy for this scope. Changes apply after review.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            loading={busy === "save"}
            disabled={Boolean(busy)}
            onClick={() => void save()}
          >
            <Save aria-hidden="true" className="h-4 w-4" />
            Save progress
          </Button>
          <Button
            disabled={Boolean(busy)}
            onClick={() => {
              setTab("review");
              if (validate()) setConfirm("apply");
            }}
          >
            <Check aria-hidden="true" className="h-4 w-4" />
            Review & apply
          </Button>
        </div>
      </div>
      <Modal
        open={confirm !== null}
        onClose={() => {
          if (!busy) setConfirm(null);
        }}
        title={
          confirm === "allocate"
            ? "Allocate leave balances?"
            : "Apply leave settings?"
        }
        size="sm"
      >
        <p className="text-sm text-muted-foreground">
          {confirm === "allocate"
            ? "Create allocations for eligible employees in this policy scope. Repeating this action never allocates the same period twice."
            : `${draft.leaveTypes.length} leave types, effective ${date ? formatDate(new Date(date)) : "date not selected"}. Earlier requests keep their saved rules. Balance allocation is a separate step.`}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="outline"
            disabled={Boolean(busy)}
            onClick={() => setConfirm(null)}
          >
            Keep editing
          </Button>
          <Button
            loading={Boolean(busy)}
            onClick={() =>
              confirm === "allocate" ? void allocate() : void save(true)
            }
          >
            {confirm === "allocate" ? "Allocate balances" : "Apply settings"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
