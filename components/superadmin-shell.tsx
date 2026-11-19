"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, ShieldCheck } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/components/ui/toast";

export function SuperadminShell({ name, children }: { name: string; children: ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout failed");
      router.replace("/superadmin/login");
      router.refresh();
    } catch {
      toast("error", "Could not sign out. Try again.");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-20 border-b border-edge bg-card">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link href="/superadmin" className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="PeopleNexa platform home">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><ShieldCheck aria-hidden="true" className="size-5" /></span>
            <span className="min-w-0"><span className="block truncate text-sm font-semibold">PeopleNexa</span><span className="block truncate text-xs text-muted-foreground">Platform console</span></span>
          </Link>
          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            <span className="hidden max-w-40 truncate text-sm text-muted-foreground sm:block">{name}</span>
            <ThemeToggle />
            <button type="button" onClick={signOut} disabled={signingOut} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-edge px-2.5 text-sm font-medium hover:bg-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" aria-label="Sign out">
              <LogOut aria-hidden="true" className="size-4" /><span className="hidden sm:inline">{signingOut ? "Signing out…" : "Sign out"}</span>
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
