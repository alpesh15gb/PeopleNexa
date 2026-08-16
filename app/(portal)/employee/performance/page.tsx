"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Star, MessageSquarePlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/stat";
import { useToast } from "@/components/ui/toast";

type Review = {
  id: string;
  period: string;
  status: string;
  selfSummary: string | null;
  managerSummary: string | null;
  overallRating: number | null;
  employee: { id: string; firstName: string; lastName: string; employeeNumber: string; position: string | null };
  scores: { id: string; kpiId: string; kpi: string; selfScore: number | null; managerScore: number | null; managerComment: string | null }[];
  feedbacks: { id: string; rater: string; comment: string; rating: number | null }[];
};

const tone: Record<string, "warning" | "info" | "success"> = { draft: "warning", self_done: "info", completed: "success" };

export default function EmployeePerformancePage() {
  const router = useRouter();
  const toast = useToast();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [peers, setPeers] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  // self-score state
  const [draftId, setDraftId] = useState<string | null>(null);
  const [selfScores, setSelfScores] = useState<Record<string, number | "">>({});
  const [selfSummary, setSelfSummary] = useState("");
  const [busy, setBusy] = useState(false);

  // 360 feedback state
  const [fbId, setFbId] = useState<string | null>(null);
  const [fbComment, setFbComment] = useState("");
  const [fbRating, setFbRating] = useState<number | "">("");

  async function load() {
    const res = await fetch("/api/performance");
    const data = await res.json();
    setReviews(data.reviews);
    setPeers(data.peerReviews ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function submitSelf(e: React.FormEvent) {
    e.preventDefault();
    if (!draftId) return;
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        action: "self",
        scores: Object.fromEntries(Object.entries(selfScores).map(([k, v]) => [k, v === "" ? null : Number(v)])),
      };
      if (selfSummary.trim()) payload.selfSummary = selfSummary;
      const res = await fetch(`/api/performance/reviews/${draftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast("success", "Self-review submitted.");
      setDraftId(null);
      router.refresh();
      await load();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitFeedback(e: React.FormEvent) {
    e.preventDefault();
    if (!fbId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/performance/reviews/${fbId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "feedback", comment: fbComment, rating: fbRating === "" ? null : fbRating }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast("success", "Feedback submitted.");
      setFbId(null);
      setFbComment("");
      setFbRating("");
      await load();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  const draft = reviews.find((r) => r.status === "draft");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Performance</h1>
        <p className="mt-1 text-sm text-muted-foreground">Self-review, manager feedback and 360° peer input.</p>
      </div>

      {/* Self review */}
      {draft ? (
        <form onSubmit={submitSelf} className="space-y-4 rounded-2xl border border-indigo-400/20 bg-indigo-500/5 p-5">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-indigo-400" />
            <p className="text-[14px] font-semibold">Self-review — {draft.period}</p>
          </div>
          <div className="space-y-2.5">
            {draft.scores.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl bg-card px-4 py-3">
                <p className="text-[13px] font-medium">{s.kpi}</p>
                <div className="flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 text-muted-foreground" />
                  <select
                    value={selfScores[s.kpiId] ?? ""}
                    onChange={(e) => setSelfScores({ ...selfScores, [s.kpiId]: e.target.value === "" ? "" : Number(e.target.value) })}
                    className="rounded-lg border border-edge bg-card px-2 py-1.5 text-[12.5px] outline-none"
                  >
                    <option value="">—</option>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
            ))}
          </div>
          <textarea value={selfSummary} onChange={(e) => setSelfSummary(e.target.value)} rows={3} placeholder="Your summary of this period…" className="w-full rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50" />
          <div className="flex justify-end">
            <Button type="submit" loading={busy}>Submit self-review</Button>
          </div>
        </form>
      ) : (
        <EmptyState icon={<ClipboardList className="h-5 w-5" />} title={reviews.length ? "Self-review submitted" : "No reviews yet"} description={reviews.length ? "Waiting for your manager to complete the cycle." : "Your manager will start a review cycle for you."} />
      )}

      {/* My reviews */}
      {reviews.filter((r) => r.status !== "draft").length > 0 && (
        <div className="space-y-3">
          <p className="text-[13px] font-medium text-muted-foreground">My reviews</p>
          {reviews.filter((r) => r.status !== "draft").map((r) => (
            <div key={r.id} className="rounded-2xl border border-edge bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[14px] font-semibold">{r.period}</p>
                <Badge tone={tone[r.status]} className="capitalize">{r.status.replace("_", " ")}</Badge>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {r.scores.map((s) => (
                  <div key={s.id} className="rounded-xl bg-tint px-3.5 py-2.5">
                    <p className="text-[11.5px] text-muted-foreground">{s.kpi}</p>
                    <p className="mt-0.5 text-[13px] font-medium">
                      Self: <span className="font-mono">{s.selfScore ?? "—"}/5</span>
                      {s.managerScore != null && <> · Manager: <span className="font-mono">{s.managerScore}/5</span></>}
                    </p>
                    {s.managerComment && <p className="mt-1 text-[11.5px] text-muted-foreground">{s.managerComment}</p>}
                  </div>
                ))}
              </div>
              {r.overallRating && (
                <p className="mt-3 text-[13px]"><Star className="mr-1 inline h-3.5 w-3.5 text-amber-400" /> Overall: <span className="font-bold">{r.overallRating}/5</span></p>
              )}
              {r.feedbacks.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground">Peer feedback</p>
                  {r.feedbacks.map((f) => (
                    <p key={f.id} className="rounded-xl bg-tint px-3.5 py-2.5 text-[12.5px]"><span className="font-medium">{f.rater}:</span> {f.comment}{f.rating ? ` (${f.rating}/5)` : ""}</p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 360 feedback on peers */}
      {peers.length > 0 && (
        <div className="space-y-3">
          <p className="text-[13px] font-medium text-muted-foreground">Give 360° feedback</p>
          {peers.map((r) => (
            <div key={r.id} className="rounded-2xl border border-edge bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13.5px] font-medium">{r.employee.firstName} {r.employee.lastName} <span className="text-muted-foreground">· {r.period}</span></p>
                <Button size="sm" variant="outline" onClick={() => { setFbId(r.id); setFbComment(""); setFbRating(""); }}>
                  <MessageSquarePlus className="mr-1.5 h-3.5 w-3.5" /> Give feedback
                </Button>
              </div>
              {r.feedbacks.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {r.feedbacks.map((f) => (
                    <p key={f.id} className="text-[12px] text-muted-foreground"><span className="font-medium text-foreground">{f.rater}:</span> {f.comment}</p>
                  ))}
                </div>
              )}
              {fbId === r.id && (
                <form onSubmit={submitFeedback} className="mt-3 space-y-2.5">
                  <textarea value={fbComment} onChange={(e) => setFbComment(e.target.value)} required rows={2} placeholder="Constructive feedback…" className="w-full rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50" />
                  <div className="flex items-center justify-end gap-2">
                    <select value={fbRating} onChange={(e) => setFbRating(e.target.value === "" ? "" : Number(e.target.value))} className="rounded-lg border border-edge bg-card px-2 py-1.5 text-[12.5px] outline-none">
                      <option value="">No rating</option>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}/5</option>)}
                    </select>
                    <Button type="submit" size="sm" loading={busy}>Submit</Button>
                  </div>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
