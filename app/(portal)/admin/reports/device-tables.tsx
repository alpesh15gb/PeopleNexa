"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/stat";
import { Download, Printer } from "lucide-react";
import type { DeviceDailyOutput, DeviceMonthlyOutput, DevicePerformanceOutput, DeviceStatusMatrixOutput, DeviceWorkSummaryOutput } from "@/lib/device-report";

export type DeviceKind = "daily" | "monthly" | "status-matrix" | "work-summary" | "performance";

export function DeviceTables({
  kind,
  apiUrl,
  xlsxUrl,
}: {
  kind: DeviceKind;
  apiUrl: string;
  xlsxUrl: string;
}) {
  function exportExcel() {
    const search = document.querySelector<HTMLInputElement>('[aria-label="Search employees in this report"]')?.value.trim();
    const url = new URL(xlsxUrl, window.location.origin);
    if (search) url.searchParams.set("q", search);
    window.location.href = url.toString();
  }
  return (
    <div className="space-y-4">
      <style>{`@media print {
  body * { visibility: hidden !important; }
  .print-report, .print-report * { visibility: visible !important; }
  .print-report { position: absolute !important; left: 0; top: 0; width: 100%; }
  .no-print { display: none !important; }
}`}</style>

      <div className="no-print flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={exportExcel}>
          <Download className="h-4 w-4" /> Export Excel
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> {kind === "daily" ? "Print" : "Print current page"}
        </Button>
      </div>

      {kind === "daily" ? (
        <DailyDirect apiUrl={apiUrl} />
      ) : kind === "monthly" ? (
        <MonthlyTables baseUrl={apiUrl} />
      ) : kind === "status-matrix" ? (
        <StatusMatrixTables baseUrl={apiUrl} />
      ) : kind === "work-summary" ? (
        <WorkSummaryTables baseUrl={apiUrl} />
      ) : (
        <PerformanceTables baseUrl={apiUrl} />
      )}
    </div>
  );
}

/** Screen fetches stay small: monthly kinds page server-side (25 staff). */
const PAGE_SIZE = 25;

function usePagedDevice(baseUrl: string) {
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(0);
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const url =
    `${baseUrl}&page=${page}` +
    (debouncedQuery ? `&q=${encodeURIComponent(debouncedQuery)}` : "");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    fetch(url)
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
  }, [url]);

  const total =
    typeof (data as { total?: unknown })?.total === "number"
      ? (data as { total: number }).total
      : null;
  return { data, loading, error, page, setPage, query, setQuery, total };
}

function LoadingCard() {
  return (
    <Card>
      <CardContent>
        <EmptyState title="Loading report…" description="Fetching device attendance." />
      </CardContent>
    </Card>
  );
}

function ErrorCard({ error }: { error: string }) {
  return (
    <Card>
      <CardContent>
        <EmptyState title="Could not load report" description={error} />
      </CardContent>
    </Card>
  );
}

function ReportPager({
  query,
  setQuery,
  page,
  setPage,
  total,
}: {
  query: string;
  setQuery: (s: string) => void;
  page: number;
  setPage: (n: number) => void;
  total: number;
}) {
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  return (
    <div className="no-print flex flex-wrap items-center gap-3">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search code or name…"
        aria-label="Search employees in this report"
        className="h-9 min-h-[36px] w-56 rounded-lg border border-input bg-tint px-3 text-[12.5px] outline-none focus:border-primary/60"
      />
      <span className="text-[12px] text-muted-foreground">
        Showing {total === 0 ? 0 : safePage * PAGE_SIZE + 1}–
        {Math.min(total, safePage * PAGE_SIZE + PAGE_SIZE)} of {total}
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
  );
}

