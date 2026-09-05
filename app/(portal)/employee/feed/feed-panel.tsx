"use client";

import { useEffect, useState } from "react";
import { Megaphone, MessageCircle, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/stat";
import { useToast } from "@/components/ui/toast";

type Author = { id: string; firstName: string; lastName: string; role: string; profilePicture?: string | null };
type Comment = { id: string; body: string; createdAt: string; author: { id: string; firstName: string; lastName: string; role: string } };
type Post = { id: string; body: string; isAnnouncement: boolean; createdAt: string; author: Author; comments: Comment[] };

export function FeedPanel({ isAdmin }: { isAdmin: boolean }) {
  const toast = useToast();
  const [posts, setPosts] = useState<Post[]>([]);
  const [draft, setDraft] = useState("");
  const [announce, setAnnounce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [replying, setReplying] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  async function load() {
    const res = await fetch("/api/feed");
    const data = await res.json();
    setPosts(data.posts);
  }
  useEffect(() => {
    void load();
  }, []);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
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
      await load();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function comment(e: React.FormEvent, id: string) {
    e.preventDefault();
    if (!replyText.trim()) return;
    const res = await fetch(`/api/feed/${id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: replyText }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast("error", data.error ?? "Failed");
      return;
    }
    setReplyText("");
    setReplying(null);
    await load();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Org Feed</h1>
        <p className="mt-1 text-sm text-muted-foreground">Company announcements and team chatter.</p>
      </div>

      <form onSubmit={post} className="rounded-2xl border border-edge bg-card p-4">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="Share something with the team…"
          className="w-full resize-none bg-transparent text-[14px] outline-none placeholder:text-muted-foreground/60"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          {isAdmin ? (
            <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-muted-foreground">
              <input type="checkbox" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} className="accent-indigo-500" />
              Post as announcement
            </label>
          ) : <span />}
          <Button type="submit" size="sm" loading={busy}><Send className="h-3.5 w-3.5" /> Post</Button>
        </div>
      </form>

      {posts.length === 0 ? (
        <EmptyState icon={<Megaphone className="h-5 w-5" />} title="Nothing here yet" description="Be the first to post — announcements from admins appear here too." />
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
                  <p className="text-[11px] text-muted-foreground">{new Date(p.createdAt).toLocaleString()}</p>
                </div>
                {p.isAnnouncement && <Badge tone="info"><Megaphone className="mr-1 h-3 w-3" /> Announcement</Badge>}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed">{p.body}</p>
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
                <button onClick={() => setReplying(replying === p.id ? null : p.id)} className="inline-flex items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground">
                  <MessageCircle className="h-3.5 w-3.5" /> Comment
                </button>
              </div>
              {replying === p.id && (
                <form onSubmit={(e) => comment(e, p.id)} className="mt-2 flex items-center gap-2">
                  <input value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Write a comment…" className="flex-1 rounded-xl border border-edge bg-card px-3 py-2 text-[13px] outline-none focus:border-indigo-400/50" />
                  <Button type="submit" size="sm">Send</Button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
