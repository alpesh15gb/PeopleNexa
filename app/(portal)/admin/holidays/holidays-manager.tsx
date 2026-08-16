"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, PartyPopper, Repeat, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatDate, relativeDay, toDateKey } from "@/lib/dates";

interface Holiday {
  id: string;
  name: string;
  date: Date;
  isRecurring: boolean;
  isHalfDay: boolean;
}

export function HolidaysManager({ holidays }: { holidays: Holiday[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          date: form.get("date"),
          isRecurring: form.get("isRecurring") === "on",
          isHalfDay: form.get("isHalfDay") === "on",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Failed to add holiday");
        return;
      }
      toast("success", "Holiday added");
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/holidays/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        toast("error", data.error ?? "Failed to delete");
        return;
      }
      toast("success", "Holiday removed");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const today = toDateKey(new Date());
  const upcoming = holidays.filter((h) => toDateKey(h.date) >= today);
  const past = holidays.filter((h) => toDateKey(h.date) < today);

  return (
    <>
      <div className="flex items-center justify-between border-b border-edge px-5 py-3">
        <p className="text-[13px] text-muted-foreground">{holidays.length} holidays · {upcoming.length} upcoming</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-3.5 w-3.5" /> Import
          </Button>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add holiday
          </Button>
        </div>
      </div>

      {holidays.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-edge-strong bg-tint text-muted-foreground">
            <PartyPopper className="h-5 w-5" />
          </div>
          <p className="font-display text-sm font-semibold">No holidays yet</p>
          <p className="max-w-xs text-[13px] text-muted-foreground">
            Add public holidays and they'll show as days off across attendance.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {holidays.map((h) => (
            <div key={h.id} className="card-surface group flex items-start gap-3 rounded-xl p-4 transition-colors hover:border-edge-strong">
              <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
                <span className="font-display text-[15px] font-bold leading-none">{h.date.getDate()}</span>
                <span className="text-[9px] font-semibold uppercase">
                  {h.date.toLocaleString("en", { month: "short" })}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-[13.5px] font-semibold">{h.name}</p>
                  {h.isRecurring && <Repeat className="h-3 w-3 shrink-0 text-muted-foreground" />}
                  {h.isHalfDay && (
                    <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                      Half day
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {formatDate(h.date)}
                  <span className="ml-1.5 capitalize text-muted-foreground/60">({relativeDay(h.date)})</span>
                </p>
              </div>
              <Button size="icon" variant="ghost" className="text-rose-300 opacity-0 transition-opacity hover:bg-rose-500/10 group-hover:opacity-100" onClick={() => remove(h.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add holiday" size="sm">
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Holiday name">
            <Input name="name" required placeholder="e.g. Diwali" />
          </Field>
          <Field label="Date">
            <Input name="date" type="date" required />
          </Field>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <input type="checkbox" name="isRecurring" className="h-4 w-4 accent-indigo-500" />
              Repeats every year
            </label>
            <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <input type="checkbox" name="isHalfDay" className="h-4 w-4 accent-amber-500" />
              Half day
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={loading}>Add holiday</Button>
          </div>
        </form>
      </Modal>

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={(msg) => {
          setImportOpen(false);
          toast("success", msg);
          router.refresh();
        }}
        onBusy={setImporting}
        busy={importing}
      />
    </>
  );
}

function ImportModal({
  open,
  onClose,
  onDone,
  onBusy,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (msg: string) => void;
  onBusy: (v: boolean) => void;
  busy: boolean;
}) {
  const [error, setError] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    onBusy(true);
    const form = new FormData(e.currentTarget);
    const raw = String(form.get("rows") ?? "");
    const rows = raw
      .split(/\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        // Accept CSV-ish: name,date[,recurring][,half]
        const [name = "", date = "", recurring = "", half = ""] = line.split(",").map((s) => s.trim());
        return {
          name,
          date,
          isRecurring: ["1", "true", "yes", "y", "recurring"].includes(recurring.toLowerCase()),
          isHalfDay: ["1", "true", "yes", "y", "half"].includes(half.toLowerCase()),
        };
      });
    try {
      const res = await fetch("/api/holidays", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      onDone(`${data.created} imported, ${data.skipped} skipped`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      onBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Import holidays" size="md">
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Holiday rows"
          hint="One per line: Name, YYYY-MM-DD, recurring?, half? — e.g. Diwali, 2026-11-08, true, half"
        >
          <Textarea name="rows" required placeholder={`Diwali, 2026-11-08, true, half\nChristmas, 2026-12-25`} className="min-h-40 font-mono text-[12.5px]" />
        </Field>
        {error && <p className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3.5 py-2.5 text-[13px] text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Import</Button>
        </div>
      </form>
    </Modal>
  );
}
