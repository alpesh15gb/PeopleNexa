import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = {
  title: "Create your company | PeopleNexa",
  robots: { index: false, follow: false },
};

export default async function RegisterPage() {
  return (
    <div className="animate-fade-up motion-reduce:animate-none">
      <div className="mb-7">
        <h1 className="font-display text-[30px] font-bold tracking-[-0.035em]">Create your workspace</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
          Set your organization’s workspace address and create its first administrator account.
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
