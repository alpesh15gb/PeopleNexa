import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";
import { istDateKey, parseIST } from "./ist";
import { isAttendanceWriteConflict } from "./attendance-conflicts";
import { assertLeavePayrollOpen } from "./leave-payroll-lock";
import { AUTOMATIC_SHIFT_KIND, automaticShiftPolicy } from "./automatic-shifts";
import { UNASSIGNED_SHIFT_POLICY_KIND } from "./unassigned-shift-policy";

// Private manifests contain attendance evidence. They must never be checked in.
// Review-only intentionally does not approve the earlier calendar-day scenario.
type Row = Record<string, any>;
export type RepairSelection = { tenantId: string; days: Array<{ employeeId: string; day: string }>; sourceLogIds: string[] };
type Component = { id: string; employeeId: string; days: string[]; sourceLogIds: string[]; expectedHash: string; before: Row; proposed: Row[]; blocked: string[] };
export type HistoricalRepairManifest = {
  version: 1; mode: "review-only"; tenantId: string; preparedAt: string; recentCutoff: string;
  components: Component[]; hash: string;
};
const attendanceSelect = { id: true, tenantId: true, employeeId: true, date: true, branchId: true, shiftId: true, punchInTime: true, punchOutTime: true, status: true, lateMinutes: true, overtimeMinutes: true, punches: true, finalized: true, reviewStatus: true, note: true, createdAt: true, updatedAt: true } as const;
const employeeSelect = { id: true, tenantId: true, employeeNumber: true, deviceCode: true, firstName: true, lastName: true, status: true, loginOnly: true, joiningDate: true, branchId: true, locationId: true, shiftId: true, updatedAt: true, createdAt: true } as const;
const punchSelect = { id: true, tenantId: true, employeeId: true, punchTime: true, deviceId: true, realtimeDeviceId: true, inOutHint: true, authStatus: true, eventKey: true, source: true, createdAt: true } as const;
export const repairPlain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export const repairHash = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(repairPlain(value)))).digest("hex");
const midnight = (value: string) => parseIST(`${value} 00:00:00`)!;
const yesterday = (now: Date) => istDateKey(new Date(midnight(istDateKey(now)).getTime() - 86400000));
function validDay(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && parseIST(`${value} 00:00:00`) && istDateKey(midnight(value)) === value; }
const dateKey = (value: Date | string) => istDateKey(new Date(value));

function historicalField(employee: Row, audits: Row[], field: string, at: Date) {
  let value = employee[field];
  for (const a of [...audits].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt) || b.id.localeCompare(a.id))) {
    if (+new Date(a.createdAt) <= +at || !(field in (a.before ?? {})) || !(field in (a.after ?? {})) || a.before[field] === a.after[field]) continue;
    if (a.after[field] !== value) throw new Error(`Historical ${field} audit chain is incomplete.`);
    value = a.before[field];
  }
  return value;
}

