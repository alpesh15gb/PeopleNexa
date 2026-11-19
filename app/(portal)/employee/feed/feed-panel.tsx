"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Megaphone, MessageCircle, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/stat";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/dates";
import { DocumentExpensePagination } from "@/components/document-expense-pagination";
import { recordPageHref, recordPageNumber, type recordPagination } from "@/lib/document-expense-pagination";

type Author = { id: string; firstName: string; lastName: string; role: string; profilePicture?: string | null };
type Comment = { id: string; body: string; createdAt: string; author: { id: string; firstName: string; lastName: string; role: string } };
type Post = { id: string; body: string; isAnnouncement: boolean; createdAt: string; author: Author; comments: Comment[] };
type FeedPage = { posts: Post[]; pagination: ReturnType<typeof recordPagination> };
const path = "/employee/feed";

export function FeedPanel({ isAdmin }: { isAdmin: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const view = params.get("view") === "announcements" ? "announcements" : "all";
  const page = recordPageNumber(params.get("page")) ?? 1;
  const [draft, setDraft] = useState("");
  const [announce, setAnnounce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [replying, setReplying] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; data?: FeedPage; error?: string } | null>(null);
  const requestKey = `${view}:${page}:${retry}`;
  const current = loaded?.key === requestKey ? loaded : null;
  const posts = current?.data?.posts ?? [];

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ view, page: String(page), pageSize: "20" });
    void fetch(`/api/feed?${query}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load the feed.");
        const data: FeedPage = await response.json();
        if (!controller.signal.aborted) setLoaded({ key: requestKey, data });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ key: requestKey, error: "Could not load the feed." });
      });
    return () => controller.abort();
  }, [view, page, requestKey]);

  useEffect(() => {
    setReplying(null);
    setReplyText("");
  }, [view, page]);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !draft.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft, isAnnouncement: announce }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast("success", announce ? "Announcement posted." : "Post published.");
      setDraft("");
      setAnnounce(false);
      const publishView = announce && view === "announcements" ? { view } : {};
      if (page !== 1 || view === "announcements" && !announce) {
        router.push(recordPageHref(path, publishView, 1));
      }
      setRetry((value) => value + 1);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function comment(e: React.FormEvent, id: string) {
    e.preventDefault();
    if (replyBusy || !replyText.trim()) return;
    setReplyBusy(true);
    try {
      const res = await fetch(`/api/feed/${id}/comments`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: replyText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not send your comment.");
      setReplyText("");
      setReplying(null);
      setRetry((value) => value + 1);
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Could not send your comment.");
    } finally {
      setReplyBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Company feed</h1>
        <p className="mt-1 text-sm text-muted-foreground">Read announcements, share updates and reply to coworkers.</p>
      </div>

      <form onSubmit={post} className="rounded-2xl border border-edge bg-card p-4">
        <textarea
          aria-label="New company post"
          maxLength={2000}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="Share something with the team…"
          className="w-full resize-none bg-transparent text-[14px] outline-none placeholder:text-muted-foreground/60"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          {isAdmin ? (
            <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-muted-foreground">
              <input type="checkbox" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} className="accent-indigo-500" />
              Post as announcement
            </label>
          ) : <span />}
          <Button type="submit" size="sm" loading={busy} disabled={!draft.trim()}><Send aria-hidden="true" className="h-3.5 w-3.5" /> {announce ? "Publish announcement" : "Post update"}</Button>
        </div>
      </form>

      <nav aria-label="Filter company feed" className="flex flex-wrap gap-2">
        <Link href={path} aria-current={view === "all" ? "page" : undefined} className={`rounded-lg px-3 py-2 text-sm font-medium hover:bg-tint ${view === "all" ? "bg-tint text-primary" : "text-muted-foreground"}`}>All updates</Link>
        <Link href={`${path}?view=announcements`} aria-current={view === "announcements" ? "page" : undefined} className={`rounded-lg px-3 py-2 text-sm font-medium hover:bg-tint ${view === "announcements" ? "bg-tint text-primary" : "text-muted-foreground"}`}>Announcements</Link>
      </nav>
      {!current ? <p role="status" className="text-sm text-muted-foreground">Loading company updates…</p> : current.error ? (
        <div className="flex flex-wrap items-center gap-3"><p role="alert" className="text-sm text-destructive">{current.error}</p><Button size="sm" variant="outline" onClick={() => setRetry((value) => value + 1)}>Retry feed</Button></div>
      ) : posts.length === 0 ? (
        <EmptyState icon={<Megaphone className="h-5 w-5" />} title={view === "announcements" ? "No announcements yet" : "No updates yet"} description={view === "announcements" ? "Company announcements will appear here when an admin publishes them." : "Share the first update with your workspace."} />
      ) : (
        <div className="space-y-4">
          {posts.map((p) => (
            <div key={p.id} className="rounded-2xl border border-edge bg-card p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-[12px] font-bold text-white">
                  {p.author.firstName[0]}{p.author.lastName[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">
                    {p.author.firstName} {p.author.lastName}
                    {p.author.role === "admin" && <span className="ml-1.5 text-[11px] font-semibold text-indigo-400">Admin</span>}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{formatDateTime(new Date(p.createdAt))}</p>
                </div>
                {p.isAnnouncement && <Badge tone="info"><Megaphone className="mr-1 h-3 w-3" /> Announcement</Badge>}
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words text-[14px] leading-relaxed">{p.body}</p>
              {p.comments.length > 0 && (
                <div className="mt-3 space-y-2 border-t border-edge pt-3">
                  {p.comments.map((c) => (
                    <p key={c.id} className="text-[12.5px] text-muted-foreground">
                      <span className="font-medium text-foreground">{c.author.firstName} {c.author.lastName}:</span> {c.body}
                    </p>
                  ))}
                </div>
              )}
              <div className="mt-2">
                <button type="button" aria-expanded={replying === p.id} onClick={() => { setReplying(replying === p.id ? null : p.id); setReplyText(""); }} className="inline-flex min-h-9 items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground">
                  <MessageCircle className="h-3.5 w-3.5" /> Comment
                </button>
              </div>
              {replying === p.id && (
                <form onSubmit={(e) => comment(e, p.id)} className="mt-2 flex items-center gap-2">
                  <input aria-label="Write a comment" maxLength={2000} value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Write a comment…" className="min-w-0 flex-1 rounded-xl border border-edge bg-card px-3 py-2 text-[13px] outline-none focus:border-indigo-400/50" />
                  <Button type="submit" size="sm" loading={replyBusy} disabled={!replyText.trim()}>Send</Button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
      {current?.data && <DocumentExpensePagination path={path} params={view === "announcements" ? { view } : {}} pagination={current.data.pagination} label="posts" />}
    </div>
  );
}
