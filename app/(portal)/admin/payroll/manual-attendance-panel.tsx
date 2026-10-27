"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { PayrollAttendanceRow, ReviewedAttendanceRow } from "@/lib/payroll-attendance-import";
import type { PayrollGenerationResult } from "@/lib/payroll-generation-results";

type Upload = { id: string; fileName: string; sheet?: string; reviewedAt?: string; rows?: PayrollAttendanceRow[]; reviewedRows?: ReviewedAttendanceRow[] };
type Decision = { rowNumber: number; excluded: boolean; blankAsUnpaid: boolean; reason: string };
const control = "rounded-lg border border-edge bg-card p-2 text-sm text-foreground";
export function ManualAttendancePanel({ month, locationId, runId, includedEmployeeIds, editable, openByDefault = false, blocked = false, sourceLocked = false, onBusyChange, onGenerationIssues, onInterrupted, readOnlyReason }: { month: string; locationId: string; runId?: string; includedEmployeeIds: string[]; editable: boolean; openByDefault?: boolean; blocked?: boolean; sourceLocked?: boolean; onBusyChange?: (busy: boolean) => void; onGenerationIssues?: (issues: PayrollGenerationResult[]) => void; onInterrupted?: (message: string) => void; readOnlyReason?: string }) {
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
  const [rowQuery, setRowQuery] = useState("");
  const [onlyWarnings, setOnlyWarnings] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [expanded, setExpanded] = useState(openByDefault);
  useEffect(() => { if (openByDefault) setExpanded(true); }, [openByDefault]);
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
    }).catch(error => { if (error.name !== "AbortError") setErrors([error.message]); }).finally(() => { if (!controller.signal.aborted) setLoadingHistory(false); });
    return () => controller.abort();
  }, [endpoint]);
  function loadRows(next: PayrollAttendanceRow[], reviewed?: ReviewedAttendanceRow[]) {
    setConfirmScope(Boolean(reviewed));
    setRowQuery(""); setOnlyWarnings(false);
    setRows(next);
    setDecisions(next.map(row => { const saved = reviewed?.find(item => item.rowNumber === row.rowNumber); return { rowNumber: row.rowNumber, excluded: saved?.excluded ?? false, blankAsUnpaid: saved?.blankAsUnpaid ?? false, reason: saved?.reason ?? "" }; }));
  }
  async function request(url: string, init?: RequestInit) {
    const response = await fetch(url, init); const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Request failed.");
    return data;
  }
  async function action(work: () => Promise<void>) {
    setBusy(true); onBusyChange?.(true); setMessage(""); setErrors([]);
    try { await work(); } catch (error) { setErrors([error instanceof Error ? error.message : "Unable to continue."]); } finally { setBusy(false); onBusyChange?.(false); }
  }
  const change = (rowNumber: number, patch: Partial<Decision>) => setDecisions(current => current.map(row => row.rowNumber === rowNumber ? { ...row, ...patch } : row));
  async function generate() {
    if (!upload?.reviewedRows) return;
    let currentRun = generationRunId;
    const failures: PayrollGenerationResult[] = [];
    let createdCount = 0;
    onGenerationIssues?.([]);
    const included = new Set([...includedEmployeeIds, ...generatedIds]);
    const candidates = upload.reviewedRows.filter(row => !row.excluded && row.employeeId && !included.has(row.employeeId));
    if (!candidates.length) { setMessage("All included employees already have payslips in this draft."); return; }
    try { for (let i = 0; i < candidates.length; i++) {
      const row = candidates[i];
      setMessage(`Generating ${i + 1} of ${candidates.length}: ${row.code} ${row.name}`);
      const data = await request("/api/payroll/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month, locationId, attendanceUploadId: upload.id, selectionMode: "selected", employeeIds: [row.employeeId], ...(currentRun ? { runId: currentRun } : {}) }) });
      if (!data.cancelled && typeof data.runId === "string") { currentRun = data.runId; setGenerationRunId(currentRun); }
      if (data.created > 0) { createdCount += data.created; setGeneratedIds(current => [...current, row.employeeId!]); }
      const failed: PayrollGenerationResult[] = (data.results?.filter((result: PayrollGenerationResult) => !result.created) ?? []).map((result: PayrollGenerationResult) => ({ ...result, employeeId: row.employeeId!, employeeName: `${row.code} ${row.name}` }));
      if (!data.created && !failed.length) failed.push({ employeeId: row.employeeId!, employeeName: `${row.code} ${row.name}`, created: false, error: data.cancelled ? "No payslip was created; the empty draft was cancelled." : "No payslip was created. Check the draft before retrying." });
      failures.push(...failed);
      if (failed.length) setErrors(current => [...current, ...failed.map((result: { error?: string; skipped?: string }) => `${row.code}: ${result.error ?? result.skipped}`)]);
    } } catch (error) {
      const message = `Generation stopped. Check the saved draft before retrying; some employees may already have payslips. ${error instanceof Error ? error.message : "Connection failed."}`;
      onGenerationIssues?.(failures);
      onInterrupted?.(message);
      if (currentRun) router.replace(`/admin/payroll?${new URLSearchParams({ period: month, location: locationId, run: currentRun })}`);
      router.refresh();
      throw new Error(message);
    }
    onGenerationIssues?.(failures);
    setMessage(failures.length ? `Generation finished: ${createdCount} created, ${failures.length} need attention. Review the employee reasons before approval.` : `Generation finished: ${createdCount} created. Review the draft before approval.`);
    if (currentRun) router.replace(`/admin/payroll?${new URLSearchParams({ period: month, location: locationId, run: currentRun })}`);
    router.refresh();
  }
  const includedIds = new Set([...includedEmployeeIds, ...generatedIds]);
  const decisionsByRow = new Map(decisions.map(decision => [decision.rowNumber, decision]));
  const remaining = upload?.reviewedRows?.filter(row => !row.excluded && row.employeeId && !includedIds.has(row.employeeId)).length ?? 0;
  const hasWarning = (row: PayrollAttendanceRow) => Boolean(row.blockers.length || row.issues.length || row.blankDays || decisionsByRow.get(row.rowNumber)?.excluded);
  const warningCount = rows.filter(hasWarning).length;
  const query = rowQuery.trim().toLowerCase();
  const visibleRows = rows.filter(row => (!query || `${row.code} ${row.name} ${row.matchedCode ?? ""}`.toLowerCase().includes(query)) && (!onlyWarnings || hasWarning(row)));
  const stage = !editable ? "View saved attendance workbooks" : !upload ? sourceLocked ? loadingHistory ? "Loading the workbook used for this draft" : "The workbook used for this draft is unavailable" : "1. Save the original workbook" : !sheet ? "2. Choose a worksheet" : !rows.length ? "3. Preview employee matches and days" : !upload.reviewedAt ? "4. Review and confirm the rows" : remaining ? "5. Generate the draft payroll" : "All included employees have payslips in this draft";
  return <details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)} className="rounded-2xl border border-edge bg-card p-5">
    <summary className="cursor-pointer font-semibold">Attendance workbook</summary>
    <fieldset disabled={blocked} className="min-w-0">
    <p className="mt-3 text-sm font-medium text-primary">{stage}</p>
    <p className="mt-2 text-sm text-muted-foreground">For {month}, save the original Excel file and check its worksheet and employee matches. Salary comes from PeopleNexa.</p>
    {sourceLocked && <p className="mt-2 text-sm text-muted-foreground">This draft is linked to the reviewed workbook below. To replace it, cancel the draft with a reason and start a replacement payroll.</p>}
    <details className="mt-2 text-sm text-muted-foreground"><summary className="cursor-pointer">How workbook attendance is used</summary><p className="mt-2">P and OD count as worked; L is unpaid. Earned leave: 14–24 work days = 1, 25+ = 2, available next month after finalization. No punches or overtime are created.</p></details>
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-sm">Upload history<select className={control} value={upload?.id ?? ""} disabled={busy || sourceLocked} onChange={event => { const id = event.target.value; if (!id) { setUpload(null); loadRows([]); setSheets([]); return; } void action(async () => { const data = await request(`${endpoint}&id=${encodeURIComponent(id)}`); setUpload(data.upload); setSheets(data.sheets); setSheet(data.upload.sheet ?? ""); loadRows(data.upload.rows ?? [], data.upload.reviewedRows); }); }}><option value="">Select saved upload</option>{history.map(item => <option key={item.id} value={item.id}>{item.fileName} · {item.sheet ?? "unreviewed"} · {item.id.slice(-6)}</option>)}</select></label>
      {editable && !sourceLocked && <><label className="grid gap-1 text-sm">Original Excel workbook<input type="file" accept=".xlsx" disabled={busy} onChange={event => setFile(event.target.files?.[0] ?? null)} className={control} /></label>
      <Button disabled={busy || !file} variant="outline" onClick={() => void action(async () => { const form = new FormData(); form.set("file", file!); const data = await request(endpoint, { method: "POST", body: form }); setUpload(data.upload); setSheets(data.sheets); setSheet(""); loadRows([]); setHistory(current => [data.upload, ...current]); setMessage("Original workbook saved. Select the correct worksheet."); })}>Save workbook</Button></>}
      {upload && <a className="text-sm text-primary underline" href={`${endpoint}&id=${encodeURIComponent(upload.id)}&download=1`}>Download original</a>}
    </div>
    {upload && <div className="mt-4 flex flex-wrap items-end gap-3"><label className="grid gap-1 text-sm">Worksheet<select value={sheet} className={control} disabled={busy || !!upload.reviewedAt || !editable} onChange={event => { setSheet(event.target.value); loadRows([]); }}><option value="">Choose a worksheet</option>{sheets.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
      {!upload.reviewedAt && editable && <Button variant="outline" disabled={busy || !sheet} onClick={() => void action(async () => { const data = await request(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: upload.id, sheet }) }); loadRows(data.rows); })}>Preview matches and days</Button>}
    </div>}
    {rows.length > 0 && <><p className="mt-4 text-sm">{rows.length} rows · {decisions.filter(row => !row.excluded).length} included. Exclusions and discrepancies require a reason. Calculated leave is used; spreadsheet values remain in the saved original.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="grid min-w-48 flex-1 gap-1 text-sm">Find an employee<input type="search" className={control} value={rowQuery} onChange={event => setRowQuery(event.target.value)} placeholder="Name or employee code" /></label>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={onlyWarnings} onChange={event => setOnlyWarnings(event.target.checked)} />Rows with warnings or exclusions ({warningCount})</label>
        <span className="text-xs text-muted-foreground" aria-live="polite">Showing {visibleRows.length} of {rows.length}; filters do not change the included rows.</span>
      </div>
      <div className="mt-3 max-h-[32rem] overflow-auto"><table className="block w-full text-left text-sm md:table"><thead className="hidden md:table-header-group"><tr>{["Include", "Employee / source row", "Match", "Worked / L / blank", "Earned", "Review"].map(title => <th key={title} className="border-b border-edge p-2">{title}</th>)}</tr></thead><tbody className="block md:table-row-group">{visibleRows.map(row => {
        const decision = decisionsByRow.get(row.rowNumber)!;
        return <tr key={row.rowNumber} className="mb-3 block rounded-xl border border-edge p-2 md:mb-0 md:table-row md:rounded-none md:border-0 md:p-0">
          <td className="block p-2 md:table-cell md:border-b md:border-edge"><label className="flex items-center gap-2"><input aria-label={`Include ${row.code}`} type="checkbox" checked={!decision.excluded} disabled={busy || !!upload?.reviewedAt || !editable} onChange={event => change(row.rowNumber, { excluded: !event.target.checked })} /><span className="md:hidden">Include employee</span></label></td>
          <td className="block p-2 md:table-cell md:border-b md:border-edge"><span className="block text-xs text-muted-foreground md:hidden">Employee / source row</span>{row.code}<br />{row.name}<br /><span className="text-muted-foreground">Excel row {row.rowNumber}</span><details><summary className="cursor-pointer">Daily marks</summary><div className="max-w-xs">{row.marks.map((mark, i) => `${i + 1}:${mark || "blank"}`).join(" · ")}</div></details></td>
          <td className="block p-2 md:table-cell md:border-b md:border-edge"><span className="block text-xs text-muted-foreground md:hidden">Match</span>{row.match}<br />{row.matchedCode}</td>
          <td className="block p-2 md:table-cell md:border-b md:border-edge"><span className="block text-xs text-muted-foreground md:hidden">Worked / L / blank</span>{row.workDays} / {row.leaveDays} / {row.blankDays}</td>
          <td className="block p-2 md:table-cell md:border-b md:border-edge"><span className="block text-xs text-muted-foreground md:hidden">Earned</span>{row.earnedLeave}<br />from {row.availableMonth}</td>
          <td className="block min-w-0 p-2 md:table-cell md:min-w-72 md:border-b md:border-edge"><span className="block text-xs text-muted-foreground md:hidden">Review</span>{[...row.blockers, ...row.issues].map(issue => <p key={issue}>{issue}</p>)}{row.blankDays > 0 && <label className="my-2 flex gap-2"><input type="checkbox" checked={decision.blankAsUnpaid} disabled={busy || !!upload?.reviewedAt || !editable} onChange={event => change(row.rowNumber, { blankAsUnpaid: event.target.checked })} />Treat blanks after joining as unpaid</label>}<input aria-label={`Review reason for ${row.code}`} className={`${control} w-full`} value={decision.reason} placeholder="Review / exclusion reason" disabled={busy || !!upload?.reviewedAt || !editable} onChange={event => change(row.rowNumber, { reason: event.target.value })} /></td>
        </tr>;
      })}{!visibleRows.length && <tr className="block md:table-row"><td colSpan={6} className="block p-4 text-muted-foreground md:table-cell">No matching rows. Change the search or show all rows.</td></tr>}</tbody></table></div>
      {!upload?.reviewedAt && editable && <label className="mt-4 flex gap-2 text-sm"><input type="checkbox" checked={confirmScope} disabled={busy} onChange={event => setConfirmScope(event.target.checked)} />I verified that this worksheet belongs to {month} and the location selected above.</label>}
      {editable && <div className="mt-4 flex flex-wrap gap-3">{!upload?.reviewedAt ? <Button disabled={busy || !confirmScope} onClick={() => void action(async () => { const data = await request(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: upload!.id, decisions, confirmScope }) }); setUpload(current => ({ ...current!, reviewedAt: new Date().toISOString(), reviewedRows: data.reviewedRows })); setMessage("Review saved. Generate payroll from these inputs."); })}>Confirm reviewed attendance</Button> : <Button disabled={busy || !remaining} onClick={() => void action(generate)}>Generate payroll from reviewed upload{remaining > 0 ? ` (${remaining} remaining)` : ""}</Button>}</div>}
    </>}
    {busy && <p className="mt-3 text-sm">Processing… Keep this page open. Resume an interrupted generation using its saved upload and draft.</p>}
    {message && <p role="status" aria-live="polite" className="mt-3 text-sm">{message}</p>}
    {errors.length > 0 && <ul role="alert" className="mt-3 list-disc pl-5 text-sm">{errors.map((error, index) => <li key={index}>{error}</li>)}</ul>}
    {!editable && <p className="mt-3 text-sm text-muted-foreground">{readOnlyReason ?? "Return reviewed or approved runs to Draft before changes. Finalized payroll remains frozen."}</p>}
    </fieldset>
  </details>;
}
