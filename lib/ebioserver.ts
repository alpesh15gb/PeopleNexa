import * as soapNs from "soap";
// CJS/ESM interop: module.exports carries createClientAsync directly; some
// bundlers wrap it in .default, so accept both shapes.
const soap = (soapNs as { default?: typeof soapNs }).default ?? soapNs;
import { prisma } from "./prisma";
import { encryptSecret, decryptSecret } from "./encrypt";
import { parseIST } from "./ist";
import { hashPassword } from "./auth";
import crypto from "node:crypto";
import { handleDevicePunch, reprocessFailedLogs, type RawPunch } from "./iclock";
import type { Tenant } from "@/generated/prisma/client";

// ── Tenant config helpers ──────────────────────────────────────────────────

export interface EbioserverProfile {
  url: string;
  username: string;
  passwordEnc: string | null;
  enabled: boolean;
  pollIntervalMinutes: number;
  lastPulledAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  lastLogId: number; // global transaction-log cursor for GetDeviceLogsByLogId
}

const DEFAULT_PROFILE: EbioserverProfile = {
  url: "",
  username: "",
  passwordEnc: null,
  enabled: false,
  pollIntervalMinutes: 15,
  lastPulledAt: null,
  lastError: null,
  lastErrorAt: null,
  lastLogId: 0,
};

type TenantConfig = { ebioserver?: Partial<EbioserverProfile> };

export function getEbioserverConfig(tenant: Pick<Tenant, "config">): EbioserverProfile {
  const cfg = ((tenant.config ?? {}) as Record<string, unknown>) as TenantConfig;
  return { ...DEFAULT_PROFILE, ...(cfg.ebioserver ?? {}) };
}

/** Decrypt the stored password (or return null). Callers must have EBIO_ENCRYPTION_KEY set. */
export function getEbioserverPassword(profile: EbioserverProfile): string | null {
  if (!profile.passwordEnc) return null;
  return decryptSecret(profile.passwordEnc);
}

export async function saveEbioserverConfig(
  tenantId: string,
  input: { url: string; username: string; password?: string; enabled: boolean; pollIntervalMinutes: number }
): Promise<EbioserverProfile> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new Error("Tenant not found");

  const current = getEbioserverConfig(tenant);
  const next: Partial<EbioserverProfile> = {
    url: input.url.trim(),
    username: input.username.trim(),
    enabled: input.enabled,
    pollIntervalMinutes: Math.max(1, Math.min(1440, input.pollIntervalMinutes || 15)),
  };
  // Blank password means "keep the existing one"; a real value is re-encrypted.
  if (input.password && input.password.length > 0) {
    next.passwordEnc = encryptSecret(input.password);
  } else {
    next.passwordEnc = current.passwordEnc;
  }
  // A change of URL/creds invalidates the last successful pull window + cursor.
  if (next.url !== current.url || next.username !== current.username) {
    next.lastPulledAt = null;
    next.lastError = null;
    next.lastErrorAt = null;
    next.lastLogId = 0;
  }

  const config = {
    ...((tenant.config ?? {}) as Record<string, unknown>),
    ebioserver: { ...current, ...next },
  };
  await prisma.tenant.update({ where: { id: tenantId }, data: { config } });
  return { ...current, ...next };
}

export async function updateEbioserverStatus(
  tenantId: string,
  patch: Partial<Pick<EbioserverProfile, "lastPulledAt" | "lastError" | "lastErrorAt" | "lastLogId">>
) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return;
  const current = getEbioserverConfig(tenant);
  const ebioserver = { ...current, ...patch };
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { config: { ...((tenant.config ?? {}) as Record<string, unknown>), ebioserver } },
  });
}

// ── SOAP client ────────────────────────────────────────────────────────────

const CALL_TIMEOUT_MS = 20000;
const LOG_BATCH = 200; // records per GetDeviceLogsByLogId call
const BACKFILL_DAYS = 7; // date-based backfill on a fresh cursor

type SoapClient = Awaited<ReturnType<typeof soap.createClientAsync>>;

async function createClient(profile: EbioserverProfile): Promise<SoapClient> {
  const wsdlUrl = profile.url.includes("?") ? profile.url : `${profile.url}?WSDL`;
  return soap.createClientAsync(wsdlUrl, { timeout: 15000 } as Parameters<typeof soap.createClientAsync>[1]);
}

