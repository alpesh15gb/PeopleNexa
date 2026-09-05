"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, LogOut, Menu, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/superadmin", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" />, exact: true },
];

export function SuperadminShell({ name, children }: { name: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // still redirect
    }
    router.push("/superadmin/login");
    router.refresh();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open ]);

  const nav = (
    <nav aria-label="Superadmin" className="space-y-1 px-3">
      {navItems.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-all duration-150 sm:min-h-0",
              active
                ? "bg-gradient-brand text-white shadow-[0_4px_20px_-6px_rgba(99,102,241,0.6)]"
                : "text-muted-foreground hover:bg-tint hover:text-foreground"
            )}
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden h-screen w-60 flex-col border-r border-edge bg-sidebar/80 backdrop-blur-xl lg:flex">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex h-16 shrink-0 items-center gap-2.5 px-5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand text-[13px] font-bold text-white">
              SA
            </span>
            <div className="leading-tight">
              <p className="font-display text-[14px] font-bold tracking-tight">PeopleNexa</p>
              <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground/70">Super Admin</p>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{nav}</div>
          <div className="shrink-0 border-t border-edge/60 p-3">
            <div className="card-surface rounded-xl p-3">
              <p className="truncate text-[13px] font-semibold">{name}</p>
              <button
                onClick={logout}
                className="mt-2 flex min-h-[44px] w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] text-rose-300 transition-colors hover:bg-rose-500/10 sm:min-h-0"
              >
                <LogOut aria-hidden="true" className="h-3.5 w-3.5" /> Sign out
              </button>
            </div>
          </div>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} aria-hidden="true" />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Superadmin navigation"
            className="absolute inset-y-0 left-0 flex h-full w-72 max-w-[85vw] flex-col border-r border-edge bg-sidebar"
          >
            <div className="flex h-16 shrink-0 items-center gap-2.5 px-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand text-[13px] font-bold text-white">
                SA
              </span>
              <p className="font-display text-[14px] font-bold">PeopleNexa</p>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-tint"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pb-4">{nav}</div>
          </aside>
        </div>
      )}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-edge bg-background/70 px-4 backdrop-blur-xl sm:px-6">
          <button
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-tint lg:hidden"
          >
            <Menu aria-hidden="true" className="h-5 w-5" />
          </button>
          <Link href="/superadmin" className="flex items-center gap-2 lg:hidden" aria-label="Superadmin home">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand text-[13px] font-bold text-white">
              SA
            </span>
          </Link>
          <div className="min-w-0 flex-1">
            <p aria-hidden="true" className="truncate font-display text-[17px] font-bold tracking-tight">
              {navItems.find((n) => (n.exact ? pathname === n.href : pathname.startsWith(n.href)))?.label ?? "Console"}
            </p>
          </div>
          <span className="hidden items-center gap-1.5 rounded-xl border border-edge bg-tint px-3 py-1.5 text-[12px] font-medium text-muted-foreground sm:flex">
            <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 text-indigo-300" /> Platform console
          </span>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
