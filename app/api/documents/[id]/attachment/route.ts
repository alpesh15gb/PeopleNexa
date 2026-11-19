import { NextRequest, NextResponse } from "next/server";
import { documentAttachment } from "@/lib/document-attachment";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";

const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  const [{ id }, locationId] = await Promise.all([params, managerLocationId(session)]);
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "No location assigned." }, { status: 403 });
  const document = await prisma.document.findFirst({
    where: {
      id,
      tenantId: session.tenantId,
      ...(session.role === "admin" ? {} : locationId ? { employee: employeeLocationScope(locationId) } : { employeeId: session.sub }),
    },
    select: { fileUrl: true, name: true },
  });
  const attachment = documentAttachment(document?.fileUrl ?? null, session.tenantId);
  if (!document || !attachment) return NextResponse.json({ error: "Attachment not found." }, { status: 404, headers: privateHeaders });
  if (attachment.kind === "link") {
    return NextResponse.redirect(new URL(attachment.url, request.url), { status: 303, headers: privateHeaders });
  }

  const filename = document.name.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "employee-document";
  return new NextResponse(new Uint8Array(Buffer.from(attachment.base64, "base64")), {
    headers: {
      ...privateHeaders,
      "Content-Type": attachment.type,
      "Content-Disposition": `attachment; filename="${filename}.${attachment.extension}"`,
    },
  });
}
