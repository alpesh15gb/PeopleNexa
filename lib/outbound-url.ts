import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPrivateIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

function isPrivateIPv6(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb")) return true;
  if (v.startsWith("::ffff:")) {
    const mapped = v.slice("::ffff:".length);
    return isIP(mapped) === 4 ? isPrivateIPv4(mapped) : true;
  }
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true;
}

/**
 * Validate an admin-configured outbound HTTP(S) endpoint before the server
 * connects to it. Private targets are blocked by default. An on-premises
 * deployment that intentionally needs a LAN BioServer may set
 * ALLOW_PRIVATE_INTEGRATION_URLS=true at the infrastructure layer.
 */
export async function validateOutboundHttpUrl(raw: string): Promise<string> {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new Error("Enter a valid eBioserver URL."); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("eBioserver URL must use http:// or https://.");
  if (url.username || url.password) throw new Error("Do not embed credentials in the eBioserver URL.");

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const allowPrivate = process.env.ALLOW_PRIVATE_INTEGRATION_URLS === "true";
  if (!hostname || hostname === "metadata.google.internal") throw new Error("This eBioserver hostname is not allowed.");
  if (!allowPrivate && (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local"))) {
    throw new Error("Private or local eBioserver addresses are disabled on this deployment.");
  }

  if (!allowPrivate) {
    const literalVersion = isIP(hostname);
    if (literalVersion) {
      if (isPrivateAddress(hostname)) throw new Error("Private or local eBioserver addresses are disabled on this deployment.");
    } else {
      let addresses: Array<{ address: string; family: number }>;
      try { addresses = await lookup(hostname, { all: true, verbatim: true }); }
      catch { throw new Error("The eBioserver hostname could not be resolved."); }
      if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
        throw new Error("The eBioserver hostname resolves to a private or local address.");
      }
    }
  }

  url.hash = "";
  return url.toString();
}
