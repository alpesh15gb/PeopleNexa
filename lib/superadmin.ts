import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/** Require a super-admin session for platform-level APIs/pages. */
export async function requireSuperAdmin(): Promise<{ sub: string; role: string }> {
  const session = await getSession();
  if (!session || session.role !== "superadmin") {
    throw new Error("unauthorized");
  }
  const sa = await prisma.superAdmin.findUnique({ where: { id: session.sub }, select: { id: true } });
  if (!sa) {
    throw new Error("unauthorized");
  }
  return { sub: session.sub, role: session.role };
}
