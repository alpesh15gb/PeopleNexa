// Demo seed: creates the "Apex Integrations" tenant with branches, departments,
// shifts, employees, attendance history, leaves and holidays.
//
// Run with: node prisma/seed.ts  (Node 24 runs TS natively)
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { hashPassword } from "../lib/auth";
import { startOfDay, addDays } from "../lib/dates";
import { istStartOfDay } from "../lib/ist";
import { reconcileEmployeeDay, isFinalizable } from "../lib/reconcile";
import { MODULES, planFor } from "../lib/modules";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction) {
    if (process.env.ALLOW_DESTRUCTIVE_SEED !== "true") {
      throw new Error("Refusing destructive demo seed in production. Set ALLOW_DESTRUCTIVE_SEED=true only for an intentional disposable environment.");
    }
    const superadminPassword = process.env.SUPERADMIN_PASSWORD ?? "";
    const adminPassword = process.env.DEMO_ADMIN_PASSWORD ?? "";
    const employeePassword = process.env.DEMO_EMPLOYEE_PASSWORD ?? "";
    if (superadminPassword.length < 16 || adminPassword.length < 16 || employeePassword.length < 16) {
      throw new Error("Production demo seed requires SUPERADMIN_PASSWORD, DEMO_ADMIN_PASSWORD, and DEMO_EMPLOYEE_PASSWORD of at least 16 characters.");
    }
  }
  console.log("Seeding demo data…");

  // Wipe everything for a clean demo (dev only).
  await prisma.assetAssignment.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.punch.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.employeeLoan.deleteMany();
  await prisma.punchCorrection.deleteMany();
  await prisma.expenseClaim.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.leaveType.deleteMany();
  await prisma.locationPing.deleteMany();
  await prisma.document.deleteMany();
  await prisma.reviewFeedback.deleteMany();
  await prisma.reviewScore.deleteMany();
  await prisma.performanceReview.deleteMany();
  await prisma.kpi.deleteMany();
  await prisma.ticketMessage.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.orgComment.deleteMany();
  await prisma.orgPost.deleteMany();
  await prisma.policy.deleteMany();
  await prisma.rosterAssignment.deleteMany();
  await prisma.onboardingTask.deleteMany();
  await prisma.exitRequest.deleteMany();
  await prisma.webhookEndpoint.deleteMany();
  await prisma.payrollAdjustment.deleteMany();
  await prisma.taxDeclaration.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.department.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.tenantModule.deleteMany();
  await prisma.license.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.superAdmin.deleteMany();

  // ── Super admin (platform operator) ─────────────────────────────────────
  const superAdminPassword = await hashPassword(process.env.SUPERADMIN_PASSWORD ?? "superadmin123");
  await prisma.superAdmin.create({
    data: {
      name: "Platform Owner",
      email: process.env.SUPERADMIN_EMAIL ?? "superadmin@peoplenexa.in",
      password: superAdminPassword,
    },
  });

  // ── Tenant ────────────────────────────────────────────────────────────────
  // Subdomain slug "crk" → crk.localhost:3000 locally / crk.peoplenexa.in in prod.
  const company = await prisma.tenant.create({
    data: {
      name: "Apex Integrations",
      code: "CP26080012",
      slug: "crk",
      email: "alpesh2060@gmail.com",
      phone: "9100960692",
      status: "active",
      plan: "pro",
      seats: planFor("pro").seats,
      subscriptionExpiry: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      config: {},
    },
  });

  // All modules enabled for the demo tenant + a license record.
  await prisma.tenantModule.createMany({
    data: MODULES.map((m) => ({
      tenantId: company.id,
      module: m.key,
      enabled: planFor("pro").modules.includes(m.key),
    })),
  });
  await prisma.license.create({
    data: {
      tenantId: company.id,
      plan: "pro",
      seats: planFor("pro").seats,
      expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      note: "Demo tenant (pro plan)",
      createdBy: "seed",
    },
  });

  // ── Branches ─────────────────────────────────────────────────────────────
  // Main Branch geofenced around a real office coordinate (Ahmedabad, India).
  const mainBranch = await prisma.branch.create({
    data: {
      tenantId: company.id,
      name: "Main Branch",
      code: "MAIN",
      address: "S.G. Highway, Ahmedabad, Gujarat",
      latitude: 23.0454,
      longitude: 72.5418,
      geofenceRadius: 200,
      isDefault: true,
    },
  });
  const vatvaBranch = await prisma.branch.create({
    data: {
      tenantId: company.id,
      name: "Vatva Plant",
      code: "VATVA",
      address: "Vatva GIDC, Ahmedabad, Gujarat",
      latitude: 22.9573,
      longitude: 72.6223,
      geofenceRadius: 300,
    },
  });

  // ── Departments ──────────────────────────────────────────────────────────
  const hr = await prisma.department.create({
    data: { tenantId: company.id, name: "Human Resources", description: "People operations" },
  });
  const it = await prisma.department.create({
    data: { tenantId: company.id, name: "Information Technology", description: "Engineering & product" },
  });
  const sales = await prisma.department.create({
    data: { tenantId: company.id, name: "Sales", description: "Revenue team" },
  });

  // ── Shifts ───────────────────────────────────────────────────────────────
  const general = await prisma.shift.create({
    data: { tenantId: company.id, name: "General Shift", code: "GEN", startTime: "09:00", endTime: "18:00", graceMinutes: 15, isDefault: true },
  });
  const night = await prisma.shift.create({
    data: { tenantId: company.id, name: "Night Shift", code: "NIGHT", startTime: "22:00", endTime: "06:00", graceMinutes: 10, isNightShift: true },
  });

  // ── Leave types ──────────────────────────────────────────────────────────
  await prisma.leaveType.createMany({
    data: [
      { tenantId: company.id, name: "Casual Leave", code: "CL", maxDays: 12, color: "#3b82f6" },
      { tenantId: company.id, name: "Sick Leave", code: "SL", maxDays: 10, color: "#f59e0b" },
      { tenantId: company.id, name: "Privilege Leave", code: "PL", maxDays: 15, color: "#10b981", encashable: true },
      { tenantId: company.id, name: "Comp Off", code: "CO", maxDays: 6, color: "#a78bfa" },
    ],
  });

  // ── Holidays ─────────────────────────────────────────────────────────────
  await prisma.holiday.createMany({
    data: [
      { tenantId: company.id, name: "Independence Day", date: startOfDay(new Date(2026, 7, 15)) },
      { tenantId: company.id, name: "Gandhi Jayanti", date: startOfDay(new Date(2026, 9, 2)) },
      { tenantId: company.id, name: "Diwali", date: startOfDay(new Date(2026, 10, 8)) },
      { tenantId: company.id, name: "Holi (half day)", date: startOfDay(new Date(2026, 2, 4)), isHalfDay: true },
    ],
  });

  // ── Biometric devices (demo) ────────────────────────────────────────────
  await prisma.device.createMany({
    data: [
      {
        tenantId: company.id,
        name: "Main Entrance — Fingerprint",
        serialNumber: "ESLDEMO0001",
        ipAddress: "192.168.1.50",
        type: "biometric",
        protocol: "attlog",
        lastSeenAt: new Date(),
        config: {},
      },
      {
        tenantId: company.id,
        name: "Vatva Plant — Face Reader",
        serialNumber: "ESLDEMO0002",
        ipAddress: "192.168.2.40",
        type: "face",
        protocol: "json",
        lastSeenAt: new Date(Date.now() - 45 * 60 * 1000),
        config: {},
      },
      {
        tenantId: company.id,
        name: "Warehouse — Card Reader",
        serialNumber: "ESLDEMO0003",
        ipAddress: "192.168.3.12",
        type: "card",
        protocol: "attlog",
        status: "offline",
        lastSeenAt: new Date(Date.now() - 3 * 24 * 3600 * 1000),
        config: {},
      },
    ],
  });

  // ── Employees ────────────────────────────────────────────────────────────
  const password = await hashPassword(process.env.DEMO_ADMIN_PASSWORD ?? "admin123");
  const empPassword = await hashPassword(process.env.DEMO_EMPLOYEE_PASSWORD ?? "emp123");

  const admin = await prisma.employee.create({
    data: {
      tenantId: company.id,
      employeeNumber: "ADM-001",
      firstName: "Admin",
      lastName: "Apex",
      email: "admin@apex.com",
      phone: "9100960692",
      password,
      role: "admin",
      position: "Managing Director",
      salary: 95000,
      joiningDate: startOfDay(new Date(2025, 3, 1)),
      branchId: mainBranch.id,
      departmentId: hr.id,
      shiftId: general.id,
      bankName: "HDFC Bank",
      accountNumber: "50100234567890",
      ifscCode: "HDFC0000123",
    },
  });

  const roster: Array<{
    first: string; last: string; email: string; num: string; dept: typeof it; branch: typeof mainBranch; shift: typeof general; pos: string; salary: number; join: Date;
  }> = [
    { first: "Rahul", last: "Sharma", email: "rahul@apex.com", num: "EMP-001", dept: it, branch: mainBranch, shift: general, pos: "Senior Engineer", salary: 85000, join: new Date(2025, 5, 15) },
    { first: "Priya", last: "Patel", email: "priya@apex.com", num: "EMP-002", dept: sales, branch: mainBranch, shift: general, pos: "Sales Lead", salary: 70000, join: new Date(2025, 7, 1) },
    { first: "Amit", last: "Desai", email: "amit@apex.com", num: "EMP-003", dept: it, branch: mainBranch, shift: night, pos: "DevOps Engineer", salary: 90000, join: new Date(2025, 8, 20) },
    { first: "Neha", last: "Gupta", email: "neha@apex.com", num: "EMP-004", dept: hr, branch: vatvaBranch, shift: general, pos: "HR Executive", salary: 55000, join: new Date(2025, 10, 5) },
    { first: "Vikram", last: "Singh", email: "vikram@apex.com", num: "EMP-005", dept: sales, branch: vatvaBranch, shift: general, pos: "Account Manager", salary: 60000, join: new Date(2026, 0, 10) },
  ];

  const employees = [admin];
  for (const r of roster) {
    const emp = await prisma.employee.create({
      data: {
        tenantId: company.id,
        employeeNumber: r.num,
        firstName: r.first,
        lastName: r.last,
        email: r.email,
        phone: `9${String(Math.floor(100000000 + Math.random() * 899999999))}`,
        password: empPassword,
        role: "employee",
        position: r.pos,
        salary: r.salary,
        joiningDate: startOfDay(r.join),
        branchId: r.branch.id,
        departmentId: r.dept.id,
        shiftId: r.shift.id,
        bankName: "HDFC Bank",
        accountNumber: `50100${String(Math.floor(10000000 + Math.random() * 89999999))}`,
        ifscCode: "HDFC0000123",
      },
    });
    employees.push(emp);
  }

  // ── Org chart: reporting lines ────────────────────────────────────────────
  const empByNum = (num: string) => employees.find((e) => e.employeeNumber === num)!;
  await prisma.employee.update({ where: { id: empByNum("EMP-001").id }, data: { managerId: admin.id } });
  await prisma.employee.update({ where: { id: empByNum("EMP-002").id }, data: { managerId: admin.id } });
  await prisma.employee.update({ where: { id: empByNum("EMP-003").id }, data: { managerId: admin.id } });
  await prisma.employee.update({ where: { id: empByNum("EMP-004").id }, data: { managerId: admin.id } });
  await prisma.employee.update({ where: { id: empByNum("EMP-005").id }, data: { managerId: empByNum("EMP-002").id } });

  // ── Rosters: this week's schedule (drives auto punch-out) ─────────────────
  const now = new Date();
  const weekMonday = addDays(now, -((now.getDay() + 6) % 7));
  for (let d = 0; d < 7; d++) {
    const day = addDays(weekMonday, d);
    if (day.getDay() === 0) continue; // Sunday off
    const rows = employees.slice(1).map((emp) => ({
      tenantId: company.id,
      employeeId: emp.id,
      shiftId: emp.shiftId === night.id ? night.id : general.id,
      date: istStartOfDay(day),
      createdBy: admin.id,
      note: emp.shiftId === night.id ? "Night rotation" : "Standard week",
    }));
    await prisma.rosterAssignment.createMany({ data: rows });
  }

  // ── Attendance history (last 30 days) ────────────────────────────────────
  // Seeded days go through the same path as live punches: immutable Punch rows
  // first, then reconcileEmployeeDay derives the Attendance view (in/out/
  // status + punch snapshot). This keeps the admin punch-correction modal,
  // lazy finalization and reports consistent with real clock-ins — writing
  // Attendance rows directly here used to leave them punch-less, so
  // finalizeEligibleDays would silently delete every seeded day on the first
  // page load.
  const today = startOfDay(new Date());
  const lateEmployees = new Set(["EMP-003", "EMP-005"]);
  const random = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

  const tenant = await prisma.tenant.findUnique({ where: { id: company.id } });
  let punches = 0;
  for (let i = 29; i >= 0; i--) {
    const day = addDays(today, -i);
    if (day.getDay() === 0) continue; // skip Sundays
    for (const emp of employees.slice(1)) {
      // ~8% chance of a genuine absence
      if (Math.random() < 0.08) continue;

      const branch = emp.branchId === vatvaBranch.id ? vatvaBranch : mainBranch;
      const shift = emp.shiftId === night.id ? night : general;
      const isLate = lateEmployees.has(emp.employeeNumber) && Math.random() < 0.35;

      const startParts = shift.startTime.split(":").map(Number);
      const base = new Date(day);
      base.setHours(startParts[0], startParts[1], 0, 0);
      let punchIn = new Date(base);
      punchIn.setMinutes(punchIn.getMinutes() + (isLate ? random(20, 55) : random(-10, 5)));

      const endParts = shift.endTime.split(":").map(Number);
      let punchOut = new Date(day);
      punchOut.setHours(endParts[0], endParts[1], 0, 0);
      if (shift.isNightShift) punchOut = addDays(punchOut, 1);
      punchOut.setMinutes(punchOut.getMinutes() + random(0, 40));

      await prisma.punch.createMany({
        data: [
          {
            tenantId: company.id,
            employeeId: emp.id,
            source: "seed",
            punchTime: punchIn,
            inOutHint: "in",
            lat: branch.latitude,
            lng: branch.longitude,
          },
          {
            tenantId: company.id,
            employeeId: emp.id,
            source: "seed",
            punchTime: punchOut,
            inOutHint: "out",
            lat: branch.latitude,
            lng: branch.longitude,
          },
        ],
      });
      await reconcileEmployeeDay(
        tenant ?? { id: company.id, config: null },
        { id: emp.id, shiftId: emp.shiftId, tenantId: company.id, branchId: emp.branchId },
        day,
        { finalize: isFinalizable(day, undefined, shift) }
      );
      punches++;
    }
  }

  // ── Payslips (previous month) ────────────────────────────────────────────
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;
  for (const emp of employees) {
    const salary = emp.salary ?? 50000;
    const allowances = Math.round(salary * 0.12);
    const deductions = Math.round(salary * 0.1);
    await prisma.payslip.create({
      data: {
        tenantId: company.id,
        employeeId: emp.id,
        month: lastMonthKey,
        baseSalary: salary,
        basicSalary: Math.round(salary * 0.5),
        allowances,
        deductions,
        netSalary: salary + allowances - deductions,
        status: emp.employeeNumber === "ADM-001" ? "draft" : "paid",
      },
    });
  }

  // ── Leave requests ───────────────────────────────────────────────────────
  const cl = await prisma.leaveType.findFirst({ where: { tenantId: company.id, code: "CL" } });
  const sl = await prisma.leaveType.findFirst({ where: { tenantId: company.id, code: "SL" } });
  const pl = await prisma.leaveType.findFirst({ where: { tenantId: company.id, code: "PL" } });

  const priya = employees.find((e) => e.employeeNumber === "EMP-002")!;
  const vikram = employees.find((e) => e.employeeNumber === "EMP-005")!;
  const rahul = employees.find((e) => e.employeeNumber === "EMP-001")!;
  const neha = employees.find((e) => e.employeeNumber === "EMP-004")!;

  await prisma.leaveRequest.createMany({
    data: [
      // approved history
      {
        tenantId: company.id, employeeId: rahul.id, leaveTypeId: cl!.id,
        fromDate: addDays(today, -14), toDate: addDays(today, -14), days: 1,
        reason: "Personal work", status: "approved", appliedAt: addDays(today, -20), reviewedAt: addDays(today, -19), reviewedBy: admin.id,
      },
      {
        tenantId: company.id, employeeId: priya.id, leaveTypeId: sl!.id,
        fromDate: addDays(today, -8), toDate: addDays(today, -7), days: 2,
        reason: "Viral fever", status: "approved", appliedAt: addDays(today, -9), reviewedAt: addDays(today, -8), reviewedBy: admin.id,
      },
      // pending
      {
        tenantId: company.id, employeeId: vikram.id, leaveTypeId: pl!.id,
        fromDate: addDays(today, 6), toDate: addDays(today, 10), days: 5,
        reason: "Family vacation", status: "pending", appliedAt: addDays(today, -1),
      },
      {
        tenantId: company.id, employeeId: priya.id, leaveTypeId: cl!.id,
        fromDate: addDays(today, 3), toDate: addDays(today, 3), days: 1,
        reason: "Doctor appointment", status: "pending", appliedAt: addDays(today, -2),
      },
    ],
  });

  // ── Loans & advances ─────────────────────────────────────────────────────
  // Demo: one salary advance with fixed EMIs, one laptop loan. Payroll
  // generation auto-deducts `emiAmount` from each monthly payslip until the
  // outstanding balance reaches zero (then the loan is marked closed).
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  await prisma.employeeLoan.createMany({
    data: [
      {
        tenantId: company.id,
        employeeId: rahul.id,
        type: "advance",
        amount: 20000,
        outstanding: 15000,
        emiCount: 4,
        emiAmount: 5000,
        startMonth: currentMonth,
        note: "Salary advance for home repair",
      },
      {
        tenantId: company.id,
        employeeId: neha.id,
        type: "loan",
        amount: 45000,
        outstanding: 45000,
        emiCount: 6,
        emiAmount: 7500,
        startMonth: currentMonth,
        note: "Laptop loan — 6 monthly instalments",
      },
    ],
  });

  // ── Assets (asset tracking) ───────────────────────────────────────────────
  const assetData = [
    { name: "MacBook Pro 14\"", category: "laptop", tag: "AST-001", serialNumber: "C02XK3D2JGH5", value: 185000, purchaseDate: new Date(2025, 5, 10), status: "available" },
    { name: "ThinkPad X1 Carbon", category: "laptop", tag: "AST-002", serialNumber: "PF3X1A2B", value: 145000, purchaseDate: new Date(2025, 8, 2), status: "available" },
    { name: "iPhone 15", category: "phone", tag: "AST-003", serialNumber: "F2LWK4N5", value: 78000, purchaseDate: new Date(2025, 10, 15), status: "available" },
    { name: "OnePlus Nord CE", category: "phone", tag: "AST-004", serialNumber: "OP-NC-8891", value: 24000, purchaseDate: new Date(2026, 1, 20), status: "available" },
    { name: "Company ID Card", category: "id_card", tag: "AST-005", value: 500, purchaseDate: new Date(2026, 0, 12), status: "available" },
    { name: "Tata Nexon EV (pool car)", category: "vehicle", tag: "AST-006", serialNumber: "GJ01AB1234", value: 1200000, purchaseDate: new Date(2025, 3, 5), status: "available" },
    { name: "ZKTeco Biometric Device", category: "device", tag: "AST-007", serialNumber: "ZK-44982011", value: 42000, purchaseDate: new Date(2024, 11, 1), status: "maintenance" },
    { name: "Ergonomic Desk Chair", category: "furniture", tag: "AST-008", value: 12500, purchaseDate: new Date(2025, 6, 25), status: "available" },
  ];
  const assets: Array<{ id: string; tag: string }> = [];
  for (const a of assetData) {
    const created = await prisma.asset.create({
      data: { tenantId: company.id, ...a },
    });
    assets.push({ id: created.id, tag: created.tag! });
  }

  // Issue a few assets to employees (history + one open assignment each)
  const byTag = (tag: string) => assets.find((a) => a.tag === tag)!;
  const assign = async (tag: string, empId: string, daysAgo: number, note?: string) => {
    await prisma.assetAssignment.create({
      data: {
        assetId: byTag(tag).id,
        employeeId: empId,
        assignedAt: addDays(today, -daysAgo),
        assignedBy: admin.id,
        note,
      },
    });
    await prisma.asset.update({ where: { id: byTag(tag).id }, data: { status: "assigned" } });
  };
  await assign("AST-001", rahul.id, 95, "Primary work laptop");
  await assign("AST-002", priya.id, 40, "Sales team laptop");
  await assign("AST-003", neha.id, 60, "HR field use");
  await assign("AST-005", vikram.id, 210, "Gate access + identity");

  // One returned (closed) assignment for history
  await prisma.assetAssignment.create({
    data: {
      assetId: byTag("AST-004").id,
      employeeId: neha.id,
      assignedAt: addDays(today, -50),
      returnedAt: addDays(today, -20),
      assignedBy: admin.id,
      note: "Temporary replacement while iPhone was in service",
    },
  });

  // ── Punch corrections & expense claims (demo) ────────────────────────────
  await prisma.punchCorrection.createMany({
    data: [
      {
        tenantId: company.id,
        employeeId: rahul.id,
        date: addDays(today, -3),
        currentIn: null,
        currentOut: null,
        requestedIn: new Date(addDays(today, -3).setHours(9, 5, 0, 0)),
        requestedOut: new Date(addDays(today, -3).setHours(18, 20, 0, 0)),
        reason: "Phone died — could not clock in from the site.",
        status: "pending",
      },
      {
        tenantId: company.id,
        employeeId: vikram.id,
        date: addDays(today, -6),
        currentIn: new Date(addDays(today, -6).setHours(9, 40, 0, 0)),
        currentOut: new Date(addDays(today, -6).setHours(18, 10, 0, 0)),
        requestedIn: new Date(addDays(today, -6).setHours(9, 2, 0, 0)),
        requestedOut: new Date(addDays(today, -6).setHours(18, 10, 0, 0)),
        reason: "Device clock was 35 minutes ahead; actual arrival was on time.",
        status: "approved",
        reviewedBy: admin.id,
        reviewedAt: addDays(today, -5),
      },
    ],
  });

  await prisma.expenseClaim.createMany({
    data: [
      {
        tenantId: company.id,
        employeeId: vikram.id,
        title: "Client visit — cab fare",
        category: "travel",
        amount: 850,
        description: "Cab to client site in Vatva and back.",
        status: "pending",
      },
      {
        tenantId: company.id,
        employeeId: neha.id,
        title: "Team lunch — onboarding",
        category: "food",
        amount: 2400,
        description: "New joiner team lunch.",
        status: "approved",
        reviewedBy: admin.id,
        reviewedAt: addDays(today, -2),
      },
      {
        tenantId: company.id,
        employeeId: rahul.id,
        title: "Mobile recharge — work sim",
        category: "mobile",
        amount: 499,
        description: "Monthly work number recharge.",
        status: "settled",
        reviewedBy: admin.id,
        reviewedAt: addDays(today, -10),
        settledAt: addDays(today, -9),
      },
    ],
  });

  // ── Notifications ────────────────────────────────────────────────────────
  await prisma.notification.createMany({
    data: [
      {
        tenantId: company.id, employeeId: vikram.id, type: "warning",
        title: "Late arrival", message: "You've been marked late 3 times this month.",
      },
      {
        tenantId: company.id, employeeId: rahul.id, type: "success",
        title: "Leave approved", message: "Your Casual Leave for Aug 4 was approved.",
      },
    ],
  });

  // ── Journey tracker: demo GPS route for the field rep (today) ────────────
  const route = [
    [23.0225, 72.5714], [23.0286, 72.5778], [23.0351, 72.5865], [23.0412, 72.5941],
    [23.0337, 72.6012], [23.0258, 72.5968], [23.0192, 72.5884], [23.0127, 72.5819],
  ] as const;
  await prisma.locationPing.createMany({
    data: route.map(([lat, lng], i) => ({
      tenantId: company.id,
      employeeId: rahul.id,
      lat,
      lng,
      accuracy: 12 + (i % 3) * 4,
      at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9 + Math.floor(i / 2), (i % 2) * 30, 0),
    })),
  });

  // ── Documents (expiry alerts) ────────────────────────────────────────────
  await prisma.document.createMany({
    data: [
      {
        tenantId: company.id, employeeId: vikram.id, name: "Passport", docType: "passport",
        number: "P8172003", expiryDate: addDays(today, 21), notes: "Renewal reminder sent.",
      },
      {
        tenantId: company.id, employeeId: rahul.id, name: "Work visa", docType: "visa",
        number: "V9921", expiryDate: addDays(today, -10), notes: "Overdue — escalate with HR.",
      },
      {
        tenantId: company.id, employeeId: neha.id, name: "Aadhaar card", docType: "aadhaar",
        number: "2345 6789 0123",
      },
    ],
  });

  // ── Performance: KPIs, a live review + 360° feedback ─────────────────────
  const kpiRows = await Promise.all(
    [
      { name: "Attendance regularity", category: "core", description: "Consistent on-time attendance" },
      { name: "Task completion", category: "core", description: "Delivering assigned work on time" },
      { name: "Team collaboration", category: "behavior", description: "Helping teammates and communicating" },
      { name: "Client satisfaction", category: "skill", description: "Field client feedback" },
    ].map((k) =>
      prisma.kpi.create({ data: { tenantId: company.id, ...k } })
    )
  );
  const review = await prisma.performanceReview.create({
    data: {
      tenantId: company.id,
      employeeId: rahul.id,
      reviewerId: admin.id,
      period: "Q3 2026",
      status: "self_done",
      selfSummary: "Covered the west-zone client visits and met most weekly targets.",
      scores: { create: kpiRows.map((k, i) => ({ kpiId: k.id, selfScore: [4, 3, 4, 5][i] })) },
    },
  });
  await prisma.reviewFeedback.create({
    data: {
      reviewId: review.id,
      raterId: vikram.id,
      comment: "Reliable on field visits, always shares client notes promptly.",
      rating: 4,
    },
  });

  // ── Helpdesk: two tickets with a thread ──────────────────────────────────
  const ticket1 = await prisma.ticket.create({
    data: {
      tenantId: company.id,
      requesterId: rahul.id,
      assigneeId: admin.id,
      subject: "Can't log into biometric device",
      description: "Fingerprint reader not registering since Monday at the Vatva site.",
      category: "device",
      priority: "high",
      status: "in_progress",
    },
  });
  await prisma.ticketMessage.createMany({
    data: [
      { ticketId: ticket1.id, senderId: admin.id, body: "Tried a remote resync — please try again in 10 minutes." },
      { ticketId: ticket1.id, senderId: rahul.id, body: "Still failing. Should I switch to the mobile app in the meantime?" },
    ],
  });
  await prisma.ticket.create({
    data: {
      tenantId: company.id,
      requesterId: neha.id,
      subject: "Payslip discrepancy for last month",
      description: "TDS shown seems higher than expected for my bracket.",
      category: "payroll",
      priority: "medium",
    },
  });

  // ── Org feed: an announcement + a post with a comment ────────────────────
  const post1 = await prisma.orgPost.create({
    data: {
      tenantId: company.id,
      authorId: admin.id,
      body: "📢 From next month office timings move to 9:30 AM – 6:30 PM. Weekend shifts unchanged.",
      isAnnouncement: true,
    },
  });
  const post2 = await prisma.orgPost.create({
    data: {
      tenantId: company.id,
      authorId: neha.id,
      body: "Great onboarding session today — welcome aboard, team! 🎉",
    },
  });
  await prisma.orgComment.create({
    data: { postId: post2.id, authorId: vikram.id, body: "Welcome indeed! Let's grab lunch Friday." },
  });

  // ── Policies ─────────────────────────────────────────────────────────────
  await prisma.policy.createMany({
    data: [
      {
        tenantId: company.id, title: "Attendance policy", category: "attendance", createdBy: admin.id,
        body: "All employees must clock in within the shift's grace period. Missed punches require a regularization request within 48 hours. More than 3 unregularized misses in a month may lead to disciplinary review.",
      },
      {
        tenantId: company.id, title: "Leave policy", category: "leave", createdBy: admin.id,
        body: "Privilege leave accrues at 1.5 days per month. Apply at least 3 days in advance for planned leave. Sick leave needs a doctor's note for stays over 2 days.",
      },
      {
        tenantId: company.id, title: "Field expenses", category: "payroll", createdBy: admin.id,
        body: "Claim field expenses within 7 days of incurring them. Receipts above ₹500 are mandatory. Travel claims require client/site visit purpose.",
      },
    ],
  });

  // ── Onboarding checklists (demo) ─────────────────────────────────────────
  await prisma.onboardingTask.createMany({
    data: [
      { tenantId: company.id, employeeId: vikram.id, name: "Submit PAN card", status: "done", createdBy: admin.id, completedAt: addDays(today, -5) },
      { tenantId: company.id, employeeId: vikram.id, name: "Share bank account details (bank file)", status: "done", createdBy: admin.id, completedAt: addDays(today, -4) },
      { tenantId: company.id, employeeId: vikram.id, name: "Issue ID card / access badge", status: "pending", createdBy: admin.id, dueBy: addDays(today, 3) },
      { tenantId: company.id, employeeId: vikram.id, name: "Assign laptop & assets", status: "pending", createdBy: admin.id, dueBy: addDays(today, 7) },
      { tenantId: company.id, employeeId: neha.id, name: "Add to company WhatsApp / HR group", status: "pending", createdBy: admin.id },
    ],
  });

  // ── Exit request (demo: pending resignation) ─────────────────────────────
  const amit = empByNum("EMP-003");
  await prisma.exitRequest.create({
    data: {
      tenantId: company.id,
      employeeId: amit.id,
      reason: "Relocating to Pune — personal family reasons",
      resignationDate: addDays(today, -2),
      lastWorkingDay: addDays(today, 28),
      status: "pending",
    },
  });

  // ── Webhook endpoint (demo) ──────────────────────────────────────────────
  await prisma.webhookEndpoint.create({
    data: {
      tenantId: company.id,
      name: "ERP sync (demo)",
      url: "https://hooks.example.com/peoplenexa",
      events: "punch.created,leave.approved,expense.created",
      secret: "demo-secret-do-not-use",
      active: true,
    },
  });

  // ── Tenant config: auto punch-out + payroll statutory (LWF on for Gujarat) ─
  const cfg = (company.config ?? {}) as Record<string, unknown>;
  const punchesCfg = (cfg.punches ?? {}) as Record<string, unknown>;
  const payrollCfg = (cfg.payroll ?? {}) as Record<string, unknown>;
  await prisma.tenant.update({
    where: { id: company.id },
    data: {
      config: {
        ...cfg,
        punches: { ...punchesCfg, autoOut: { enabled: true, minutesAfterStart: 570 } },
        payroll: {
          ...payrollCfg,
          basicPercent: 50,
          allowancesPercent: 12,
          lateFinePerLateDay: 50,
          otMultiplier: 1.5,
          pt: { enabled: true, state: "Gujarat" },
          lwf: { enabled: true },
          tds: { enabled: true, regime: "new" },
        },
      },
    },
  });

  // ── Tax declaration (demo: Rahul, verified) ──────────────────────────────
  const fy = `${new Date().getFullYear()}-${String(new Date().getFullYear() + 1).slice(2)}`;
  await prisma.taxDeclaration.create({
    data: {
      tenantId: company.id,
      employeeId: rahul.id,
      fy,
      sections: { "80c": 150000, "80d": 25000, hra: 0, lta: 0, other: 50000, total: 225000 } as object,
      status: "verified",
      note: "Proofs checked by HR",
    },
  });

  // ── Manual adjustment (demo: Priya, current month arrears) ───────────────
  const month = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  await prisma.payrollAdjustment.create({
    data: {
      tenantId: company.id,
      employeeId: priya.id,
      month,
      type: "arrears",
      label: "July revision arrears",
      amount: 4000,
      note: "Salary revision effective July 1",
      createdBy: admin.id,
    },
  });

  // ── Pay mode demo: Neha is paid hourly ───────────────────────────────────
  await prisma.employee.update({
    where: { id: neha.id },
    data: { payMode: "hourly", salary: 350, workBasisRate: null },
  });

  console.log(`✅ Seeded: ${company.name} (${company.code}) @ ${company.slug}.peoplenexa.in`);
  console.log(`   ${employees.length} employees · ${punches} attendance punches · 4 leave types · 2 branches · 3 departments · ${assets.length} assets · 1 device`);
  console.log("");
  console.log("   Admin login:     admin@apex.com / [configured password]");
  console.log("   Employee:        rahul@apex.com / [configured password]");
  console.log("   Super admin:     [configured email] / [configured password]");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
