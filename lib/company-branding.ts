import { readTenantMedia } from "@/lib/tenant-media";
import { safeLogoUrl } from "@/lib/branding-url";

export { safeLogoUrl } from "@/lib/branding-url";

type Profile = {
  legalName?: string | null;
  displayName?: string | null;
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

function pick<T>(locationValue: T | null, tenantValue: T | null, fallbackValue: T | null) {
  if (locationValue !== null) return { value: locationValue, configured: true };
  if (tenantValue !== null) return { value: tenantValue, configured: true };
  return { value: fallbackValue, configured: false };
}

export function resolveCompanyBranding(tenant: Tenant, location?: Location): CompanyBranding {
  const locationProfile = location?.profile;
  const tenantProfile = tenant?.profile;
  const name = pick(text(locationProfile?.displayName, 160), text(tenantProfile?.displayName, 160) ?? text(tenantProfile?.legalName, 160), text(tenant?.name, 160));
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
    const stored = await readTenantMedia(source);
    if (stored) return imageBuffer(stored);
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
