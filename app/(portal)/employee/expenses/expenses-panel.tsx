"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Receipt, Camera, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/stat";
import { useToast } from "@/components/ui/toast";
import { toDateKey } from "@/lib/dates";
import { t, type Lang } from "@/lib/i18n";

type Claim = {
  id: string;
  title: string;
  category: string;
  amount: number;
  description: string | null;
  receiptUrl: string | null;
  status: string;
  createdAt: string;
};

const tone: Record<string, "warning" | "info" | "success" | "danger"> = {
  pending: "warning",
  approved: "info",
  settled: "success",
  rejected: "danger",
};

export function ExpensesPanel({ claims, lang = "en" }: { claims: Claim[]; lang?: Lang }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2_500_000) {
      toast("error", t(lang, "expenses.receiptTooLarge"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setReceipt(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.get("title"),
          category: form.get("category"),
          amount: Number(form.get("amount")),
          description: form.get("description"),
          receiptUrl: receipt,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to submit");
      toast("success", t(lang, "expenses.submitted"));
      setOpen(false);
      setReceipt(null);
      router.refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between border-b border-edge px-5 py-3">
        <p className="text-[13px] text-muted-foreground">
          {claims.length} {t(lang, "expenses.claims")}
        </p>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> {t(lang, "expenses.newClaim")}
        </Button>
      </div>

      {claims.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-5 w-5" />}
          title={t(lang, "expenses.none")}
          description={t(lang, "expenses.noneDesc")}
        />
      ) : (
        <div className="divide-y divide-[color:var(--border)]">
          {claims.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-5 py-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-brand text-[11px] font-bold text-white">
                {c.title.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium">{c.title}</p>
                <p className="text-[11.5px] text-muted-foreground">
                  {c.category} · {toDateKey(new Date(c.createdAt))}
                </p>
              </div>
              {c.receiptUrl && (
                <img src={c.receiptUrl} alt="Receipt" className="h-9 w-9 rounded-lg border border-edge object-cover" />
              )}
              <span className="font-mono text-[13.5px] font-bold">₹{c.amount.toLocaleString("en-IN")}</span>
              <Badge tone={tone[c.status] ?? "neutral"} className="capitalize">{c.status}</Badge>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={t(lang, "expenses.newClaim")} size="sm">
        <form onSubmit={submit} className="space-y-4">
          <Field label={t(lang, "expenses.titleField")}>
            <Input name="title" required placeholder={t(lang, "expenses.titlePlaceholder")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t(lang, "expenses.category")}>
              <Select name="category" defaultValue="travel">
                {["travel", "food", "fuel", "mobile", "medical", "other"].map((c) => (
                  <option key={c} value={c}>{t(lang, `expenses.cat.${c}`)}</option>
                ))}
              </Select>
            </Field>
            <Field label={t(lang, "expenses.amount")}>
              <Input name="amount" type="number" min={1} step="any" required placeholder="0" />
            </Field>
          </div>
          <Field label={t(lang, "expenses.description")}>
            <Textarea name="description" placeholder={t(lang, "expenses.descPlaceholder")} />
          </Field>
          <div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
            {receipt ? (
              <div className="relative inline-block">
                <img src={receipt} alt="Receipt" className="h-28 rounded-xl border border-edge object-contain" />
                <button
                  type="button"
                  onClick={() => setReceipt(null)}
                  className="absolute -right-2 -top-2 rounded-full bg-rose-500 p-1 text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-edge-strong py-4 text-[13px] text-muted-foreground transition-colors hover:bg-tint"
              >
                <Camera className="h-4 w-4" /> {t(lang, "expenses.attachReceipt")}
              </button>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t(lang, "common.cancel")}</Button>
            <Button type="submit" loading={loading}>{t(lang, "expenses.submit")}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
