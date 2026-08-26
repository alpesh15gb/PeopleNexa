import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const DEV_JWT_SECRET = "dev-secret-change-me-in-prod";
const SESSION_COOKIE = "sk_session";

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === "production") {
    if (!secret || secret === "change-me" || secret.startsWith("replace-with-") || secret === DEV_JWT_SECRET) {
      throw new Error("JWT_SECRET must be configured with a strong value in production.");
    }
    if (secret.length < 32) {
      throw new Error("JWT_SECRET must be at least 32 characters in production.");
    }
    return secret;
  }
  return secret ?? DEV_JWT_SECRET;
}
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
  return jwt.sign(payload, jwtSecret(), { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): SessionPayload & { exp: number } | null {
  try {
    return jwt.verify(token, jwtSecret()) as SessionPayload & { exp: number };
  } catch {
    return null;
  }
}

export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

export { SESSION_COOKIE };
