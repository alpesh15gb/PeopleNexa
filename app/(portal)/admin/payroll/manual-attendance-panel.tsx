"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { PayrollAttendanceRow, ReviewedAttendanceRow } from "@/lib/payroll-attendance-import";

type Upload = { id: string; fileName: string; sheet?: string; reviewedAt?: string; rows?: PayrollAttendanceRow[]; reviewedRows?: ReviewedAttendanceRow[] };
type Decision = { rowNumber: number; excluded: boolean; blankAsUnpaid: boolean; reason: string };
const control = "rounded-lg border border-edge bg-card p-2 text-sm text-foreground";
export function ManualAttendancePanel({ month, locationId, runId, includedEmployeeIds, editable }: { month: string; locationId: string; runId?: string; includedEmployeeIds: string[]; editable: boolean }) {
  const router = useRouter();
  const endpoint = `/api/payroll/attendance-imports?${new URLSearchParams({ month, locationId, ...(runId ? { runId } : {}) })}`;
  const [history, setHistory] = useState<Upload[]>([]);
  const [upload, setUpload] = useState<Upload | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [sheet, setSheet] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<PayrollAttendanceRow[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [generationRunId, setGenerationRunId] = useState(runId);
  const [generatedIds, setGeneratedIds] = useState<string[]>([]);
  const [confirmScope, setConfirmScope] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { signal: controller.signal }).then(async response => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error); setHistory(data.uploads);
      if (data.currentUploadId) {
        const sourceResponse = await fetch(`${endpoint}&id=${encodeURIComponent(data.currentUploadId)}`, { signal: controller.signal });
        const source = await sourceResponse.json(); if (!sourceResponse.ok) throw new Error(source.error);
        setUpload(source.upload); setSheets(source.sheets); setSheet(source.upload.sheet ?? ""); setRows(source.upload.rows ?? []);
        setDecisions((source.upload.reviewedRows ?? []).map((row: ReviewedAttendanceRow) => ({ rowNumber: row.rowNumber, excluded: row.excluded, blankAsUnpaid: row.blankAsUnpaid, reason: row.reason })));
        setConfirmScope(true);
      }
    }).catch(error => { if (error.name !== "AbortError") setMessage(error.message); });
    return () => controller.abort();
  }, [endpoint]);
  function loadRows(next: PayrollAttendanceRow[], reviewed?: ReviewedAttendanceRow[]) {
    setConfirmScope(Boolean(reviewed));
    setRows(next);
    setDecisions(next.map(row => { const saved = reviewed?.find(item => item.rowNumber === row.rowNumber); return { rowNumber: row.rowNumber, excluded: saved?.excluded ?? false, blankAsUnpaid: saved?.blankAsUnpaid ?? false, reason: saved?.reason ?? "" }; }));
  }
  async function request(url: string, init?: RequestInit) {
    const response = await fetch(url, init); const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Request failed.");
    return data;
  }
  async function action(work: () => Promise<void>) {
    setBusy(true); setMessage(""); setErrors([]);
    try { await work(); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to continue."); } finally { setBusy(false); }
  }
  const change = (rowNumber: number, patch: Partial<Decision>) => setDecisions(current => current.map(row => row.rowNumber === rowNumber ? { ...row, ...patch } : row));
  async function generate() {
    if (!upload?.reviewedRows) return;
    let currentRun = generationRunId;
    const candidates = upload.reviewedRows.filter(row => !row.excluded && row.employeeId && !includedEmployeeIds.includes(row.employeeId) && !generatedIds.includes(row.employeeId));
    if (!candidates.length) { setMessage("All included employees already have payslips in this draft."); return; }
    for (let i = 0; i < candidates.length; i++) {
      const row = candidates[i];
      setMessage(`Generating ${i + 1} of ${candidates.length}: ${row.code} ${row.name}`);
      const data = await request("/api/payroll/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month, locationId, attendanceUploadId: upload.id, selectionMode: "selected", employeeIds: [row.employeeId], ...(currentRun ? { runId: currentRun } : {}) }) });
      if (!data.cancelled) { currentRun = data.runId; setGenerationRunId(currentRun); }
      if (data.created > 0) setGeneratedIds(current => [...current, row.employeeId!]);
      const failed = data.results?.filter((result: { created: boolean }) => !result.created) ?? [];
      if (failed.length) setErrors(current => [...current, ...failed.map((result: { error?: string; skipped?: string }) => `${row.code}: ${result.error ?? result.skipped}`)]);
    }
    setMessage("Generation finished. Review totals and any failures before approval.");
    if (currentRun) router.replace(`/admin/payroll?${new URLSearchParams({ period: month, location: locationId, run: currentRun })}`);
    router.refresh();
  }
  return <details className="rounded-2xl border border-edge bg-card p-5">
    <summary className="cursor-pointer font-semibold">Manual attendance upload</summary>
    <p className="mt-3 text-sm text-muted-foreground">Upload the original workbook for {month} and verify the worksheet month and location. Salary comes from PeopleNexa. P and OD count as worked; L is unpaid. Earned leave: 14–24 work days = 1, 25+ = 2, available next month after finalization. No punches or overtime are created.</p>
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-sm">Upload history<select className={control} value={upload?.id ?? ""} disabled={busy} onChange={event => { const id = event.target.value; if (!id) { setUpload(null); loadRows([]); setSheets([]); return; } void action(async () => { const data = await request(`${endpoint}&id=${encodeURIComponent(id)}`); setUpload(data.upload); setSheets(data.sheets); setSheet(data.upload.sheet ?? ""); loadRows(data.upload.rows ?? [], data.upload.reviewedRows); }); }}><option value="">Select saved upload</option>{history.map(item => <option key={item.id} value={item.id}>{item.fileName} · {item.sheet ?? "unreviewed"} · {item.id.slice(-6)}</option>)}</select></label>
      {editable && <><label className="grid gap-1 text-sm">Original Excel workbook<input type="file" accept=".xlsx" disabled={busy} onChange={event => setFile(event.target.files?.[0] ?? null)} className={control} /></label>
      <Button disabled={busy || !file} variant="outline" onClick={() => void action(async () => { const form = new FormData(); form.set("file", file!); const data = await request(endpoint, { method: "POST", body: form }); setUpload(data.upload); setSheets(data.sheets); setSheet(""); loadRows([]); setHistory(current => [data.upload, ...current]); setMessage("Original workbook saved. Select the correct worksheet."); })}>Save workbook</Button></>}
      {upload && <a className="text-sm text-primary underline" href={`${endpoint}&id=${encodeURIComponent(upload.id)}&download=1`}>Download original</a>}
    </div>
    {upload && <div className="mt-4 flex flex-wrap items-end gap-3"><label className="grid gap-1 text-sm">Worksheet<select value={sheet} className={control} disabled={busy || !!upload.reviewedAt || !editable} onChange={event => { setSheet(event.target.value); loadRows([]); }}><option value="">Choose a worksheet</option>{sheets.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
      {!upload.reviewedAt && editable && <Button variant="outline" disabled={busy || !sheet} onClick={() => void action(async () => { const data = await request(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: upload.id, sheet }) }); loadRows(data.rows); })}>Preview matches and days</Button>}
    </div>}
    {rows.length > 0 && <><p className="mt-4 text-sm">{rows.length} rows · {decisions.filter(row => !row.excluded).length} included. Exclusions and discrepancies require a reason. Calculated leave is used; spreadsheet values remain in the saved original.</p>
      <div className="mt-3 max-h-[32rem] overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{["Include", "Employee / source row", "Match", "Worked / L / blank", "Earned", "Review"].map(title => <th key={title} className="border-b border-edge p-2">{title}</th>)}</tr></thead><tbody>{rows.map(row => {
        const decision = decisions.find(item => item.rowNumber === row.rowNumber)!;
        return <tr key={row.rowNumber}><td className="border-b border-edge p-2"><input aria-label={`Include ${row.code}`} type="checkbox" checked={!decision.excluded} disabled={busy || !!upload?.reviewedAt || !editable} onChange={event => change(row.rowNumber, { excluded: !event.target.checked })} /></td><td className="border-b border-edge p-2">{row.code}<br />{row.name}<br /><span className="text-muted-foreground">Excel row {row.rowNumber}</span><details><summary className="cursor-pointer">Daily marks</summary><div className="max-w-xs">{row.marks.map((mark, i) => `${i + 1}:${mark || "blank"}`).join(" · ")}</div></details></td><td className="border-b border-edge p-2">{row.match}<br />{row.matchedCode}</td><td className="border-b border-edge p-2">{row.workDays} / {row.leaveDays} / {row.blankDays}</td><td className="border-b border-edge p-2">{row.earnedLeave}<br />from {row.availableMonth}</td><td className="min-w-72 border-b border-edge p-2">{[...row.blockers, ...row.issues].map(issue => <p key={issue}>{issue}</p>)}{row.blankDays > 0 && <label className="my-2 flex gap-2"><input type="checkbox" checked={decision.blankAsUnpaid} disabled={busy || !!upload?.reviewedAt || !editable} onChange={event => change(row.rowNumber, { blankAsUnpaid: event.target.checked })} />Treat blanks after joining as unpaid</label>}<input aria-label={`Review reason for ${row.code}`} className={`${control} w-full`} value={decision.reason} placeholder="Review / exclusion reason" disabled={busy || !!upload?.reviewedAt || !editable} onChange={event => change(row.rowNumber, { reason: event.target.value })} /></td></tr>;
      })}</tbody></table></div>
      {!upload?.reviewedAt && editable && <label className="mt-4 flex gap-2 text-sm"><input type="checkbox" checked={confirmScope} disabled={busy} onChange={event => setConfirmScope(event.target.checked)} />I verified that this worksheet belongs to {month} and the location selected above.</label>}
      {editable && <div className="mt-4 flex flex-wrap gap-3">{!upload?.reviewedAt ? <Button disabled={busy || !confirmScope} onClick={() => void action(async () => { const data = await request(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: upload!.id, decisions, confirmScope }) }); setUpload(current => ({ ...current!, reviewedAt: new Date().toISOString(), reviewedRows: data.reviewedRows })); setMessage("Review saved. Generate payroll from these inputs."); })}>Confirm reviewed attendance</Button> : <Button disabled={busy} onClick={() => void action(generate)}>Generate payroll from reviewed upload</Button>}</div>}
    </>}
    {busy && <p className="mt-3 text-sm">Processing… Keep this page open. Resume an interrupted generation using its saved upload and draft.</p>}
    {message && <p role="status" aria-live="polite" className="mt-3 text-sm">{message}</p>}
    {errors.length > 0 && <ul role="alert" className="mt-3 list-disc pl-5 text-sm">{errors.map((error, index) => <li key={index}>{error}</li>)}</ul>}
    {!editable && <p className="mt-3 text-sm text-muted-foreground">Return reviewed or approved runs to Draft before changes. Finalized payroll remains frozen.</p>}
  </details>;
}
