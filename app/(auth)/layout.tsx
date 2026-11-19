import type { ReactNode } from "react";
import Link from "next/link";
import { Building2, KeyRound, Users } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-edge bg-card">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/" className="rounded-lg bg-white px-2.5 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="PeopleNexa home" className="h-6 w-auto" />
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <div className="mx-auto grid max-w-5xl gap-8 px-5 py-8 sm:px-8 sm:py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] lg:gap-20">
        <main className="mx-auto w-full max-w-lg">{children}</main>
        <aside aria-labelledby="access-help" className="mx-auto w-full max-w-lg self-start rounded-2xl border border-edge bg-tint/60 p-5 lg:mt-8 lg:p-7">
          <h2 id="access-help" className="font-display text-lg font-semibold">Workspace access</h2>
          <dl className="mt-4 space-y-4 text-sm">
            <div className="grid grid-cols-[1.25rem_1fr] gap-x-3">
              <Building2 aria-hidden="true" className="mt-0.5 size-4 text-primary" />
              <div><dt className="font-medium">Find your workspace</dt><dd className="mt-0.5 text-muted-foreground">Use the workspace address shared by your organization.</dd></div>
            </div>
            <div className="grid grid-cols-[1.25rem_1fr] gap-x-3">
              <Users aria-hidden="true" className="mt-0.5 size-4 text-primary" />
              <div><dt className="font-medium">Use your own account</dt><dd className="mt-0.5 text-muted-foreground">Sign in with the employee ID or work email assigned to you.</dd></div>
            </div>
            <div className="grid grid-cols-[1.25rem_1fr] gap-x-3">
              <KeyRound aria-hidden="true" className="mt-0.5 size-4 text-primary" />
              <div><dt className="font-medium">Get help signing in</dt><dd className="mt-0.5 text-muted-foreground">Ask your workspace administrator for your account details or a password reset.</dd></div>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
