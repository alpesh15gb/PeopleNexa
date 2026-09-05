"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, ExternalLink, MoreHorizontal, Pencil, Plus, ShieldOff, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { MODULES, type PlanDef } from "@/lib/modules";
import { useToast } from "@/components/ui/toast";

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  seats: number;
  subscriptionExpiry: string | null;
  employeeCount: number;
  enabledModules: string[];
  createdAt: string;
  /** Pre-formatted date strings (avoid toLocaleDateString hydration mismatch). */
  expiryLabel?: string | null;
  createdAtLabel?: string | null;
};

const planTone: Record<string, "neutral" | "success" | "warning" | "info" | "violet"> = {
  trial: "warning",
  starter: "neutral",
  growth: "info",
  pro: "success",
  enterprise: "violet",
};

export function TenantsTable({ tenants, plans }: { tenants: TenantRow[]; plans: PlanDef[] }) {
  const router = useRouter();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TenantRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Close the row menu if the page scrolls while it's open (fixed-anchored menu
  // would otherwise drift away from its button).
  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [menuFor]);

  const openMenu = (e: React.MouseEvent<HTMLButtonElement>, t: TenantRow) => {
    if (menuFor === t.id) {
      setMenuFor(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const MENU_W = 176; // w-44
    const MENU_H = 96; // two items + padding
    let top = rect.bottom + 4;
    if (top + MENU_H > window.innerHeight) top = Math.max(8, rect.top - MENU_H - 4);
    let right = Math.max(8, window.innerWidth - rect.right);
    if (right + MENU_W > window.innerWidth) right = 8;
    setMenuPos({ top, right });
    setMenuFor(t.id);
  };

  const toggle = async (id: string, status: string) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/superadmin/tenants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: status === "active" ? "suspended" : "active" }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed to update");
      }
      toast("success", status === "active" ? "Tenant suspended." : "Tenant re-activated.");
      router.refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to update tenant");
    } finally {
      setBusy(null);
      setMenuFor(null);
    }
  };

  const remove = (t: TenantRow) => {
    setConfirmDelete(t);
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    setBusy(confirmDelete.id);
    try {
      const res = await fetch(`/api/superadmin/tenants/${confirmDelete.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed to delete");
      }
      toast("success", "Tenant deleted.");
      setConfirmDelete(null);
      router.refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to delete tenant");
    } finally {
      setDeleting(false);
      setBusy(null);
      setMenuFor(null);
    }
  };

  return (
    <>
    <div className="card-surface overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between border-b border-edge px-5 py-4">
        <p className="text-[13px] text-muted-foreground">{tenants.length} workspace(s)</p>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" /> New tenant
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-edge text-[11px] uppercase tracking-wider text-muted-foreground/70">
              <th className="px-5 py-3 font-medium">Company</th>
              <th className="px-3 py-3 font-medium">Plan</th>
              <th className="px-3 py-3 font-medium">Seats</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium">Expiry</th>
              <th className="px-3 py-3 font-medium">Modules</th>
              <th className="px-3 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--border)]">
            {tenants.map((t) => (
              <tr key={t.id} className="transition-colors hover:bg-tint/40">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-brand text-[11px] font-bold text-white">
                      {t.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{t.name}</p>
                      <p className="text-[11.5px] text-muted-foreground">{t.slug}.peoplenexa.in</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3.5">
                  <Badge tone={planTone[t.plan] ?? "neutral"} className="capitalize">
                    {t.plan}
                  </Badge>
                </td>
                <td className="px-3 py-3.5 text-muted-foreground">
                  {t.employeeCount}/{t.seats}
                </td>
                <td className="px-3 py-3.5">
                  <Badge tone={t.status === "active" ? "success" : "danger"}>{t.status}</Badge>
                </td>
                <td className="px-3 py-3.5 text-muted-foreground">{t.expiryLabel ?? "—"}</td>
                <td className="px-3 py-3.5">
                  <div className="flex max-w-[220px] flex-wrap gap-1">
                    {t.enabledModules.slice(0, 3).map((m) => (
                      <span key={m} className="rounded-md bg-tint-strong px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
                        {m}
                      </span>
                    ))}
                    {t.enabledModules.length > 3 && (
                      <span className="rounded-md bg-tint-strong px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
                        +{t.enabledModules.length - 3}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3.5">
                  <div className="flex items-center gap-1">
                    <Link href={`/superadmin/tenants/${t.id}`} className="rounded-lg p-1.5 text-muted-foreground hover:bg-tint hover:text-foreground" title="Manage tenant">
                      <Pencil className="h-3.5 w-3.5" />
                    </Link>
                    <a
                      href={`https://${t.slug}.peoplenexa.in`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-tint hover:text-foreground"
                      title="Open workspace"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <div className="relative">
                      <button
                        onClick={(e) => openMenu(e, t)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-tint hover:text-foreground"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                      {menuFor === t.id && menuPos && (
                        <>
                          <div className="fixed inset-0 z-30" onClick={() => setMenuFor(null)} />
                          <div
                            className="card-surface fixed z-40 w-44 rounded-xl bg-card-2 p-1.5 shadow-2xl"
                            style={{ top: menuPos.top, right: menuPos.right }}
                          >
                            <button
                              disabled={busy === t.id}
                              onClick={() => toggle(t.id, t.status)}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] text-muted-foreground transition-colors hover:bg-tint hover:text-foreground disabled:opacity-50"
                            >
                              <ShieldOff className="h-3.5 w-3.5" />
                              {t.status === "active" ? "Suspend" : "Re-activate"}
                            </button>
                            <button
                              disabled={busy === t.id}
                              onClick={() => remove(t)}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] text-rose-300 transition-colors hover:bg-rose-500/10 disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && (
        <CreateTenantModal
          plans={plans}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); router.refresh(); }}
        />
      )}
    </div>
      <ConfirmDialog
        open={!!confirmDelete}
        title={confirmDelete ? `Delete ${confirmDelete.name}?` : "Delete tenant?"}
        description={
          confirmDelete
            ? `Delete ${confirmDelete.name} (${confirmDelete.slug})? This permanently removes all of their data.`
            : undefined
        }
        confirmLabel="Delete"
        busy={deleting}
        onCancel={() => {
          if (!deleting) setConfirmDelete(null);
        }}
        onConfirm={doDelete}
      />
    </>
  );
}

