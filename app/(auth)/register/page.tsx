import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "./register-form";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Create your company | PeopleNexa",
  robots: { index: false, follow: false },
};

export default async function RegisterPage() {
  const session = await getSession();
  if (session) redirect(session.role === "admin" ? "/admin" : "/employee");

  return (
    <div className="animate-fade-up">
      <div className="mb-7">
        <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-indigo-500 dark:text-indigo-300">Start with the essentials</p>
        <h2 className="font-display text-[30px] font-bold tracking-[-0.035em]">Create your workspace</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
          We&apos;ll set up the sensible defaults so you can invite your team and get moving in minutes.
        </p>
      </div>
      <RegisterForm baseDomain={process.env.APP_BASE_DOMAIN ?? "peoplenexa.in"} />
      <p className="mt-7 text-center text-[13px] text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-indigo-300 transition-colors hover:text-indigo-200">
          Sign in
        </Link>
      </p>
    </div>
  );
}
