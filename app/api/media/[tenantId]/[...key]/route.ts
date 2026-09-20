import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import { requireActiveSession } from "@/lib/session";
import { mediaFilePath, parseMediaUrl } from "@/lib/tenant-media";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ tenantId: string; key: string[] }> }) {
  const session = await requireActiveSession().catch(() => null);
  const { tenantId, key } = await params;
  if (!session || session.tenantId !== tenantId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const media = parseMediaUrl(`/api/media/${tenantId}/${key.join("/")}`);
  if (!media || media.tenantId !== session.tenantId) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const filePath = mediaFilePath(media);
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("not a file");
    return new NextResponse(await readFile(filePath), { headers: { "Content-Type": media.filename.endsWith(".png") ? "image/png" : "image/jpeg", "Content-Length": String(info.size), "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
  } catch { return NextResponse.json({ error: "not found" }, { status: 404 }); }
}
