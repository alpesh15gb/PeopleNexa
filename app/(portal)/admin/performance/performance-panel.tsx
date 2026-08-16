"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Target, ClipboardList, Trash2, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/stat";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

type Kpi = { id: string; name: string; description: string | null; category: string; enabled: boolean };
type Score = { id: string; kpiId: string; kpi: string; selfScore: number | null; managerScore: number | null; managerComment: string | null };
type Review = {
  id: string;
  period: string;
  status: string;
  selfSummary: string | null;
  managerSummary: string | null;
  overallRating: number | null;
  dueDate: string | null;
  createdAt: string;
  employee: { id: string; firstName: string; lastName: string; employeeNumber: string; position: string | null };
  reviewer: { firstName: string; lastName: string } | null;
  scores: Score[];
  feedbacks: { id: string; rater: string; comment: string; rating: number | null }[];
};

const statusTone: Record<string, "warning" | "info" | "success"> = { draft: "warning", self_done: "info", completed: "success" };

export function PerformancePanel({ kpis, reviews, employees }: { kpis: Kpi[]; reviews: Review[]; employees: { id: string; firstName: string; lastName: string; employeeNumber: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<"reviews" | "kpis">("reviews");
  const [addingKpi, setAddingKpi] = useState(false);
  const [creatingReview, setCreatingReview] = useState(false);
  const [scoring, setScoring] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", category: "core" });
  const [rform, setRform] = useState({ employeeId: "", period: "", dueDate: "" });
  const [scores, setScores] = useState<Record<string, number | "">>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [managerSummary, setManagerSummary] = useState("");
  const [overallRating, setOverallRating] = useState<number | "">("");

  async function addKpi(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/performance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "kpi", ...form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast("success", "KPI created.");
      setAddingKpi(false);
      setForm({ name: "", description: "", category: "core" });
      router.refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function createReview(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/performance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "review", ...rform }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast("success", "Review cycle created.");
      setCreatingReview(false);
      setRform({ employeeId: "", period: "", dueDate: "" });
      router.refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  function openScoring(r: Review) {
    setScoring(r);
    const s: Record<string, number | ""> = {};
    const c: Record<string, string> = {};
    r.scores.forEach((x) => {
      s[x.kpiId] = x.managerScore ?? "";
      c[x.kpiId] = x.managerComment ?? "";
    });
    setScores(s);
    setComments(c);
    setManagerSummary(r.managerSummary ?? "");
    setOverallRating(r.overallRating ?? "");
  }

  async function submitManager(e: React.FormEvent) {
    e.preventDefault();
    if (!scoring) return;
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        action: "manager",
        scores: Object.fromEntries(
          Object.entries(scores).map(([kpiId, v]) => [kpiId, { score: v === "" ? null : Number(v), comment: comments[kpiId] || null }])
        ),
        managerSummary,
      };
      if (overallRating !== "") payload.overallRating = Number(overallRating);
      const res = await fetch(`/api/performance/reviews/${scoring.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast("success", "Review completed.");
      setScoring(null);
      router.refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteKpi(id: string) {
    if (!confirm("Delete this KPI? Existing scores will be removed.")) return;
    const res = await fetch(`/api/performance/kpis/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast("success", "KPI deleted.");
      router.refresh();
    } else toast("error", "Failed");
  }

  async function deleteReview(id: string) {
    if (!confirm("Delete this review cycle?")) return;
    const res = await fetch(`/api/performance/reviews/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast("success", "Review deleted.");
      router.refresh();
    } else toast("error", "Failed");
  }

  const pending = reviews.filter((r) => r.status !== "completed").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button onClick={() => setTab("reviews")} className={`rounded-lg px-3.5 py-2 text-[13px] font-medium ${tab === "reviews" ? "bg-gradient-brand text-white" : "bg-tint text-muted-foreground hover:text-foreground"}`}>
            <ClipboardList className="mr-1.5 inline h-3.5 w-3.5" /> Reviews ({pending} active)
          </button>
          <button onClick={() => setTab("kpis")} className={`rounded-lg px-3.5 py-2 text-[13px] font-medium ${tab === "kpis" ? "bg-gradient-brand text-white" : "bg-tint text-muted-foreground hover:text-foreground"}`}>
            <Target className="mr-1.5 inline h-3.5 w-3.5" /> KPIs ({kpis.length})
          </button>
        </div>
        {tab === "reviews" ? (
          <Button size="sm" onClick={() => setCreatingReview(true)}><Plus className="h-3.5 w-3.5" /> Start review</Button>
        ) : (
          <Button size="sm" onClick={() => setAddingKpi(true)}><Plus className="h-3.5 w-3.5" /> Add KPI</Button>
        )}
      </div>

      {tab === "kpis" ? (
        kpis.length === 0 ? (
          <EmptyState icon={<Target className="h-5 w-5" />} title="No KPIs yet" description="Create measurable KPIs to use in review cycles." />
        ) : (
          <div className="divide-y divide-white/[0.04] rounded-2xl border border-edge bg-card">
            {kpis.map((k) => (
              <div key={k.id} className="flex items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium">{k.name}</p>
                  <p className="text-[11.5px] text-muted-foreground">{k.description ?? "—"} · {k.category}</p>
                </div>
                <Button size="icon" variant="ghost" onClick={() => deleteKpi(k.id)}><Trash2 className="h-4 w-4 text-rose-400" /></Button>
              </div>
            ))}
          </div>
        )
      ) : reviews.length === 0 ? (
        <EmptyState icon={<ClipboardList className="h-5 w-5" />} title="No reviews yet" description="Start a review cycle for an employee — they self-score, you complete it, peers give 360° feedback." />
      ) : (
        <div className="divide-y divide-white/[0.04] rounded-2xl border border-edge bg-card">
          {reviews.map((r) => (
            <div key={r.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-brand text-[11px] font-bold text-white">
                  {r.employee.firstName[0]}{r.employee.lastName[0]}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium">{r.employee.firstName} {r.employee.lastName}</p>
                  <p className="text-[11.5px] text-muted-foreground">{r.period} · {r.employee.position ?? r.employee.employeeNumber}{r.overallRating ? ` · rating ${r.overallRating}/5` : ""}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <Badge tone={statusTone[r.status] ?? "neutral"} className="capitalize">{r.status.replace("_", " ")}</Badge>
                <Button size="sm" variant="outline" onClick={() => openScoring(r)}>
                  {r.status === "completed" ? "View" : "Score"}
                </Button>
                <Button size="icon" variant="ghost" onClick={() => deleteReview(r.id)}><Trash2 className="h-4 w-4 text-rose-400" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add KPI */}
      <Modal open={addingKpi} onClose={() => setAddingKpi(false)} title="Add KPI" size="sm">
        <form onSubmit={addKpi} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-muted-foreground">KPI name</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Attendance regularity" className="w-full rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Description</span>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional" className="w-full rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50" />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setAddingKpi(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>Create</Button>
          </div>
        </form>
      </Modal>

      {/* Start review */}
      <Modal open={creatingReview} onClose={() => setCreatingReview(false)} title="Start review cycle" size="sm">
        <form onSubmit={createReview} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Employee</span>
            <select value={rform.employeeId} onChange={(e) => setRform({ ...rform, employeeId: e.target.value })} required className="w-full rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50">
              <option value="">Select…</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeNumber})</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Period</span>
            <input value={rform.period} onChange={(e) => setRform({ ...rform, period: e.target.value })} required placeholder="e.g. Q3 2026" className="w-full rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Due date</span>
            <input type="date" value={rform.dueDate} onChange={(e) => setRform({ ...rform, dueDate: e.target.value })} className="w-full rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50" />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setCreatingReview(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>Start</Button>
          </div>
        </form>
      </Modal>

      {/* Score / complete review */}
      <Modal open={Boolean(scoring)} onClose={() => setScoring(null)} title={scoring ? `${scoring.employee.firstName} ${scoring.employee.lastName} — ${scoring.period}` : ""} size="md">
        {scoring && (
          <form onSubmit={submitManager} className="space-y-4">
            <div className="space-y-2.5">
              {scoring.scores.map((s) => (
                <div key={s.id} className="rounded-xl bg-tint p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] font-medium">{s.kpi}</p>
                    <div className="flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 text-muted-foreground" />
                      <select value={scores[s.kpiId] ?? ""} onChange={(e) => setScores({ ...scores, [s.kpiId]: e.target.value === "" ? "" : Number(e.target.value) })} className="rounded-lg border border-edge bg-card px-2 py-1.5 text-[12.5px] outline-none">
                        <option value="">—</option>
                        {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 text-[11.5px] text-muted-foreground">
                    <span>Self: {s.selfScore ?? "—"}/5</span>
                  </div>
                  <input value={comments[s.kpiId] ?? ""} onChange={(e) => setComments({ ...comments, [s.kpiId]: e.target.value })} placeholder="Manager comment (optional)" className="mt-2 w-full rounded-lg border border-edge bg-card px-3 py-2 text-[12.5px] outline-none focus:border-indigo-400/50" />
                </div>
              ))}
            </div>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Manager summary</span>
              <textarea value={managerSummary} onChange={(e) => setManagerSummary(e.target.value)} rows={3} placeholder="Overall assessment…" className="w-full rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Overall rating</span>
              <select value={overallRating} onChange={(e) => setOverallRating(e.target.value === "" ? "" : Number(e.target.value))} className="w-full rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50">
                <option value="">—</option>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} / 5</option>)}
              </select>
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setScoring(null)}>Cancel</Button>
              <Button type="submit" loading={busy}>Complete review</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
