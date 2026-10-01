"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";

function parseCsv(text: string) {
  const rows: string[][] = [];
  let cell = ""; let row: string[] = []; let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index++; } else quoted = !quoted;
    } else if (character === "," && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index++;
      row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = "";
    } else cell += character;
  }
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows[0].map((value) => value.trim());
  return rows.slice(1, 2501).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

export function EmployeeMasterImportExport() {
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

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) { setError("Choose a CSV file."); return; }
    const parsed = parseCsv(await file.text());
    if (!parsed.length) { setError("The CSV needs a header row and at least one employee row."); return; }
    setFileName(file.name); setRows(parsed); setError(null); setResult(null);
  }

  async function submit() {
    if (!rows.length) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/employees/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Bulk import failed.");
      const failed = data.failed ?? [];
      setResult({ createdEmployees: data.createdEmployees ?? [], updatedEmployees: data.updatedEmployees ?? [], failed });
      router.refresh();
      if (failed.length) {
        setError(`${data.created ?? 0} created, ${data.updated ?? 0} updated. ${failed.length} row(s) need correction.`);
        toast("info", "Import completed with rows needing correction.");
        return;
      }
      toast("success", `${data.created ?? 0} employee(s) created · ${data.updated ?? 0} updated.`);
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
      const query = new URLSearchParams({ confirm: "true", ...(ylrEffectiveMonth ? { effectiveMonth: ylrEffectiveMonth } : {}) });
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
    <Modal open={open} onClose={() => !busy && setOpen(false)} title="Import employees" description="Upload the completed CSV template. Existing employees are matched by Device Code, Employee Code, or email.">
      <div className="space-y-4">
        <div className="rounded-lg border border-edge p-3">
          <p className="text-sm font-semibold">Direct YLR payroll workbook</p>
          <p className="mt-1 text-sm text-muted-foreground">Previews active YLR payroll tabs before it creates or updates employees. Summary, leave, and duplicate tabs are ignored.</p>
          <input ref={ylrFileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(event) => void previewYlr(event.target.files?.[0])} />
          <Button className="mt-3" type="button" variant="outline" loading={busy} onClick={() => ylrFileRef.current?.click()}>Choose YLR workbook</Button>
           {ylrPreview && <div className="mt-3 rounded-md bg-muted/50 p-3 text-sm"><p className="font-medium">Preview: {ylrPreview.sheets.length} active sheets, {ylrPreview.rows.length} employees</p><p className="mt-1 text-muted-foreground">{ylrPreview.sheets.join(" · ")}</p><label className="mt-3 block text-xs font-medium">Mess plan effective payroll month (optional)<input type="month" value={ylrEffectiveMonth} onChange={(event) => setYlrEffectiveMonth(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-card px-2 text-sm" /></label><p className="mt-1 text-xs text-muted-foreground">Use this when the workbook belongs to an earlier payroll month. Blank uses today.</p><details className="mt-2"><summary className="cursor-pointer font-medium">Preview employees and exceptions</summary><p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{ylrPreview.rows.slice(0, 30).map((row) => `${row.employeeCode} · ${row.name} · ${row.designation} · ${row.department} · Mess ${row.messPlan ?? "review"}`).join("\n")}{ylrPreview.rows.length > 30 ? `\n...and ${ylrPreview.rows.length - 30} more` : ""}{ylrPreview.exceptions.length ? `\n\nExceptions:\n${ylrPreview.exceptions.join("\n")}` : ""}</p></details><Button className="mt-3" type="button" loading={busy} onClick={() => void importYlr()}>Confirm YLR import</Button></div>}
          {ylrResult && <p className="mt-3 text-sm text-muted-foreground">YLR import completed: {ylrResult.created.length} created, {ylrResult.updated.length} updated, {ylrResult.assignments.length} Mess assignments, {ylrResult.exceptions.length} exceptions. Full detail is in the audit log.</p>}
        </div>
        <a href="/api/employees/bulk" download="employees-template.csv" className="inline-flex text-sm font-semibold text-primary hover:underline">Download CSV template</a>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => void chooseFile(event.target.files?.[0])} />
        <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>Choose CSV file</Button>
        {fileName && <p className="text-sm text-muted-foreground">{fileName} · {rows.length} row{rows.length === 1 ? "" : "s"} ready</p>}
        {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-foreground">{error}</p>}
        {result && <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3 text-sm"><p className="font-semibold">Import completed</p><p className="mt-1 text-muted-foreground">Created: {result.createdEmployees.length} · Updated: {result.updatedEmployees.length} · Needs correction: {result.failed.length}. The complete result is retained in the audit log.</p>{result.createdEmployees.length > 0 && <details className="mt-3"><summary className="cursor-pointer font-medium">Created employees</summary><p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{result.createdEmployees.map((employee) => `${employee.employeeNumber} · ${employee.name}`).join("\n")}</p></details>}{result.updatedEmployees.length > 0 && <details className="mt-3"><summary className="cursor-pointer font-medium">Updated employees</summary><p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{result.updatedEmployees.map((employee) => `${employee.employeeNumber} · ${employee.name}`).join("\n")}</p></details>}{result.failed.length > 0 && <details className="mt-3"><summary className="cursor-pointer font-medium">Rows needing correction</summary><p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{result.failed.map((row) => `${row.email} · ${row.error}`).join("\n")}</p></details>}</div>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="button" loading={busy} disabled={!rows.length} onClick={() => void submit()}>Import employees</Button></div>
      </div>
    </Modal>
  </>;
}
