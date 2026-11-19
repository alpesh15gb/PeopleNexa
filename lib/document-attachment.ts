import { parseMediaUrl } from "./media-url";

export const DOCUMENT_ATTACHMENT_MAX_BYTES = 2_000_000;
export const DOCUMENT_ATTACHMENT_TYPES = {
  "application/pdf": "pdf",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export function documentAttachment(value: string | null, tenantId: string) {
  if (!value || value.length > 3_000_000) return null;
  const media = parseMediaUrl(value);
  if (media) return media.tenantId === tenantId ? { kind: "link" as const, url: value } : null;
  const data = /^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (data) {
    const [, type, base64] = data;
    if (!Object.prototype.hasOwnProperty.call(DOCUMENT_ATTACHMENT_TYPES, type) || base64.length % 4 !== 0) return null;
    const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
    const bytes = base64.length / 4 * 3 - padding;
    if (bytes > DOCUMENT_ATTACHMENT_MAX_BYTES) return null;
    return { kind: "data" as const, type, base64, extension: DOCUMENT_ATTACHMENT_TYPES[type as keyof typeof DOCUMENT_ATTACHMENT_TYPES] };
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? { kind: "link" as const, url: url.href } : null;
  } catch {
    return null;
  }
}
