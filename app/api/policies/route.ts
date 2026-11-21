import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

const CATEGORIES = ["general", "attendance", "leave", "payroll", "conduct", "it", "safety"];

/** GET — active policies (everyone). */
export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const policies = await prisma.policy.findMany({
    where: { tenantId: session.tenantId, active: true },
    orderBy: [{ category: "asc" }, { updatedAt: "desc" }],
  });
  return NextResponse.json({
    policies: policies.map((p) => ({ ...p, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() })),
  });
}

/** POST — admin creates a policy. */
export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!title || !text || title.length > 180 || text.length > 50_000) return NextResponse.json({ error: "Enter a policy title up to 180 characters and policy text up to 50,000 characters." }, { status: 400 });

  const policy = await prisma.policy.create({
    data: {
      tenantId: session.tenantId,
      title,
      body: text,
      category: CATEGORIES.includes(body.category) ? body.category : "general",
      createdBy: session.sub,
    },
  });
  return NextResponse.json({ policy }, { status: 201 });
}
