import { createHash, randomBytes } from "node:crypto";

/** Not a mailbox; stable and tenant-specific, independent of editable HR/device codes. */
export function internalEmployeeEmail(tenantId: string, employeeId: string): string {
  return `ess-${createHash("sha256").update(`${tenantId}:${employeeId}`).digest("hex").slice(0, 32)}@employees.peoplenexa.invalid`;
}
export function temporaryEmployeePassword(): string { return randomBytes(18).toString("base64url"); }
export function passwordError(password: string): string | null {
  return password.length < 1 || password.length > 72 || Buffer.byteLength(password, "utf8") > 72 ? "Enter a password of at most 72 UTF-8 bytes." : null;
}
export function portalHome(role: string): string {
  return ["admin", "branch_manager", "location_manager"].includes(role) ? "/admin" : role === "supervisor" ? "/admin/attendance" : "/employee";
}
