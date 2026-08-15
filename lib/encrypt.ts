import crypto from "crypto";

// AES-256-GCM envelope: "enc:<iv-b64>:<authTag-b64>:<ciphertext-b64>".
// The key comes from env; it is NOT stored with the ciphertext.
function getKey(): Buffer {
  const secret = process.env.EBIO_ENCRYPTION_KEY;
  if (!secret || secret.length < 16) {
    throw new Error("EBIO_ENCRYPTION_KEY must be set (>= 16 chars) to store eBioserver credentials.");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(payload: string): string | null {
  try {
    const [prefix, ivB64, tagB64, dataB64] = payload.split(":");
    if (prefix !== "enc" || !ivB64 || !tagB64 || !dataB64) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
