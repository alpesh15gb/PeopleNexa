"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Star, MessageSquarePlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/stat";
import { useToast } from "@/components/ui/toast";
import { PageHeader } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";

type Review = {
  id: string;
  period: string;
  status: string;
  selfSummary: string | null;
  managerSummary: string | null;
  overallRating: number | null;
  dueDate: string | null;
  employee: { id: string; firstName: string; lastName: string; employeeNumber: string; position: string | null };
  scores: { id: string; kpiId: string; kpi: string; selfScore: number | null; managerScore: number | null; managerComment: string | null }[];
  feedbacks: { id: string; rater: string; comment: string; rating: number | null }[];
};

const tone: Record<string, "warning" | "info" | "success"> = { draft: "warning", self_done: "info", completed: "success" };
const statusLabel: Record<string, string> = { draft: "Self-review due", self_done: "Awaiting manager", completed: "Completed" };

type ReviewPage = { page: number; pageCount: number };
function ReviewNavigation({ current, other, peer = false }: { current: ReviewPage; other: ReviewPage; peer?: boolean }) {
  if (current.pageCount <= 1) return null;
  const href = (page: number) => `?page=${peer ? other.page : page}&peerPage=${peer ? page : other.page}`;
  return <nav aria-label={peer ? "Peer feedback pages" : "Review history pages"} className="flex items-center gap-4 text-sm">
    {current.page > 1 && <a className="text-primary" href={href(current.page - 1)}>Previous</a>}
    <span>Page {current.page} of {current.pageCount}</span>
    {current.page < current.pageCount && <a className="text-primary" href={href(current.page + 1)}>Next</a>}
  </nav>;
}

