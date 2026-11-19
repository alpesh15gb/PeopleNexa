import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

async function changeLoan(id: string, action: "close" | "delete") {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Only an administrator can change an existing loan." }, { status: 403 });

  try {
    return await prisma.$transaction(async (tx) => {
      const where = { id, tenantId: session.tenantId };
      const loan = await tx.employeeLoan.findFirst({ where });
      if (!loan) return NextResponse.json({ error: "Loan not found." }, { status: 404 });
      if (action === "close" && loan.status === "closed") return NextResponse.json({ loan });

      const referenced = await tx.payslip.findFirst({
        where: {
          tenantId: session.tenantId,
          employeeId: loan.employeeId,
          ...(action === "close" ? { payrollRun: { status: { in: ["draft", "reviewed", "approved"] } } } : {}),
          OR: [
            { inputSnapshot: { path: ["loanAllocations"], array_contains: [{ id }] } },
            ...(loan.lastDeductedMonth ? [{ month: loan.lastDeductedMonth, loanDeduction: { gt: 0 } }] : []),
          ],
        },
        select: { id: true },
      });
      if (action === "close" && referenced) {
        return NextResponse.json({ error: "Finish or cancel the open payroll that deducts this loan before closing it." }, { status: 409 });
      }
      if (action === "delete" && (referenced || loan.lastDeductedMonth || loan.amount !== loan.outstanding)) {
        return NextResponse.json({ error: "This loan has payroll history. Keep the record and close future deductions if needed." }, { status: 409 });
      }

      const updated = action === "close"
        ? await tx.employeeLoan.update({ where, data: { status: "closed" } })
        : await tx.employeeLoan.delete({ where });
      await tx.auditLog.create({ data: {
        tenantId: session.tenantId, actorId: session.sub, actorRole: session.role,
        action: `loan.${action}`, entity: "EmployeeLoan", entityId: id,
        summary: action === "close" ? "Stopped future payroll deductions" : "Deleted an unused loan or advance",
        before: { status: loan.status, outstanding: loan.outstanding },
        ...(action === "close" ? { after: { status: updated.status, outstanding: updated.outstanding } } : {}),
      } });
      return NextResponse.json(action === "close" ? { loan: updated } : { success: true });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2034") return NextResponse.json({ error: "Payroll changed the loan during this request. Refresh and try again." }, { status: 409 });
    throw error;
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await req.json().catch(() => null);
  if (body?.status !== "closed") return NextResponse.json({ error: "Choose the supported close action." }, { status: 400 });
  return changeLoan((await params).id, "close");
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return changeLoan((await params).id, "delete");
}
