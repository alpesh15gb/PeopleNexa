import type { ReactNode } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background sm:grid sm:grid-cols-[minmax(14rem,0.65fr)_minmax(0,1.35fr)]">
      <header className="relative overflow-hidden bg-[#16392d] p-5 text-white sm:flex sm:flex-col sm:justify-between sm:p-8 lg:p-12">
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-28 hidden size-[36rem] rounded-full border-[70px] border-[#96d78c]/14 sm:block" />
        <div className="relative flex items-center justify-between gap-3">
          <Link href="/" className="inline-flex rounded-lg bg-white px-2.5 py-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
            <img src="/logo.png" alt="PeopleNexa home" className="h-6 w-auto" />
          </Link>
          <div className="rounded-lg bg-card text-foreground"><ThemeToggle /></div>
        </div>
        <p className="relative hidden max-w-xs text-sm leading-relaxed text-[#d6ebdc] sm:block">
          Need your workspace address or a password reset? Contact your organization’s workspace administrator.
        </p>
      </header>
      <main className="flex items-start justify-center px-5 py-8 sm:items-center sm:px-9 sm:py-12">
        <div className="w-full max-w-lg">{children}</div>
      </main>
    </div>
  );
}
