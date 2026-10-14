"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type Row = { id: string; punchTime: string; inOutHint: string; lat: number | null; lng: number | null; locationAccuracy: number | null; locationStatus: string | null; geofenceDistance: number | null; geofenceRadius: number | null; faceStatus: string; faceScore: number | null; authStatus: string; holdReason: string | null; photoUrl: string | null; employee: { employeeNumber: string; firstName: string; lastName: string; branch: { name: string } | null } };
export function MobilePunchesTable({ from, to }: { from: string; to: string }) {
  const [query, setQuery] = useState(""), [search, setSearch] = useState("");
  const [approval, setApproval] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[]>([]), [total, setTotal] = useState(0);
  const [error, setError] = useState(""), [loading, setLoading] = useState(false);
  useEffect(() => { const timer = setTimeout(() => { setSearch(query.trim()); setPage(1); }, 350); return () => clearTimeout(timer); }, [query]);
  const parameters = new URLSearchParams({ from, to, q: search, approval, page: String(page), size: "50" }).toString();
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    fetch(`/api/reports/mobile-punches?${parameters}`, { signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setRows(data.rows); setTotal(data.total); }).catch(error => { if (error.name !== "AbortError") setError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [parameters]);
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Every mobile attempt is listed, including punches awaiting approval and declined punches. Pending or declined punches do not count toward attendance. Older punches may have no recorded GPS accuracy or direction.</p>
    <div className="flex flex-wrap gap-3"><Input className="sm:max-w-xs" aria-label="Search mobile punches" placeholder="Search name or employee code" value={query} onChange={event => setQuery(event.target.value)} /><Select aria-label="Mobile approval status" className="sm:max-w-xs" value={approval} onChange={event => { setApproval(event.target.value); setPage(1); }}><option value="">All approval statuses</option>{["auto", "pending", "approved", "declined"].map(status => <option key={status} value={status}>{status}</option>)}</Select><a className="rounded-lg border border-edge px-3 py-2 text-sm" href={`/api/reports/mobile-punches?${parameters}&format=xlsx`}>Export Excel</a></div>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Employee", "Time (IST)", "Direction", "Location", "GPS accuracy", "Geofence", "Photo", "Face", "Approval / reason"].map(label => <th key={label} className="border-b border-edge p-3">{label}</th>)}</tr></thead><tbody>{!loading && !rows.length && <tr><td colSpan={9} className="p-5 text-center">No mobile punches found.</td></tr>}{rows.map(row => <tr key={row.id}><td className="border-b border-edge p-3">{row.employee.firstName} {row.employee.lastName}<br /><span className="font-mono text-xs">{row.employee.employeeNumber}</span><br />{row.employee.branch?.name ?? "Unassigned"}</td><td className="whitespace-nowrap border-b border-edge p-3">{new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", dateStyle: "short", timeStyle: "medium" }).format(new Date(row.punchTime))}</td><td className="border-b border-edge p-3">{row.inOutHint === "unknown" ? "Not recorded" : row.inOutHint}</td><td className="border-b border-edge p-3">{row.lat != null && row.lng != null ? <a className="text-primary underline" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps?q=${row.lat},${row.lng}`}>{row.lat.toFixed(6)}, {row.lng.toFixed(6)}</a> : "Not recorded"}</td><td className="border-b border-edge p-3">{row.locationAccuracy == null ? "Not recorded" : `±${Math.round(row.locationAccuracy)}m`}</td><td className="border-b border-edge p-3">{row.locationStatus?.replaceAll("_", " ") ?? "Not recorded"}{row.geofenceDistance != null && <p>{Math.round(row.geofenceDistance)}m away / {row.geofenceRadius}m radius</p>}</td><td className="border-b border-edge p-3">{row.photoUrl ? <a className="text-primary underline" href={row.photoUrl} target="_blank" rel="noopener noreferrer">View selfie</a> : "Unavailable / expired"}</td><td className="border-b border-edge p-3">{row.faceStatus}{row.faceScore == null ? "" : ` (${row.faceScore.toFixed(3)})`}</td><td className="border-b border-edge p-3">{row.authStatus}<br />{row.holdReason?.replaceAll("_", " ")}</td></tr>)}</tbody></table></div>
    <div role="status" aria-live="polite" className="flex flex-wrap items-center justify-between gap-3 text-sm"><Button variant="outline" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>Previous</Button><span>{loading ? "Loading…" : `${total} punches · page ${page} of ${Math.max(1, Math.ceil(total / 50))}`}</span><Button variant="outline" disabled={page * 50 >= total || loading} onClick={() => setPage(value => value + 1)}>Next</Button></div>
  </div>;
}