export default function EmployeePerformancePage() {
  const router = useRouter();
  const toast = useToast();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [historyPage, setHistoryPage] = useState<ReviewPage>({ page: 1, pageCount: 1 });
  const [peerPage, setPeerPage] = useState<ReviewPage>({ page: 1, pageCount: 1 });
  const [peers, setPeers] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");

  // self-score state
  const [draftId, setDraftId] = useState<string | null>(null);
  const [selfScores, setSelfScores] = useState<Record<string, number | "">>({});
  const [selfSummary, setSelfSummary] = useState("");
  const [busy, setBusy] = useState(false);

  // 360 feedback state
  const [fbId, setFbId] = useState<string | null>(null);
  const [fbComment, setFbComment] = useState("");
  const [fbRating, setFbRating] = useState<number | "">("");

  async function load(signal?: AbortSignal) {
    setLoadError("");
    try {
      const url = new URL(window.location.href);
      const params = new URLSearchParams({ scope: "self", pageSize: "25" });
      for (const key of ["page", "peerPage"]) {
        const value = url.searchParams.get(key);
        if (value && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value))) params.set(key, value);
      }
      const res = await fetch(`/api/performance?${params}`, { signal });
      if (!res.ok) throw new Error("Could not load your performance reviews.");
      const data = await res.json();
      if (!signal?.aborted) {
        setReviews(data.reviews ?? []);
        setPeers(data.peerReviews ?? []);
        setHistoryPage(data.pagination);
        setPeerPage(data.peerPagination);
      }
    } catch {
      if (!signal?.aborted) setLoadError("Could not load your performance reviews.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, []);

  const drafts = reviews.filter((review) => review.status === "draft");
  const draft = drafts.find((review) => review.id === draftId) ?? drafts[0];

  async function submitSelf(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || busy) return;
    setFormError("");
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        action: "self",
        scores: Object.fromEntries(Object.entries(selfScores).map(([k, v]) => [k, v === "" ? null : Number(v)])),
      };
      if (selfSummary.trim()) payload.selfSummary = selfSummary;
      const res = await fetch(`/api/performance/reviews/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast("success", "Self-review submitted.");
      setDraftId(null);
      setSelfScores({});
      setSelfSummary("");
      router.refresh();
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not submit the self-review.");
    } finally {
      setBusy(false);
    }
  }

  async function submitFeedback(e: React.FormEvent) {
    e.preventDefault();
    if (!fbId || busy) return;
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

  return (
    <div className="space-y-6">
      <PageHeader title="My performance" description="Complete your self-review and read feedback once your manager finishes the review." />

      {loading ? <p role="status" className="text-sm text-muted-foreground">Loading performance reviews…</p> : loadError ? (
        <div className="flex flex-wrap items-center gap-3"><p role="alert" className="text-sm text-destructive">{loadError}</p><Button size="sm" variant="outline" onClick={() => { setLoading(true); void load(); }}>Retry reviews</Button></div>
      ) : <>
      {draft ? (
        <form onSubmit={submitSelf} className="space-y-4 rounded-2xl border border-indigo-400/20 bg-indigo-500/5 p-5">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-indigo-400" />
            <h2 className="text-sm font-semibold">Self-review · {draft.period}</h2>
          </div>
          {draft.dueDate && <p className="text-sm text-muted-foreground">Due {formatDate(new Date(draft.dueDate))}</p>}
          {drafts.length > 1 && <label className="flex flex-wrap items-center gap-2 text-sm">Review period
            <select value={draft.id} disabled={busy} onChange={(event) => { setDraftId(event.target.value); setSelfScores({}); setSelfSummary(""); setFormError(""); }} className="rounded-lg border border-edge bg-card px-3 py-2">
              {drafts.map((review) => <option key={review.id} value={review.id}>{review.period}</option>)}
            </select>
          </label>}
          <div className="space-y-2.5">
            {draft.scores.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl bg-card px-4 py-3">
                <p className="text-[13px] font-medium">{s.kpi}</p>
                <div className="flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 text-muted-foreground" />
                  <select
                    aria-label={`Self rating for ${s.kpi}`}
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
          <textarea aria-label="Self-review summary" value={selfSummary} onChange={(e) => setSelfSummary(e.target.value)} rows={3} placeholder="Your summary of this period…" className="w-full rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50" />
          {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
          <div className="flex justify-end">
            <Button type="submit" loading={busy}>Submit self-review</Button>
          </div>
        </form>
      ) : reviews.length === 0 && <EmptyState icon={<ClipboardList className="h-5 w-5" />} title="No reviews yet" description="Your manager will start a review cycle for you." />}

      {/* My reviews */}
      {reviews.filter((r) => r.status !== "draft").length > 0 && (
        <div className="space-y-3">
          <p className="text-[13px] font-medium text-muted-foreground">My reviews</p>
          {reviews.filter((r) => r.status !== "draft").map((r) => (
            <div key={r.id} className="rounded-2xl border border-edge bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[14px] font-semibold">{r.period}</p>
                <Badge tone={tone[r.status]}>{statusLabel[r.status] ?? r.status}</Badge>
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
              {r.selfSummary && <p className="mt-3 whitespace-pre-wrap break-words text-sm"><span className="font-medium">Your summary · </span>{r.selfSummary}</p>}
              {r.managerSummary && <p className="mt-3 whitespace-pre-wrap break-words text-sm"><span className="font-medium">Manager summary · </span>{r.managerSummary}</p>}
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

      <ReviewNavigation current={historyPage} other={peerPage} />
      {/* 360 feedback on peers */}
      {peers.length > 0 && (
        <div className="space-y-3">
          <p className="text-[13px] font-medium text-muted-foreground">Give 360° feedback</p>
          {peers.map((r) => (
            <div key={r.id} className="rounded-2xl border border-edge bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13.5px] font-medium">{r.employee.firstName} {r.employee.lastName} <span className="text-muted-foreground">· {r.period}</span></p>
                {r.feedbacks.length === 0 && <Button size="sm" variant="outline" onClick={() => { setFbId(r.id); setFbComment(""); setFbRating(""); }}>
                  <MessageSquarePlus className="mr-1.5 h-3.5 w-3.5" /> Give feedback
                </Button>}
              </div>
              {r.feedbacks.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {r.feedbacks.map((f) => (
                    <p key={f.id} className="text-[12px] text-muted-foreground"><span className="font-medium text-foreground">Your feedback:</span> {f.comment}</p>
                  ))}
                </div>
              )}
              {fbId === r.id && (
                <form onSubmit={submitFeedback} className="mt-3 space-y-2.5">
                  <textarea aria-label="Peer feedback" maxLength={10000} value={fbComment} onChange={(e) => setFbComment(e.target.value)} required rows={2} placeholder="Constructive feedback…" className="w-full rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50" />
                  <div className="flex items-center justify-end gap-2">
                    <select aria-label="Peer rating" value={fbRating} onChange={(e) => setFbRating(e.target.value === "" ? "" : Number(e.target.value))} className="rounded-lg border border-edge bg-card px-2 py-1.5 text-[12.5px] outline-none">
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
      <ReviewNavigation current={peerPage} other={historyPage} peer />
      </>}
    </div>
  );
}
