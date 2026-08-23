import { randomBytes } from "node:crypto";
import * as soapNs from "soap";
const soap = (soapNs as { default?: typeof soapNs }).default ?? soapNs;
import { prisma } from "./prisma";
import { encryptSecret, decryptSecret } from "./encrypt";
import { parseIST } from "./ist";
import { toDateKey } from "./dates";
import { hashPassword } from "./auth";
import { handleDevicePunch, reprocessFailedLogs, type RawPunch } from "./iclock";
import { validateOutboundHttpUrl } from "./outbound-url";
import type { Tenant } from "@/generated/prisma/client";

export interface EbioserverProfile {
  url: string;
  username: string;
  passwordEnc: string | null;
  enabled: boolean;
  pollIntervalMinutes: number;
  lastPulledAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  lastLogId: number;
}

const DEFAULT_PROFILE: EbioserverProfile = {
  url: "", username: "", passwordEnc: null, enabled: false, pollIntervalMinutes: 15,
  lastPulledAt: null, lastError: null, lastErrorAt: null, lastLogId: 0,
};
type TenantConfig = { ebioserver?: Partial<EbioserverProfile> };

export function getEbioserverConfig(tenant: Pick<Tenant, "config">): EbioserverProfile {
  const cfg = ((tenant.config ?? {}) as Record<string, unknown>) as TenantConfig;
  return { ...DEFAULT_PROFILE, ...(cfg.ebioserver ?? {}) };
}

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
    url: input.url.trim(), username: input.username.trim(), enabled: input.enabled,
    pollIntervalMinutes: Math.max(1, Math.min(1440, input.pollIntervalMinutes || 15)),
    passwordEnc: input.password ? encryptSecret(input.password) : current.passwordEnc,
  };
  if (next.url !== current.url || next.username !== current.username || (input.password && input.password.length > 0)) {
    next.lastPulledAt = null; next.lastError = null; next.lastErrorAt = null; next.lastLogId = 0;
  }
  const profile = { ...current, ...next };
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { config: { ...((tenant.config ?? {}) as Record<string, unknown>), ebioserver: profile } },
  });
  return profile;
}

export async function updateEbioserverStatus(
  tenantId: string,
  patch: Partial<Pick<EbioserverProfile, "lastPulledAt" | "lastError" | "lastErrorAt" | "lastLogId">>
) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return;
  const ebioserver = { ...getEbioserverConfig(tenant), ...patch };
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { config: { ...((tenant.config ?? {}) as Record<string, unknown>), ebioserver } },
  });
}

const CALL_TIMEOUT_MS = 20_000;
const LOG_BATCH = 200;
const BACKFILL_DAYS = 7;
type SoapClient = Awaited<ReturnType<typeof soap.createClientAsync>>;

async function createClient(profile: EbioserverProfile): Promise<SoapClient> {
  if (!profile.url || !profile.username || !getEbioserverPassword(profile)) throw new Error("eBioserver credentials are incomplete.");
  const safeUrl = await validateOutboundHttpUrl(profile.url);
  const wsdlUrl = safeUrl.includes("?") ? safeUrl : `${safeUrl}?WSDL`;
  return soap.createClientAsync(wsdlUrl, { timeout: 15_000 } as Parameters<typeof soap.createClientAsync>[1]);
}

function authArgs(profile: EbioserverProfile): { UserName: string; Password: string } {
  return { UserName: profile.username, Password: getEbioserverPassword(profile) ?? "" };
}

