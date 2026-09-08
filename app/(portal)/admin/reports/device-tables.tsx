"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/stat";
import { Download, Printer } from "lucide-react";
import type { DeviceDailyOutput, DeviceMonthlyOutput } from "@/lib/device-report";

export type DeviceKind = "daily" | "monthly";

export function DeviceTables({
  kind,
  apiUrl,
  xlsxUrl,
}: {
  kind: DeviceKind;
  apiUrl: string;
  xlsxUrl: string;
}) {
  const [data, setData] = useState<DeviceDailyOutput | DeviceMonthlyOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    fetch(apiUrl)
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
        return json;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load report.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  return (
    <div className="space-y-4">
      <style>{`@media print {
  body * { visibility: hidden !important; }
  .print-report, .print-report * { visibility: visible !important; }
  .print-report { position: absolute !important; left: 0; top: 0; width: 100%; }
  .no-print { display: none !important; }
}`}</style>

      <div className="no-print flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={() => (window.location.href = xlsxUrl)}>
          <Download className="h-4 w-4" /> Export Excel
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print
        </Button>
        {loading && <span className="text-[12px] text-muted-foreground animate-pulse-soft">Loading…</span>}
      </div>

      {loading && (
        <Card>
          <CardContent>
            <EmptyState title="Loading report…" description="Fetching device attendance." />
          </CardContent>
        </Card>
      )}

      {!loading && error && (
        <Card>
          <CardContent>
            <EmptyState title="Could not load report" description={error} />
          </CardContent>
        </Card>
      )}

      {!loading && !error && data && kind === "daily" && <DailyTable output={data as DeviceDailyOutput} />}
      {!loading && !error && data && kind === "monthly" && <MonthlyTables output={data as DeviceMonthlyOutput} />}
    </div>
  );
}

const TH = "border border-neutral-300 bg-neutral-100 px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wide text-black";
const TD = "border border-neutral-300 px-2 py-1.5 text-[12px] text-black";

function ReportHeader({ left, center, right }: { left: string; center: string; right: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-4 bg-white px-1 py-2 text-black">
      <p className="text-[13px] font-semibold">{left}</p>
      <p className="text-[15px] font-bold">{center}</p>
      <p className="text-[13px] font-semibold">{right}</p>
    </div>
  );
}

function DailyTable({ output }: { output: DeviceDailyOutput }) {
  if (output.rows.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState title="No employees" description="No active employees match this filter for the selected day." />
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="print-report bg-white p-4 text-black">
      <ReportHeader left={output.header.left} center={output.header.center} right={output.header.right} />
      <div className="overflow-x-auto">
        <table id="report-table" className="w-full border-collapse bg-white">
          <thead>
            <tr>
              {output.columns.map((c) => (
                <th key={c} className={TH}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {output.rows.map((r) => (
              <tr key={r.code}>
                <td className={TD}>{r.code}</td>
                <td className={TD}>{r.name}</td>
                <td className={TD}>{r.designation}</td>
                <td className={TD}>{r.shift}</td>
                <td className={`${TD} font-mono`}>{r.inTime}</td>
                <td className={`${TD} font-mono`}>{r.outTime}</td>
                <td className={`${TD} font-mono`}>{r.late}</td>
                <td className={`${TD} font-mono`}>{r.early}</td>
                <td className={`${TD} font-mono`}>{r.duration}</td>
                <td className={`${TD} font-mono`}>{r.overtime}</td>
                <td className={`${TD} font-mono text-[11px]`}>{r.punches}</td>
                <td className={`${TD} text-center font-bold`}>{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MonthlyTables({ output }: { output: DeviceMonthlyOutput }) {
  // 467 employees × 30 days will not render at once (tab freezes) — search +
  // paginate on screen. Full-month artifacts come from Export Excel; Print
  // covers the current page.
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;
  const q = query.trim().toLowerCase();
  const filtered = q
    ? output.blocks.filter(
        (b) => b.code.toLowerCase().includes(q) || b.name.toLowerCase().includes(q)
      )
    : output.blocks;
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  if (output.blocks.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState title="No employees" description="No active employees match this filter for the selected month." />
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          placeholder="Search code or name…"
          aria-label="Search employees in this report"
          className="h-9 min-h-[36px] w-56 rounded-lg border border-input bg-tint px-3 text-[12.5px] outline-none focus:border-primary/60"
        />
        <span className="text-[12px] text-muted-foreground">
          Showing {filtered.length === 0 ? 0 : safePage * PAGE_SIZE + 1}–
          {Math.min(filtered.length, safePage * PAGE_SIZE + PAGE_SIZE)} of {filtered.length}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
            Prev
          </Button>
          <span className="text-[12px] text-muted-foreground">
            Page {safePage + 1} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(safePage + 1)}
          >
            Next
          </Button>
        </div>
      </div>
      {filtered.length === 0 && (
        <Card>
          <CardContent>
            <EmptyState title="No matches" description={`No employees match "${query.trim()}".`} />
          </CardContent>
        </Card>
      )}
    <div className="print-report space-y-8 bg-white p-4 text-black">
      {visible.map((block) => (
        <div key={block.code}>
          <ReportHeader left={output.header.left} center={output.header.center} right={output.header.right} />
          <p className="mb-1 bg-white text-[13px] font-semibold text-black">
            Code | {block.code} | Name | {block.name} | Designation | {block.designation}
          </p>
          <p className="mb-2 bg-white text-[12px] text-black">{block.summaryLine}</p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse bg-white">
              <thead>
                <tr>
                  {output.columns.map((c) => (
                    <th key={c} className={TH}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.days.map((d) => (
                  <tr key={d.day}>
                    <td className={`${TD} text-center`}>{d.day}</td>
                    <td className={`${TD} text-center font-bold`}>{d.status}</td>
                    <td className={TD}>{d.shift}</td>
                    <td className={`${TD} font-mono`}>{d.inTime}</td>
                    <td className={`${TD} font-mono`}>{d.outTime}</td>
                    <td className={`${TD} font-mono`}>{d.lateBy}</td>
                    <td className={`${TD} font-mono`}>{d.earlyBy}</td>
                    <td className={`${TD} font-mono`}>{d.duration}</td>
                    <td className={`${TD} font-mono`}>{d.overTime}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
    </div>
  );
}
