"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";

type Designation = { id: string; name: string; active: boolean };

export function DesignationsManager({ rows }: { rows: Designation[] }) {
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [creating, setCreating] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState("");
  const matches = rows.filter((row) =>
    row.name.toLowerCase().includes(query.trim().toLowerCase())
    && (status === "all" || row.active === (status === "active")),
  );

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (working) return;
    const { name } = Object.fromEntries(new FormData(event.currentTarget));
    setWorking("new");
    setError("");
    try {
      const response = await fetch("/api/designations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not create the designation.");
      setCreating(false);
      setQuery("");
      setStatus("all");
      router.refresh();
      toast("success", "Designation created");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not create the designation.");
    } finally {
      setWorking(null);
    }
  }

  async function toggle(row: Designation) {
    if (working) return;
    setWorking(row.id);
    try {
      const response = await fetch(`/api/designations/${row.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !row.active }) });
      if (!response.ok) throw new Error("Could not update the designation.");
      router.refresh();
      toast("success", row.active ? "Designation deactivated" : "Designation reactivated");
    } catch {
      toast("error", "Could not update the designation. Try again.");
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Designations" description="Create job titles that HR can assign in the employee directory. Deactivated titles stay on existing records." actions={<Button onClick={() => { setError(""); setCreating(true); }}>New designation</Button>} />
      <Card>
        <CardContent className="p-0">
          {rows.length > 0 && <div className="flex flex-wrap gap-3 border-b border-edge p-4">
            <Input aria-label="Search designations" placeholder="Search job titles" value={query} onChange={(event) => setQuery(event.target.value)} className="max-w-xs" />
            <Select aria-label="Designation status" className="w-auto" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
            </Select>
          </div>}
          <ul className="divide-y divide-edge">
            {matches.map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="flex min-w-0 flex-wrap items-center gap-2"><span className="break-words font-medium">{row.name}</span><Badge tone={row.active ? "success" : "neutral"}>{row.active ? "Active" : "Inactive"}</Badge></div>
              <Button size="sm" variant="outline" disabled={working !== null} aria-label={`${row.active ? "Deactivate" : "Reactivate"} ${row.name}`} onClick={() => toggle(row)}>{row.active ? "Deactivate" : "Reactivate"}</Button>
            </li>)}
          </ul>
          {!matches.length && <p className="p-6 text-sm text-muted-foreground">{rows.length ? "No designations match these filters." : "Create a designation to make it available on employee records."}</p>}
        </CardContent>
      </Card>
      <Modal open={creating} title="New designation" onClose={() => !working && setCreating(false)} size="sm">
        <form className="space-y-4" onSubmit={save}>
          <Field label="Job title"><Input name="name" required maxLength={100} placeholder="e.g. Operations Manager" /></Field>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={!!working} onClick={() => setCreating(false)}>Cancel</Button><Button type="submit" loading={working === "new"}>Create designation</Button></div>
        </form>
      </Modal>
    </div>
  );
}
