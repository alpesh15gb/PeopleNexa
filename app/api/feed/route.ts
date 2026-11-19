import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/** GET — feed posts with comments (tenant-wide). */
export async function GET() {
  const session = await requireActiveSession().catch(() => null);
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
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const text = String(body.body ?? "").trim();
  if (!text) return NextResponse.json({ error: "Write something first." }, { status: 400 });
  if (text.length > 2000) return NextResponse.json({ error: "Post is too long." }, { status: 400 });

  const isAnnouncement = Boolean(body.isAnnouncement) && session.role === "admin";
  const post = await prisma.$transaction(async (tx) => {
    const created = await tx.orgPost.create({
      data: { tenantId: session.tenantId, authorId: session.sub, body: text, isAnnouncement },
    });
    if (!isAnnouncement) return created;
    const recipients = await tx.employee.findMany({
      where: { tenantId: session.tenantId, status: "active", id: { not: session.sub } },
      select: { id: true },
    });
    if (recipients.length) {
      await tx.notification.createMany({
        data: recipients.map((employee) => ({ tenantId: session.tenantId, employeeId: employee.id, type: "info", title: "New announcement", message: text.slice(0, 120) })),
      });
    }
    return created;
  });

  return NextResponse.json({ post }, { status: 201 });
}
