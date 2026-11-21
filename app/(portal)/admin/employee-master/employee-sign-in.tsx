"use client";

import { KeyRound } from "lucide-react";
import { EssLoginAccess } from "@/components/ess-login-access";
import { useRouteAction } from "@/components/use-route-action";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export function EmployeeSignIn({ employeeId, employeeName }: { employeeId: string; employeeName: string }) {
  const [open, setOpen] = useRouteAction("sign-in");
  return <>
    <Button size="sm" variant="outline" onClick={() => setOpen(true)}><KeyRound className="size-4" /> Set up sign-in</Button>
    <Modal open={open} onClose={() => setOpen(false)} title="Set up employee sign-in" description={`Generate a temporary password for ${employeeName}. Share the employee ID and password directly through your approved private channel.`} placement="drawer">
      {open && <EssLoginAccess employeeId={employeeId} />}
    </Modal>
  </>;
}
