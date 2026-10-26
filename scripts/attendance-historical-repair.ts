import { readFile, writeFile } from "node:fs/promises";
import { prisma } from "../lib/prisma";
import { prepareHistoricalRepair, applyHistoricalRepair, rollbackHistoricalRepair, type HistoricalRepairManifest, type RepairSelection } from "../lib/attendance-historical-repair";
import { verifyRecentAttendance } from "../lib/attendance-recent-verification";

async function save(path: string, value: unknown) {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", mode: 0o600, flag: "wx" });
}
async function main() {
  const [mode, input, outputOrHash, limitText, offsetText, extra] = process.argv.slice(2);
  if (mode === "preview" && input && outputOrHash && !limitText) {
    const selection = JSON.parse(await readFile(input, "utf8")) as RepairSelection;
    const manifest = await prepareHistoricalRepair(selection);
    await save(outputOrHash, manifest);
    console.log(JSON.stringify({ mode: "read_only_preview", hash: manifest.hash, components: manifest.components.length, eligibleReviewDays: manifest.components.filter(c => !c.blocked.length).reduce((n, c) => n + c.days.length, 0), heldComponents: manifest.components.filter(c => c.blocked.length).length, recentDatesExcludedFrom: manifest.recentCutoff, output: outputOrHash }));
    return;
  }
  if (mode === "recent" && input && outputOrHash && limitText && !offsetText && !extra) {
    const result = await verifyRecentAttendance(input, outputOrHash);
    await save(limitText, result);
    console.log(JSON.stringify({ ...result.summary, output: limitText })); return;
  }
  if (["apply", "rollback"].includes(mode) && input && outputOrHash && !extra) {
    const limit = Number(limitText ?? 25);
    const offset = Number(offsetText ?? 0);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Batch size must be an integer from 1 to 100.");
    if (!Number.isInteger(offset) || offset < 0) throw new Error("Offset must be a nonnegative integer.");
    const manifest = JSON.parse(await readFile(input, "utf8")) as HistoricalRepairManifest;
    const result = mode === "apply" ? await applyHistoricalRepair(manifest, outputOrHash, limit, new Date(), offset) : await rollbackHistoricalRepair(manifest, outputOrHash, limit, offset);
    console.log(JSON.stringify({ mode, offset, nextOffset: offset + limit < manifest.components.length ? offset + limit : null, results: result }, null, 2));
    if (result.some(r => r.status === "failed")) process.exitCode = 1;
    return;
  }
  throw new Error("Usage: tsx scripts/attendance-historical-repair.ts preview SELECTION.json NEW_MANIFEST.json | recent TENANT_ID FROM_IST_DAY NEW_REPORT.json | apply MANIFEST.json SHA256 [1-100] [OFFSET] | rollback MANIFEST.json SHA256 [1-100] [OFFSET]. No environment files are loaded by this script.");
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
