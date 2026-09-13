import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { profilePictureValue } from "@/lib/profile-picture";

export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const photos = (await req.json()).photos as Array<{ code?: unknown; profilePicture?: unknown }>;
  if (!Array.isArray(photos) || photos.length === 0 || photos.length > 10) return NextResponse.json({ error: "Upload 1 to 10 photos at a time." }, { status: 400 });
  const results: Array<{ code: string; error?: string }> = [];
  for (const item of photos) {
    const code = String(item.code ?? "").trim();
    const photo = profilePictureValue(item.profilePicture);
    if (!code || photo.error) { results.push({ code: code || "unknown", error: photo.error ?? "Filename must be an Employee Code or Device Code." }); continue; }
    const employee = await prisma.employee.findFirst({ where: { tenantId: session.tenantId, OR: [{ deviceCode: code }, { employeeNumber: code }] }, select: { id: true } });
    if (!employee) { results.push({ code, error: "No employee matches this filename." }); continue; }
    await prisma.employee.update({ where: { id: employee.id }, data: { profilePicture: photo.value } });
    results.push({ code });
  }
  return NextResponse.json({ updated: results.filter((result) => !result.error).length, results });
}
