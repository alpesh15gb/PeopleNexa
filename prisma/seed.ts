// Demo seed: creates the "Apex Integrations" tenant with branches, departments,
// shifts, employees, attendance history, leaves and holidays.
//
// Run with: node prisma/seed.ts  (Node 24 runs TS natively)
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { hashPassword } from "../lib/auth";
import { startOfDay, addDays } from "../lib/dates";
import { reconcileEmployeeDay, isFinalizable } from "../lib/reconcile";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding demo data…");

  // Wipe everything for a clean demo (dev only).
  await prisma.assetAssignment.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.punch.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.employeeLoan.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.leaveType.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.department.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.tenant.deleteMany();

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
      config: {},
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
      { tenantId: company.id, name: "Privilege Leave", code: "PL", maxDays: 15, color: "#10b981" },
      { tenantId: company.id, name: "Comp Off", code: "CO", maxDays: 6, color: "#a78bfa" },
    ],
  });

  // ── Holidays ─────────────────────────────────────────────────────────────
  await prisma.holiday.createMany({
    data: [
      { tenantId: company.id, name: "Independence Day", date: startOfDay(new Date(2026, 7, 15)) },
      { tenantId: company.id, name: "Gandhi Jayanti", date: startOfDay(new Date(2026, 9, 2)) },
      { tenantId: company.id, name: "Diwali", date: startOfDay(new Date(2026, 10, 8)) },
    ],
  });

  // ── Biometric device (demo) ──────────────────────────────────────────────
  await prisma.device.create({
    data: {
      tenantId: company.id,
      name: "Main Entrance — Fingerprint",
      serialNumber: "ESLDEMO0001",
      ipAddress: "192.168.1.50",
      type: "biometric",
      protocol: "attlog",
      config: {},
    },
  });

  // ── Employees ────────────────────────────────────────────────────────────
  const password = await hashPassword("admin123");
  const empPassword = await hashPassword("emp123");

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

  console.log(`✅ Seeded: ${company.name} (${company.code}) @ ${company.slug}.peoplenexa.in`);
  console.log(`   ${employees.length} employees · ${punches} attendance punches · 4 leave types · 2 branches · 3 departments · ${assets.length} assets · 1 device`);
  console.log("");
  console.log("   Admin login:  admin@apex.com / admin123");
  console.log("   Employee:     rahul@apex.com / emp123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
