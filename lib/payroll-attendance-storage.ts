import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

const root = () => path.join(process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads"), "private-payroll-attendance");
function filePath(key: string) {
  if (!/^[a-f0-9-]{36}\.xlsx$/.test(key)) throw new Error("Invalid workbook storage key.");
  return path.join(/* turbopackIgnore: true */ root(), key);
}
export async function savePayrollWorkbook(bytes: Buffer) {
  const key = `${randomUUID()}.xlsx`;
  await mkdir(root(), { recursive: true });
  await writeFile(filePath(key), bytes, { flag: "wx", mode: 0o600 });
  return key;
}
export const readPayrollWorkbook = (key: string) => readFile(/* turbopackIgnore: true */ filePath(key));
export const removePayrollWorkbook = (key: string) => unlink(filePath(key));
