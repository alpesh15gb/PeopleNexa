import { redirect } from "next/navigation";
import { readActiveIdentity } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getTenantAccess } from "@/lib/modules-server";
import { ChangePasswordForm } from "./password-form";

export default async function ChangePasswordPage() {
  const identity = await readActiveIdentity();
  if (!identity) redirect("/login");
  const { session, mustChangePassword } = identity;
  if (session.role === "superadmin") redirect("/superadmin");
  const [pendingTask, access] = mustChangePassword && session.role === "employee"
    ? await Promise.all([
        prisma.onboardingTask.findFirst({
          where: { tenantId: session.tenantId, employeeId: session.sub, status: "pending", employee: { loginOnly: false } },
          select: { id: true },
        }),
        getTenantAccess(session.tenantId),
      ])
    : [null, null];
  const hasChecklist = Boolean(pendingTask && access?.modules.has("onboarding"));

  return (
    <div className="space-y-6">
      <div>
        {hasChecklist && <p className="mb-2 text-sm font-semibold text-primary">Step 1 of 2 · Account setup</p>}
        <h1 className="font-display text-3xl font-bold tracking-tight">{mustChangePassword ? "Set your password" : "Change your password"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {hasChecklist
            ? "Use the temporary password HR shared, then create your own password. Your onboarding checklist opens next."
            : mustChangePassword
              ? "Use the temporary password HR shared, then create your own password."
              : "Enter your current password and choose a new one."}
        </p>
      </div>
      <ChangePasswordForm temporary={mustChangePassword} hasChecklist={hasChecklist} />
    </div>
  );
}
