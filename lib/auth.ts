import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me-in-prod";
const SESSION_COOKIE = "sk_session";
export const SESSION_COOKIE_DOMAIN =
  process.env.NODE_ENV === "production" && process.env.APP_BASE_DOMAIN
    ? `.${process.env.APP_BASE_DOMAIN}`
    : undefined;
const TOKEN_TTL = "30d";

export interface SessionPayload {
  sub: string; // employee id
  role: string;
  tenantId: string;
}

export function signToken(payload: SessionPayload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): SessionPayload & { exp: number } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionPayload & { exp: number };
  } catch {
    return null;
  }
}

export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

export { SESSION_COOKIE };
