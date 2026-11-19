"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import { parseEmployeeImportCsv } from "@/lib/employee-import-csv";

export function EmployeeMasterImportExport({ legacyWorkbookEnabled }: { legacyWorkbookEnabled: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ createdEmployees: Array<{ employeeNumber: string; name: string }>; updatedEmployees: Array<{ employeeNumber: string; name: string }>; failed: Array<{ email: string; error: string }> } | null>(null);
  const ylrFileRef = useRef<HTMLInputElement>(null);
  const [ylrFile, setYlrFile] = useState<File | null>(null);
  const [ylrPreview, setYlrPreview] = useState<{ rows: Array<{ employeeCode: string; name: string; designation: string; department: string; messPlan: number | null }>; sheets: string[]; exceptions: string[] } | null>(null);
  const [ylrResult, setYlrResult] = useState<{ created: string[]; updated: string[]; assignments: string[]; exceptions: string[] } | null>(null);
  const [ylrEffectiveMonth, setYlrEffectiveMonth] = useState("");
  const [ylrNewEmployeeStatus, setYlrNewEmployeeStatus] = useState("active");
  const [legacyEnabled, setLegacyEnabled] = useState(legacyWorkbookEnabled);
  const [previewPage, setPreviewPage] = useState(0);
  const [warnings, setWarnings] = useState<string[]>([]);

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    setFileName("");
    setRows([]);
    setResult(null);
    setWarnings([]);
    setError(null);
    setBusy(true);
    try {
      if (!file.name.toLowerCase().endsWith(".csv")) throw new Error("Choose a CSV file.");
      const parsed = parseEmployeeImportCsv(await file.text());
      setFileName(file.name);
      setRows(parsed.map((row) => ({ ...row, status: (row.status ?? "").trim().toLowerCase() })));
      setPreviewPage(0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not read the CSV file.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function setLegacyWorkbookEnabled(enabled: boolean) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/employees/ylr-workbook-import", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not update legacy import settings.");
      setLegacyEnabled(data.enabled);
      if (!data.enabled) {
        setYlrFile(null);
        setYlrPreview(null);
        setYlrResult(null);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update legacy import settings.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!rows.length) return;
    setBusy(true); setError(null); setWarnings([]);
    try {
      const response = await fetch("/api/employees/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Bulk import failed.");
      const failed = data.failed ?? [];
      setWarnings(data.warnings ?? []);
      setResult({ createdEmployees: data.createdEmployees ?? [], updatedEmployees: data.updatedEmployees ?? [], failed });
      router.refresh();
      if (failed.length) {
        setError(`${data.created ?? 0} created, ${data.updated ?? 0} updated. ${failed.length} row(s) need correction.`);
        toast("info", "Import completed with rows needing correction.");
        return;
      }
      toast(data.warnings?.length ? "info" : "success", `${data.created ?? 0} employee(s) created · ${data.updated ?? 0} updated.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Bulk import failed."); } finally { setBusy(false); }
  }

  async function previewYlr(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) { setError("Choose an Excel .xlsx workbook."); return; }
    setBusy(true); setError(null); setYlrPreview(null); setYlrResult(null);
    try {
      const form = new FormData(); form.append("file", file);
      const response = await fetch("/api/employees/ylr-workbook-import", { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Workbook preview failed.");
      setYlrFile(file); setYlrPreview(data.preview);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Workbook preview failed."); } finally { setBusy(false); }
  }

  async function importYlr() {
    if (!ylrFile || !ylrPreview) return;
    setBusy(true); setError(null);
    try {
      const form = new FormData(); form.append("file", ylrFile);
      const query = new URLSearchParams({ confirm: "true", newEmployeeStatus: ylrNewEmployeeStatus, ...(ylrEffectiveMonth ? { effectiveMonth: ylrEffectiveMonth } : {}) });
      const response = await fetch(`/api/employees/ylr-workbook-import?${query}`, { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "YLR workbook import failed.");
      setYlrResult(data); router.refresh();
      toast("success", `${data.created?.length ?? 0} employee(s) created and ${data.updated?.length ?? 0} updated.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "YLR workbook import failed."); } finally { setBusy(false); }
  }

  return <>
    <a href="/api/employees/export" download="employees-export.csv"><Button type="button" variant="outline"><Download aria-hidden="true" className="h-4 w-4" />Export employees</Button></a>
    <Button type="button" variant="outline" onClick={() => setOpen(true)}><Upload aria-hidden="true" className="h-4 w-4" />Import employees</Button>
    <Modal open={open} onClose={() => !busy && setOpen(false)} title="Import employees" description="Upload the completed CSV template. Use employee codes or work email addresses to match existing records.">
      <div className="space-y-4">
        <a href="/api/employees/bulk" download="employees-template.csv" className="inline-flex text-sm font-semibold text-primary hover:underline">Download CSV template</a>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => void chooseFile(event.target.files?.[0])} />
        <Button type="button" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>Choose CSV file</Button>
        <details className="rounded-lg border border-edge p-3">
          <summary className="cursor-pointer text-sm font-medium">Legacy workbook import</summary>
          <p className="mt-2 text-sm text-muted-foreground">Enable this workspace setting only when migrating records from the original workbook format.</p>
          <Button className="my-3" type="button" variant="outline" disabled={busy} onClick={() => void setLegacyWorkbookEnabled(!legacyEnabled)}>
            {legacyEnabled ? "Disable legacy import" : "Enable legacy import"}
          </Button>
          {legacyEnabled && <div className="border-t border-edge pt-3">
          <p className="text-sm font-semibold">Direct YLR payroll workbook</p>
          <p className="mt-1 text-sm text-muted-foreground">Previews active YLR payroll tabs before it creates or updates employees. Summary, leave, and duplicate tabs are ignored.</p>
          <input ref={ylrFileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(event) => void previewYlr(event.target.files?.[0])} />
          <Button className="mt-3" type="button" variant="outline" loading={busy} onClick={() => ylrFileRef.current?.click()}>Choose YLR workbook</Button>
           {ylrPreview && <div className="mt-3 rounded-md bg-muted/50 p-3 text-sm"><p className="font-medium">Preview: {ylrPreview.sheets.length} active sheets, {ylrPreview.rows.length} employees</p><p className="mt-1 text-muted-foreground">{ylrPreview.sheets.join(" · ")}</p><label className="mt-3 block text-xs font-medium">Status for new employees<select value={ylrNewEmployeeStatus} disabled={busy} onChange={(event) => setYlrNewEmployeeStatus(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-card px-2 text-sm"><option value="active">Active</option><option value="inactive">Inactive</option></select></label><p className="mt-1 text-xs text-muted-foreground">Existing employee status is preserved.</p><label className="mt-3 block text-xs font-medium">Mess plan effective payroll month (optional)<input type="month" value={ylrEffectiveMonth} onChange={(event) => setYlrEffectiveMonth(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-card px-2 text-sm" /></label><p className="mt-1 text-xs text-muted-foreground">Use this when the workbook belongs to an earlier payroll month. Blank uses today.</p><details className="mt-2"><summary className="cursor-pointer font-medium">Preview employees and exceptions</summary><p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{ylrPreview.rows.slice(0, 30).map((row) => `${row.employeeCode} · ${row.name} · ${row.designation} · ${row.department} · Mess ${row.messPlan ?? "review"}`).join("\n")}{ylrPreview.rows.length > 30 ? `\n...and ${ylrPreview.rows.length - 30} more` : ""}{ylrPreview.exceptions.length ? `\n\nExceptions:\n${ylrPreview.exceptions.join("\n")}` : ""}</p></details><Button className="mt-3" type="button" loading={busy} onClick={() => void importYlr()}>Confirm YLR import</Button></div>}
          {ylrResult && <p className="mt-3 text-sm text-muted-foreground">YLR import completed: {ylrResult.created.length} created, {ylrResult.updated.length} updated, {ylrResult.assignments.length} Mess assignments, {ylrResult.exceptions.length} exceptions. Full detail is in the audit log.</p>}
          </div>}
        </details>
        {fileName && <p className="text-sm text-muted-foreground">{fileName} · {rows.length} row{rows.length === 1 ? "" : "s"} ready</p>}
        {rows.length > 0 && <div className="space-y-3 rounded-lg border border-edge p-3">
          <p className="text-sm font-semibold">Review employee status</p>
          <p className="text-xs text-muted-foreground">Choose Active or Inactive for each employee. Keep current preserves existing employees; new employees default to Active. Inactive employees cannot sign in and are excluded from new payroll generation.</p>
          <div className="max-h-80 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Employee</th><th className="p-2">Status</th></tr></thead><tbody>
            {rows.slice(previewPage * 25, (previewPage + 1) * 25).map((row, offset) => {
              const index = previewPage * 25 + offset;
              const validStatus = ["", "active", "inactive"].includes(row.status);
              return <tr key={index} className="border-t border-edge"><td className="p-2"><p>{[row.firstName, row.lastName].filter(Boolean).join(" ") || row.email || `Row ${index + 1}`}</p><p className="text-xs text-muted-foreground">{row.employeeNumber || row.deviceCode}</p></td><td className="p-2"><select aria-label={`Status for employee row ${index + 1}`} value={row.status} disabled={busy} onChange={(event) => { const status = event.target.value; setRows((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, status } : entry)); setResult(null); }} className="h-10 w-full rounded-md border border-input bg-card px-2 text-foreground"><option value="">Keep current / new: Active</option><option value="active">Active</option><option value="inactive">Inactive</option>{!validStatus && <option value={row.status}>Invalid: {row.status}</option>}</select></td></tr>;
            })}
          </tbody></table></div>
          <div className="flex items-center justify-between gap-2"><Button type="button" variant="outline" disabled={busy || previewPage === 0} onClick={() => setPreviewPage((page) => page - 1)}>Previous</Button><span className="text-xs text-muted-foreground">Page {previewPage + 1} of {Math.ceil(rows.length / 25)}</span><Button type="button" variant="outline" disabled={busy || (previewPage + 1) * 25 >= rows.length} onClick={() => setPreviewPage((page) => page + 1)}>Next</Button></div>
        </div>}
        {warnings.length > 0 && <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">{warnings.join(" ")}</p>}
        {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-foreground">{error}</p>}
        {result && <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3 text-sm"><p className="font-semibold">Import completed</p><p className="mt-1 text-muted-foreground">Created: {result.createdEmployees.length} · Updated: {result.updatedEmployees.length} · Needs correction: {result.failed.length}. The complete result is retained in the audit log.</p>{result.createdEmployees.length > 0 && <details className="mt-3"><summary className="cursor-pointer font-medium">Created employees</summary><p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{result.createdEmployees.map((employee) => `${employee.employeeNumber} · ${employee.name}`).join("\n")}</p></details>}{result.updatedEmployees.length > 0 && <details className="mt-3"><summary className="cursor-pointer font-medium">Updated employees</summary><p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{result.updatedEmployees.map((employee) => `${employee.employeeNumber} · ${employee.name}`).join("\n")}</p></details>}{result.failed.length > 0 && <details className="mt-3"><summary className="cursor-pointer font-medium">Rows needing correction</summary><p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{result.failed.map((row) => `${row.email} · ${row.error}`).join("\n")}</p></details>}</div>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button type="button" loading={busy} disabled={!rows.length} onClick={() => void submit()}>Import employees</Button></div>
      </div>
    </Modal>
  </>;
}
