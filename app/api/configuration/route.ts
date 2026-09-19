import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appendAudit } from "@/lib/audit";
import { CONFIGURATION_KINDS, dashboardLayout, idCardTemplate, leavePolicyDraft, payrollPolicyDraft } from "@/lib/configuration";
import { loadBrandLogo, safeLogoUrl } from "@/lib/company-branding";
import { Prisma } from "@/generated/prisma/client";
import { requireActiveSession } from "@/lib/session";

async function requireConfigurationAdmin() {
  const session = await requireActiveSession().catch(() => null);
  return session?.role === "admin" ? session : null;
}

export async function GET() {
  const session = await requireConfigurationAdmin();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const [tenant, locations, records] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { name: true, email: true, phone: true, address: true, profile: true } }),
    prisma.location.findMany({ where: { tenantId: session.tenantId }, select: { id: true, name: true, code: true, profile: true }, orderBy: { name: "asc" } }),
    prisma.configurationRecord.findMany({ where: { tenantId: session.tenantId }, include: { location: { select: { name: true } } }, orderBy: [{ kind: "asc" }, { scopeKey: "asc" }, { version: "desc" }] }),
  ]);
  return NextResponse.json({ tenant, locations, records, kinds: CONFIGURATION_KINDS });
}

export async function PUT(request: NextRequest) {
  const session = await requireConfigurationAdmin();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? "");
  if (action === "tenant-profile") {
    let data; try { data = cleanProfile(body); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid company profile." }, { status: 400 }); }
    const previous = await prisma.tenantProfile.findUnique({ where: { tenantId: session.tenantId } });
    const profile = await prisma.tenantProfile.upsert({ where: { tenantId: session.tenantId }, create: { tenantId: session.tenantId, ...data }, update: data });
    await appendAudit({ tenantId: session.tenantId, actorId: session.sub, actorRole: session.role, action: "configuration.profile.update", entity: "TenantProfile", entityId: profile.id, summary: "Updated tenant master profile", before: previous ?? undefined, after: profile });
    return NextResponse.json({ profile });
  }
  if (action === "location-profile") {
    const locationId = String(body.locationId ?? "");
    const location = await prisma.location.findFirst({ where: { id: locationId, tenantId: session.tenantId }, select: { id: true } });
    if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404 });
    let data; try { data = cleanLocationProfile(body); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid location profile." }, { status: 400 }); }
    const previous = await prisma.locationProfile.findUnique({ where: { locationId } });
    const profile = await prisma.locationProfile.upsert({ where: { locationId }, create: { locationId, ...data }, update: data });
    await appendAudit({ tenantId: session.tenantId, actorId: session.sub, actorRole: session.role, action: "configuration.location_profile.update", entity: "LocationProfile", entityId: profile.id, summary: "Updated location master profile", before: previous ?? undefined, after: profile });
    return NextResponse.json({ profile });
  }
  return NextResponse.json({ error: "Unknown profile action." }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const session = await requireConfigurationAdmin();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const kind = String(body.kind ?? "");
  if (!CONFIGURATION_KINDS.includes(kind as (typeof CONFIGURATION_KINDS)[number])) return NextResponse.json({ error: "Invalid configuration kind." }, { status: 400 });
  const locationId = body.locationId ? String(body.locationId) : null;
  if (locationId && !await prisma.location.findFirst({ where: { id: locationId, tenantId: session.tenantId }, select: { id: true } })) return NextResponse.json({ error: "Location not found." }, { status: 404 });
  const effectiveFrom = new Date(String(body.effectiveFrom ?? ""));
  const effectiveTo = body.effectiveTo ? new Date(String(body.effectiveTo)) : null;
  if (Number.isNaN(effectiveFrom.getTime()) || (effectiveTo && (Number.isNaN(effectiveTo.getTime()) || effectiveTo < effectiveFrom))) return NextResponse.json({ error: "Provide a valid effective date range." }, { status: 400 });
  if (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) return NextResponse.json({ error: "Configuration payload must be a JSON object." }, { status: 400 });
  if (kind === "dashboard" && !dashboardLayout(body.payload)) return NextResponse.json({ error: "Dashboard layouts must contain unique known widgets with enabled, order, and size values." }, { status: 400 });
  if (kind === "id_card" && !await validIdCardTemplate(body.payload)) return NextResponse.json({ error: "An ID-card template requires reachable PNG/JPEG front and back backgrounds from HTTPS or data URLs." }, { status: 400 });
  if (kind === "leave_policy" && !leavePolicyDraft(body.payload)) return NextResponse.json({ error: "Leave policy needs unique type codes, whole-day entitlements, and valid carry-forward limits." }, { status: 400 });
  if (kind === "payroll_policy" && !payrollPolicyDraft(body.payload)) return NextResponse.json({ error: "Payroll policy needs valid divisor, LOP, overtime, and statutory values." }, { status: 400 });
  if (body.action === "preview") {
    const where = { tenantId: session.tenantId, status: "active", loginOnly: false, ...(locationId ? { branch: { locationId } } : {}) };
    const affectedEmployees = await prisma.employee.count({ where });
    return NextResponse.json({ affectedEmployees, scope: locationId ? "location" : "tenant" });
  }
  const scopeKey = locationId ?? "tenant";
  const latest = await prisma.configurationRecord.aggregate({ where: { tenantId: session.tenantId, scopeKey, kind }, _max: { version: true } });
  const record = await prisma.configurationRecord.create({ data: { tenantId: session.tenantId, locationId, scopeKey, kind, version: (latest._max.version ?? 0) + 1, effectiveFrom, effectiveTo, payload: body.payload, createdBy: session.sub } });
  await appendAudit({ tenantId: session.tenantId, actorId: session.sub, actorRole: session.role, action: "configuration.create", entity: "ConfigurationRecord", entityId: record.id, summary: `Created inactive ${kind} v${record.version}`, after: record });
  return NextResponse.json({ record }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const session = await requireConfigurationAdmin();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const active = Boolean(body.active);
  const current = await prisma.configurationRecord.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!current) return NextResponse.json({ error: "Configuration record not found." }, { status: 404 });
  if (active && current.kind === "dashboard" && !dashboardLayout(current.payload)) return NextResponse.json({ error: "This dashboard layout is invalid and cannot be activated." }, { status: 400 });
  if (active && current.kind === "id_card" && !await validIdCardTemplate(current.payload)) return NextResponse.json({ error: "This ID-card template has invalid or unreachable background assets and cannot be activated." }, { status: 400 });
  if (active && current.kind === "leave_policy" && !leavePolicyDraft(current.payload)) return NextResponse.json({ error: "This leave policy draft is invalid and cannot be activated." }, { status: 400 });
  if (active && current.kind === "payroll_policy" && !payrollPolicyDraft(current.payload)) return NextResponse.json({ error: "This payroll policy draft is invalid and cannot be activated." }, { status: 400 });
  const record = await prisma.$transaction(async (tx) => {
    if (active) await tx.configurationRecord.updateMany({ where: { tenantId: session.tenantId, scopeKey: current.scopeKey, kind: current.kind, active: true, NOT: { id } }, data: { active: false } });
    return tx.configurationRecord.update({ where: { id }, data: { active, activatedBy: active ? session.sub : null, activatedAt: active ? new Date() : null } });
  });
  await appendAudit({ tenantId: session.tenantId, actorId: session.sub, actorRole: session.role, action: active ? "configuration.activate" : "configuration.deactivate", entity: "ConfigurationRecord", entityId: id, summary: `${active ? "Activated" : "Deactivated"} ${record.kind} v${record.version}${record.kind === "dashboard" ? "; dashboard layout is live" : "; no live consumer is enabled"}`, before: current, after: record });
  return NextResponse.json({ record });
}

