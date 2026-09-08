"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

const TYPES = [
  { key: "device-daily", label: "Daily Attendance" },
  { key: "device-monthly", label: "Monthly Attendance" },
  { key: "device-status-matrix", label: "Status Matrix" },
  { key: "device-work-summary", label: "Work Summary" },
  { key: "device-performance", label: "Performance" },
];

export function ReportControls({
  type,
  departments,
  branches,
}: {
  type: string;
  departments: { id: string; name: string }[];
  branches?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const departmentId = searchParams.get("departmentId") ?? "";
  const branchId = searchParams.get("branchId") ?? "";
  const deviceDate = searchParams.get("date") ?? "";
  const deviceMonth = searchParams.get("month") ?? "";

  function update(overrides: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(overrides)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    startTransition(() => router.push(`/admin/reports?${params.toString()}`));
  }

  function reset() {
    startTransition(() => router.push("/admin/reports"));
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
        {type === "device-daily" && (
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Date</label>
            <Input key={`devdate-${deviceDate}`} type="date" defaultValue={deviceDate} onChange={(e) => update({ date: e.target.value })} className="w-40" />
          </div>
        )}
        {type !== "device-daily" && (
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Month</label>
            <Input key={`devmonth-${deviceMonth}`} type="month" defaultValue={deviceMonth} onChange={(e) => update({ month: e.target.value })} className="w-40" />
          </div>
        )}
        {branches && branches.length > 0 && (
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Branch</label>
            <Select key={`branch-${branchId}`} defaultValue={branchId} onChange={(e) => update({ branchId: e.target.value })} className="w-44">
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </div>
        )}
        <div>
          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Department</label>
          <Select key={`dept-${departmentId}`} defaultValue={departmentId} onChange={(e) => update({ departmentId: e.target.value })} className="w-44">
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
        </div>
        <Button variant="ghost" onClick={reset} disabled={pending}>
          <RotateCcw className="h-4 w-4" /> Reset
        </Button>
        {pending && <span className="text-[12px] text-muted-foreground animate-pulse-soft">Updating…</span>}
      </div>
    </div>
  );
}
