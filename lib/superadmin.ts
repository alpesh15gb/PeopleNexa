import { getSession } from "@/lib/session";

/** Require a super-admin session for platform-level APIs/pages. */
export async function requireSuperAdmin(): Promise<{ sub: string; role: string }> {
  const session = await getSession();
  if (!session || session.role !== "superadmin") {
    throw new Error("unauthorized");
  }
  return { sub: session.sub, role: session.role };
}
