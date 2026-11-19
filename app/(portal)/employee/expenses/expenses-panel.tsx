"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Receipt, Camera, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/stat";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/dates";
import { t, type Lang } from "@/lib/i18n";
import { useRouteAction } from "@/components/use-route-action";

type Claim = {
  id: string;
  title: string;
  category: string;
  amount: number;
  description: string | null;
  receiptUrl: string | null;
  reviewNote: string | null;
  status: string;
  createdAt: string;
};

function readReceipt(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the receipt image."));
    reader.readAsDataURL(file);
  });
}

const tone: Record<string, "warning" | "info" | "success" | "danger"> = {
  pending: "warning",
  approved: "info",
  settled: "success",
  rejected: "danger",
};

export function ExpensesPanel({ claims, totalClaims, lang = "en" }: { claims: Claim[]; totalClaims: number; lang?: Lang }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useRouteAction("new");
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<{ file: File; preview: string } | null>(null);
  const [viewing, setViewing] = useState<Claim | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (receipt) URL.revokeObjectURL(receipt.preview);
  }, [receipt]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (file.size > 2_000_000) {
      toast("error", t(lang, "expenses.receiptTooLarge"));
      return;
    }
    if (!file.type.startsWith("image/") || !file.size) {
      toast("error", "Choose a receipt image.");
      return;
    }
    setReceipt({ file, preview: URL.createObjectURL(file) });
  }

  function closeClaimForm() {
    if (loading) return;
    setReceipt(null);
    setOpen(false);
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
          receiptUrl: receipt ? await readReceipt(receipt.file) : null,
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
          {totalClaims} {t(lang, "expenses.claims")}
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
            <button type="button" key={c.id} onClick={() => setViewing(c)} className="flex w-full flex-wrap items-center gap-3 px-5 py-4 text-left hover:bg-tint">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-brand text-[11px] font-bold text-white">
                {c.title.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium">{c.title}</p>
                <p className="text-[11.5px] text-muted-foreground">
                  {t(lang, `expenses.cat.${c.category}`)} · {formatDate(new Date(c.createdAt))}
                </p>
              </div>
              {c.receiptUrl && (
                <img src={c.receiptUrl} alt="Receipt" className="h-9 w-9 rounded-lg border border-edge object-cover" />
              )}
              <span className="font-mono text-[13.5px] font-bold">₹{c.amount.toLocaleString("en-IN")}</span>
              <Badge tone={tone[c.status] ?? "neutral"} className="capitalize">{c.status}</Badge>
            </button>
          ))}
        </div>
      )}

      <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title={viewing?.title} size="sm">
        {viewing && <div className="space-y-4 text-sm">
          <p className="flex flex-wrap items-center gap-3">
            <span className="font-semibold">₹{viewing.amount.toLocaleString("en-IN")}</span>
            <span className="text-muted-foreground">{t(lang, `expenses.cat.${viewing.category}`)} · {formatDate(new Date(viewing.createdAt))}</span>
            <Badge tone={tone[viewing.status] ?? "neutral"} className="capitalize">{viewing.status}</Badge>
          </p>
          {viewing.description && <p className="whitespace-pre-wrap text-muted-foreground">{viewing.description}</p>}
          {viewing.reviewNote && <p className="whitespace-pre-wrap rounded-lg bg-tint p-3"><span className="block font-medium">Review note</span>{viewing.reviewNote}</p>}
          {viewing.receiptUrl && <img src={viewing.receiptUrl} alt="Receipt" className="max-h-72 w-full rounded-xl border border-edge object-contain" />}
        </div>}
      </Modal>

      <Modal open={open} onClose={closeClaimForm} title={t(lang, "expenses.newClaim")} size="sm">
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
              <Input name="amount" type="number" min={0} step="any" required placeholder="0" />
            </Field>
          </div>
          <Field label={t(lang, "expenses.description")}>
            <Textarea name="description" placeholder={t(lang, "expenses.descPlaceholder")} />
          </Field>
          <div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
            {receipt ? (
              <div className="relative inline-block">
                <img src={receipt.preview} alt="Receipt" className="h-28 rounded-xl border border-edge object-contain" />
                <button
                  type="button"
                  aria-label="Remove receipt"
                  disabled={loading}
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
            <Button type="button" variant="ghost" disabled={loading} onClick={closeClaimForm}>{t(lang, "common.cancel")}</Button>
            <Button type="submit" loading={loading}>{t(lang, "expenses.submit")}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
