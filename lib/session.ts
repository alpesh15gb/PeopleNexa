import { cookies } from "next/headers";
import { verifyToken, SESSION_COOKIE, type SessionPayload } from "./auth";

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  return { sub: payload.sub, role: payload.role, tenantId: payload.tenantId };
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new Error("unauthorized");
  }
  return session;
}
