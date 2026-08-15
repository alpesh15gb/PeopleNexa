import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "./register-form";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Create your company | PeopleNexa" };

export default async function RegisterPage() {
  const session = await getSession();
  if (session) redirect(session.role === "admin" ? "/admin" : "/employee");

  return (
    <div className="animate-fade-up">
      <div className="mb-8">
        <h2 className="font-display text-2xl font-bold tracking-tight">Create your company</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          We'll set up your company, default branch, shift and leave types automatically.
        </p>
      </div>
      <RegisterForm baseDomain={process.env.APP_BASE_DOMAIN ?? "peoplenexa.in"} />
      <p className="mt-8 text-center text-[13px] text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-indigo-300 transition-colors hover:text-indigo-200">
          Sign in
        </Link>
      </p>
    </div>
  );
}