function DailyDirect({ apiUrl }: { apiUrl: string }) {
  const [data, setData] = useState<DeviceDailyOutput | null>(null);
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

  if (loading) return <LoadingCard />;
  if (error || !data) return <ErrorCard error={error ?? "Failed to load report."} />;
  return <DailyTable output={data} />;
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
  const rows = Array.isArray((output as { rows?: unknown })?.rows)
    ? (output as DeviceDailyOutput).rows
    : [];
  const columns = Array.isArray((output as { columns?: unknown })?.columns)
    ? (output as DeviceDailyOutput).columns
    : [];
  if (rows.length === 0) {
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
              {columns.map((c) => (
                <th key={c} className={TH}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
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

function MonthlyTables({ baseUrl }: { baseUrl: string }) {
  const { data, loading, error, query, setQuery, page, setPage, total } = usePagedDevice(baseUrl);
  if (loading) return <LoadingCard />;
  if (error || !data) return <ErrorCard error={error ?? "Failed to load report."} />;
  const output = data as DeviceMonthlyOutput;
  const blocks = Array.isArray((output as { blocks?: unknown })?.blocks) ? output.blocks : [];
  const visible = blocks;
  if (blocks.length === 0) {
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
      <ReportPager query={query} setQuery={setQuery} page={page} setPage={setPage} total={total ?? blocks.length} />
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

function statusCellClass(status: string): string {
  if (status === "P" || status === "½P") return `${TD} text-center font-bold text-green-600`;
  if (status === "A") return `${TD} text-center font-bold text-red-600`;
  return `${TD} text-center font-bold`;
}

function StatusMatrixTables({ baseUrl }: { baseUrl: string }) {
  const { data, loading, error, query, setQuery, page, setPage, total } = usePagedDevice(baseUrl);
  if (loading) return <LoadingCard />;
  if (error || !data) return <ErrorCard error={error ?? "Failed to load report."} />;
  const output = data as DeviceStatusMatrixOutput;
  const blocks = Array.isArray((output as { blocks?: unknown })?.blocks) ? output.blocks : [];
  const visible = blocks;
  if (blocks.length === 0) {
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
      <ReportPager query={query} setQuery={setQuery} page={page} setPage={setPage} total={total ?? blocks.length} />
      <div className="print-report space-y-8 bg-white p-4 text-black">
        <ReportHeader left={output.header.left} center={output.header.center} right={output.header.right} />
        {output.department && (
          <p className="bg-white text-[13px] font-semibold text-black">Department | {output.department}</p>
        )}
        {visible.map((block) => (
          <div key={block.code}>
            <p className="mb-1 bg-white text-[13px] font-semibold text-black">
              Emp. Code {block.code} Emp. Name {block.name}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse bg-white">
                <thead>
                  <tr>
                    <th className={TH}></th>
                    {block.days.map((d) => (
                      <th key={d.day} className={`${TH} text-center`}>
                        {d.day} {d.dow}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className={`${TD} font-bold`}>Status</td>
                    {block.days.map((d) => (
                      <td key={d.day} className={statusCellClass(d.status)}>{d.status}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className={`${TD} font-bold`}>InTime</td>
                    {block.days.map((d) => (
                      <td key={d.day} className={`${TD} text-center font-mono`}>{d.inTime}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className={`${TD} font-bold`}>OutTime</td>
                    {block.days.map((d) => (
                      <td key={d.day} className={`${TD} text-center font-mono`}>{d.outTime}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className={`${TD} font-bold`}>Total</td>
                    {block.days.map((d) => (
                      <td key={d.day} className={`${TD} text-center font-mono`}>{d.total}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const WORK_SUMMARY_COLUMNS = ["Date", "Shift", "First IN", "Last OUT", "Gross", "Work Hours", "Late", "Overtime", "Early"];

function WorkSummaryTables({ baseUrl }: { baseUrl: string }) {
  const { data, loading, error, query, setQuery, page, setPage, total } = usePagedDevice(baseUrl);
  if (loading) return <LoadingCard />;
  if (error || !data) return <ErrorCard error={error ?? "Failed to load report."} />;
  const output = data as DeviceWorkSummaryOutput;
  const blocks = Array.isArray((output as { blocks?: unknown })?.blocks) ? output.blocks : [];
  const visible = blocks;
  if (blocks.length === 0) {
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
      <ReportPager query={query} setQuery={setQuery} page={page} setPage={setPage} total={total ?? blocks.length} />
      <div className="print-report space-y-8 bg-white p-4 text-black">
        <ReportHeader left={output.header.left} center={output.header.center} right={output.header.right} />
        <p className="bg-white text-[12px] text-black">
          Run by {output.header.runBy} | Date/Time {output.header.generatedAt}
        </p>
        {visible.map((block) => (
          <div key={block.code}>
            <p className="mb-1 bg-white text-[13px] font-semibold text-black">
              {block.code} - {block.name}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse bg-white">
                <thead>
                  <tr>
                    {WORK_SUMMARY_COLUMNS.map((c) => (
                      <th key={c} className={TH}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((r) => (
                    <tr key={r.dayKey}>
                      <td className={`${TD} font-mono`}>{r.date}</td>
                      <td className={TD}>{r.shift}</td>
                      <td className={`${TD} font-mono`}>{r.firstIn}</td>
                      <td className={`${TD} font-mono`}>{r.lastOut}</td>
                      <td className={`${TD} font-mono`}>{r.gross}</td>
                      <td className={`${TD} font-mono`}>{r.work}</td>
                      <td className={`${TD} font-mono`}>{r.late}</td>
                      <td className={`${TD} font-mono`}>{r.overtime}</td>
                      <td className={`${TD} font-mono`}>{r.early}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className={`${TD} font-bold`}>Totals</td>
                    <td className={TD}></td>
                    <td className={TD}></td>
                    <td className={TD}></td>
                    <td className={`${TD} font-mono font-bold`}>{block.totals.gross}</td>
                    <td className={`${TD} font-mono font-bold`}>{block.totals.work}</td>
                    <td className={`${TD} font-mono font-bold`}>{block.totals.late}</td>
                    <td className={`${TD} font-mono font-bold`}>{block.totals.overtime}</td>
                    <td className={`${TD} font-mono font-bold`}>{block.totals.early}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PerformanceTables({ baseUrl }: { baseUrl: string }) {
  const { data, loading, error, query, setQuery, page, setPage, total } = usePagedDevice(baseUrl);
  if (loading) return <LoadingCard />;
  if (error || !data) return <ErrorCard error={error ?? "Failed to load report."} />;
  const output = data as DevicePerformanceOutput;
  const blocks = Array.isArray((output as { blocks?: unknown })?.blocks) ? output.blocks : [];
  const visible = blocks;
  if (blocks.length === 0) {
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
      <ReportPager query={query} setQuery={setQuery} page={page} setPage={setPage} total={total ?? blocks.length} />
      <div className="print-report space-y-8 bg-white p-4 text-black">
        {visible.map((block, i) => (
          <div key={block.code}>
            {i === 0 && (
              <ReportHeader left={output.header.left} center={output.header.center} right={output.header.right} />
            )}
            <p className="mb-1 bg-white text-[13px] font-semibold text-black">
              Dep | {block.department} | Name | {block.name} | E.Code | {block.code} | Desig | {block.designation} | Shift | {block.shiftHours}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse bg-white">
                <thead>
                  <tr>
                    <th className={TH}></th>
                    {block.days.map((d) => (
                      <th key={d.day} className={`${TH} text-center`}>
                        {d.day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className={`${TD} font-bold`}>Status</td>
                    {block.days.map((d) => (
                      <td key={d.day} className={statusCellClass(d.status)}>{d.status}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className={`${TD} font-bold`}>IN</td>
                    {block.days.map((d) => (
                      <td key={d.day} className={`${TD} text-center font-mono`}>{d.inTime}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className={`${TD} font-bold`}>OUT</td>
                    {block.days.map((d) => (
                      <td key={d.day} className={`${TD} text-center font-mono`}>{d.outTime}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className={`${TD} font-bold`}>Shift</td>
                    {block.days.map((d) => (
                      <td key={d.day} className={`${TD} text-center`}>{d.shift}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className={`${TD} font-bold`}>Late</td>
                    {block.days.map((d) => (
                      <td key={d.day} className={`${TD} text-center font-mono`}>{d.late}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className={`${TD} font-bold`}>OT</td>
                    {block.days.map((d) => (
                      <td key={d.day} className={`${TD} text-center font-mono`}>{d.ot}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className={`${TD} font-bold`}>Early</td>
                    {block.days.map((d) => (
                      <td key={d.day} className={`${TD} text-center font-mono`}>{d.early}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-1 bg-white text-[12px] text-black">
              Total Working Hrs: {block.totals.work} | Total OT Hrs: {block.totals.ot} | Present: {block.totals.present} Absent: {block.totals.absent} | Paid Day: {block.totals.paidDay} | WO: {block.totals.wo} HLD: {block.totals.hld} Leave: {block.totals.leave}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
