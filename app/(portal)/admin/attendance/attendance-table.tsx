"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ListChecks, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusPill, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

interface PunchRow {
  id: string;
  time: string;
  source: string;
  type: string;
  deviceSn?: string | null;
}

interface Row {
  employeeId: string;
  employeeNumber: string;
  name: string;
  department: string;
  shift: string;
  record: {
    id: string;
    punchIn: string;
    punchOut: string;
    lateMinutes: number;
    status: string;
    note: string | null;
    reviewStatus: string | null;
    punches: PunchRow[] | null;
  } | null;
  leave: { type: string; color: string } | null;
}

const IST_OFFSET_MS = 5.5 * 3600 * 1000;
const pad = (n: number) => String(n).padStart(2, "0");
const fmtIST = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + IST_OFFSET_MS);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
const fmtISTFull = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + IST_OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

export function AttendanceTable({ rows, date }: { rows: Row[]; date: string }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [correction, setCorrection] = useState<Row["record"] | null>(null);
  const [newTime, setNewTime] = useState("");

  async function save(recordId: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/attendance/${recordId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Failed to update");
        return;
      }
      toast("success", "Attendance status updated");
      setEditing(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function refreshRecord(recordId: string) {
    const res = await fetch(`/api/attendance/${recordId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.record) setCorrection(data.record);
    }
    router.refresh();
  }

  async function addPunch() {
    if (!correction) return;
    if (!newTime) {
      toast("error", "Pick a time first");
      return;
    }
    const res = await fetch(`/api/attendance/${correction.id}/punches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ time: newTime.replace("T", " ") }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      toast("error", data.error ?? "Failed to add punch");
      return;
    }
    toast("success", "Punch added — day re-derived");
    setNewTime("");
    await refreshRecord(correction.id);
  }

  async function deletePunch(punchId: string) {
    if (!correction) return;
    const res = await fetch(`/api/attendance/${correction.id}/punches?punchId=${punchId}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok || !data.success) {
      toast("error", data.error ?? "Failed to delete punch");
      return;
    }
    toast("success", "Punch removed — day re-derived");
    await refreshRecord(correction.id);
  }

  return (
    <>
      <Table>
        <THead>
          <TR>
            <TH>Employee</TH>
            <TH className="hidden md:table-cell">Department</TH>
            <TH className="hidden lg:table-cell">Shift</TH>
            <TH>In</TH>
            <TH>Out</TH>
            <TH>Status</TH>
            <TH className="w-24" />
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => {
            const statusNow = row.leave ? "on_leave" : row.record?.status ?? "absent";
            return (
              <TR key={row.employeeId}>
                <TD>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-tint-strong text-[11px] font-bold text-muted-foreground">
                      {row.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-[13.5px] font-medium">{row.name}</p>
                      <p className="text-[11.5px] text-muted-foreground">{row.employeeNumber}</p>
                    </div>
                  </div>
                </TD>
                <TD className="hidden md:table-cell">
                  <span className="text-[13px] text-muted-foreground">{row.department}</span>
                </TD>
                <TD className="hidden lg:table-cell">
                  <span className="text-[13px] text-muted-foreground">{row.shift}</span>
                </TD>
                <TD className="font-mono text-[13px]">{row.record?.punchIn ?? "—"}</TD>
                <TD className="font-mono text-[13px]">{row.record?.punchOut ?? "—"}</TD>
                <TD>
                  {row.leave ? (
                    <Badge className="border-transparent" style={{ background: `${row.leave.color}22`, color: row.leave.color }}>
                      On leave · {row.leave.type}
                    </Badge>
                  ) : editing === row.employeeId ? (
                    <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 w-32 text-xs">
                      {["present", "late", "permission", "absent", "half_day"].map((s) => (
                        <option key={s} value={s}>
                          {s.replace("_", " ")}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <div className="flex items-center gap-2">
                      <StatusPill status={statusNow} />
                      {row.record?.reviewStatus && (
                        <Badge tone="warning">Review</Badge>
                      )}
                    </div>
                  )}
                </TD>
                <TD>
                  {editing === row.employeeId ? (
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="success" loading={saving} onClick={() => save(row.record!.id)}>
                        <Save className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : row.record ? (
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        title="View / correct punches"
                        onClick={() => setCorrection(row.record!)}
                      >
                        <ListChecks className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(row.employeeId); setStatus(row.record!.status); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : null}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>

      {/* Punch correction modal */}
      <Modal
        open={Boolean(correction)}
        onClose={() => setCorrection(null)}
        title="Correct punches"
        description={`${date} · every change re-derives the day from its punches`}
        size="md"
      >
        <div className="space-y-3">
          {!correction?.punches || correction.punches.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">No punches recorded for this day.</p>
          ) : (
            correction.punches.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl border border-edge bg-tint px-3.5 py-2.5">
                <span
                  className={
                    p.type === "in"
                      ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-400"
                      : p.type === "out"
                        ? "rounded-full bg-sky-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-sky-400"
                        : "rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground"
                  }
                >
                  {p.type}
                </span>
                <span className="font-mono text-[13px]">{fmtISTFull(p.time)} IST</span>
                <span className="text-[11px] capitalize text-muted-foreground">{p.source}{p.deviceSn ? ` · ${p.deviceSn}` : ""}</span>
                <button
                  onClick={() => deletePunch(p.id)}
                  className="ml-auto rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-300"
                  title="Delete punch"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}

          <div className="flex items-center gap-2 pt-2">
            <Input
              type="datetime-local"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              className="font-mono"
            />
            <Button size="sm" variant="outline" onClick={addPunch}>
              <Plus className="h-3.5 w-3.5" /> Add punch
            </Button>
          </div>

          {correction?.reviewStatus && (
            <p className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3.5 py-2.5 text-[12.5px] text-amber-400">
              Flagged: {correction.reviewStatus === "missed_punch" ? "probable missed punch-out — add the missing time" : "implausible span — check the punches"}
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
