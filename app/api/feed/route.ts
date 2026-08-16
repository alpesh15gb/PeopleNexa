import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { notifyAdmins } from "@/lib/notifications";

/** GET — feed posts with comments (tenant-wide). */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const posts = await prisma.orgPost.findMany({
    where: { tenantId: session.tenantId },
    include: {
      author: { select: { id: true, firstName: true, lastName: true, role: true, profilePicture: true } },
      comments: { include: { author: { select: { id: true, firstName: true, lastName: true, role: true } } }, orderBy: { createdAt: "asc" } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    posts: posts.map((p) => ({
      id: p.id,
      body: p.body,
      isAnnouncement: p.isAnnouncement,
      createdAt: p.createdAt.toISOString(),
      author: p.author,
      comments: p.comments.map((c) => ({ id: c.id, body: c.body, createdAt: c.createdAt.toISOString(), author: c.author })),
    })),
  });
}

/** POST — create a post (admins can mark as announcement). */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const text = String(body.body ?? "").trim();
  if (!text) return NextResponse.json({ error: "Write something first." }, { status: 400 });
  if (text.length > 2000) return NextResponse.json({ error: "Post is too long." }, { status: 400 });

  const isAnnouncement = Boolean(body.isAnnouncement) && session.role === "admin";
  const post = await prisma.orgPost.create({
    data: { tenantId: session.tenantId, authorId: session.sub, body: text, isAnnouncement },
  });

  if (isAnnouncement) {
    await notifyAdmins(session.tenantId, "info", "New announcement", text.slice(0, 120));
  }

  return NextResponse.json({ post }, { status: 201 });
}
