import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { appendAudit } from "@/lib/audit";

const PAID_VIA = ["cash", "upi", "bank", "other"] as const;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (session?.role === "branch_manager") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json();
  const status = String(body.status ?? "");
  if (!["draft", "paid"].includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const payslip = await prisma.payslip.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!payslip) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (status === "draft") {
    if (payslip.status === "paid") {
      return NextResponse.json({ error: "Paid payslips cannot be reverted to draft." }, { status: 409 });
    }
    const updated = await prisma.payslip.update({
      where: { id },
      data: {
        status: "draft",
        note: body.note ?? payslip.note,
        paidAt: null,
        paidVia: null,
        paymentRef: null,
      },
    });
    return NextResponse.json({ payslip: updated });
  }

  // status === "paid": validate optional payout metadata.
  let paidVia: string | null | undefined = undefined;
  if (body.paidVia !== undefined && body.paidVia !== null && String(body.paidVia).trim() !== "") {
    const v = String(body.paidVia).trim().toLowerCase();
    if (!(PAID_VIA as readonly string[]).includes(v)) {
      return NextResponse.json({ error: "paidVia must be one of: cash, upi, bank, other." }, { status: 400 });
    }
    paidVia = v;
  } else if (body.paidVia !== undefined) {
    // Explicit empty/null clears the channel but keeps the slip paid.
    paidVia = null;
  }

  let paymentRef: string | null | undefined = undefined;
  if (body.paymentRef !== undefined && body.paymentRef !== null) {
    const ref = String(body.paymentRef).trim();
    if (ref.length > 120) {
      return NextResponse.json({ error: "paymentRef must be 120 characters or fewer." }, { status: 400 });
    }
    paymentRef = ref === "" ? null : ref;
  }

  const updated = await prisma.payslip.update({
    where: { id },
    data: {
      status: "paid",
      note: body.note ?? payslip.note,
      // A repeated paid request may update metadata, but not the original payout time.
      paidAt: payslip.paidAt ?? new Date(),
      ...(paidVia !== undefined ? { paidVia } : {}),
      ...(paymentRef !== undefined ? { paymentRef } : {}),
    },
  });
  await appendAudit({
    tenantId: session.tenantId,
    actorId: session.sub,
    actorRole: session.role,
    action: "payslip.paid",
    entity: "Payslip",
    entityId: id,
    summary: `Payslip ${updated.month} marked paid`,
    before: { status: payslip.status },
    after: { status: updated.status, paidVia: updated.paidVia, paymentRef: updated.paymentRef },
  });
  return NextResponse.json({ payslip: updated });
}
