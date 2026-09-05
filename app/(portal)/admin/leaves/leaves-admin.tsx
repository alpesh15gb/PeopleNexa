"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Plus, Pencil, Trash2, ChevronLeft, ChevronRight, CalendarDays, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { addDays, formatDate, toDateKey, fromDateKey } from "@/lib/dates";

interface Request {
  id: string;
  days: number;
  reason: string | null;
  status: string;
  fromDate: Date;
  toDate: Date;
  appliedAt: Date;
  leaveType: { name: string; color: string };
  employee: { firstName: string; lastName: string; employeeNumber: string };
}

interface Type {
  id: string;
  name: string;
  code: string;
  maxDays: number;
  color: string;
  isCarryForward: boolean;
  requiresApproval: boolean;
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
}

export function LeavesAdmin({
  requests,
  types,
  employees,
}: {
  requests: Request[];
  types: Type[];
  employees: Employee[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<"requests" | "types" | "calendar">("requests");
  const [busy, setBusy] = useState<string | null>(null);
  const [typeModal, setTypeModal] = useState<Type | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [onBehalfOpen, setOnBehalfOpen] = useState(false);
  const [logSaving, setLogSaving] = useState(false);
  const [month, setMonth] = useState(() => new Date());

  async function review(id: string, status: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/leaves/requests/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Failed to update");
        return;
      }
      toast("success", status === "approved" ? "Leave approved" : "Leave rejected");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function saveType(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const editing = typeModal && typeof typeModal === "object" ? typeModal : null;
    const payload = {
      name: form.get("name"),
      code: form.get("code"),
      maxDays: form.get("maxDays"),
      isCarryForward: form.get("isCarryForward") === "on",
      requiresApproval: form.get("requiresApproval") === "on" || form.get("requiresApproval") === null,
      color: form.get("color"),
    };
    try {
      const res = await fetch(editing ? `/api/leaves/types/${editing.id}` : "/api/leaves/types", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Failed to save");
        return;
      }
      toast("success", editing ? "Leave type updated" : "Leave type created");
      setTypeModal(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function removeType(t: Type) {
    const res = await fetch(`/api/leaves/types/${t.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      toast("error", data.error ?? "Failed to delete");
      return;
    }
    toast("success", "Leave type removed");
    router.refresh();
  }

  const pending = requests.filter((r) => r.status === "pending").length;

  return (
    <>
      <div className="flex items-center justify-between border-b border-edge px-5 pt-3">
        <div className="flex gap-1">
          {([
            ["requests", `Requests${pending ? ` (${pending})` : ""}`],
            ["calendar", "Team calendar"],
            ["types", "Leave types"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`relative rounded-t-lg px-4 py-2.5 text-[13px] font-medium transition-colors ${
                tab === key ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              {tab === key && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-gradient-brand" />}
            </button>
          ))}
        </div>
        {tab === "requests" && (
          <Button size="sm" variant="outline" onClick={() => setOnBehalfOpen(true)}>
            <PenLine className="h-3.5 w-3.5" /> Log for employee
          </Button>
        )}
        {tab === "types" && (
          <Button size="sm" onClick={() => setTypeModal("new")}>
            <Plus className="h-3.5 w-3.5" /> New type
          </Button>
        )}
      </div>

      {tab === "requests" ? (
        <Table>
          <THead>
            <TR>
              <TH>Employee</TH>
              <TH>Type</TH>
              <TH className="hidden md:table-cell">Dates</TH>
              <TH>Days</TH>
              <TH className="hidden lg:table-cell">Reason</TH>
              <TH>Status</TH>
              <TH className="w-28" />
            </TR>
          </THead>
          <TBody>
            {requests.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-[13px] text-muted-foreground">
                  No leave requests yet.
                </td>
              </tr>
            ) : (
              requests.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <p className="text-[13.5px] font-medium">
                      {r.employee.firstName} {r.employee.lastName}
                    </p>
                    <p className="text-[11.5px] text-muted-foreground">{r.employee.employeeNumber}</p>
                  </TD>
                  <TD>
                    <span className="flex items-center gap-2 text-[13px]">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.leaveType.color }} />
                      {r.leaveType.name}
                    </span>
                  </TD>
                  <TD className="hidden md:table-cell">
                    <span className="text-[13px] text-muted-foreground">
                      {formatDate(r.fromDate)} → {formatDate(r.toDate)}
                    </span>
                  </TD>
                  <TD className="font-semibold">{r.days}d</TD>
                  <TD className="hidden max-w-[220px] lg:table-cell">
                    <span className="block truncate text-[13px] text-muted-foreground">{r.reason || "—"}</span>
                  </TD>
                  <TD><StatusPill status={r.status} /></TD>
                  <TD>
                    {r.status === "pending" ? (
                      <div className="flex items-center gap-1.5">
                        <Button size="sm" variant="success" loading={busy === r.id} onClick={() => review(r.id, "approved")}>
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="danger" disabled={busy === r.id} onClick={() => review(r.id, "rejected")}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <span className="text-[12px] text-muted-foreground">
                        {r.status === "approved" ? "Approved" : "Rejected"}
                      </span>
                    )}
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      ) : tab === "calendar" ? (
        <TeamCalendar month={month} setMonth={setMonth} requests={requests} />
      ) : (
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {types.map((t) => (
            <div key={t.id} className="card-surface group rounded-xl p-4 transition-colors hover:border-edge-strong">
              <div className="flex items-center gap-2.5">
                <span className="h-3 w-3 rounded-full" style={{ background: t.color }} />
                <p className="font-display text-[15px] font-semibold">{t.name}</p>
                <span className="rounded-md bg-tint-strong px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
                  {t.code}
                </span>
              </div>
              <p className="mt-2 text-[12.5px] text-muted-foreground">
                {t.maxDays} days · {t.isCarryForward ? "carry forward" : "no carry forward"} ·{" "}
                {t.requiresApproval ? "approval required" : "auto-approved"}
              </p>
              <div className="mt-3 flex gap-1.5 opacity-100 transition-opacity focus-within:opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
                <Button size="sm" variant="outline" onClick={() => setTypeModal(t)}>
                  <Pencil className="h-3 w-3" /> Edit
                </Button>
                <Button size="sm" variant="outline" className="text-rose-300" onClick={() => removeType(t)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={onBehalfOpen} onClose={() => setOnBehalfOpen(false)} title="Log leave for an employee" size="sm">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setLogSaving(true);
            const form = new FormData(e.currentTarget);
            try {
              const res = await fetch("/api/leaves/requests", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  employeeId: form.get("employeeId"),
                  leaveTypeId: form.get("leaveTypeId"),
                  fromDate: form.get("fromDate"),
                  toDate: form.get("toDate"),
                  reason: form.get("reason"),
                }),
              });
              const data = await res.json();
              if (!res.ok) {
                toast("error", data.error ?? "Failed to log leave");
                return;
              }
              toast("success", "Leave logged — employee notified");
              setOnBehalfOpen(false);
              router.refresh();
            } finally {
              setLogSaving(false);
            }
          }}
          className="space-y-4"
        >
          <Field label="Employee">
            <Select name="employeeId" required>
              <option value="">Select employee</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName} ({e.employeeNumber})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Leave type">
            <Select name="leaveTypeId" required>
              <option value="">Select type</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.maxDays} days)
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="From">
              <Input name="fromDate" type="date" required />
            </Field>
            <Field label="To">
              <Input name="toDate" type="date" required />
            </Field>
          </div>
          <Field label="Reason">
            <Input name="reason" placeholder="e.g. Leave sanctioned by manager" />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOnBehalfOpen(false)}>Cancel</Button>
            <Button type="submit" loading={logSaving}>Log leave</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={typeModal !== null}
        onClose={() => setTypeModal(null)}
        title={typeModal === "new" ? "New leave type" : `Edit ${typeModal !== null && typeof typeModal === "object" ? typeModal.name : ""}`}
        size="sm"
      >
        <form onSubmit={saveType} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <Input name="name" required defaultValue={typeModal !== null && typeof typeModal === "object" ? typeModal.name : ""} />
            </Field>
            <Field label="Code">
              <Input name="code" required defaultValue={typeModal !== null && typeof typeModal === "object" ? typeModal.code : ""} placeholder="e.g. CL" />
            </Field>
            <Field label="Max days / year">
              <Input name="maxDays" type="number" min={1} required defaultValue={typeModal !== null && typeof typeModal === "object" ? typeModal.maxDays : 10} />
            </Field>
            <Field label="Color">
              <Input name="color" type="color" defaultValue={typeModal !== null && typeof typeModal === "object" ? typeModal.color : "#3b82f6"} className="h-10 p-1" />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <input type="checkbox" name="isCarryForward" defaultChecked={typeModal !== null && typeof typeModal === "object" ? typeModal.isCarryForward : false} className="h-4 w-4 accent-indigo-500" />
            Carry forward unused days
          </label>
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <input type="checkbox" name="requiresApproval" defaultChecked={typeModal !== null && typeof typeModal === "object" ? typeModal.requiresApproval : true} className="h-4 w-4 accent-indigo-500" />
            Requires admin approval
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setTypeModal(null)}>Cancel</Button>
            <Button type="submit" loading={saving}>Save</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function TeamCalendar({
  month,
  setMonth,
  requests,
}: {
  month: Date;
  setMonth: (d: Date) => void;
  requests: Request[];
}) {
  const year = month.getFullYear();
  const mon = month.getMonth();
  const first = new Date(year, mon, 1);
  const offset = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const today = toDateKey(new Date());

  const approved = requests.filter((r) => r.status === "approved");
  const byDay = new Map<string, typeof approved>();
  for (const r of approved) {
    for (let d = fromDateKey(toDateKey(r.fromDate)); d <= r.toDate; d = addDays(d, 1)) {
      const key = toDateKey(d);
      if (!key.startsWith(`${year}-${String(mon + 1).padStart(2, "0")}`)) continue;
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(r);
    }
  }

  const cells: (string | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${year}-${String(mon + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`),
  ];

  return (
    <div className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" onClick={() => setMonth(new Date(year, mon - 1, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="min-w-36 text-center font-display text-[15px] font-semibold capitalize">
            {month.toLocaleString("en", { month: "long", year: "numeric" })}
          </p>
          <Button size="icon" variant="outline" onClick={() => setMonth(new Date(year, mon + 1, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMonth(new Date())}>
            Today
          </Button>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <CalendarDays className="h-4 w-4" />
          Approved leaves only — tap a day to see who is out
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="pb-1 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {d}
          </div>
        ))}
        {cells.map((key, i) => {
          if (!key) return <div key={`empty-${i}`} />;
          const dayLeaves = byDay.get(key) ?? [];
          const isToday = key === today;
          const isWeekend = new Date(year, mon, Number(key.slice(8))).getDay() === 0;
          return (
            <div
              key={key}
              className={`min-h-16 rounded-xl border p-1.5 transition-colors sm:min-h-24 sm:p-2 ${
                isToday ? "border-indigo-400/50 bg-indigo-500/[0.06]" : "border-edge bg-card-2"
              }`}
            >
              <p className={`text-[12px] font-semibold ${isToday ? "text-indigo-300" : isWeekend ? "text-muted-foreground/40" : "text-foreground"}`}>
                {Number(key.slice(8))}
                {isToday && <span className="ml-1 text-[9px] font-bold uppercase text-indigo-300">Today</span>}
              </p>
              {/* Mobile: dots + count (names truncate badly at 360px). Desktop: names. */}
              <div className="mt-1.5 flex flex-wrap gap-1 sm:hidden" aria-hidden="true">
                {dayLeaves.slice(0, 5).map((r) => (
                  <span
                    key={r.id}
                    className="h-2 w-2 rounded-full"
                    style={{ background: r.leaveType.color }}
                  />
                ))}
                {dayLeaves.length > 0 && (
                  <span className="text-[10px] font-medium text-muted-foreground">{dayLeaves.length}</span>
                )}
              </div>
              <p className="sr-only">
                {dayLeaves.length === 0
                  ? "No leaves"
                  : dayLeaves.map((r) => `${r.employee.firstName} ${r.employee.lastName} — ${r.leaveType.name}`).join(", ")}
              </p>
              <div className="mt-1.5 hidden space-y-1 sm:block">
                {dayLeaves.slice(0, 3).map((r) => (
                  <div
                    key={r.id}
                    className="truncate rounded-md px-1.5 py-0.5 text-[10.5px] font-medium"
                    style={{ background: `${r.leaveType.color}1f`, color: r.leaveType.color }}
                    title={`${r.employee.firstName} ${r.employee.lastName} — ${r.leaveType.name}`}
                  >
                    {r.employee.firstName} {r.employee.lastName.slice(0, 1)}
                  </div>
                ))}
                {dayLeaves.length > 3 && (
                  <p className="px-1 text-[10px] text-muted-foreground">+{dayLeaves.length - 3} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