async function evidence(db: Prisma.TransactionClient, tenantId: string, employeeId: string, days: string[], sourceIds: string[]) {
  const employee = await db.employee.findFirstOrThrow({ where: { tenantId, id: employeeId }, select: employeeSelect });
  const from = midnight(days[0]), to = new Date(+midnight(days[days.length - 1]) + 86400000);
  const [tenant, records, punches, logs, rosters, configs, branches, shifts, devices, audits, pending] = await Promise.all([
    db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { id: true, config: true } }),
    db.attendance.findMany({ where: { tenantId, employeeId }, select: attendanceSelect, orderBy: { id: "asc" } }),
    db.punch.findMany({ where: { tenantId, employeeId, punchTime: { gte: from, lt: to } }, select: punchSelect, orderBy: { id: "asc" } }),
    db.deviceLog.findMany({ where: { tenantId, id: { in: sourceIds } }, orderBy: { id: "asc" } }),
    db.rosterAssignment.findMany({ where: { tenantId, employeeId, date: { gte: new Date(+from - 86400000), lt: new Date(+to + 86400000) } }, orderBy: { id: "asc" } }),
    db.configurationRecord.findMany({ where: { tenantId, kind: { in: [AUTOMATIC_SHIFT_KIND, "payroll_policy", UNASSIGNED_SHIFT_POLICY_KIND] } }, orderBy: { id: "asc" } }),
    db.branch.findMany({ where: { tenantId }, select: { id: true, locationId: true, updatedAt: true }, orderBy: { id: "asc" } }),
    db.shift.findMany({ where: { tenantId }, orderBy: { id: "asc" } }),
    db.device.findMany({ where: { tenantId }, select: { id: true, tenantId: true, serialNumber: true, branchId: true }, orderBy: { id: "asc" } }),
    db.auditLog.findMany({ where: { tenantId, entity: "Employee", entityId: employeeId }, select: { id: true, createdAt: true, before: true, after: true }, orderBy: { id: "asc" } }),
    db.employee.count({ where: { tenantId, id: employeeId, branchId: null, OR: [{ legacyImportData: { path: ["source"], equals: "ebioserver" } }, { email: { endsWith: "@device.local" } }] } }),
  ]);
  const tuplePunches = logs.length ? await db.punch.findMany({ where: { OR: logs.map(log => ({ deviceId: log.deviceId, punchTime: log.punchTime! })) }, select: punchSelect, orderBy: { id: "asc" } }) : [];
  // Any boundary row mentioning a target day's punch/time belongs to the same
  // atomic group. An unselected external reference invalidates the manifest.
  const referenced = records.filter(r => days.includes(dateKey(r.date)) || [r.punchInTime, r.punchOutTime, ...(Array.isArray(r.punches) ? r.punches.map(p => p && typeof p === "object" && !Array.isArray(p) ? p.time : null) : [])].some(time => typeof time === "string" || time instanceof Date ? days.includes(dateKey(time)) : false));
  const historyFields = new Set(["shiftId", "branchId", "locationId", "status", "joiningDate", "deviceCode"]);
  const history = audits.map(a => ({ ...a, before: Object.fromEntries(Object.entries(a.before && typeof a.before === "object" && !Array.isArray(a.before) ? a.before : {}).filter(([key]) => historyFields.has(key))), after: Object.fromEntries(Object.entries(a.after && typeof a.after === "object" && !Array.isArray(a.after) ? a.after : {}).filter(([key]) => historyFields.has(key))) }));
  // Hash complete policies for drift detection; don't repeat salary-component
  // configuration or unrelated device/location metadata in every audit image.
  const settings = configs.map(({ payload, ...meta }) => ({ ...meta, payloadHash: repairHash(payload), payload: meta.kind === AUTOMATIC_SHIFT_KIND ? automaticShiftPolicy(payload) : null }));
  const branchIds = new Set([employee.branchId, ...referenced.map(r => r.branchId), ...history.flatMap(a => [a.before.branchId, a.after.branchId])]);
  const deviceIds = new Set([...punches.map(p => p.deviceId), ...logs.map(l => l.deviceId)]);
  const tenantConfig = tenant.config && typeof tenant.config === "object" && !Array.isArray(tenant.config) ? tenant.config as Row : {};
  return repairPlain({ employee, tenant: { id: tenant.id, punchConfigHash: repairHash(tenantConfig.punches ?? null), punchMode: tenantConfig.punches?.mode ?? "first_last" }, records: referenced, punches, logs, tuplePunches, rosters, configs: settings, branches: branches.filter(b => branchIds.has(b.id)), shifts, devices: devices.filter(d => deviceIds.has(d.id)), audits: history, pending });
}