function text(value: unknown) { return String(value ?? "").trim() || null; }
async function validIdCardTemplate(payload: unknown) { const template = idCardTemplate(payload); return Boolean(template && await loadBrandLogo(safeLogoUrl(template.frontBackgroundUrl)) && await loadBrandLogo(safeLogoUrl(template.backBackgroundUrl))); }
function logo(value: unknown) { const source = text(value); if (source && !safeLogoUrl(source)) throw new Error("Logo must be an HTTPS or PNG/JPEG data URL."); return source; }
function cleanProfile(body: Record<string, unknown>) { return { legalName: text(body.legalName), displayName: text(body.displayName), logoUrl: logo(body.logoUrl), address: text(body.address), contactName: text(body.contactName), contactEmail: text(body.contactEmail), contactPhone: text(body.contactPhone), website: text(body.website), taxId: text(body.taxId), registrationNo: text(body.registrationNo), legalDetails: text(body.legalDetails) ? { notes: text(body.legalDetails) } : Prisma.JsonNull }; }
function cleanLocationProfile(body: Record<string, unknown>) { return { legalName: text(body.legalName), displayName: text(body.displayName), address: text(body.address), contactName: text(body.contactName), contactEmail: text(body.contactEmail), contactPhone: text(body.contactPhone), logoUrl: logo(body.logoUrl), website: text(body.website), taxId: text(body.taxId), registrationNo: text(body.registrationNo), legalDetails: text(body.legalDetails) ? { notes: text(body.legalDetails) } : Prisma.JsonNull }; }
