import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Only administrators can review declarations." }, { status: 403 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const status = body?.action === "verify" ? "verified" : body?.action === "reject" ? "rejected" : null;
  const updatedAt = new Date(typeof body?.updatedAt === "string" ? body.updatedAt : NaN);
  if (!status || Number.isNaN(updatedAt.getTime()) || (body.note !== undefined && (typeof body.note !== "string" || body.note.length > 2000))) {
    return NextResponse.json({ error: "Select a valid review action and refresh the declaration before reviewing." }, { status: 400 });
  }
  const where = { id, tenantId: session.tenantId };
  const conflict = () => NextResponse.json({ error: "The declaration changed. Refresh and review the latest figures." }, { status: 409 });
  return prisma.$transaction(async (tx) => {
    const current = await tx.taxDeclaration.findFirst({ where });
    if (!current) return NextResponse.json({ error: "Declaration not found." }, { status: 404 });
    if (current.employeeId === session.sub) return NextResponse.json({ error: "An independent administrator must review this declaration." }, { status: 403 });
    if (current.updatedAt.getTime() !== updatedAt.getTime()) return conflict();
    if (current.status === status) return NextResponse.json({ declaration: current });
    if (status === "verified" && current.status !== "submitted") return NextResponse.json({ error: "The employee must resubmit this declaration before verification." }, { status: 409 });

    const [updated] = await tx.taxDeclaration.updateManyAndReturn({
      where: { ...where, updatedAt, status: current.status },
      data: { status, note: body.note?.trim() || null },
    });
    if (!updated) return conflict();
    await tx.auditLog.create({ data: {
      tenantId: session.tenantId, actorId: session.sub, actorRole: session.role,
      action: `tax_declaration.${body.action}`, entity: "TaxDeclaration", entityId: id,
      summary: `Tax declaration ${status}`, before: { status: current.status }, after: { status },
    } });
    return NextResponse.json({ declaration: updated });
  });
}
