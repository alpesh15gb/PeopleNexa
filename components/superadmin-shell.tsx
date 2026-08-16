"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, LogOut, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/superadmin", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" />, exact: true },
];

export function SuperadminShell({ name, children }: { name: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // still redirect
    }
    router.push("/superadmin/login");
    router.refresh();
  };

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-edge bg-sidebar/80 backdrop-blur-xl lg:block">
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center gap-2.5 px-5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand text-[13px] font-bold text-white">
              SA
            </span>
            <div className="leading-tight">
              <p className="font-display text-[14px] font-bold tracking-tight">PeopleNexa</p>
              <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground/70">Super Admin</p>
            </div>
          </div>
          <nav className="space-y-1 px-3">
            {navItems.map((item) => {
              const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-all duration-150",
                    active
                      ? "bg-gradient-brand text-white shadow-[0_4px_20px_-6px_rgba(99,102,241,0.6)]"
                      : "text-muted-foreground hover:bg-tint hover:text-foreground"
                  )}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto p-3">
            <div className="card-surface rounded-xl p-3">
              <p className="truncate text-[13px] font-semibold">{name}</p>
              <button
                onClick={logout}
                className="mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] text-rose-300 transition-colors hover:bg-rose-500/10"
              >
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-edge bg-background/70 px-4 backdrop-blur-xl sm:px-6">
          <Link href="/superadmin" className="flex items-center gap-2 lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand text-[13px] font-bold text-white">
              SA
            </span>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-[17px] font-bold tracking-tight">
              {navItems.find((n) => (n.exact ? pathname === n.href : pathname.startsWith(n.href)))?.label ?? "Console"}
            </h1>
          </div>
          <span className="hidden items-center gap-1.5 rounded-xl border border-edge bg-tint px-3 py-1.5 text-[12px] font-medium text-muted-foreground sm:flex">
            <ShieldCheck className="h-3.5 w-3.5 text-indigo-300" /> Platform console
          </span>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
