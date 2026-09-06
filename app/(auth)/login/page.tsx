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
    <div className="animate-fade-up motion-reduce:animate-none">
      <div className="mb-7">
        <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-primary dark:text-[#93C5FD]">Welcome back</p>
        <h2 className="font-display text-[30px] font-bold tracking-[-0.035em]">Sign in to your workspace</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
          Pick up where your team left off. Your people data, requests, and daily actions are waiting.
        </p>
      </div>
      <LoginForm />
      <p className="mt-7 text-center text-[13px] text-muted-foreground">
        New to PeopleNexa?{" "}
        <Link
          href="/register"
          className="cursor-pointer rounded font-medium text-primary transition-colors duration-200 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none dark:text-[#93C5FD] dark:hover:text-[#BFDBFE]"
        >
          Create a workspace
        </Link>
      </p>
    </div>
  );
}
