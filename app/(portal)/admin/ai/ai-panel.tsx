"use client";

import { useState } from "react";
import { Send, Sparkles, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type AiResult = {
  answer: string;
  data?: Record<string, unknown>[];
  columns?: string[];
  tone: "info" | "success" | "warning" | "danger";
};

const SUGGESTIONS = [
  "How many employees do we have?",
  "Who is late today?",
  "How many leave requests are pending?",
  "What are our upcoming holidays?",
  "How is Rahul doing this month?",
  "How much overtime this month?",
];

/** Render `**bold**` markers as <strong> so AI answers don't show raw asterisks. */
function renderAnswer(answer: string) {
  const parts = answer.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold">
        {part}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export function AiPanel() {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<{ q: string; r: AiResult }[]>([]);
  const [busy, setBusy] = useState(false);

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || busy) return;
    setBusy(true);
    setQuestion("");
    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setHistory((h) => [...h, { q: text, r: data }]);
    } catch (e) {
      setHistory((h) => [...h, { q: text, r: { tone: "danger", answer: e instanceof Error ? e.message : "Something went wrong." } }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {history.length === 0 && (
          <div className="rounded-2xl border border-edge bg-card p-6 text-center">
            <Sparkles className="mx-auto mb-3 h-8 w-8 text-indigo-400" />
            <p className="text-[14px] font-medium">Ask anything about your workspace</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">Attendance, leaves, payroll, expenses, overtime, holidays — answered live.</p>
          </div>
        )}
        {history.map((h, i) => (
          <div key={i} className="space-y-2">
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-gradient-brand px-4 py-2.5 text-[13.5px] font-medium text-white">
                {h.q}
              </div>
            </div>
            <div className="flex justify-start">
              <div className="w-full max-w-[92%] rounded-2xl rounded-bl-sm border border-edge bg-card px-4 py-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-indigo-400">
                  <Sparkles className="h-3 w-3" /> Ask AI
                </div>
                <p className="mt-1.5 text-[13.5px] leading-relaxed">{renderAnswer(h.r.answer)}</p>
                {h.r.data && h.r.data.length > 0 && (
                  <div className="mt-3 overflow-hidden rounded-xl border border-edge">
                    <table className="w-full text-left text-[12.5px]">
                      <thead>
                        <tr className="border-b border-edge bg-tint/60">
                          {(h.r.columns ?? Object.keys(h.r.data[0])).map((c) => (
                            <th key={c} className="px-3 py-2 font-medium capitalize text-muted-foreground">{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {h.r.data.slice(0, 12).map((row, ri) => (
                          <tr key={ri} className="border-b border-edge last:border-0">
                            {Object.values(row).map((v, ci) => (
                              <td key={ci} className="px-3 py-2">{String(v)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => ask(s)}
            className="rounded-full border border-edge bg-card px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-indigo-400/40 hover:text-foreground"
          >
            {s}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
        className="flex items-center gap-2 rounded-2xl border border-edge bg-card p-2"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Who is absent today?"
          className="flex-1 bg-transparent px-3 py-2 text-[14px] outline-none placeholder:text-muted-foreground/60"
        />
        <button
          type="submit"
          disabled={busy || !question.trim()}
          className="flex items-center gap-1.5 rounded-xl bg-gradient-brand px-4 py-2.5 text-[13px] font-semibold text-white transition-opacity disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Ask
        </button>
      </form>
      <p className="text-center text-[11px] text-muted-foreground/70">
        <Badge tone="info">On-device</Badge> Answers are computed live from your tenant data — no external AI service is involved.
      </p>
    </div>
  );
}
