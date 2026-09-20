import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parseMediaUrl, type StoredMedia } from "@/lib/media-url";

export const MEDIA_MAX_BYTES = 5_000_000;
const root = () => process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");
export { parseMediaUrl, type StoredMedia } from "@/lib/media-url";

export function mediaUrl(tenantId: string, locationId: string | null, filename: string) {
  return `/api/media/${tenantId}/${locationId ? `locations/${locationId}` : "tenant"}/${filename}`;
}

export function mediaFilePath(media: StoredMedia) {
  // UPLOADS_DIR is a mounted runtime volume, not a build-time project asset.
  return path.join(/* turbopackIgnore: true */ root(), media.tenantId, media.locationId ?? "tenant", media.filename);
}

export function mediaAllowedForScope(value: string | null | undefined, tenantId: string, locationId: string | null) {
  const media = parseMediaUrl(value);
  return !media || (media.tenantId === tenantId && (media.locationId === null || media.locationId === locationId));
}

export async function saveTenantMedia(tenantId: string, locationId: string | null, bytes: Buffer, extension: "png" | "jpg") {
  const filename = `${randomUUID()}.${extension}`;
  const media = { tenantId, locationId, filename };
  const filePath = mediaFilePath(media);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, bytes, { flag: "wx", mode: 0o640 });
  return mediaUrl(tenantId, locationId, filename);
}

export async function readTenantMedia(value: string | null | undefined) {
  const media = parseMediaUrl(value);
  if (!media) return null;
  try { return await readFile(/* turbopackIgnore: true */ mediaFilePath(media)); } catch { return null; }
}

export function imageType(bytes: Buffer): "png" | "jpg" | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  return null;
}
