const DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const MAX_BYTES = 300 * 1024;

export function profilePictureValue(value: unknown): { value: string | null; error?: string } {
  if (value === null || value === "") return { value: null };
  if (typeof value !== "string") return { value: null, error: "Photo must be a JPEG, PNG, or WebP image." };
  const match = value.match(DATA_URL);
  if (!match) return { value: null, error: "Photo must be a JPEG, PNG, or WebP image." };
  if (Buffer.from(match[2], "base64").length > MAX_BYTES) {
    return { value: null, error: "Photo must be 300 KB or smaller." };
  }
  return { value };
}
