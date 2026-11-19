import { redirect } from "next/navigation";
import { readActiveIdentity } from "@/lib/session";
import { ChangePasswordForm } from "./password-form";
export default async function ChangePasswordPage() {
  const identity = await readActiveIdentity();
  if (!identity) redirect("/login");
  if (identity.session.role === "superadmin") redirect("/superadmin");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Set your password</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {identity.mustChangePassword ? "Replace your temporary password to continue to your workspace." : "Confirm your current password, then choose a new one."}
        </p>
      </div>
      <ChangePasswordForm />
    </div>
  );
}
