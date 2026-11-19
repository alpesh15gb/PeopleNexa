import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";
import { headers } from "next/headers";

export const metadata: Metadata = {
  title: "Login | PeopleNexa",
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  const workspace = (await headers()).get("x-tenant-slug");

  return (
    <div className="animate-fade-up motion-reduce:animate-none">
      <div className="mb-7">
        <h1 className="font-display text-[30px] font-bold tracking-[-0.035em]">Sign in to your workspace</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
          {workspace ? <>You’re signing in to <strong className="font-semibold text-foreground">{workspace}</strong>.</> : "Enter your workspace name and the account details provided by your organization."}
        </p>
      </div>
      <LoginForm workspace={workspace} />
      {!workspace && <p className="mt-7 text-center text-[13px] text-muted-foreground">
        New to PeopleNexa?{" "}
        <Link
          href="/register"
          className="cursor-pointer rounded font-medium text-primary transition-colors duration-200 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none dark:text-[#93C5FD] dark:hover:text-[#BFDBFE]"
        >
          Create a workspace
        </Link>
      </p>}
    </div>
  );
}
