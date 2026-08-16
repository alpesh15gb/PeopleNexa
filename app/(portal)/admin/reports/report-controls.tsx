"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

const TYPES = [
  { key: "daily", label: "Daily summary" },
  { key: "monthly", label: "Monthly" },
  { key: "matrix", label: "Present / Absent" },
  { key: "late", label: "Late-comers" },
  { key: "shift", label: "Shift-wise" },
  { key: "overtime", label: "Overtime" },
  { key: "department", label: "Departments" },
  { key: "trend", label: "Monthly trend" },
  { key: "holiday", label: "Holiday-affected" },
  { key: "attendance_pct", label: "Attendance %" },
  { key: "missing", label: "Missing punches" },
];

export function ReportControls({
  type,
  from,
  to,
  departments,
}: {
  type: string;
  from: string;
  to: string;
  departments: { id: string; name: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(overrides: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(overrides)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    startTransition(() => router.push(`/admin/reports?${params.toString()}`));
  }

  function exportCsv() {
    const table = document.getElementById("report-table");
    if (!table) return;
    const rows = Array.from(table.querySelectorAll("tr")).map((tr) =>
      Array.from(tr.querySelectorAll("th, td"))
        .map((td) => `"${td.textContent?.trim().replace(/"/g, '""') ?? ""}"`)
        .join(",")
    );
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${type}-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        {TYPES.map((t) => (
          <button
            key={t.key}
            onClick={() => update({ type: t.key })}
            className={`rounded-full px-4 py-2 text-[13px] font-medium transition-all ${
              type === t.key
                ? "bg-gradient-brand text-white shadow-[0_4px_16px_-6px_rgba(99,102,241,0.6)]"
                : "text-muted-foreground hover:bg-tint hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">From</label>
          <Input type="date" defaultValue={from} onChange={(e) => update({ from: e.target.value })} className="w-40" />
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">To</label>
          <Input type="date" defaultValue={to} onChange={(e) => update({ to: e.target.value })} className="w-40" />
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Department</label>
          <Select defaultValue={searchParams.get("departmentId") ?? ""} onChange={(e) => update({ departmentId: e.target.value })} className="w-44">
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={pending}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
        {pending && <span className="text-[12px] text-muted-foreground animate-pulse-soft">Updating…</span>}
      </div>
    </div>
  );
}