function proposal(state: Row, days: string[], sourceIds: string[], recentCutoff: string) {
  const e = state.employee, blocked: string[] = [];
  if (state.tenant.punchMode !== "first_last") blocked.push("This review-only calendar-day tool requires a first/last workday plan; strict/alternating modes need separate review.");
  if (state.punches.some((p: Row) => !["device", "ebioserver", "realtime"].includes(p.source))) blocked.push("Mobile/manual or mixed source evidence needs a separate preservation plan.");
  if (days.some(d => d >= recentCutoff)) blocked.push("Yesterday/today or future attendance is excluded from historical repair.");
  if (e.status !== "active" || e.loginOnly || state.pending) blocked.push("Employee is inactive, login-only, or Assignment Pending.");
  if (state.records.some((r: Row) => !days.includes(dateKey(r.date)))) blocked.push("Linked boundary record is outside this atomic component; regenerate preview.");
  if (state.records.some((r: Row) => r.reviewStatus === "manual_override")) blocked.push("Manual attendance decision is protected.");
  if (state.logs.length !== sourceIds.length) blocked.push("A selected source log is missing or outside the tenant.");
  const ledger: Row[] = [...state.punches];
  for (const raw of state.logs) {
    const device = state.devices.find((d: Row) => d.id === raw.deviceId);
    let body: Row | null = null;
    try { body = JSON.parse(raw.rawData ?? "null"); } catch { /* unverifiable source is held */ }
    if (!raw.punchTime || raw.userId !== e.deviceCode || !device || !body || body.EmployeeCode !== raw.userId || body.SerialNumber !== device.serialNumber || body.LogDate !== new Date(+new Date(raw.punchTime) + 19800000).toISOString().slice(0, 19).replace("T", " ") || !days.includes(dateKey(raw.punchTime))) {
      blocked.push(`Source identity/serial/time mismatch: ${raw.id}`); continue;
    }
    const key = `device-log:${raw.id}`;
    const matches = state.tuplePunches.filter((p: Row) => p.deviceId === raw.deviceId && p.punchTime === raw.punchTime);
    const keyed = state.punches.find((p: Row) => p.eventKey === key);
    if (matches.some((p: Row) => p.employeeId !== e.id || p.tenantId !== e.tenantId || p.eventKey !== key) || (keyed && (keyed.employeeId !== e.id || keyed.deviceId !== raw.deviceId || keyed.punchTime !== raw.punchTime || !["auto", "approved"].includes(keyed.authStatus)))) {
      blocked.push(`Source event already represented or conflicting: ${raw.id}`); continue;
    }
    if (!keyed) ledger.push({ id: `recovered:${raw.id}`, tenantId: e.tenantId, employeeId: e.id, deviceId: raw.deviceId, realtimeDeviceId: null, punchTime: raw.punchTime, source: "device", inOutHint: "unknown", authStatus: "auto", eventKey: key });
  }
  const rows = days.map(day => {
    const before = state.records.find((r: Row) => dateKey(r.date) === day);
    const scans = ledger.filter(p => dateKey(p.punchTime) === day && ["auto", "approved"].includes(p.authStatus)).sort((a, b) => a.punchTime.localeCompare(b.punchTime) || a.id.localeCompare(b.id));
    if (e.joiningDate && day < dateKey(e.joiningDate)) blocked.push(`Before employee joining date: ${day}`);
    if (!scans.length) blocked.push(`No authorized evidence for selected day: ${day}`);
    let shiftId = null, branchId = e.branchId;
    try {
      const first = new Date(scans[0]?.punchTime ?? midnight(day));
      shiftId = historicalField(e, state.audits, "shiftId", first);
      branchId = historicalField(e, state.audits, "branchId", first);
    } catch (error) { blocked.push((error as Error).message); }
    const roster = state.rosters.find((r: Row) => dateKey(r.date) === day);
    shiftId = roster?.shiftId ?? shiftId;
    if (state.shifts.some((r: Row) => (r.id === shiftId || r.id === before?.shiftId) && r.isNightShift)) blocked.push(`Configured night shift requires a separate workday plan: ${day}`);
    if (state.configs.some((r: Row) => r.kind === AUTOMATIC_SHIFT_KIND && r.active && [branchId, e.branchId].some(b => r.scopeKey === `branch:${b}`) && automaticShiftPolicy(r.payload)?.enabled)) blocked.push(`Automatic shift requires a separate workday plan: ${day}`);
    const sourceCount = scans.filter(p => p.id.startsWith("recovered:")).length;
    return {
      day, id: before?.id ?? null, branchId: before ? before.branchId : e.branchId, shiftId: before ? before.shiftId : shiftId,
      punchInTime: scans[0]?.punchTime ?? null,
      // A single scan does not become a fabricated OUT; repeated bursts keep
      // their observed last timestamp but never grant hours in review-only mode.
      punchOutTime: scans.length > 1 ? scans[scans.length - 1].punchTime : null,
      status: before?.status ?? "present", lateMinutes: before?.lateMinutes ?? 0, overtimeMinutes: 0,
      finalized: true, reviewStatus: "needs_review",
      note: `Historical repair: observed calendar-day scans retained for review; no paid-day decision. ${scans.length} scans (${sourceCount} recovered).`,
      punches: scans.map((p, index) => ({ id: p.id, time: p.punchTime, source: p.source, type: p.inOutHint === "in" ? "in" : p.inOutHint === "out" ? "out" : index === 0 ? "in" : index === scans.length - 1 ? "out" : "auto", ...(p.deviceId ? { deviceSn: state.devices.find((d: Row) => d.id === p.deviceId)?.serialNumber } : {}) })),
    };
  });
  const afterIds = new Set(rows.flatMap(r => r.punches.map((p: Row) => p.id)));
  const originals = state.records.flatMap((r: Row) => Array.isArray(r.punches) ? r.punches : []).filter((p: Row) => p?.id);
  if (originals.some((p: Row) => !afterIds.has(p.id))) blocked.push("A saved snapshot contains evidence not present in the selected authorized ledger; separate review required.");
  return { rows, ledger: ledger.filter(p => p.id.startsWith("recovered:")), blocked: [...new Set(blocked)] };
}

