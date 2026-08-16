import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { SuperAdminLoginForm } from "./superadmin-login-form";

export const metadata: Metadata = { title: "Super Admin | PeopleNexa" };

export default async function SuperAdminLoginPage() {
  const session = await getSession();
  if (session?.role === "superadmin") redirect("/superadmin");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-brand text-lg font-bold text-white">
            SA
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Super Admin</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Platform console — manage tenants, modules and licenses.
          </p>
        </div>
        <SuperAdminLoginForm />
        <p className="mt-8 text-center text-[13px] text-muted-foreground">
          <Link href="/login" className="font-medium text-indigo-300 transition-colors hover:text-indigo-200">
            ← Back to workspace login
          </Link>
        </p>
      </div>
    </div>
  );
}
