"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import { languages, type Lang } from "@/lib/i18n";

export function LanguageToggle({ lang }: { lang: Lang }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const setLang = async (next: Lang) => {
    setBusy(true);
    try {
      await fetch("/api/i18n", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: next }),
      });
      router.refresh();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  const current = languages.find((l) => l.code === lang) ?? languages[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-label={`Language, current: ${current.label}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        title="Language / भाषा / ભાષા / भाषा / மொழி"
        className={cn(
          "flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-edge bg-tint px-2.5 text-[12px] font-semibold transition-colors duration-200",
          "text-muted-foreground hover:border-primary/25 hover:bg-primary/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
          busy && "opacity-60"
        )}
      >
        <Languages aria-hidden="true" className="h-3.5 w-3.5" />
        <span className="hidden md:inline">{current.native}</span>
        <span aria-hidden="true" className="md:hidden">{current.code.toUpperCase()}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div role="listbox" aria-label="Choose language" className="card-surface absolute right-0 z-50 mt-1 max-w-[calc(100vw-2rem)] w-44 rounded-xl bg-card-2 p-1.5 shadow-2xl">
            {languages.map((l) => (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                className="flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-[12.5px] text-muted-foreground transition-colors duration-200 hover:bg-primary/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <span>
                  <span className="font-medium text-foreground">{l.native}</span>
                  <span className="ml-1.5 text-[11px]">{l.label}</span>
                </span>
                {l.code === lang && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