async function payrollOpen(db: Prisma.TransactionClient, tenantId: string, employeeId: string, days: string[]) {
  await assertLeavePayrollOpen(db, tenantId, employeeId, midnight(days[0]), midnight(days[days.length - 1]));
  if (await db.payslip.count({ where: { tenantId, employeeId, month: { in: [...new Set(days.map(d => d.slice(0, 7)))] }, status: "paid" } })) throw Object.assign(new Error("Legacy paid payslip protects this component."), { code: "PAYROLL_LOCKED" });
}

export async function prepareHistoricalRepair(selection: RepairSelection, now = new Date()): Promise<HistoricalRepairManifest> {
  if (!selection.tenantId || !Array.isArray(selection.days) || !Array.isArray(selection.sourceLogIds) || selection.days.length + selection.sourceLogIds.length === 0 || selection.days.length > 2000 || selection.sourceLogIds.length > 1000 || selection.days.some(d => !d.employeeId || !validDay(d.day))) throw new Error("Provide a bounded selection of exact employee/day keys and source log IDs.");
  return prisma.$transaction(async db => {
    await db.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const logs = await db.deviceLog.findMany({ where: { tenantId: selection.tenantId, id: { in: selection.sourceLogIds } }, select: { id: true, userId: true, punchTime: true } });
    if (logs.length !== new Set(selection.sourceLogIds).size) throw new Error("Every selected source ID must exist in this tenant.");
    const owners = await db.employee.findMany({ where: { tenantId: selection.tenantId, deviceCode: { in: logs.map(l => l.userId).filter(Boolean) as string[] } }, select: { id: true, deviceCode: true } });
    const seeds = new Set(selection.days.map(d => `${d.employeeId}|${d.day}`));
    const logOwners = new Map<string, string>();
    for (const log of logs) {
      const matches = owners.filter(e => e.deviceCode === log.userId);
      if (matches.length !== 1 || !log.punchTime) throw new Error(`Source ${log.id} must match one exact employee code and timestamp.`);
      logOwners.set(log.id, matches[0].id); seeds.add(`${matches[0].id}|${dateKey(log.punchTime)}`);
    }
    const employeeIds = [...new Set([...seeds].map(k => k.split("|")[0]))];
    if (await db.employee.count({ where: { tenantId: selection.tenantId, id: { in: employeeIds } } }) !== employeeIds.length) throw new Error("Selection includes an employee outside the tenant.");
    const existing = await db.attendance.findMany({ where: { tenantId: selection.tenantId, employeeId: { in: employeeIds } }, select: attendanceSelect });
    const graph = new Map<string, Set<string>>();
    const connect = (a: string, b: string) => { if (!graph.has(a)) graph.set(a, new Set()); if (!graph.has(b)) graph.set(b, new Set()); graph.get(a)!.add(b); graph.get(b)!.add(a); };
    for (const r of existing) {
      const key = `${r.employeeId}|${dateKey(r.date)}`;
      for (const p of [r.punchInTime, r.punchOutTime, ...(Array.isArray(r.punches) ? r.punches.map(p => p && typeof p === "object" && !Array.isArray(p) ? p.time : null) : [])]) {
        if (typeof p === "string" || p instanceof Date) connect(key, `${r.employeeId}|${dateKey(p)}`);
      }
    }
    const seen = new Set<string>(), components: Component[] = [], cutoff = yesterday(now);
    for (const seed of [...seeds].sort()) {
      if (seen.has(seed)) continue;
      const keys = new Set([seed]), todo = [seed];
      while (todo.length) for (const next of graph.get(todo.pop()!) ?? []) if (!keys.has(next)) { keys.add(next); todo.push(next); if (keys.size > 2000) throw new Error("Connected allocation exceeds the 2000-day safety bound."); }
      for (const key of keys) seen.add(key);
      const employeeId = seed.split("|")[0], days = [...keys].map(k => k.split("|")[1]).sort();
      const sourceLogIds = logs.filter(l => logOwners.get(l.id) === employeeId && days.includes(dateKey(l.punchTime!))).map(l => l.id).sort();
      const before = await evidence(db, selection.tenantId, employeeId, days, sourceLogIds);
      const planned = proposal(before, days, sourceLogIds, cutoff);
      try { await payrollOpen(db, selection.tenantId, employeeId, days); } catch (error) { if ((error as Row).code !== "PAYROLL_LOCKED") throw error; planned.blocked.push((error as Error).message); }
      components.push({ id: repairHash({ employeeId, days }).slice(0, 24), employeeId, days, sourceLogIds, expectedHash: repairHash(before), before, proposed: planned.rows, blocked: planned.blocked });
    }
    const body = { version: 1 as const, mode: "review-only" as const, tenantId: selection.tenantId, preparedAt: now.toISOString(), recentCutoff: cutoff, components };
    return { ...body, hash: repairHash(body) };
  }, { isolationLevel: "RepeatableRead", timeout: 180_000 });
}

