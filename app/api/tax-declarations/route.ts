import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { fyFromMonth } from "@/lib/payroll";

/** GET — declarations. Admins see everyone (optionally by FY), employees see their own. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const fy = req.nextUrl.searchParams.get("fy");
  const declarations = await prisma.taxDeclaration.findMany({
    where: {
      tenantId: session.tenantId,
      ...(fy ? { fy } : {}),
      ...(session.role !== "admin" ? { employeeId: session.sub } : {}),
    },
    include:
      session.role === "admin"
        ? { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } } }
        : undefined,
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ declarations });
}

/** POST — an employee submits/updates their declaration for a financial year. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const fy = String(body.fy ?? fyFromMonth(new Date().toISOString().slice(0, 7))).trim();
  if (!/^\d{4}-\d{2}$/.test(fy)) return NextResponse.json({ error: "Invalid financial year." }, { status: 400 });

  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const sections = {
    "80c": num(body.sections?.["80c"]),
    "80d": num(body.sections?.["80d"]),
    hra: num(body.sections?.hra),
    lta: num(body.sections?.lta),
    other: num(body.sections?.other),
    total:
      num(body.sections?.["80c"]) + num(body.sections?.["80d"]) + num(body.sections?.hra) + num(body.sections?.lta) + num(body.sections?.other),
  };

  const declaration = await prisma.taxDeclaration.upsert({
    where: { employeeId_fy: { employeeId: session.sub, fy } },
    update: { sections: sections as unknown as object, status: "submitted", note: null },
    create: {
      tenantId: session.tenantId,
      employeeId: session.sub,
      fy,
      sections: sections as unknown as object,
      status: "submitted",
    },
  });

  return NextResponse.json({ declaration }, { status: 201 });
}
