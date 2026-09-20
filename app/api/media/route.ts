import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { imageType, MEDIA_MAX_BYTES, saveTenantMedia } from "@/lib/tenant-media";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const locationId = String(form?.get("locationId") ?? "").trim() || null;
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a PNG or JPEG image." }, { status: 400 });
  if (file.size < 1 || file.size > MEDIA_MAX_BYTES) return NextResponse.json({ error: "Images must be no larger than 5 MB." }, { status: 400 });
  if (file.type !== "image/png" && file.type !== "image/jpeg") return NextResponse.json({ error: "Only PNG and JPEG images are allowed." }, { status: 400 });
  if (locationId && !await prisma.location.findFirst({ where: { id: locationId, tenantId: session.tenantId }, select: { id: true } })) return NextResponse.json({ error: "Location not found." }, { status: 404 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const type = imageType(bytes);
  if (!type || (file.type === "image/png") !== (type === "png")) return NextResponse.json({ error: "The file contents do not match its image type." }, { status: 400 });
  const url = await saveTenantMedia(session.tenantId, locationId, bytes, type);
  return NextResponse.json({ url }, { status: 201 });
}
