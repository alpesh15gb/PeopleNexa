import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Login | PeopleNexa" };

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(session.role === "admin" ? "/admin" : "/employee");

  return (
    <div className="animate-fade-up">
      <div className="mb-8">
        <h2 className="font-display text-2xl font-bold tracking-tight">Login to your account</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Welcome back — punch in and get to work.
        </p>
      </div>
      <LoginForm />
      <p className="mt-8 text-center text-[13px] text-muted-foreground">
        New to PeopleNexa?{" "}
        <Link href="/register" className="font-medium text-indigo-300 transition-colors hover:text-indigo-200">
          Create your company
        </Link>
      </p>
    </div>
  );
}
