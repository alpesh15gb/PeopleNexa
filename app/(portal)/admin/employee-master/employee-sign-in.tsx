"use client";

import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { EssLoginAccess } from "@/components/ess-login-access";
import { useRouteAction } from "@/components/use-route-action";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export function EmployeeSignIn({ employeeId, employeeName, hasLogin }: { employeeId: string; employeeName: string; hasLogin: boolean }) {
  const [open, setOpen] = useRouteAction("sign-in");
  const router = useRouter();
  const label = hasLogin ? "Reset sign-in" : "Set up sign-in";
  return <>
    <Button type="button" variant="outline" onClick={() => setOpen(true)}><KeyRound className="size-4" aria-hidden="true" /> {label}</Button>
    <Modal open={open} onClose={() => { setOpen(false); router.refresh(); }} title={`${label} for ${employeeName}`} description="Share the employee ID and new temporary password privately. The employee creates their own password when they sign in." placement="drawer">
      {open && <EssLoginAccess employeeId={employeeId} existing={hasLogin} />}
    </Modal>
  </>;
}
