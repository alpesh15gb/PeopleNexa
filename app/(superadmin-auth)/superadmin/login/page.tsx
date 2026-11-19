import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { SuperAdminLoginForm } from "./superadmin-login-form";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "Super Admin | PeopleNexa",
  robots: { index: false, follow: false },
};

export default async function SuperAdminLoginPage() {
  const session = await getSession();
  if (session?.role === "superadmin") redirect("/superadmin");

  return (
    <main className="min-h-dvh bg-background px-5 py-8 sm:py-14">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link href="/login" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary hover:underline"><ArrowLeft aria-hidden="true" className="size-4" /> Workspace sign-in</Link>
          <ThemeToggle />
        </div>
        <div className="mb-6">
          <span className="mb-4 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><ShieldCheck aria-hidden="true" className="size-5" /></span>
          <h1 className="font-display text-3xl font-bold tracking-tight">Platform sign-in</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Use your platform administrator account to manage workspaces, plans and licenses.
          </p>
        </div>
        <SuperAdminLoginForm />
      </div>
    </main>
  );
}