/** eBioserver authenticates with UserName/Password as method arguments. */
function authArgs(profile: EbioserverProfile): { UserName: string; Password: string } {
  return { UserName: profile.username, Password: getEbioserverPassword(profile) ?? "" };
}

/** Call a SOAP method with a hard timeout so one hung tenant cannot stall the loop. */
async function call<T>(client: SoapClient, method: string, args: Record<string, unknown>): Promise<T> {
  const fn = client[method + "Async"] as ((a: Record<string, unknown>) => Promise<[T, unknown, unknown]>) | undefined;
  if (typeof fn !== "function") throw new Error(`SOAP method ${method} not found in WSDL`);
  return Promise.race([
    fn(args).then(([result]) => result),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${method} timed out`)), CALL_TIMEOUT_MS)
    ),
  ]);
}

// ── Response parsing (real eBioserver formats) ─────────────────────────────
//
// GetDeviceListResult:   "BANGLORE,NYU7255300639,BLR;DWARKA,CGKK231461798,DW;"
//   → LocationName,SerialNumber,DeviceName  (records split by ';', fields by ',')
//
// GetDeviceLogsResult:   "2026-08-12 08:34:20,HO076,HO,HO,INOUT;\n"
//   → DateTime,EnrollNo,LocationName,DeviceName,State
//
// GetDeviceLogsByLogIdResult: "2,2026-02-18 18:00:14,HO079,HO,HO,INOUT;\n"
//   → LogId,DateTime,EnrollNo,LocationName,DeviceName,State

export interface EbioDevice {
  location: string;
  serialNumber: string;
  deviceName: string;
}

export interface EbioLogRecord {
  logId: number | null;
  punchTime: Date;
  userId: string;
  location: string;
  deviceName: string;
  state: string;
}

/** soap wraps each result in `{ <Method>Result: ... }` — pull the inner string out. */
function resultString(x: unknown): string {
  if (x && typeof x === "object" && !Array.isArray(x)) {
    const obj = x as Record<string, unknown>;
    const key = Object.keys(obj).find((k) => /Result$/i.test(k));
    if (key && typeof obj[key] === "string") return obj[key];
  }
  if (typeof x === "string") return x;
  return "";
}

function splitRecords(result: string): string[] {
  // Records are ';'-terminated; tolerate \r\n and trailing junk.
  return result
    .split(";")
    .map((r) => r.replace(/[\r\n]+$/, "").trim())
    .filter(Boolean);
}

export function parseDeviceListResult(result: string): EbioDevice[] {
  const devices: EbioDevice[] = [];
  for (const rec of splitRecords(result)) {
    const [location, serialNumber, deviceName] = rec.split(",").map((s) => s.trim());
    if (!serialNumber) continue;
    devices.push({ location: location ?? "", serialNumber, deviceName: deviceName ?? serialNumber });
  }
  return devices;
}

function mappingCode(value: string, fallback: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20) || fallback;
}

async function availableLocationCode(tenantId: string, name: string): Promise<string> {
  const base = mappingCode(name, "LOCATION");
  let code = base;
  for (let suffix = 2; ; suffix++) {
    const clash = await prisma.location.findFirst({ where: { tenantId, code }, select: { id: true } });
    if (!clash) return code;
    code = `${base.slice(0, 16)}${suffix}`.slice(0, 20);
  }
}

async function availableBranchCode(tenantId: string, locationCode: string, name: string): Promise<string> {
  const base = mappingCode(`${locationCode}-${name}`, "BRANCH");
  let code = base;
  for (let suffix = 2; ; suffix++) {
    const clash = await prisma.branch.findFirst({ where: { tenantId, code }, select: { id: true } });
    if (!clash) return code;
    code = `${base.slice(0, 16)}${suffix}`.slice(0, 20);
  }
}

/**
 * Map eBio topology into PeopleNexa without touching employees, punches, or
 * the incremental pull cursor. eBio's device/group code (e.g. MNP) becomes a
 * Location; its worksite LocationName becomes a Branch beneath that group.
 */
export async function syncEbioWorksites(tenantId: string, profile: EbioserverProfile): Promise<{ locations: number; branches: number; devices: number; skipped: number; cleanedBranches: number; cleanedLocations: number }> {
  const client = await createClient(profile);
  const deviceResult = await call<unknown>(client, "GetDeviceList", { ...authArgs(profile), Location: "" });
  const discovered = parseDeviceListResult(resultString(deviceResult));
  const locationByName = new Map<string, { id: string; code: string }>();
  const branchByWorksite = new Map<string, string>();
  const summary = { locations: 0, branches: 0, devices: 0, skipped: 0, cleanedBranches: 0, cleanedLocations: 0 };
  const legacyBranchIds = new Set<string>();

  for (const item of discovered) {
    const worksiteName = item.location.trim();
    const locationName = item.deviceName.trim();
    if (!locationName || !worksiteName) { summary.skipped++; continue; }
    const locationKey = locationName.toLowerCase();
    let location = locationByName.get(locationKey);
    if (!location) {
      const existing = await prisma.location.findFirst({ where: { tenantId, OR: [{ name: { equals: locationName, mode: "insensitive" } }, { code: { equals: locationName, mode: "insensitive" } }] }, select: { id: true, code: true } });
      if (existing) location = existing;
      else {
        const code = await availableLocationCode(tenantId, locationName);
        const created = await prisma.location.create({ data: { tenantId, name: locationName, code }, select: { id: true, code: true } });
        location = created;
        summary.locations++;
      }
      locationByName.set(locationKey, location);
    }
    const branchKey = `${location.id}|${worksiteName.toLowerCase()}`;
    let branchId = branchByWorksite.get(branchKey);
    if (!branchId) {
      const existing = await prisma.branch.findFirst({ where: { tenantId, locationId: location.id, name: { equals: worksiteName, mode: "insensitive" } }, select: { id: true } });
      if (existing) branchId = existing.id;
      else {
        const code = await availableBranchCode(tenantId, location.code, worksiteName);
        branchId = (await prisma.branch.create({ data: { tenantId, locationId: location.id, name: worksiteName, code }, select: { id: true } })).id;
        summary.branches++;
      }
      branchByWorksite.set(branchKey, branchId);
    }
    const device = await prisma.device.findUnique({ where: { serialNumber: item.serialNumber } });
    if (device && device.tenantId !== tenantId) { summary.skipped++; continue; }
    if (device) {
      if (device.branchId && device.branchId !== branchId) legacyBranchIds.add(device.branchId);
      await prisma.device.update({ where: { id: device.id }, data: { ebioLocation: worksiteName, branchId } });
    } else {
      await prisma.device.create({ data: { tenantId, name: `${locationName} (${worksiteName})`, serialNumber: item.serialNumber, type: "biometric", protocol: "json", ebioLocation: worksiteName, branchId, config: { ebioserver: true, location: worksiteName } } });
    }
    summary.devices++;
  }
  // Remove only the empty mapping rows created by the previous reversed sync.
  // Existing user-managed branches, employees, attendance, and the generic MNP
  // branch are retained because they fail one of these strict emptiness checks.
  const legacyLocationIds = new Set<string>();
  for (const id of legacyBranchIds) {
    const branch = await prisma.branch.findFirst({ where: { id, tenantId }, include: { _count: { select: { employees: true, attendance: true, devices: true } } } });
    if (!branch || branch._count.employees || branch._count.attendance || branch._count.devices) continue;
    if (branch.locationId) legacyLocationIds.add(branch.locationId);
    await prisma.branch.delete({ where: { id } });
    summary.cleanedBranches++;
  }
  for (const id of legacyLocationIds) {
    const location = await prisma.location.findFirst({ where: { id, tenantId }, include: { _count: { select: { branches: true, managers: true } } } });
    if (!location || location._count.branches || location._count.managers) continue;
    await prisma.location.delete({ where: { id } });
    summary.cleanedLocations++;
  }
  return summary;
}

export function parseLogRecords(result: string): EbioLogRecord[] {
  const records: EbioLogRecord[] = [];
  for (const rec of splitRecords(result)) {
    const parts = rec.split(",").map((s) => s.trim());
    // With log id: [logId, dt, enroll, loc, dev, state]; without: [dt, enroll, loc, dev, state].
    const hasId = parts.length === 6 && /^\d+$/.test(parts[0]);
    const [dt, enroll, location, deviceName, state] = hasId ? parts.slice(1) : parts;
    if (!dt || !enroll) continue;
    // Skip device operation/enrollment records, not punches.
    if (/^OPLOG|^USER PIN=|^NEW USER/i.test(enroll)) continue;
    const punchTime = parseIST(dt);
    if (!punchTime || punchTime.getUTCFullYear() < 2000) continue; // BOGUS_YEAR guard
    records.push({
      logId: hasId ? parseInt(parts[0], 10) : null,
      punchTime,
      userId: enroll,
      location: location ?? "",
      deviceName: deviceName ?? "",
      state: state ?? "",
    });
  }
  return records;
}

// ── Employee master import ─────────────────────────────────────────────────
//
// GetEmployeeCodesResult: "HO009,HO115,..." (comma-separated codes)
// GetEmployeeDetailsResult: "EmployeeName=N Subba Rao,EmployeeLocation=HO,"
//   "EmployeeRole=Normal User,EmployeeVerificationType=0,..." (Key=Value pairs)

export function parseEmployeeDetails(result: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of result.split(",")) {
    const i = pair.indexOf("=");
    if (i < 0) continue;
    const k = pair.slice(0, i).trim();
    const v = pair.slice(i + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

function splitName(name: string): [string, string] {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return ["Imported", "Employee"];
  if (parts.length === 1) return [parts[0], ""];
  return [parts.slice(0, -1).join(" "), parts[parts.length - 1]];
}

/**
 * Pull the device employee-code master and create matching employees in this
 * tenant. This intentionally does not call GetEmployeeDetails once per code:
 * a 1,700-person device roster would otherwise make 1,700 serial SOAP calls
 * and exceed the reverse-proxy timeout. Imported identities are inactive until
 * an admin provisions their real profile and login details.
 */
export async function importEmployeesFromEbioserver(
  tenantId: string,
  profile: EbioserverProfile
): Promise<{ ok: boolean; total: number; created: number; activated: number; skipped: number; failed: number; reprocessed: number; message?: string }> {
  const result = { ok: false, total: 0, created: 0, activated: 0, skipped: 0, failed: 0, reprocessed: 0, message: "" as string | undefined };
  try {
    const client = await createClient(profile);
    const codesResult = await call<unknown>(client, "GetEmployeeCodes", { ...authArgs(profile), EmployeeLocation: "" });
    const codes = [...new Set(String(resultString(codesResult))
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean))];
    result.total = codes.length;
    const existing = await prisma.employee.findMany({
      where: { tenantId, OR: [{ deviceCode: { in: codes } }, { employeeNumber: { in: codes } }] },
      select: { deviceCode: true, employeeNumber: true },
    });
    const known = new Set(existing.flatMap((employee) => [employee.deviceCode, employee.employeeNumber]).filter(Boolean));
    const newCodes = codes.filter((code) => !known.has(code));
    result.skipped = codes.length - newCodes.length;
    // eBio is the source of the active workforce roster for this workspace.
    // Re-importing also activates identities created by an earlier partial import.
    const activated = await prisma.employee.updateMany({
      where: { tenantId, deviceCode: { in: codes }, status: "inactive", loginOnly: false },
      data: { status: "active" },
    });
    result.activated = activated.count;
    // All imported accounts are inactive and have no usable shared password.
    // One opaque hash is sufficient until each account is provisioned.
    const inactivePassword = await hashPassword(crypto.randomBytes(32).toString("hex"));
    for (let offset = 0; offset < newCodes.length; offset += 250) {
      const batch = newCodes.slice(offset, offset + 250);
      const created = await prisma.employee.createMany({
        data: batch.map((code) => ({
          tenantId,
          employeeNumber: code,
          deviceCode: code,
          firstName: code,
          lastName: "",
          email: `device-${Buffer.from(code).toString("hex")}@device.local`,
          password: inactivePassword,
          role: "employee",
          status: "active",
        })),
        skipDuplicates: true,
      });
      result.created += created.count;
      result.failed += batch.length - created.count;
    }
    result.ok = true;
    // Now that employees exist, reconcile punches that were flagged earlier
    // because their code had no match at ingest time.
    // A first-time employee import can unlock thousands of recently received
    // eBio logs, so recover a full practical workday backlog in one action.
    result.reprocessed = (await reprocessFailedLogs(tenantId, 5000)).accepted;
    return result;
  } catch (err) {
    result.message = err instanceof Error ? err.message : "Import failed";
    return result;
  }
}

/**
 * Backfill N days of history by date (GetDeviceLogs per day, all devices).
 * The incremental cursor is left untouched — future pulls continue from the
 * head. Idempotent: already-ingested punches are deduped by handleDevicePunch.
 */
export async function backfillDays(
  tenantId: string,
  profile: EbioserverProfile,
  days: number,
  onProgress?: (day: number, date: string, records: number, ingested: number) => void
): Promise<{ ok: boolean; days: number; records: number; ingested: number; devices: number; skipped: number; message?: string }> {
  const summary = { ok: false, days: 0, records: 0, ingested: 0, devices: 0, skipped: 0, message: "" as string | undefined };
  const touched = new Set<string>();
  try {
    const client = await createClient(profile);

    // Discover + register devices (same as pullTenant) and map by device name.
    const deviceResult = await call<unknown>(client, "GetDeviceList", { ...authArgs(profile), Location: "" });
    const deviceByDeviceName = new Map<string, Awaited<ReturnType<typeof prisma.device.create>>>();
    for (const d of parseDeviceListResult(resultString(deviceResult))) {
      let device = await prisma.device.findUnique({ where: { serialNumber: d.serialNumber } });
      if (!device) {
        device = await prisma.device.create({
          data: {
            tenantId,
            name: `${d.deviceName} (${d.location})`.trim(),
            serialNumber: d.serialNumber,
            type: "biometric",
            protocol: "json",
            ebioLocation: d.location,
            config: { ebioserver: true, location: d.location },
          },
        });
      } else if (device.tenantId !== tenantId) {
        continue;
      }
      deviceByDeviceName.set(d.deviceName, device);
      summary.devices++;
    }
    if (summary.devices === 0) {
      summary.message = "No devices found on this eBioserver.";
      return summary;
    }

    for (let d = days - 1; d >= 0; d--) {
      const day = new Date(Date.now() - d * 86400000);
      const dateStr = day.toISOString().slice(0, 10);
      const dayResult = await call<unknown>(client, "GetDeviceLogs", {
        ...authArgs(profile),
        Location: "",
        LogDate: dateStr,
      });
      const records = parseLogRecords(resultString(dayResult));
      let dayIngested = 0;
      for (const rec of records) {
        let device = deviceByDeviceName.get(rec.deviceName);
        if (!device && deviceByDeviceName.size === 1) device = deviceByDeviceName.values().next().value;
        if (!device) {
          console.warn(`[eBioserver] Skipping punch: deviceName "${rec.deviceName}" did not match any registered device (user=${rec.userId})`);
          summary.skipped++;
          continue;
        }
        summary.records++;
        const raw: RawPunch = {
          userId: rec.userId,
          punchTime: rec.punchTime,
          verifyMode: "0",
          inOutMode: rec.state === "OUT" ? "1" : rec.state === "IN" ? "5" : "0",
          rawLine: rec.userId,
        };
        let res;
        try {
          res = await handleDevicePunch(device, raw);
        } catch (err) {
          console.warn(`[eBioserver] Skipping punch (user=${rec.userId}):`, err instanceof Error ? err.message : err);
          summary.skipped++;
          continue;
        }
        if (res.action === "in" || res.action === "out") {
          summary.ingested++;
          dayIngested++;
          touched.add(device.id);
        }
      }
      summary.days++;
      onProgress?.(d, dateStr, records.length, dayIngested);
    }

    await touchDevices(touched);
    summary.ok = true;
    return summary;
  } catch (err) {
    summary.message = err instanceof Error ? err.message : "Backfill failed";
    return summary;
  }
}

// ── Operations ────────────────────────────────────────────────────────────

/**
 * Mark devices as seen after a pull/backfill actually ingested their punches.
 * eBioserver-fed machines never hit /iclock directly, so without this their
 * health cards sit at "Never"/STALE forever despite healthy data flow.
 */
async function touchDevices(ids: Set<string>): Promise<void> {
  if (ids.size === 0) return;
  try {
    await prisma.device.updateMany({ where: { id: { in: [...ids] } }, data: { lastSeenAt: new Date() } });
  } catch (err) {
    console.warn("[eBioserver] touchDevices failed:", err instanceof Error ? err.message : err);
  }
}

export async function testConnection(profile: EbioserverProfile): Promise<{ ok: boolean; message: string }> {
  if (!profile.url) return { ok: false, message: "Enter the eBioserver Web Service URL first." };
  if (!profile.username) return { ok: false, message: "Enter the Web Service username." };
  try {
    const client = await createClient(profile);
    try {
      await call(client, "IseSSLebioServer", {});
      return { ok: true, message: "Connected — eBioserver responded." };
    } catch {
      // Some deployments only expose the data methods; GetDeviceList is a good probe.
      const devices = await call<unknown>(client, "GetDeviceList", { ...authArgs(profile), Location: "" });
      return { ok: true, message: `Connected — ${parseDeviceListResult(resultString(devices)).length} devices found.` };
    }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Connection failed" };
  }
}

/**
 * Pull punches for one tenant from its own eBioserver, feeding the shared
 * punch pipeline. Incremental via the global transaction-log cursor
 * (GetDeviceLogsByLogId); a fresh cursor backfills a bounded window so the
 * first run stays fast and later runs only fetch what's new.
 */
export async function pullTenant(
  tenantId: string,
  profile: EbioserverProfile
): Promise<{ ok: boolean; pulled: number; ingested: number; devices: number; skipped: number; message?: string }> {
  const summary = { ok: false, pulled: 0, ingested: 0, devices: 0, skipped: 0, message: "" as string | undefined };
  const touched = new Set<string>();
  try {
    const client = await createClient(profile);

    // 1. Discover devices: LocationName,SerialNumber,DeviceName.
    const deviceResult = await call<unknown>(client, "GetDeviceList", { ...authArgs(profile), Location: "" });
    const discovered = parseDeviceListResult(resultString(deviceResult));

    // Auto-register into this tenant; serial is globally unique so a device can
    // never be captured by a different tenant. Map deviceName → our Device row.
    const deviceBySerial = new Map<string, Awaited<ReturnType<typeof prisma.device.create>>>();
    const deviceByDeviceName = new Map<string, Awaited<ReturnType<typeof prisma.device.create>>>();
    for (const d of discovered) {
      let device = await prisma.device.findUnique({ where: { serialNumber: d.serialNumber } });
      if (!device) {
        device = await prisma.device.create({
          data: {
            tenantId,
            name: `${d.deviceName} (${d.location})`.trim(),
            serialNumber: d.serialNumber,
            type: "biometric",
            protocol: "json",
            ebioLocation: d.location,
            config: { ebioserver: true, location: d.location },
          },
        });
      } else if (device.tenantId !== tenantId) {
        continue; // serial belongs to another tenant — never cross the boundary
      }
      deviceBySerial.set(d.serialNumber, device);
      deviceByDeviceName.set(d.deviceName, device);
      summary.devices++;
    }
    if (summary.devices === 0) {
      summary.message = "No devices found on this eBioserver.";
      return summary;
    }

    // 2. Pull. A fresh cursor bootstraps: probe the head of the transaction
    // log (so we don't walk another company's full history), then backfill the
    // last few days by date so reports populate immediately. Established
    // cursors just walk forward with GetDeviceLogsByLogId.
    let cursor = profile.lastLogId || 0;

    if (cursor === 0) {
      cursor = await probeLogHead(client, profile);
      await updateEbioserverStatus(tenantId, { lastLogId: cursor });
      // Backfill recent days (all devices at once via empty Location).
      for (let d = 0; d < BACKFILL_DAYS; d++) {
        const day = new Date(Date.now() - d * 24 * 3600 * 1000);
        const dateStr = day.toISOString().slice(0, 10);
        const dayResult = await call<unknown>(client, "GetDeviceLogs", {
          ...authArgs(profile),
          Location: "",
          LogDate: dateStr,
        });
        const dayRecords = parseLogRecords(resultString(dayResult));
        for (const rec of dayRecords) {
          try {
            await ingestRecord(rec, deviceByDeviceName);
          } catch (err) {
            console.warn(`[eBioserver] Skipping punch (user=${rec.userId} logId=${rec.logId ?? "?"}):`, err instanceof Error ? err.message : err);
            summary.skipped++;
            continue;
          }
        }
      }
    } else {
      while (true) {
        const batchResult = await call<unknown>(client, "GetDeviceLogsByLogId", {
          ...authArgs(profile),
          Location: "",
          LogId: String(cursor),
          LogCount: String(LOG_BATCH),
        });
        const records = parseLogRecords(resultString(batchResult));
        if (records.length === 0) break;

        // Cursor tracks the max successfully ingested logId (never cursor+len,
        // which would skip over failures or over-count short batches).
        let batchMax = cursor;
        for (const rec of records) {
          try {
            await ingestRecord(rec, deviceByDeviceName);
          } catch (err) {
            console.warn(`[eBioserver] Skipping punch (user=${rec.userId} logId=${rec.logId ?? "?"}):`, err instanceof Error ? err.message : err);
            summary.skipped++;
            continue;
          }
          if (rec.logId !== null && rec.logId > batchMax) batchMax = rec.logId;
        }

        // Persist the cursor so an interrupted run resumes rather than re-pulls.
        if (batchMax > cursor) {
          cursor = batchMax;
          await updateEbioserverStatus(tenantId, { lastLogId: cursor });
        } else {
          // No forward progress (e.g. a poison record at the head keeps
          // failing) — stop rather than re-pulling the same batch forever.
          // The next scheduled pull retries from this cursor.
          break;
        }
        // A short batch means the history is exhausted — done.
        if (records.length < LOG_BATCH) break;
      }
    }

    await touchDevices(touched);
    summary.ok = true;
    return summary;

    /** Ingest one parsed record; returns true when it produced a punch. */
    async function ingestRecord(
      rec: EbioLogRecord,
      deviceByName: Map<string, Awaited<ReturnType<typeof prisma.device.create>>>
    ): Promise<boolean> {
      // Attribute the punch to the device this eBioserver reports by its
      // device name; with a single device, fall back to it directly.
      let device = deviceByName.get(rec.deviceName);
      if (!device && deviceByName.size === 1) device = deviceByName.values().next().value;
      if (!device) {
        console.warn(`[eBioserver] Skipping punch: deviceName "${rec.deviceName}" did not match any registered device (user=${rec.userId} logId=${rec.logId ?? "?"})`);
        summary.skipped++;
        return false;
      }
      summary.pulled++;
      const raw: RawPunch = {
        userId: rec.userId,
        punchTime: rec.punchTime,
        verifyMode: "0",
        inOutMode: rec.state === "OUT" ? "1" : rec.state === "IN" ? "5" : "0",
        rawLine: rec.logId !== null ? `${rec.logId},${rec.userId},${rec.punchTime.toISOString()}` : rec.userId,
      };
      const res = await handleDevicePunch(device, raw);
      if (res.action === "in" || res.action === "out") {
        summary.ingested++;
        touched.add(device.id);
        return true;
      }
      return false;
    }
  } catch (err) {
    summary.message = err instanceof Error ? err.message : "Pull failed";
    return summary;
  }
}

/**
 * Find the exact head (max LogId) of the global transaction log so the cursor
 * starts AT the head — new records (head+1) are then picked up incrementally.
 * Exponential probe to bracket the head, then binary search to pin it down.
 */
async function probeLogHead(client: SoapClient, profile: EbioserverProfile): Promise<number> {
  const hasRecords = async (logId: number): Promise<boolean> => {
    const probe = await call<unknown>(client, "GetDeviceLogsByLogId", {
      ...authArgs(profile),
      Location: "",
      LogId: String(logId),
      LogCount: "1",
    });
    return parseLogRecords(resultString(probe)).length > 0;
  };

  // Exponential probe: find a LogId that returns nothing.
  let lo = 1024;
  while (await hasRecords(lo)) lo *= 2;

  // Binary search in (lo/2, lo] for the last LogId that still has records.
  let low = lo / 2;
  let high = lo;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (await hasRecords(mid)) low = mid;
    else high = mid;
  }
  return low; // exact head
}

/** Map a high-level action to an eBioserver DeviceCommand_* call. */
export async function runDeviceCommand(
  profile: EbioserverProfile,
  deviceSerial: string,
  action: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const client = await createClient(profile);
    const args = { ...authArgs(profile), DeviceSerialNumber: deviceSerial };
    switch (action) {
      case "reboot":
        await call(client, "DeviceCommand_Reboot", args);
        break;
      case "clear_logs":
        await call(client, "DeviceCommand_ClearLogs", args);
        break;
      case "sync":
        await call(client, "DeviceCommand_GetDeviceLogs", args);
        break;
      default:
        return { ok: false, message: `Command "${action}" is not available in eBioserver mode.` };
    }
    return { ok: true, message: `${action} command sent to device ${deviceSerial}.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Command failed" };
  }
}
