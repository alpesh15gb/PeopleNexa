"use client";
import { PunchPhoto, PunchLocation } from "@/components/punch-evidence";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import type { WorkspaceRegion } from "@/lib/workspace-region";

type Row = { id: string; punchTime: string; inOutHint: string; lat: number | null; lng: number | null; locationAccuracy: number | null; locationStatus: string | null; geofenceDistance: number | null; geofenceRadius: number | null; faceStatus: string; faceScore: number | null; authStatus: string; holdReason: string | null; photoUrl: string | null; employee: { employeeNumber: string; firstName: string; lastName: string; branch: { name: string } | null } };
export function MobilePunchesTable({ from, to, query, approval, requestedPage, region }: {
  from: string; to: string; query: string; approval: string; requestedPage: number; region: WorkspaceRegion;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(requestedPage);
  const [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const scope = { from, to, ...(query && { q: query }), ...(approval && { approval }) };
  const parameters = new URLSearchParams({ ...scope, page: String(requestedPage), size: "50" }).toString();
  function gotoPage(next: number) {
    router.push(`/admin/reports/punch-details?${new URLSearchParams({ ...scope, view: "mobile", page: String(next) })}`);
  }
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setRows([]);
    fetch(`/api/reports/mobile-punches?${parameters}`, { signal: controller.signal }).then(async (response) => {
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) throw new Error(data?.error ?? "Could not load the report.");
      if (!controller.signal.aborted) { setRows(data.rows); setTotal(data.total); setPage(data.page); }
    }).catch((error) => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [parameters, retry]);
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Every mobile attempt is listed, including punches awaiting approval and declined punches. Pending or declined punches do not count toward attendance. Older punches may have no recorded GPS accuracy or direction.</p>
    <div className="flex flex-wrap gap-3"><a className="inline-flex min-h-10 items-center rounded-lg border border-edge px-3 text-sm" href={`/api/reports/mobile-punches?${new URLSearchParams({ ...scope, format: "xlsx" })}`}>Export Excel</a></div>
    {error && <div className="flex flex-wrap items-center gap-3"><p role="alert" className="text-sm text-destructive">{error}</p><Button size="sm" variant="outline" onClick={() => setRetry((value) => value + 1)}>Retry report</Button></div>}
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Employee", "Local time", "Direction", "Location", "GPS accuracy", "Geofence", "Photo", "Face", "Approval / reason"].map(label => <th key={label} className="border-b border-edge p-3">{label}</th>)}</tr></thead><tbody>{!loading && !error && !rows.length && <tr><td colSpan={9} className="p-5 text-center">No mobile punches found.</td></tr>}{rows.map(row => <tr key={row.id}><td className="border-b border-edge p-3">{row.employee.firstName} {row.employee.lastName}<br /><span className="font-mono text-xs">{row.employee.employeeNumber}</span><br />{row.employee.branch?.name ?? "Unassigned"}</td><td className="whitespace-nowrap border-b border-edge p-3">{new Intl.DateTimeFormat(region.locale, { timeZone: region.timeZone, dateStyle: "short", timeStyle: "medium" }).format(new Date(row.punchTime))}</td><td className="border-b border-edge p-3">{row.inOutHint === "unknown" ? "Not recorded" : row.inOutHint}</td><td className="border-b border-edge p-3">{row.lat != null && row.lng != null ? <PunchLocation lat={row.lat} lng={row.lng} accuracy={row.locationAccuracy} label={`${row.employee.firstName} ${row.employee.lastName} (${row.employee.employeeNumber}) — punch location`} /> : "Not recorded"}</td><td className="border-b border-edge p-3">{row.locationAccuracy == null ? "Not recorded" : `±${Math.round(row.locationAccuracy)}m`}</td><td className="border-b border-edge p-3">{row.locationStatus?.replaceAll("_", " ") ?? "Not recorded"}{row.geofenceDistance != null && <p>{Math.round(row.geofenceDistance)}m away / {row.geofenceRadius}m radius</p>}</td><td className="border-b border-edge p-3">{row.photoUrl ? <PunchPhoto src={row.photoUrl} label={`${row.employee.firstName} ${row.employee.lastName} (${row.employee.employeeNumber}) — punch selfie`} /> : "Unavailable / expired"}</td><td className="border-b border-edge p-3">{row.faceStatus}{row.faceScore == null ? "" : ` (${row.faceScore.toFixed(3)})`}</td><td className="border-b border-edge p-3">{row.authStatus}<br />{row.holdReason?.replaceAll("_", " ")}</td></tr>)}</tbody></table></div>
    <div role="status" aria-live="polite" className="flex flex-wrap items-center justify-between gap-3 text-sm"><Button variant="outline" disabled={page <= 1 || loading} onClick={() => gotoPage(page - 1)}>Previous</Button><span>{loading ? "Loading…" : `${total} punches · page ${page} of ${Math.max(1, Math.ceil(total / 50))}`}</span><Button variant="outline" disabled={page * 50 >= total || loading} onClick={() => gotoPage(page + 1)}>Next</Button></div>
  </div>;
}