async function call<T>(client: SoapClient, method: string, args: Record<string, unknown>): Promise<T> {
  const fn = client[method + "Async"] as ((a: Record<string, unknown>) => Promise<[T, unknown, unknown]>) | undefined;
  if (typeof fn !== "function") throw new Error(`SOAP method ${method} not found in WSDL`);
  return Promise.race([
    fn(args).then(([result]) => result),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${method} timed out`)), CALL_TIMEOUT_MS)),
  ]);
}

export interface EbioDevice { location: string; serialNumber: string; deviceName: string }
export interface EbioLogRecord {
  logId: number | null; punchTime: Date; userId: string; location: string; deviceName: string; state: string;
}

function resultString(x: unknown): string {
  if (x && typeof x === "object" && !Array.isArray(x)) {
    const obj = x as Record<string, unknown>;
    const key = Object.keys(obj).find((k) => /Result$/i.test(k));
    if (key && typeof obj[key] === "string") return obj[key] as string;
  }
  return typeof x === "string" ? x : "";
}

function splitRecords(result: string): string[] {
  return result.split(";").map((r) => r.replace(/[\r\n]+$/, "").trim()).filter(Boolean);
}

export function parseDeviceListResult(result: string): EbioDevice[] {
  const devices: EbioDevice[] = [];
  for (const rec of splitRecords(result)) {
    const [location, serialNumber, deviceName] = rec.split(",").map((s) => s.trim());
    if (serialNumber) devices.push({ location: location ?? "", serialNumber, deviceName: deviceName ?? serialNumber });
  }
  return devices;
}

export function parseLogRecords(result: string): EbioLogRecord[] {
  const records: EbioLogRecord[] = [];
  for (const rec of splitRecords(result)) {
    const parts = rec.split(",").map((s) => s.trim());
    const hasId = parts.length >= 6 && /^\d+$/.test(parts[0]);
    const payload = hasId ? parts.slice(1) : parts;
    const [dt, enroll, location = "", deviceName = "", state = ""] = payload;
    if (!dt || !enroll || /^OPLOG|^USER PIN=|^NEW USER/i.test(enroll)) continue;
    const punchTime = parseIST(dt);
    if (!punchTime || punchTime.getUTCFullYear() < 2000) continue;
    records.push({ logId: hasId ? Number(parts[0]) : null, punchTime, userId: enroll, location, deviceName, state });
  }
  return records;
}

export function parseEmployeeDetails(result: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of result.split(",")) {
    const i = pair.indexOf("=");
    if (i < 0) continue;
    const key = pair.slice(0, i).trim();
    if (key) out[key] = pair.slice(i + 1).trim();
  }
  return out;
}

function splitName(name: string): [string, string] {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return ["Imported", "Employee"];
  if (parts.length === 1) return [parts[0], ""];
  return [parts.slice(0, -1).join(" "), parts[parts.length - 1]];
}

function deviceEmail(code: string): string {
  const safe = code.toLowerCase().replace(/[^a-z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 50) || randomBytes(6).toString("hex");
  return `device-${safe}@device.local`;
}

export async function importEmployeesFromEbioserver(
  tenantId: string,
  profile: EbioserverProfile
): Promise<{ ok: boolean; total: number; created: number; skipped: number; failed: number; reprocessed: number; message?: string }> {
  const result = { ok: false, total: 0, created: 0, skipped: 0, failed: 0, reprocessed: 0, message: "" as string | undefined };
  try {
    const [tenant, currentCount, client] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { seats: true } }),
      prisma.employee.count({ where: { tenantId } }),
      createClient(profile),
    ]);
    if (!tenant) throw new Error("Workspace not found.");

    const codesResult = await call<unknown>(client, "GetEmployeeCodes", { ...authArgs(profile), EmployeeLocation: "" });
    const codes = resultString(codesResult).split(",").map((c) => c.trim()).filter(Boolean);
    result.total = codes.length;
    let seatsUsed = currentCount;

    for (const code of codes) {
      const existing = await prisma.employee.findFirst({ where: { tenantId, employeeNumber: code }, select: { id: true } });
      if (existing) { result.skipped++; continue; }
      if (seatsUsed >= tenant.seats) { result.failed++; result.message = `Seat limit reached (${tenant.seats}). Upgrade before importing the remaining employees.`; continue; }

      try {
        const detail = await call<unknown>(client, "GetEmployeeDetails", { ...authArgs(profile), EmployeeCode: code });
        const fields = parseEmployeeDetails(resultString(detail));
        const [firstName, lastName] = splitName(fields.EmployeeName || code);
        const location = fields.EmployeeLocation || "";
        let branchId: string | null = null;
        if (location) {
          const branchCode = location.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20) || "UNKNOWN";
          let branch = await prisma.branch.findFirst({ where: { tenantId, code: branchCode } });
          if (!branch) branch = await prisma.branch.create({ data: { tenantId, name: location, code: branchCode } });
          branchId = branch.id;
        }

        // Biometric master import is identity provisioning, not password
        // provisioning. Use an unguessable random password; an admin must set a
        // real credential later if this employee should log into PeopleNexa.
        const lockedPassword = randomBytes(32).toString("base64url");
        await prisma.employee.create({
          data: {
            tenantId, employeeNumber: code, firstName, lastName,
            email: deviceEmail(code), password: await hashPassword(lockedPassword),
            role: "employee", position: fields.EmployeeRole || null, branchId,
          },
        });
        seatsUsed++;
        result.created++;
      } catch (err) {
        console.error(`[eBio] Employee import failed for ${code}:`, err instanceof Error ? err.message : err);
        result.failed++;
      }
    }
    result.ok = result.created + result.skipped > 0 || codes.length === 0;
    result.reprocessed = await reprocessFailedLogs(tenantId);
    return result;
  } catch (err) {
    result.message = err instanceof Error ? err.message : "Import failed";
    return result;
  }
}

type DeviceRow = Awaited<ReturnType<typeof prisma.device.create>>;

async function discoverDevices(tenantId: string, client: SoapClient, profile: EbioserverProfile) {
  const deviceResult = await call<unknown>(client, "GetDeviceList", { ...authArgs(profile), Location: "" });
  const deviceByName = new Map<string, DeviceRow>();
  let count = 0;
  for (const d of parseDeviceListResult(resultString(deviceResult))) {
    let device = await prisma.device.findUnique({ where: { serialNumber: d.serialNumber } });
    if (!device) {
      device = await prisma.device.create({
        data: { tenantId, name: `${d.deviceName} (${d.location})`.trim(), serialNumber: d.serialNumber, type: "biometric", protocol: "json", config: { ebioserver: true, location: d.location } },
      });
    } else if (device.tenantId !== tenantId) {
      continue;
    }
    deviceByName.set(d.deviceName, device);
    count++;
  }
  return { deviceByName, count };
}

async function ingestEbioRecord(rec: EbioLogRecord, deviceByName: Map<string, DeviceRow>) {
  let device = deviceByName.get(rec.deviceName);
  if (!device && deviceByName.size === 1) device = deviceByName.values().next().value;
  if (!device) return { accepted: false, newPunch: false };
  const raw: RawPunch = {
    userId: rec.userId,
    punchTime: rec.punchTime,
    verifyMode: "0",
    inOutMode: /^OUT$/i.test(rec.state) ? "1" : /^IN$/i.test(rec.state) ? "5" : "0",
    rawLine: rec.logId !== null ? `${rec.logId},${rec.userId},${rec.punchTime.toISOString()}` : rec.userId,
  };
  return handleDevicePunch(device, raw);
}

export async function backfillDays(
  tenantId: string,
  profile: EbioserverProfile,
  days: number,
  onProgress?: (day: number, date: string, records: number, ingested: number) => void
): Promise<{ ok: boolean; days: number; records: number; ingested: number; devices: number; message?: string }> {
  const summary = { ok: false, days: 0, records: 0, ingested: 0, devices: 0, message: "" as string | undefined };
  try {
    const client = await createClient(profile);
    const discovered = await discoverDevices(tenantId, client, profile);
    summary.devices = discovered.count;
    if (!summary.devices) return { ...summary, message: "No devices found on this eBioserver." };

    const boundedDays = Math.max(1, Math.min(366, Math.floor(days)));
    for (let offset = boundedDays - 1; offset >= 0; offset--) {
      const day = new Date(Date.now() - offset * 86400000);
      const dateStr = toDateKey(day);
      const rawResult = await call<unknown>(client, "GetDeviceLogs", { ...authArgs(profile), Location: "", LogDate: dateStr });
      const records = parseLogRecords(resultString(rawResult));
      let dayIngested = 0;
      for (const rec of records) {
        summary.records++;
        const res = await ingestEbioRecord(rec, discovered.deviceByName);
        if (res.newPunch) { summary.ingested++; dayIngested++; }
      }
      summary.days++;
      onProgress?.(offset, dateStr, records.length, dayIngested);
    }
    summary.ok = true;
    return summary;
  } catch (err) {
    summary.message = err instanceof Error ? err.message : "Backfill failed";
    return summary;
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
      const devices = await call<unknown>(client, "GetDeviceList", { ...authArgs(profile), Location: "" });
      return { ok: true, message: `Connected — ${parseDeviceListResult(resultString(devices)).length} devices found.` };
    }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Connection failed" };
  }
}

export async function pullTenant(
  tenantId: string,
  profile: EbioserverProfile
): Promise<{ ok: boolean; pulled: number; ingested: number; devices: number; message?: string }> {
  const summary = { ok: false, pulled: 0, ingested: 0, devices: 0, message: "" as string | undefined };
  try {
    const client = await createClient(profile);
    const discovered = await discoverDevices(tenantId, client, profile);
    summary.devices = discovered.count;
    if (!summary.devices) return { ...summary, message: "No devices found on this eBioserver." };

    let cursor = Math.max(0, profile.lastLogId || 0);
    if (cursor === 0) {
      cursor = await probeLogHead(client, profile);
      await updateEbioserverStatus(tenantId, { lastLogId: cursor });
      for (let offset = 0; offset < BACKFILL_DAYS; offset++) {
        const dateStr = toDateKey(new Date(Date.now() - offset * 86400000));
        const rawResult = await call<unknown>(client, "GetDeviceLogs", { ...authArgs(profile), Location: "", LogDate: dateStr });
        for (const rec of parseLogRecords(resultString(rawResult))) {
          summary.pulled++;
          const res = await ingestEbioRecord(rec, discovered.deviceByName);
          if (res.newPunch) summary.ingested++;
        }
      }
    } else {
      for (let pages = 0; pages < 1000; pages++) {
        const batchResult = await call<unknown>(client, "GetDeviceLogsByLogId", {
          ...authArgs(profile), Location: "", LogId: String(cursor), LogCount: String(LOG_BATCH),
        });
        const records = parseLogRecords(resultString(batchResult));
        if (!records.length) break;
        let maxId = cursor;
        for (const rec of records) {
          summary.pulled++;
          if (rec.logId !== null) maxId = Math.max(maxId, rec.logId);
          const res = await ingestEbioRecord(rec, discovered.deviceByName);
          if (res.newPunch) summary.ingested++;
        }
        if (maxId <= cursor) {
          throw new Error("eBioserver cursor did not advance; stopping to prevent an infinite pull loop.");
        }
        cursor = maxId;
        await updateEbioserverStatus(tenantId, { lastLogId: cursor });
        if (records.length < LOG_BATCH) break;
      }
    }
    summary.ok = true;
    return summary;
  } catch (err) {
    summary.message = err instanceof Error ? err.message : "Pull failed";
    return summary;
  }
}

/** Return the last log id that is known to have data after it. */
async function probeLogHead(client: SoapClient, profile: EbioserverProfile): Promise<number> {
  const hasRecordsAfter = async (logId: number): Promise<boolean> => {
    const probe = await call<unknown>(client, "GetDeviceLogsByLogId", {
      ...authArgs(profile), Location: "", LogId: String(logId), LogCount: "1",
    });
    return parseLogRecords(resultString(probe)).length > 0;
  };

  if (!(await hasRecordsAfter(0))) return 0;
  let low = 0;
  let high = 1;
  while (await hasRecordsAfter(high)) {
    low = high;
    high *= 2;
    if (high > 2_147_483_647) throw new Error("eBioserver log cursor exceeded supported range.");
  }
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (await hasRecordsAfter(mid)) low = mid;
    else high = mid;
  }
  // high is the first id for which there is nothing after it: the head.
  return high;
}

export async function runDeviceCommand(
  profile: EbioserverProfile,
  deviceSerial: string,
  action: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const client = await createClient(profile);
    const args = { ...authArgs(profile), DeviceSerialNumber: deviceSerial };
    if (action === "reboot") await call(client, "DeviceCommand_Reboot", args);
    else if (action === "clear_logs") await call(client, "DeviceCommand_ClearLogs", args);
    else if (action === "sync") await call(client, "DeviceCommand_GetDeviceLogs", args);
    else return { ok: false, message: `Command "${action}" is not available in eBioserver mode.` };
    return { ok: true, message: `${action} command sent to device ${deviceSerial}.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Command failed" };
  }
}
