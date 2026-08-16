"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Download, Plus, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { addDays, toDateKey, fromDateKey } from "@/lib/dates";

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  department: { id: string; name: string } | null;
}

interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  isNightShift: boolean;
}

interface Department {
  id: string;
  name: string;
}

interface RosterRow {
  id: string;
  date: string;
  employeeId: string;
  employee: Employee;
  shift: Shift;
}

interface Assign {
  id: string;
  date: string;
  employeeId: string;
  employee: Employee;
  shift: Shift;
}

function weekStart(d: Date): Date {
  const day = (d.getDay() + 6) % 7; // Monday = 0
  return fromDateKey(toDateKey(addDays(d, -day)));
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function RostersPanel({
  employees,
  shifts,
  departments,
}: {
  employees: Employee[];
  shifts: Shift[];
  departments: Department[];
}) {
  const toast = useToast();
  const [week, setWeek] = useState<Date>(() => weekStart(new Date()));
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulkOpen, setBulkOpen] = useState(false);

  const from = weekStart(week);
  const to = addDays(from, 6);
  const fromKey = toDateKey(from);
  const toKey = toDateKey(to);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/rosters?from=${fromKey}&to=${toKey}`);
      const data = await res.json();
      if (res.ok) setRows(data.assignments ?? []);
    } catch {
      // keep last data
    } finally {
      setLoading(false);
    }
  }, [fromKey, toKey]);

  useEffect(() => {
    load();
  }, [load]);

  const byEmp = useMemo(() => {
    const map = new Map<string, Map<string, Assign>>();
    for (const a of rows) {
      if (!map.has(a.employeeId)) map.set(a.employeeId, new Map());
      map.get(a.employeeId)!.set(a.date, a);
    }
    return map;
  }, [rows]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(from, i)), [from]);
  const assignedCount = new Set(rows.map((r) => `${r.employeeId}|${r.date}`)).size;

  function exportCsv() {
    const header = ["Employee", "Emp No", ...days.map((d) => toDateKey(d))].join(",");
    const lines = employees.map((e) => {
      const cell = (d: Date) => {
        const a = byEmp.get(e.id)?.get(toDateKey(d));
        return a ? `"${a.shift.name} ${a.shift.startTime}-${a.shift.endTime}"` : "";
      };
      return [`"${e.firstName} ${e.lastName}"`, e.employeeNumber, ...days.map(cell)].join(",");
    });
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `roster-${fromKey}-to-${toKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast("success", "Roster CSV downloaded");
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-3">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" onClick={() => setWeek(addDays(week, -7))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="min-w-44 text-center text-[13.5px] font-semibold">
            {fromKey} → {toKey}
          </p>
          <Button size="icon" variant="outline" onClick={() => setWeek(addDays(week, 7))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setWeek(weekStart(new Date()))}>
            This week
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-muted-foreground">{assignedCount} assignments</span>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button size="sm" onClick={() => setBulkOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Bulk assign
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-left">
          <thead>
            <tr className="border-b border-edge text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="sticky left-0 z-10 bg-card-2 px-4 py-2.5 font-semibold">Employee</th>
              {days.map((d) => (
                <th key={toDateKey(d)} className="px-2 py-2.5 text-center font-semibold">
                  <span className="block">{DAY_LABELS[(d.getDay() + 6) % 7]}</span>
                  <span className="text-muted-foreground/60">{d.getDate()}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center text-[13px] text-muted-foreground">
                  Loading roster…
                </td>
              </tr>
            ) : employees.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center text-[13px] text-muted-foreground">
                  No active employees yet.
                </td>
              </tr>
            ) : (
              employees.map((e) => (
                <tr key={e.id} className="border-b border-edge/60 last:border-0">
                  <td className="sticky left-0 z-10 bg-card-2 px-4 py-2">
                    <p className="text-[13px] font-semibold leading-tight">
                      {e.firstName} {e.lastName}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {e.employeeNumber}
                      {e.department ? ` · ${e.department.name}` : ""}
                    </p>
                  </td>
                  {days.map((d) => {
                    const key = toDateKey(d);
                    const a = byEmp.get(e.id)?.get(key);
                    const isWeekend = [0, 6].includes(d.getDay());
                    return (
                      <td key={key} className="px-2 py-2 text-center">
                        {a ? (
                          <span
                            className={`inline-block rounded-lg px-2 py-1 text-[11.5px] font-semibold ${
                              a.shift.isNightShift
                                ? "bg-indigo-500/15 text-indigo-300"
                                : "bg-emerald-500/10 text-emerald-300"
                            }`}
                            title={`${a.shift.startTime}–${a.shift.endTime}`}
                          >
                            {a.shift.name}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground/40">
                            {isWeekend ? "Off" : "—"}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <BulkAssignModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        employees={employees}
        shifts={shifts}
        departments={departments}
        onDone={(msg) => {
          setBulkOpen(false);
          toast("success", msg);
          load();
        }}
        onError={(msg) => toast("error", msg)}
      />
    </div>
  );
}

function BulkAssignModal({
  open,
  onClose,
  employees,
  shifts,
  departments,
  onDone,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  employees: Employee[];
  shifts: Shift[];
  departments: Department[];
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [mode, setMode] = useState<"employees" | "department">("employees");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(new Set(employees.map((e) => e.id)));
      setMode("employees");
    }
  }, [open, employees]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      shiftId: form.get("shiftId"),
      dateFrom: form.get("dateFrom"),
      dateTo: form.get("dateTo"),
      overwrite: form.get("overwrite") === "on",
    };
    if (mode === "department") body.departmentId = form.get("departmentId");
    else body.employeeIds = [...selected];
    try {
      const res = await fetch("/api/rosters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        onError(data.error ?? "Bulk assign failed");
        return;
      }
      const clashMsg = data.clashes > 0 ? ` · ${data.clashes} skipped (already assigned)` : "";
      onDone(`${data.created} assignments created over ${data.days} days for ${data.employees} employees${clashMsg}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Bulk assign shifts" size="md">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Shift">
            <Select name="shiftId" required>
              <option value="">Select shift</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.startTime}–{s.endTime})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="From">
            <Input name="dateFrom" type="date" required />
          </Field>
          <Field label="To" hint="Max 31 days">
            <Input name="dateTo" type="date" required />
          </Field>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode("employees")}
            className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
              mode === "employees" ? "bg-indigo-500/15 text-indigo-300" : "text-muted-foreground hover:bg-tint"
            }`}
          >
            Pick employees ({selected.size})
          </button>
          <button
            type="button"
            onClick={() => setMode("department")}
            className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
              mode === "department" ? "bg-indigo-500/15 text-indigo-300" : "text-muted-foreground hover:bg-tint"
            }`}
          >
            Whole department
          </button>
        </div>

        {mode === "department" ? (
          <Field label="Department">
            <Select name="departmentId" required>
              <option value="">Select department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-edge p-2">
            {employees.map((e) => (
              <label
                key={e.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors hover:bg-tint"
              >
                <input
                  type="checkbox"
                  checked={selected.has(e.id)}
                  onChange={() => toggle(e.id)}
                  className="h-4 w-4 accent-indigo-500"
                />
                <span className="font-medium">{e.firstName} {e.lastName}</span>
                <span className="ml-auto text-[11.5px] text-muted-foreground">
                  {e.employeeNumber}{e.department ? ` · ${e.department.name}` : ""}
                </span>
              </label>
            ))}
          </div>
        )}

        <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <input type="checkbox" name="overwrite" className="h-4 w-4 accent-amber-500" />
          Overwrite existing assignments in range
        </label>

        <div className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-500/5 px-3.5 py-2.5 text-[12.5px] text-amber-200/90">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Existing assignments are skipped (reported as clashes) unless overwrite is on. Roster shifts drive
          auto punch-out and shift-wise reports.
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>Assign</Button>
        </div>
      </form>
    </Modal>
  );
}
