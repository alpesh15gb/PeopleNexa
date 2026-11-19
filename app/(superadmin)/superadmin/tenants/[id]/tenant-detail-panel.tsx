"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CalendarClock, Check, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { MODULES, type PlanDef } from "@/lib/modules";
import { useToast } from "@/components/ui/toast";

type LicenseRow = {
  id: string;
  plan: string;
  seats: number;
  startsAt: string;
  expiresAt: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  /** Pre-formatted date strings (avoid toLocaleDateString hydration mismatch). */
  createdAtLabel?: string;
  expiresAtLabel?: string | null;
};

type TenantDetail = {
  id: string;
  name: string;
  code: string;
  slug: string;
  email: string | null;
  phone: string | null;
  status: string;
  plan: string;
  seats: number;
  subscriptionExpiry: string | null;
  createdAt: string;
  employeeCount: number;
  modules: { module: string; enabled: boolean }[];
  licenses: LicenseRow[];
};

const planTone: Record<string, "neutral" | "success" | "warning" | "info" | "violet"> = {
  trial: "warning",
  starter: "neutral",
  growth: "info",
  pro: "success",
  enterprise: "violet",
};

export function TenantDetailPanel({ tenant, plans }: { tenant: TenantDetail; plans: PlanDef[] }) {
  const router = useRouter();
  const toast = useToast();
  const planDef = (key: string) => plans.find((p) => p.key === key) ?? plans[0];

  const [name, setName] = useState(tenant.name);
  const [email, setEmail] = useState(tenant.email ?? "");
  const [phone, setPhone] = useState(tenant.phone ?? "");
  const [status, setStatus] = useState(tenant.status);
  const [plan, setPlan] = useState(tenant.plan);
  const [seats, setSeats] = useState(String(tenant.seats));
  const [expiry, setExpiry] = useState(tenant.subscriptionExpiry ? tenant.subscriptionExpiry.slice(0, 10) : "");
  const [saving, setSaving] = useState(false);
  const [modulesBusy, setModulesBusy] = useState(false);

  const [enabled, setEnabled] = useState<Set<string>>(new Set(tenant.modules.filter((m) => m.enabled).map((m) => m.module)));

  const toggleModule = (key: string) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const saveLicense = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/superadmin/tenants/${tenant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          status,
          plan,
          seats: Number(seats),
          subscriptionExpiry: expiry || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      if (plan !== tenant.plan) setEnabled(new Set(planDef(plan).modules));
      toast("success", "License updated.");
      router.refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const saveModules = async () => {
    setModulesBusy(true);
    try {
      const res = await fetch(`/api/superadmin/tenants/${tenant.id}/modules`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modules: [...enabled] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save modules");
      toast("success", "Modules updated.");
      router.refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to save modules");
    } finally {
      setModulesBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        {/* License */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Workspace & subscription</CardTitle>
              <CardDescription>Manage contact details, the assigned plan and when access expires.</CardDescription>
            </div>
            <CalendarClock className="h-4.5 w-4.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Company name" className="sm:col-span-2">
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Contact email">
                <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
              </Field>
              <Field label="Phone">
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
              <Field label="Plan">
                <Select value={plan} onChange={(e) => setPlan(e.target.value)}>
                  {plans.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label} — {p.blurb}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Seats" hint={`Default for ${planDef(plan).label}: ${planDef(plan).seats}`}>
                <Input value={seats} onChange={(e) => setSeats(e.target.value)} type="number" min={1} />
              </Field>
              <Field label="Status">
                <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </Select>
              </Field>
              <Field label="Expiry date" hint="Empty = never expires">
                <Input value={expiry} onChange={(e) => setExpiry(e.target.value)} type="date" />
              </Field>
            </div>

            <Button onClick={saveLicense} loading={saving} className="mt-5 w-full">
              <Save className="h-4 w-4" /> Save license
            </Button>
            <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground/70">
              Changing the plan re-applies that plan&apos;s default module set and records a license history entry.
            </p>
          </CardContent>
        </Card>

        {/* Modules */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Modules</CardTitle>
              <CardDescription>Toggle what this workspace can use</CardDescription>
            </div>
            <Building2 className="h-4.5 w-4.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-5">
            <div className="space-y-2.5">
              {MODULES.map((m) => {
                const on = enabled.has(m.key);
                return (
                  <button
                    key={m.key}
                    onClick={() => toggleModule(m.key)}
                    className="flex w-full items-center gap-3 rounded-xl border border-edge bg-tint px-3.5 py-3 text-left transition-all hover:border-edge-strong"
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                        on ? "border-indigo-400/40 bg-indigo-500/20 text-indigo-300" : "border-edge-strong text-transparent"
                      }`}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-medium">{m.label}</span>
                      <span className="block text-[11.5px] text-muted-foreground">{m.description}</span>
                    </span>
                    {planDef(tenant.plan).modules.includes(m.key) && !on && (
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">in {tenant.plan}</span>
                    )}
                  </button>
                );
              })}
            </div>
            <Button onClick={saveModules} loading={modulesBusy} variant="secondary" className="mt-5 w-full">
              <Save className="h-4 w-4" /> Save modules
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* License history */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>License history</CardTitle>
            <CardDescription>Every plan/seat change recorded</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          {tenant.licenses.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-muted-foreground">No license changes yet.</p>
          ) : (
            <div className="divide-y divide-[color:var(--border)]">
              {tenant.licenses.map((l) => (
                <div key={l.id} className="flex flex-wrap items-center gap-3 py-3">
                  <Badge tone={planTone[l.plan] ?? "neutral"} className="capitalize">{l.plan}</Badge>
                  <span className="text-[12.5px] text-muted-foreground">{l.seats} seats</span>
                  <span className="text-[12.5px] text-muted-foreground">
                    {l.createdAtLabel ?? "—"} {l.note ? `· ${l.note}` : ""}
                  </span>
                  {l.expiresAt && (
                    <span className="ml-auto text-[12px] text-muted-foreground/70">expires {l.expiresAtLabel ?? "—"}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