function validateManifest(manifest: HistoricalRepairManifest, expectedHash: string) {
  const { hash, ...body } = manifest;
  if (manifest.version !== 1 || manifest.mode !== "review-only" || hash !== expectedHash || repairHash(body) !== hash) throw new Error("Manifest hash/version mismatch. No changes made.");
}
const auditId = (manifest: HistoricalRepairManifest, component: Component) => `attendance-repair:${manifest.hash}:${component.id}`;
class SkipRepair extends Error {}

export async function applyHistoricalRepair(manifest: HistoricalRepairManifest, expectedHash: string, limit = 25, now = new Date(), offset = 0) {
  validateManifest(manifest, expectedHash);
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid batch offset or size.");
  const result: Row[] = [];
  for (const component of manifest.components.slice(offset, offset + limit)) {
    if (component.blocked.length) { result.push({ id: component.id, status: "held", reasons: component.blocked }); continue; }
    if (await prisma.auditLog.count({ where: { id: auditId(manifest, component), tenantId: manifest.tenantId } })) { result.push({ id: component.id, status: "already_applied" }); continue; }
    for (let attempt = 0; ; attempt++) {
      try {
        const applied = await prisma.$transaction(async db => {
          await db.$executeRawUnsafe("SET LOCAL lock_timeout = '750ms'");
          if (await db.auditLog.count({ where: { id: auditId(manifest, component), tenantId: manifest.tenantId } })) throw new SkipRepair("Already applied by another process.");
          const current = await evidence(db, manifest.tenantId, component.employeeId, component.days, component.sourceLogIds);
          if (repairHash(current) !== component.expectedHash) throw new SkipRepair("Evidence or employee/configuration/attendance changed after preview. Regenerate and review.");
          const planned = proposal(current, component.days, component.sourceLogIds, yesterday(now));
          if (planned.blocked.length) throw new SkipRepair(planned.blocked.join(" "));
          if (repairHash(planned.rows) !== repairHash(component.proposed)) throw new SkipRepair("Proposed changes do not match reviewed manifest.");
          await payrollOpen(db, manifest.tenantId, component.employeeId, component.days);
          const recovered = [];
          for (const source of planned.ledger) {
            const { id: placeholder, ...data } = source;
            const punch = await db.punch.create({ data: { ...data, punchTime: new Date(data.punchTime) } as Prisma.PunchUncheckedCreateInput });
            await db.attendanceReconcileJob.create({ data: { tenantId: manifest.tenantId, employeeId: component.employeeId, punchId: punch.id, status: "blocked", lastError: "Historical evidence recovered; attendance held for authorized review." } });
            for (const row of planned.rows) for (const p of row.punches) if (p.id === placeholder) p.id = punch.id;
            recovered.push(punch.id);
          }
          const changed = [];
          for (const proposed of planned.rows) {
            const { id, day, ...data } = proposed;
            const converted = { ...data, punchInTime: data.punchInTime ? new Date(data.punchInTime) : null, punchOutTime: data.punchOutTime ? new Date(data.punchOutTime) : null, punches: repairPlain(data.punches) };
            if (id) {
              const before = current.records.find((r: Row) => r.id === id);
              if (!before) throw new SkipRepair("Selected attendance row disappeared.");
              const saved = await db.attendance.updateMany({ where: { id, tenantId: manifest.tenantId, updatedAt: new Date(before.updatedAt), OR: [{ reviewStatus: null }, { reviewStatus: { not: "manual_override" } }] }, data: converted });
              if (!saved.count) throw new SkipRepair("Attendance changed or became manual during repair.");
              changed.push(id);
            } else {
              const saved = await db.attendance.create({ data: { ...converted, tenantId: manifest.tenantId, employeeId: component.employeeId, date: midnight(day) } as Prisma.AttendanceUncheckedCreateInput });
              changed.push(saved.id);
            }
          }
          for (const raw of current.logs) {
            await db.deviceLog.update({ where: { id: raw.id }, data: { processed: true, error: null } });
          }
          const after = await evidence(db, manifest.tenantId, component.employeeId, component.days, component.sourceLogIds);
          await db.auditLog.create({ data: {
            id: auditId(manifest, component), tenantId: manifest.tenantId, actorId: "system:attendance-repair", actorRole: "system", action: "attendance.historical_repair", entity: "AttendanceRepair", entityId: component.id,
            summary: `${current.employee.employeeNumber} ${current.employee.firstName} ${current.employee.lastName ?? ""}: ${changed.length} historical days retained for Review; ${recovered.length} exact events recovered.`,
            before: repairPlain({ hash: manifest.hash, state: current }), after: repairPlain({ hash: manifest.hash, state: after, recoveredPunchIds: recovered }),
          } });
          return { id: component.id, status: "applied_review_only", employeeNumber: current.employee.employeeNumber, days: changed.length, recoveredEvents: recovered.length };
        }, { isolationLevel: "Serializable", timeout: 20_000 });
        result.push(applied); break;
      } catch (error) {
        if (isAttendanceWriteConflict(error) && attempt < 2) { await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1))); continue; }
        result.push({ id: component.id, status: error instanceof SkipRepair || (error as Row).code === "PAYROLL_LOCKED" || isAttendanceWriteConflict(error) ? "skipped" : "failed", reason: (error as Error).message }); break;
      }
    }
  }
  return result;
}