function CreateTenantModal({ plans, onClose, onCreated }: { plans: PlanDef[]; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState("trial");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/superadmin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          slug: form.get("slug"),
          plan,
          seats: Number(form.get("seats")) || undefined,
          expiresAt: form.get("expiresAt") || null,
          adminEmail: form.get("adminEmail") || "",
          adminPassword: form.get("adminPassword") || "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create tenant");
      toast("success", `Tenant "${data.tenant.name}" created.`);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create tenant");
    } finally {
      setLoading(false);
    }
  }

  const defaults = plans.find((p) => p.key === plan) ?? plans[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="card-surface relative w-full max-w-lg animate-scale-in rounded-2xl bg-card-2 p-6 shadow-2xl">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-brand text-white">
            <Building2 className="h-4 w-4" />
          </span>
          <div>
            <h3 className="font-display text-base font-bold">New tenant</h3>
            <p className="text-[12.5px] text-muted-foreground">Provision a workspace with a license</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Company name" className="col-span-2">
              <Input name="name" required placeholder="Acme Corp" />
            </Field>
            <Field label="Subdomain">
              <Input name="slug" required placeholder="acme" pattern="[a-z0-9-]+" />
            </Field>
            <Field label="Plan">
              <Select value={plan} onChange={(e) => setPlan(e.target.value)}>
                {plans.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Seats" hint={`Default for ${defaults.label}: ${defaults.seats}`}>
              <Input name="seats" type="number" min={1} defaultValue={defaults.seats} />
            </Field>
            <Field label="Expiry" hint="Empty = never expires">
              <Input name="expiresAt" type="date" />
            </Field>
            <Field label="Admin email (optional)">
              <Input name="adminEmail" type="email" placeholder="admin@acme.com" />
            </Field>
            <Field label="Admin password (optional)">
              <Input name="adminPassword" type="password" placeholder="Set an initial password" />
            </Field>
          </div>
          <p className="rounded-xl border border-edge bg-tint px-3 py-2 text-[12px] text-muted-foreground">
            {defaults.blurb} — {defaults.modules.length} modules enabled
          </p>
          {error && (
            <p className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3.5 py-2.5 text-[13px] text-rose-300">{error}</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              Create tenant
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
