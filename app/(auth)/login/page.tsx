import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Login | PeopleNexa",
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(session.role === "admin" ? "/admin" : "/employee");

  return (
    <div className="animate-fade-up">
      <div className="mb-7">
        <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-indigo-500 dark:text-indigo-300">Welcome back</p>
        <h2 className="font-display text-[30px] font-bold tracking-[-0.035em]">Sign in to your workspace</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
          Pick up where your team left off. Your people data, requests, and daily actions are waiting.
        </p>
      </div>
      <LoginForm />
      <p className="mt-7 text-center text-[13px] text-muted-foreground">
        New to PeopleNexa?{" "}
        <Link href="/register" className="font-medium text-indigo-300 transition-colors hover:text-indigo-200">
          Create a workspace
        </Link>
      </p>
    </div>
  );
}
