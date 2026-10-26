import { prisma } from "./prisma";
import { istDateKey, parseIST } from "./ist";

/** Read-only receipt -> ledger -> projection check. No calls to devices or finalization. */
export async function verifyRecentAttendance(tenantId: string, fromDay: string, now = new Date()) {
  const from = parseIST(`${fromDay} 00:00:00`);
  if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(fromDay) || istDateKey(from) !== fromDay || from > now || +now - +from > 32 * 86400000) throw new Error("Recent verification requires a valid IST day within the last 32 days.");
  return prisma.$transaction(async db => {
    await db.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    await db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { id: true } });
    const [raw, realtime, punches, employees, jobs] = await Promise.all([
      db.deviceLog.findMany({ where: { tenantId, OR: [{ punchTime: { gte: from, lte: now } }, { createdAt: { gte: from, lte: now } }] }, select: { id: true, deviceId: true, userId: true, punchTime: true, processed: true, error: true, createdAt: true } }),
      db.realtimeLog.findMany({ where: { tenantId, OR: [{ punchTime: { gte: from, lte: now } }, { createdAt: { gte: from, lte: now } }] }, select: { id: true, realtimeDeviceId: true, userId: true, punchTime: true, processed: true, error: true, createdAt: true } }),
      db.punch.findMany({ where: { tenantId, OR: [{ punchTime: { gte: from, lte: now } }, { createdAt: { gte: from, lte: now } }] }, select: { id: true, employeeId: true, deviceId: true, realtimeDeviceId: true, punchTime: true, eventKey: true, authStatus: true, createdAt: true } }),
      db.employee.findMany({ where: { tenantId }, select: { id: true, employeeNumber: true, deviceCode: true, status: true } }),
      db.attendanceReconcileJob.groupBy({ by: ["status"], where: { tenantId, punch: { OR: [{ punchTime: { gte: from, lte: now } }, { createdAt: { gte: from, lte: now } }] } }, _count: true }),
    ]);
    // Recently received scans can belong to an older workday. Include those
    // dates (and their prior night-shift dates), not only the receipt period.
    const dates = new Map<string, Date>();
    for (const p of punches) {
      const day = parseIST(`${istDateKey(p.punchTime)} 00:00:00`)!;
      for (const candidate of [day, new Date(+day - 86400000)]) dates.set(candidate.toISOString(), candidate);
    }
    const attendance = await db.attendance.findMany({ where: { tenantId, employeeId: { in: [...new Set(punches.map(p => p.employeeId))] }, date: { in: [...dates.values()] } }, select: { id: true, employeeId: true, date: true, punches: true, reviewStatus: true, finalized: true } });
    const byKey = new Map(punches.filter(p => p.eventKey).map(p => [p.eventKey, p]));
    const byTuple = new Map(punches.map(p => [`${p.employeeId}|${p.deviceId ? "device:" + p.deviceId : "realtime:" + p.realtimeDeviceId}|${p.punchTime.getTime()}`, p]));
    const byCode = new Map(employees.map(e => [e.deviceCode ?? e.employeeNumber, e]));
    const owners = new Map<string, Set<string>>();
    for (const a of attendance) for (const p of Array.isArray(a.punches) ? a.punches : []) if (p && typeof p === "object" && !Array.isArray(p) && typeof p.id === "string") {
      const days = owners.get(p.id) ?? new Set(); days.add(a.id); owners.set(p.id, days);
    }
    const issues = [];
    let represented = 0, pendingMaster = 0;
    for (const source of [...raw.map(r => ({ ...r, kind: "device" })), ...realtime.map(r => ({ ...r, kind: "realtime" }))]) {
      const employee = byCode.get(source.userId ?? "");
      const key = `${source.kind === "device" ? "device" : "realtime"}-log:${source.id}`;
      const hardware = source.kind === "device" ? (source as typeof raw[number]).deviceId : (source as typeof realtime[number]).realtimeDeviceId;
      const found = byKey.get(key) ?? byTuple.get(`${employee?.id}|${source.kind}:${hardware}|${source.punchTime?.getTime()}`);
      if (found) {
        if (found.punchTime.getTime() !== source.punchTime?.getTime() || (employee && found.employeeId !== employee.id) || (source.kind === "device" ? found.deviceId : found.realtimeDeviceId) !== hardware) {
          issues.push({ sourceId: source.id, kind: source.kind, code: source.userId, punchTime: source.punchTime, employeeId: employee?.id ?? null, reason: "normalized_source_identity_mismatch", originalError: source.error });
        } else represented++;
        continue;
      }
      const masterPending = !employee || employee.status !== "active";
      if (masterPending) pendingMaster++;
      issues.push({ sourceId: source.id, kind: source.kind, code: source.userId, punchTime: source.punchTime, employeeId: employee?.id ?? null, reason: masterPending ? "unmatched_or_inactive_master" : "raw_event_without_normalized_punch", originalError: source.error });
    }
    const unprojected = punches.filter(p => ["auto", "approved"].includes(p.authStatus) && !owners.has(p.id)).map(p => ({ punchId: p.id, employeeId: p.employeeId, punchTime: p.punchTime, reason: "authorized_scan_without_saved_snapshot_allocation" }));
    const duplicate = punches.filter(p => (owners.get(p.id)?.size ?? 0) > 1).map(p => ({ punchId: p.id, employeeId: p.employeeId, attendanceIds: [...owners.get(p.id)!] }));
    const latest = (rows: Array<{ punchTime: Date | null }>) => rows.map(r => r.punchTime?.toISOString()).filter(Boolean).sort().pop() ?? null;
    return {
      mode: "read_only", fromISTDay: fromDay, checkedThroughUTC: now.toISOString(),
      summary: { rawEvents: raw.length + realtime.length, representedRawEvents: represented, pendingMasterEvents: pendingMaster, activeMasterRawEventsWithoutLedger: issues.length - pendingMaster, normalizedPunches: punches.length, authorizedUnprojected: unprojected.length, duplicateSavedAllocations: duplicate.length, latestRawPunchUTC: latest([...raw, ...realtime]), latestNormalizedPunchUTC: latest(punches), jobs },
      rawIssues: issues, unprojected, duplicate,
      limits: "Receipt coverage uses exact source event keys or exact employee/device/time tuples. Current master classification does not prove historical status. Older scans received recently may need their historical day reviewed separately. Unprojected scans may be queued, finalized/protected or under review; this is evidence, not absence. This does not test device/network delivery before receipt.",
    };
  }, { isolationLevel: "RepeatableRead", timeout: 120_000 });
}
