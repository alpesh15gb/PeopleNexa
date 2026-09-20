import { parseMediaUrl } from "@/lib/media-url";

export function safeLogoUrl(value: string | null | undefined) {
  const source = value?.trim();
  if (!source) return null;
  if (parseMediaUrl(source)) return source;
  if (/^data:image\/(png|jpe?g);base64,[a-z0-9+/=\s]+$/i.test(source)) {
    const payload = source.slice(source.indexOf(",") + 1).replace(/\s/g, "");
    return payload.length <= 6_666_668 ? source : null;
  }
  if (source.length > 2_048) return null;
  try {
    const url = new URL(source);
    if (url.protocol !== "https:" || url.username || url.password || url.port || isPrivateHost(url.hostname)) return null;
    return url.toString();
  } catch { return null; }
}

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1") return true;
  const octets = host.split(".").map(Number);
  return octets.length === 4 && octets.every(Number.isInteger) && (octets[0] === 10 || octets[0] === 127 || octets[0] === 0 || (octets[0] === 169 && octets[1] === 254) || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168));
}
