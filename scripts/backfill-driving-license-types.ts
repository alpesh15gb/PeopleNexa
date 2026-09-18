import "dotenv/config";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";

type Source = Record<string, unknown>;

function text(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const result = String(value).trim();
  return result && !/^select(?:\s+.*)?$/i.test(result) ? result : null;
}

function licenseType(source: Source): "commercial" | "permanent" | null {
  const documentType = text(source["ID_Document Type"]);
  const details = text(source["ID_Licence / Registration Details"]);
  if (!documentType?.toLowerCase().includes("licen") || !details) return null;
  if (/(?:^|\W)(?:tr|transport)(?:\W|$)/i.test(details)) return "commercial";
  if (/(?:^|\W)(?:nt|non[-\s]?transport)(?:\W|$)/i.test(details)) return "permanent";
  return null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const tenantSlug = process.argv.find((argument) => argument.startsWith("--tenant="))?.slice(9) ?? "ksipl";
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
  if (!tenant) throw new Error(`Tenant '${tenantSlug}' was not found.`);
  const employees = await prisma.employee.findMany({ where: { tenantId: tenant.id, drivingLicenseType: null, legacyImportData: { not: Prisma.JsonNull } }, select: { id: true, legacyImportData: true } });
  const updates = employees.flatMap((employee) => {
    const source = employee.legacyImportData && typeof employee.legacyImportData === "object" && !Array.isArray(employee.legacyImportData) ? employee.legacyImportData as Source : null;
    const type = source ? licenseType(source) : null;
    return type ? [{ id: employee.id, type }] : [];
  });
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", tenant: tenantSlug, scanned: employees.length, commercial: updates.filter((item) => item.type === "commercial").length, permanent: updates.filter((item) => item.type === "permanent").length, unmapped: employees.length - updates.length }, null, 2));
  if (!apply) return;
  for (let index = 0; index < updates.length; index += 100) {
    await prisma.$transaction(updates.slice(index, index + 100).map((item) => prisma.employee.update({ where: { id: item.id }, data: { drivingLicenseType: item.type } })));
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
