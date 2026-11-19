"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { istDateKey } from "@/lib/ist";
import { formatCalendarDate } from "@/lib/workspace-time";
import type { WorkspaceRegion } from "@/lib/workspace-region";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

interface AttendanceRow {
  id: string;
  date: string;
  punchInTime: string | null;
  punchOutTime: string | null;
  status: string;
  workingMinutes: number | null;
  employee: {
    employeeNumber: string;
    deviceCode: string | null;
    firstName: string;
    lastName: string;
    position: string | null;
    branch: { name: string } | null;
    department: { name: string } | null;
    employmentProfile: { subDepartment: string | null } | null;
    shift: { name: string } | null;
  };
  deviceIn: { name: string; serialNumber: string } | null;
  deviceOut: { name: string; serialNumber: string } | null;
}

function workingHours(minutes: number | null) {
  return minutes == null ? "—" : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function PunchDetailsTable({
  from,
  to,
  query,
  requestedPage,
  size,
  region,
}: {
  from: string;
  to: string;
  query: string;
  requestedPage: number;
  size: number;
  region: WorkspaceRegion;
}) {
  const router = useRouter();
  const [data, setData] = useState<{ total: number; page: number; rows: AttendanceRow[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const page = data?.page ?? requestedPage;
  function time(value: string | null) {
    return value ? new Intl.DateTimeFormat(region.locale, { timeZone: region.timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(value)) : "—";
  }
  function date(value: string) {
    return formatCalendarDate(istDateKey(new Date(value)), region.locale);
  }

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ from, to, page: String(requestedPage), size: String(size) });
    if (query) qs.set("q", query);
    fetch(`/api/reports/punch-details?${qs.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
        return json;
      })
      .then((json) => {
        if (!cancelled) setData({ total: json.total ?? 0, page: json.page ?? requestedPage, rows: json.rows ?? [] });
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load attendance details.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [from, to, query, requestedPage, size, retry]);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const startRow = total === 0 ? 0 : (page - 1) * size + 1;
  const endRow = Math.min(page * size, total);

  function exportExcel() {
    const qs = new URLSearchParams({ from, to, format: "xlsx" });
    if (query) qs.set("q", query);
    window.location.href = `/api/reports/punch-details?${qs.toString()}`;
  }

  function gotoPage(next: number) {
    const qs = new URLSearchParams({ from, to, size: String(size), page: String(next) });
    if (query) qs.set("q", query);
    router.push(`/admin/reports/punch-details?${qs.toString()}`);
  }

  return (
    <div className="space-y-4">
      <style>{`@media print {
  body * { visibility: hidden !important; }
  .print-report, .print-report * { visibility: visible !important; }
  .print-report { position: absolute !important; left: 0; top: 0; width: 100%; }
  .no-print { display: none !important; }
}`}</style>

      <div className="no-print flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={exportExcel}>
          <Download className="h-3.5 w-3.5" /> Export Excel
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5" /> Print
        </Button>
        <span className="ml-auto text-[12px] text-muted-foreground">
          {loading ? "Loading…" : `${startRow}–${endRow} of ${total}`}
        </span>
      </div>

      {error ? (
        <div className="flex flex-wrap items-center gap-3"><p role="alert" className="text-sm text-destructive">{error}</p><Button size="sm" variant="outline" onClick={() => setRetry((value) => value + 1)}>Retry report</Button></div>
      ) : (
        <div className="print-report overflow-x-auto rounded-xl border border-edge">
          <Table>
            <THead>
              <TR>
                <TH>Sl No</TH>
                <TH>Employee ID</TH>
                <TH className="sticky left-0 z-20 bg-card">Employee Name</TH>
                <TH>Designation</TH>
                <TH>Division Name</TH><TH>Department Name</TH><TH>Sub-Department Name</TH>
                <TH>Date</TH>
                <TH>In Device</TH><TH>In Device Serial Number</TH>
                <TH>In Time</TH>
                <TH>Out Time</TH><TH>Attendance</TH>
                <TH>Out Device</TH><TH>Out Device Serial Number</TH>
                <TH>Working Hours</TH>
              </TR>
            </THead>
            <TBody>
              {loading && (
                <TR><TD colSpan={15} className="py-10 text-center text-muted-foreground">Loading attendance details…</TD></TR>
              )}
              {!loading && (data?.rows.length ?? 0) === 0 && (
                <TR><TD colSpan={15} className="py-10 text-center text-muted-foreground">No attendance found for this filter.</TD></TR>
              )}
              {(data?.rows ?? []).map((row, i) => {
                return <TR key={row.id}>
                  <TD>{startRow + i}</TD>
                  <TD className="font-mono">{row.employee.employeeNumber}</TD>
                  <TD className="sticky left-0 z-10 bg-card"><p>{row.employee.firstName} {row.employee.lastName}</p><p className="font-mono text-[11px] text-muted-foreground md:hidden">{row.employee.employeeNumber} · {row.employee.position ?? "No designation"}</p></TD>
                  <TD>{row.employee.position ?? "—"}</TD>
                  <TD>{row.employee.branch?.name ?? "—"}</TD>
                  <TD>{row.employee.department?.name ?? "—"}</TD>
                  <TD>{row.employee.employmentProfile?.subDepartment ?? "—"}</TD>
                  <TD className="font-mono">{date(row.date)}</TD>
                  <TD><span className="block max-w-44 truncate" title={row.deviceIn?.serialNumber ?? ""}>{row.deviceIn?.name ?? "—"}</span></TD>
                  <TD className="font-mono">{row.deviceIn?.serialNumber ?? "—"}</TD>
                  <TD className="font-mono">{time(row.punchInTime)}</TD>
                  <TD className="font-mono">{time(row.punchOutTime)}</TD>
                  <TD className="capitalize">{row.status.replace(/_/g, " ")}</TD>
                  <TD><span className="block max-w-44 truncate" title={row.deviceOut?.serialNumber ?? ""}>{row.deviceOut?.name ?? "—"}</span></TD>
                  <TD className="font-mono">{row.deviceOut?.serialNumber ?? "—"}</TD>
                  <TD className="font-mono">{workingHours(row.workingMinutes)}</TD>
                </TR>;
              })}
            </TBody>
          </Table>
        </div>
      )}

      <div className="no-print flex items-center justify-between text-[13px]">
        {page > 1 ? (
          <Button variant="outline" size="sm" onClick={() => gotoPage(page - 1)}>Previous</Button>
        ) : <span />}
        <span className="text-muted-foreground">Page {page} of {totalPages}</span>
        {page < totalPages ? (
          <Button variant="outline" size="sm" onClick={() => gotoPage(page + 1)}>Next</Button>
        ) : <span />}
      </div>
    </div>
  );
}
