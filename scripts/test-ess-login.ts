import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../lib/prisma";
import { hashPassword, verifyPassword, signToken, verifyToken, SESSION_COOKIE } from "../lib/auth";
import { internalEmployeeEmail, temporaryEmployeePassword, passwordError } from "../lib/ess-login";
import { POST as login } from "../app/api/auth/login/route";
import { POST as changePassword } from "../app/api/auth/change-password/route";
import { POST as provision } from "../app/api/employees/[id]/ess-login/route";
import { POST as ping } from "../app/api/location/route";
import proxy from "../proxy";
import { runInNewContext } from "node:vm";
import { readFileSync } from "node:fs";
import manifest from "../app/manifest";

async function main() {
  const require = createRequire(import.meta.url), headers = require("next/headers");
  const originalCookies = headers.cookies;
  let cookie = "";
  headers.cookies = async () => ({ get: (name: string) => name === SESSION_COOKIE && cookie ? { value: cookie } : undefined });
  const employee = { id: "employee1", tenantId: "tenant1", role: "employee", status: "active", employeeNumber: "YLR0158", deviceCode: "158", firstName: "Test", lastName: "Employee", branchId: "branch1", email: "real@example.com", password: await hashPassword("temporary-pass-123"), mustChangePassword: true, sessionVersion: 0, loginOnly: false, legacyImportData: null };
  const admin = { ...employee, id: "admin1", role: "admin", mustChangePassword: false };
  let duplicate = false;
  const audits: unknown[] = [];
  const originals = { findFirst: prisma.employee.findFirst, findUnique: prisma.employee.findUnique, findMany: prisma.employee.findMany, count: prisma.employee.count, update: prisma.employee.update, updateMany: prisma.employee.updateMany, tenant: prisma.tenant.findUnique, audit: prisma.auditLog.create, transaction: prisma.$transaction };
  // In-memory DB adapter exercises real HTTP handlers without touching employee data.
  prisma.employee.findFirst = (async (args: any) => {
    assert.equal(args.where.tenantId, "tenant1");
    return { ...(args.where.id === "admin1" ? admin : employee) };
  }) as any;
  prisma.employee.findUnique = (async (args: any) => ({ ...(args.where.id === "admin1" ? admin : employee) })) as any;
  prisma.employee.findMany = (async (args: any) => {
    if (args.where.tenantId !== "tenant1") return [];
    const matches = args.where.email ? args.where.email === employee.email : args.where.employeeNumber.equals.toLowerCase() === employee.employeeNumber.toLowerCase();
    return matches ? duplicate ? [{ ...employee }, { ...employee, id: "duplicate" }] : [{ ...employee }] : [];
  }) as any;
  prisma.employee.count = (async () => duplicate ? 2 : 1) as any;
  prisma.employee.update = (async () => employee) as any;
  prisma.employee.updateMany = (async (args: any) => {
    if (args.where.sessionVersion !== employee.sessionVersion) return { count: 0 };
    const data = args.data;
    Object.assign(employee, { ...data, sessionVersion: data.sessionVersion?.increment ? employee.sessionVersion + data.sessionVersion.increment : employee.sessionVersion });
    return { count: 1 };
  }) as any;
  prisma.tenant.findUnique = (async (args: any) => ({ id: args.where.slug === "other" ? "tenant2" : "tenant1", status: "active", subscriptionExpiry: null })) as any;
  prisma.auditLog.create = (async (args: any) => { audits.push(args.data); return args.data; }) as any;
  prisma.$transaction = (async (fn: any) => fn(prisma)) as any;
  const request = (path: string, body: unknown, token = cookie) => new NextRequest(`https://crk.peoplenexa.in${path}`, { method: "POST", headers: { "Content-Type": "application/json", "x-tenant-slug": "crk", ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}) }, body: JSON.stringify(body) });
  try {
    let response: NextResponse = await login(request("/api/auth/login", { identifier: "ylr0158", password: "temporary-pass-123" }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).mustChangePassword, true);
    cookie = response.cookies.get(SESSION_COOKIE)!.value;
    assert.equal((await proxy(request("/api/attendance/clock", {}))).status, 403, "temporary sessions cannot punch");
    const redirect = await proxy(new NextRequest("https://crk.peoplenexa.in/employee", { headers: { cookie: `${SESSION_COOKIE}=${cookie}` } }));
    assert.match(redirect.headers.get("location")!, /change-password/);
    response = await changePassword(request("/api/auth/change-password", { currentPassword: "wrong", password: "new-password-12345" }));
    assert.equal(response.status, 400);
    response = await changePassword(request("/api/auth/change-password", { currentPassword: "temporary-pass-123", password: "temporary-pass-123" }));
    assert.equal(response.status, 400);
    const initialCookie = cookie;
    response = await changePassword(request("/api/auth/change-password", { currentPassword: "temporary-pass-123", password: "new-password-12345" }));
    assert.equal(response.status, 200);
    assert.equal(employee.mustChangePassword, false);
    assert.equal(employee.sessionVersion, 1);
    assert.ok(await verifyPassword("new-password-12345", employee.password));
    assert.equal((await proxy(request("/api/attendance/clock", {}, initialCookie))).status, 401, "old session invalidated after change");
    cookie = response.cookies.get(SESSION_COOKIE)!.value;
    assert.equal(verifyToken(cookie)?.sessionVersion, 1);
    assert.equal((await ping()).status, 410, "even approved attendance cannot start journey tracking");
    assert.equal((await login(request("/api/auth/login", { identifier: "real@example.com", password: "new-password-12345" }))).status, 200, "email sign-in remains compatible");
    duplicate = true;
    assert.equal((await login(request("/api/auth/login", { identifier: "YLR0158", password: "new-password-12345" }))).status, 401);
    duplicate = false;
    assert.equal((await login(request("/api/auth/login", { identifier: "YLR/158", password: "new-password-12345" }))).status, 401, "never silently alias IDs during login");
    const otherWorkspace = request("/api/auth/login", { identifier: "YLR0158", password: "new-password-12345" }, "");
    otherWorkspace.headers.set("x-tenant-slug", "other");
    assert.equal((await login(otherWorkspace)).status, 401, "same ID cannot authenticate in another workspace");
    employee.status = "inactive";
    assert.equal((await login(request("/api/auth/login", { identifier: "YLR0158", password: "new-password-12345" }))).status, 403);
    employee.status = "active";
    const oldEmployeeCookie = cookie;
    cookie = signToken({ sub: admin.id, tenantId: admin.tenantId, role: admin.role });
    response = await provision(request("/api/employees/employee1/ess-login", {}), { params: Promise.resolve({ id: employee.id }) });
    assert.equal(response.status, 200);
    const issued = await response.json();
    assert.equal(employee.email, "real@example.com");
    assert.equal(employee.deviceCode, "158");
    assert.equal(employee.mustChangePassword, true);
    assert.ok(await verifyPassword(issued.temporaryPassword, employee.password));
    assert.equal((await proxy(request("/api/attendance/clock", {}, oldEmployeeCookie))).status, 401);
    assert.ok(!JSON.stringify(audits).includes(issued.temporaryPassword), "temporary passwords never enter audit logs");
    employee.email = "";
    response = await provision(request("/api/employees/employee1/ess-login", {}), { params: Promise.resolve({ id: employee.id }) });
    assert.equal(response.status, 200);
    assert.equal(employee.email, internalEmployeeEmail(employee.tenantId, employee.id));
    assert.equal(response.headers.get("cache-control"), "no-store");
    duplicate = true;
    assert.equal((await provision(request("/api/employees/employee1/ess-login", {}), { params: Promise.resolve({ id: employee.id }) })).status, 409);
    duplicate = false;
    employee.branchId = "";
    assert.equal((await provision(request("/api/employees/employee1/ess-login", {}), { params: Promise.resolve({ id: employee.id }) })).status, 400);
    employee.branchId = "branch1";
    employee.status = "inactive";
    assert.equal((await provision(request("/api/employees/employee1/ess-login", {}), { params: Promise.resolve({ id: employee.id }) })).status, 400);
    assert.equal(employee.status, "inactive", "provisioning must not activate anyone");
    assert.equal(internalEmployeeEmail("tenant1", "id"), internalEmployeeEmail("tenant1", "id"));
    assert.notEqual(internalEmployeeEmail("tenant1", "id"), internalEmployeeEmail("tenant2", "id"));
    assert.notEqual(temporaryEmployeePassword(), temporaryEmployeePassword());
    assert.ok(passwordError("short")); assert.ok(passwordError("x".repeat(73))); assert.equal(passwordError("new-password-12345"), null);
    const appManifest = manifest();
    assert.equal(appManifest.start_url, "/employee");
    for (const icon of appManifest.icons!) assert.ok(readFileSync(`public${icon.src}`).length > 0);
    assert.doesNotMatch(readFileSync("components/shell.tsx", "utf8"), /href: "\/admin\/journeys"/);
    for (const path of ["app/(portal)/employee/page.tsx", "app/(portal)/employee/attendance/page.tsx"]) assert.doesNotMatch(readFileSync(path, "utf8"), /LocationPinger/);
    const listeners: Record<string, (event: any) => void> = {};
    const deleted: string[] = [];
    let cacheWrites = 0, fetched = 0, claimed = false;
    const cache = { addAll: async () => undefined, match: async () => undefined, put: () => { cacheWrites++; } };
    runInNewContext(readFileSync("public/sw.js", "utf8"), {
      self: { location: { origin: "https://crk.peoplenexa.in" }, addEventListener: (type: string, fn: (event: any) => void) => { listeners[type] = fn; }, skipWaiting() {}, clients: { claim: async () => { claimed = true; } } },
      caches: { open: async () => cache, keys: async () => ["peoplenexa-v6", "unrelated-cache"], delete: async (key: string) => { deleted.push(key); } },
      fetch: async () => { fetched++; return new Response("private employee page"); }, URL, Response,
    });
    let wait: Promise<unknown> = Promise.resolve();
    listeners.activate({ waitUntil: (promise: Promise<unknown>) => { wait = promise; } }); await wait;
    assert.deepEqual(deleted, ["peoplenexa-v6"]); assert.equal(claimed, true);
    listeners.fetch({ request: { method: "GET", url: "https://crk.peoplenexa.in/employee/payslips", mode: "navigate" }, respondWith: (promise: Promise<unknown>) => { wait = promise; } }); await wait;
    assert.equal(fetched, 1); assert.equal(cacheWrites, 0, "private employee HTML never enters offline cache");
    let intercepted = false;
    listeners.fetch({ request: { method: "GET", url: "https://crk.peoplenexa.in/api/notifications", mode: "cors" }, respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false, "APIs bypass the service worker cache");
    console.log("ESS: ID login, temporary-password gate, reset/change session invalidation, inactive/duplicate protections, disabled GPS collector and PWA assets passed.");
  } finally {
    headers.cookies = originalCookies;
    prisma.employee.findFirst = originals.findFirst; prisma.employee.findUnique = originals.findUnique; prisma.employee.findMany = originals.findMany; prisma.employee.count = originals.count; prisma.employee.update = originals.update; prisma.employee.updateMany = originals.updateMany; prisma.tenant.findUnique = originals.tenant; prisma.auditLog.create = originals.audit; prisma.$transaction = originals.transaction;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
