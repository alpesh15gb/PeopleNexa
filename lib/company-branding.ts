type Profile = {
  legalName?: string | null;
  logoUrl?: string | null;
  address?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
} | null | undefined;

type Tenant = { name: string; address?: string | null; phone?: string | null; email?: string | null; profile?: Profile } | null | undefined;
type Location = { profile?: Profile } | null | undefined;

export type CompanyBranding = { companyName: string; address: string | null; contact: string | null; logoUrl: string | null; hasConfiguredValues: boolean };

const text = (value: string | null | undefined, limit: number) => {
  const result = value?.trim();
  return result && result.length <= limit ? result : null;
};

export function safeLogoUrl(value: string | null | undefined) {
  const source = value?.trim();
  if (!source) return null;
  if (/^data:image\/(png|jpe?g);base64,[a-z0-9+/=\s]+$/i.test(source)) {
    const payload = source.slice(source.indexOf(",") + 1).replace(/\s/g, "");
    return payload.length <= 6_666_668 ? source : null;
  }
  if (source.length > 2_048) return null;
  try {
    const url = new URL(source);
    if (url.protocol !== "https:" || url.username || url.password || url.port || isPrivateHost(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1") return true;
  const octets = host.split(".").map(Number);
  return octets.length === 4 && octets.every(Number.isInteger) && (octets[0] === 10 || octets[0] === 127 || octets[0] === 0 || (octets[0] === 169 && octets[1] === 254) || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168));
}

function pick<T>(locationValue: T | null, tenantValue: T | null, fallbackValue: T | null) {
  if (locationValue !== null) return { value: locationValue, configured: true };
  if (tenantValue !== null) return { value: tenantValue, configured: true };
  return { value: fallbackValue, configured: false };
}

export function resolveCompanyBranding(tenant: Tenant, location?: Location): CompanyBranding {
  const locationProfile = location?.profile;
  const tenantProfile = tenant?.profile;
  const name = pick(null, text(tenantProfile?.legalName, 160), text(tenant?.name, 160));
  const logo = pick(safeLogoUrl(locationProfile?.logoUrl), safeLogoUrl(tenantProfile?.logoUrl), null);
  const address = pick(text(locationProfile?.address, 400), text(tenantProfile?.address, 400), text(tenant?.address, 400));
  const contactName = pick(text(locationProfile?.contactName, 120), text(tenantProfile?.contactName, 120), null);
  const contactPhone = pick(validPhone(locationProfile?.contactPhone), validPhone(tenantProfile?.contactPhone), validPhone(tenant?.phone));
  const contactEmail = pick(validEmail(locationProfile?.contactEmail), validEmail(tenantProfile?.contactEmail), validEmail(tenant?.email));
  const contact = [contactName.value, contactPhone.value, contactEmail.value].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index).join(" | ") || null;
  return { companyName: name.value ?? "Company", address: address.value, contact, logoUrl: logo.value, hasConfiguredValues: name.configured || logo.configured || address.configured || contactName.configured || contactPhone.configured || contactEmail.configured };
}

function validEmail(value: string | null | undefined) {
  const result = text(value, 254);
  return result && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result) ? result : null;
}

function validPhone(value: string | null | undefined) {
  const result = text(value, 64);
  return result && /^[+()\-\s\d]+$/.test(result) && (result.match(/\d/g)?.length ?? 0) >= 6 ? result : null;
}

export async function loadBrandLogo(source: string | null) {
  if (!source) return null;
  try {
    if (source.startsWith("data:")) return imageBuffer(Buffer.from(source.slice(source.indexOf(",") + 1).replace(/\s/g, ""), "base64"));
    const response = await fetch(source, { redirect: "error", signal: AbortSignal.timeout(5_000) });
    const length = Number(response.headers.get("content-length"));
    if (!response.ok || !/^image\/(png|jpeg)$/i.test(response.headers.get("content-type") ?? "") || (Number.isFinite(length) && length > 5_000_000)) return null;
    const image = Buffer.from(await response.arrayBuffer());
    return imageBuffer(image);
  } catch {
    return null;
  }
}

function imageBuffer(image: Buffer) {
  const png = image.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpeg = image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff;
  return image.length <= 5_000_000 && (png || jpeg) ? image : null;
}
