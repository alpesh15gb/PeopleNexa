"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Printer, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

interface PunchRow {
  id: string;
  punchTime: string;
  inOutHint: string;
  employee: {
    employeeNumber: string;
    deviceCode: string | null;
    firstName: string;
    lastName: string;
    branch: { name: string } | null;
    department: { name: string } | null;
  };
  device: { name: string; serialNumber: string } | null;
  realtimeDevice: { name: string; serialNumber: string } | null;
}

export function PunchDetailsTable({
  from,
  to,
  initialQuery,
  initialPage,
  initialSize,
}: {
  from: string;
  to: string;
  initialQuery: string;
  initialPage: number;
  initialSize: number;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery);
  const [page, setPage] = useState(initialPage);
  const [size, setSize] = useState(initialSize);
  const [data, setData] = useState<{ total: number; punches: PunchRow[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 400);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debounced, from, to]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ from, to, page: String(page), size: String(size) });
    if (debounced) qs.set("q", debounced);
    fetch(`/api/reports/punch-details?${qs.toString()}`)
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
        return json;
      })
      .then((json) => {
        if (!cancelled) setData({ total: json.total ?? 0, punches: json.punches ?? [] });
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load punches.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, debounced, page, size]);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const startRow = total === 0 ? 0 : (page - 1) * size + 1;
  const endRow = Math.min(page * size, total);

  function exportExcel() {
    const qs = new URLSearchParams({ from, to, format: "xlsx" });
    if (debounced) qs.set("q", debounced);
    window.location.href = `/api/reports/punch-details?${qs.toString()}`;
  }

  function gotoPage(next: number) {
    const qs = new URLSearchParams({ from, to, page: String(next) });
    if (debounced) qs.set("q", debounced);
    router.push(`/admin/reports/punch-details?${qs.toString()}`);
    setPage(next);
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
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" placeholder="Search name or code" aria-label="Search punches" />
        </div>
        <Select value={String(size)} onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }} className="w-20" aria-label="Rows per page">
          {[50, 100, 200, 500].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
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
        <p className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-300">{error}</p>
      ) : (
        <div className="print-report overflow-x-auto rounded-xl border border-edge">
          <Table>
            <THead>
              <TR>
                <TH>Sl No</TH>
                <TH>Employee Id</TH>
                <TH>Employee Name</TH>
                <TH>Division</TH>
                <TH>Machine</TH>
                <TH>Punch Time</TH>
                <TH>Type</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {loading && (
                <TR><TD colSpan={8} className="py-10 text-center text-muted-foreground">Loading punches…</TD></TR>
              )}
              {!loading && (data?.punches.length ?? 0) === 0 && (
                <TR><TD colSpan={8} className="py-10 text-center text-muted-foreground">No punches found for this filter.</TD></TR>
              )}
              {(data?.punches ?? []).map((p, i) => {
                const machine = p.device ?? p.realtimeDevice;
                return <TR key={p.id}>
                  <TD>{startRow + i}</TD>
                  <TD className="font-mono">{p.employee.employeeNumber}</TD>
                  <TD>{p.employee.firstName} {p.employee.lastName}</TD>
                  <TD>{p.employee.branch?.name ?? "—"}</TD>
                  <TD>
                    <span className="block max-w-44 truncate" title={machine?.name ?? ""}>{machine?.name ?? "—"}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{machine?.serialNumber ?? ""}</span>
                  </TD>
                  <TD className="font-mono">{new Date(p.punchTime).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</TD>
                  <TD className="uppercase">{p.inOutHint}</TD>
                  <TD className="text-emerald-400">ACTIVE</TD>
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
