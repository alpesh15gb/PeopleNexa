import { prisma } from "@/lib/prisma";
import { appendAudit } from "@/lib/audit";

export function uniqueRosterLocations(rosters: Array<{ locationId: string; codes: string[] }>) {
  const candidates = new Map<string, Set<string>>();
  for (const roster of rosters) for (const code of roster.codes) {
    const locations = candidates.get(code) ?? new Set<string>();
    locations.add(roster.locationId); candidates.set(code, locations);
  }
  return new Map([...candidates].flatMap(([code, locations]) => locations.size === 1 ? [[code, [...locations][0]] as const] : []));
}

/** One roster call per mapped eBio group, never one SOAP call per employee. */
export async function discoverMachineEmployeeLocations(tenantId: string, fetchCodes: (locationCode: string) => Promise<string[]>) {
  const devices = await prisma.device.findMany({
    where: { tenantId, config: { path: ["ebioserver"], equals: true }, branch: { tenantId, location: { tenantId, isActive: true } } },
    select: { config: true, branch: { select: { locationId: true } } },
  });
  const groups = new Map<string, { sourceCode: string; locationIds: Set<string> }>();
  for (const device of devices) {
    const config = device.config as { locationCode?: unknown } | null;
    const sourceCode = typeof config?.locationCode === "string" ? config.locationCode.trim() : "";
    if (!sourceCode || !device.branch?.locationId) continue;
    const group = groups.get(sourceCode.toLowerCase()) ?? { sourceCode, locationIds: new Set<string>() };
    group.locationIds.add(device.branch.locationId); groups.set(sourceCode.toLowerCase(), group);
  }
  const entries = [...groups.values()];
  const rosters: Array<{ locationId: string; codes: string[] }> = [];
  let next = 0, incomplete = false;
  await Promise.all(Array.from({ length: Math.min(4, entries.length) }, async () => {
    while (next < entries.length) {
      const group = entries[next++];
      try {
        const codes = await fetchCodes(group.sourceCode);
        for (const locationId of group.locationIds) rosters.push({ locationId, codes });
      } catch { incomplete = true; }
    }
  }));
  // An unavailable roster could contain the same code in another location.
  const locations = uniqueRosterLocations(rosters);
  const ambiguous = new Set(rosters.flatMap(roster => roster.codes)).size - locations.size;
  return { locations: incomplete ? new Map<string, string>() : locations, incomplete, groups: entries.length, ambiguous };
}

/** Repair only unassigned machine imports. Never activate, reassign a branch, or alter codes. */
export async function attachPendingMachineLocations(tenantId: string, locations: Map<string, string>) {
  const groups = new Map<string, string[]>();
  for (const [code, locationId] of locations) groups.set(locationId, [...(groups.get(locationId) ?? []), code]);
  let assigned = 0;
  for (const [locationId, codes] of groups) {
    for (let offset = 0; offset < codes.length; offset += 250) {
      const batch = codes.slice(offset, offset + 250);
      const updated = await prisma.employee.updateMany({
        where: { tenantId, role: "employee", loginOnly: false, branchId: null, locationId: null,
          AND: [ { OR: [{ deviceCode: { in: batch } }, { deviceCode: null, employeeNumber: { in: batch } }] },
            { OR: [{ legacyImportData: { path: ["source"], equals: "ebioserver" } }, { email: { endsWith: "@device.local" } }] } ],
        }, data: { locationId },
      });
      assigned += updated.count;
      if (updated.count) await appendAudit({ tenantId, actorId: "machine-import", actorRole: "system", action: "employee.location.import", entity: "Location", entityId: locationId, summary: `${updated.count} unassigned machine employees linked to location; employment status unchanged`, after: { locationId, employees: updated.count } });
    }
  }
  return assigned;
}
