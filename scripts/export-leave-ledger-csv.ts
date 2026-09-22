import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { LEAVE_BALANCE_FLAT_HEADERS, PEOPLE_NEXA_LEAVE_BALANCE_FLAT, parseKeystoneLeaveLedgerSheet } from "../lib/leave-balance-import";

const [sourcePath, outputDirectory, throughMonth] = process.argv.slice(2);
if (!sourcePath || !outputDirectory || !throughMonth) throw new Error("Usage: tsx scripts/export-leave-ledger-csv.ts <source.xlsx> <output-directory> <YYYY-MM>");

const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
const csvLine = (values: (string | number)[]) => values.map(csvCell).join(",");

async function run() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(resolve(sourcePath));
  if (workbook.worksheets.length !== 1) throw new Error("Expected exactly one worksheet.");
  const ledger = parseKeystoneLeaveLedgerSheet(workbook.worksheets[0], throughMonth);
  if (ledger.errors.length) throw new Error(ledger.errors.join(" "));
  const accepted = ledger.rows.filter((row) => !row.errors.length);
  const rejected = ledger.rows.filter((row) => row.errors.length);
  await mkdir(resolve(outputDirectory), { recursive: true });
  const stem = `leave-balance-${throughMonth}`;
  const flatRows = accepted.map((row) => [PEOPLE_NEXA_LEAVE_BALANCE_FLAT, row.employeeNumber, row.employeeName, row.designation, row.joiningDate, row.openingBalance, throughMonth, row.workedDays, row.credited, row.availed, row.available, row.sourceRow]);
  const rejectedRows = rejected.map((row) => [PEOPLE_NEXA_LEAVE_BALANCE_FLAT, row.employeeNumber, row.employeeName, row.designation, row.joiningDate, row.openingBalance, throughMonth, row.workedDays, row.credited, row.availed, row.available, row.sourceRow, row.errors.join(" | ")]);
  const sourceHash = createHash("sha256").update(await readFile(resolve(sourcePath))).digest("hex");
  const readme = [
    "# Leave balance export",
    "",
    `Source workbook: ${basename(sourcePath)}`,
    `Source SHA-256: ${sourceHash}`,
    `Cutoff basis: ${throughMonth} is the latest populated monthly block; later monthly activity columns were blank for every source row.`,
    `Accepted rows: ${accepted.length}`,
    `Rejected rows: ${rejected.length}`,
    "",
    "The accepted CSV uses the canonical PeopleNexa flat schema. opening_balance is the balance immediately before through_month, so every accepted row reconciles as opening_balance + credited - availed = available.",
    "Rejected rows are deliberately excluded from the import CSV. Correct them in the source ledger and re-export; do not manually add them to the accepted CSV.",
  ].join("\n") + "\n";
  await Promise.all([
    writeFile(join(resolve(outputDirectory), `${stem}.csv`), [LEAVE_BALANCE_FLAT_HEADERS.join(","), ...flatRows.map(csvLine)].join("\r\n") + "\r\n"),
    writeFile(join(resolve(outputDirectory), `${stem}-rejected.csv`), [[...LEAVE_BALANCE_FLAT_HEADERS, "errors"].join(","), ...rejectedRows.map(csvLine)].join("\r\n") + "\r\n"),
    writeFile(join(resolve(outputDirectory), `${stem}-README.md`), readme),
  ]);
  console.log(JSON.stringify({ throughMonth, accepted: accepted.length, rejected: rejected.length, sourceHash }, null, 2));
}

run();
