import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ChangePasswordForm } from "./password-form";
export default async function ChangePasswordPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <div className="space-y-5"><h1 className="text-2xl font-bold">Set your password</h1><p className="text-sm text-muted-foreground">On your first sign-in or after an admin reset, choose a new password before continuing.</p><ChangePasswordForm /></div>;
}
