"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { cn } from "@/lib/utils";

export function LanguageToggle({ lang }: { lang: "en" | "hi" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const next = lang === "hi" ? "en" : "hi";

  const toggle = async () => {
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
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={next === "hi" ? "Switch to हिन्दी" : "Switch to English"}
      className={cn(
        "flex h-9 items-center gap-1.5 rounded-xl border border-edge bg-tint px-2.5 text-[12px] font-semibold transition-colors",
        "text-muted-foreground hover:bg-tint-strong hover:text-foreground",
        busy && "opacity-60"
      )}
    >
      <Languages className="h-3.5 w-3.5" />
      {lang === "hi" ? "हिन्दी" : "EN"}
    </button>
  );
}
