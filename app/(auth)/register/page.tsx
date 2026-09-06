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
    <div className="animate-fade-up motion-reduce:animate-none">
      <div className="mb-7">
        <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-primary dark:text-[#93C5FD]">Start with the essentials</p>
        <h2 className="font-display text-[30px] font-bold tracking-[-0.035em]">Create your workspace</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
          We&apos;ll set up the sensible defaults so you can invite your team and get moving in minutes.
        </p>
      </div>
      <RegisterForm baseDomain={process.env.APP_BASE_DOMAIN ?? "peoplenexa.in"} />
      <p className="mt-7 text-center text-[13px] text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="cursor-pointer rounded font-medium text-primary transition-colors duration-200 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none dark:text-[#93C5FD] dark:hover:text-[#BFDBFE]"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