export async function rollbackHistoricalRepair(manifest: HistoricalRepairManifest, expectedHash: string, limit = 25, offset = 0) {
  validateManifest(manifest, expectedHash);
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid batch offset or size.");
  const results: Row[] = [];
  for (const c of manifest.components.slice(offset, offset + limit)) {
    const id = auditId(manifest, c), undoId = `${id}:undo`;
    if (!await prisma.auditLog.count({ where: { id, tenantId: manifest.tenantId } })) continue;
    if (await prisma.auditLog.count({ where: { id: undoId, tenantId: manifest.tenantId } })) { results.push({ id: c.id, status: "already_rolled_back" }); continue; }
    try {
      await prisma.$transaction(async db => {
        await db.$executeRawUnsafe("SET LOCAL lock_timeout = '750ms'");
        const audit = await db.auditLog.findFirstOrThrow({ where: { id, tenantId: manifest.tenantId } });
        const before = (audit.before as Row).state, after = (audit.after as Row).state;
        const current = await evidence(db, manifest.tenantId, c.employeeId, c.days, c.sourceLogIds);
        if (repairHash(current) !== repairHash(after)) throw new SkipRepair("New punches, decisions or context exist after repair; rollback skipped to preserve them.");
        await payrollOpen(db, manifest.tenantId, c.employeeId, c.days);
        for (const row of current.records) {
          const old = before.records.find((r: Row) => r.id === row.id);
          if (!old) {
            const deleted = await db.attendance.deleteMany({ where: { id: row.id, tenantId: manifest.tenantId, updatedAt: new Date(row.updatedAt) } });
            if (deleted.count !== 1) throw new SkipRepair("Attendance changed during rollback.");
          } else {
            const { id: oldId, employeeId, tenantId, date, createdAt, updatedAt, ...data } = old;
            const saved = await db.attendance.updateMany({ where: { id: oldId, tenantId: manifest.tenantId, updatedAt: new Date(row.updatedAt) }, data: { ...data, punchInTime: data.punchInTime ? new Date(data.punchInTime) : null, punchOutTime: data.punchOutTime ? new Date(data.punchOutTime) : null, punches: data.punches ?? Prisma.DbNull } });
            if (saved.count !== 1) throw new SkipRepair("Attendance changed during rollback.");
          }
        }
        await db.auditLog.create({ data: { id: undoId, tenantId: manifest.tenantId, actorId: "system:attendance-repair", actorRole: "system", action: "attendance.historical_repair.rollback", entity: "AttendanceRepair", entityId: c.id, summary: `${current.employee.employeeNumber}: restored prior attendance decisions; recovered punch evidence retained.`, before: repairPlain({ state: current }), after: { originalRepair: id, recoveredEvidenceRetained: true } } });
      }, { isolationLevel: "Serializable", timeout: 20_000 });
      results.push({ id: c.id, status: "attendance_rolled_back_evidence_retained" });
    } catch (error) { results.push({ id: c.id, status: "skipped", reason: (error as Error).message }); }
  }
  return results;
}
