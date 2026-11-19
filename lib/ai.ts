import { prisma } from "./prisma";
import { dayRangeIST, formatDate, monthKeyIST } from "./dates";
import { holidaysForAttendanceDay } from "./attendance-tally";
import { authorizedPunchDayFilter } from "./attendance-presence";
import { getTenantAccess } from "./modules-server";
import { workspaceRegion } from "./workspace-region";
import { dateKeyInTimeZone, formatWorkspaceTime, timeZoneDayRange } from "./workspace-time";
import { financialExportPayslipFilter } from "./payroll-reporting";
import { countsAsLeaveDay } from "./leave-calendar";
import { attendanceRequiresReview } from "./attendance-validation";

/**
 * "Ask AI" — a deterministic natural-language engine over the tenant's data.
 * No external model: it parses intents from the question and answers from the
 * live database. Every answer is a sentence + structured rows for the UI.
 */

export type AiResult = {
  answer: string;
  data?: Record<string, unknown>[];
  columns?: string[];
  tone: "info" | "success" | "warning" | "danger";
};

const TOTAL_EMPLOYEES = /(how many|total|count|number of).*(employee|staff|people|team)/i;
const PRESENT_TODAY = /(who|how many).*(present|clocked in|checked in|working).*(today|now)?/i;
const ABSENT_TODAY = /(who|how many).*(absent|missing|not here|didn'?t come).*(today)?/i;
const LATE_TODAY = /(who|how many).*(late|delayed).*(today)?/i;
const PENDING_LEAVES = /(pending|open|waiting).*(leave|request)|(leave|request).*(pending|open|waiting)/i;
const LEAVE_TODAY = /(who|how many).*(on leave|leave today|off today)/i;
const EXPENSES = /(expense|reimbursement|claim)/i;
const OVERTIME = /(overtime|ot hours|extra hours)/i;
const HOLIDAYS = /(holiday|holidays|public holiday|upcoming holiday)/i;
const PAYROLL = /(payroll|salary|payslip|paid|salaries)/i;
const LOANS = /\b(?:loans?|advances?)\b/i;
const EMPLOYEE_LOOKUP = /(how is|status of|attendance of|report of|about)\s+([a-z]+)/i;
const questions = [
  { intent: "pending-leave", match: PENDING_LEAVES, module: "leaves" },
  { intent: "leave-today", match: LEAVE_TODAY, module: "leaves" },
  { intent: "expenses", match: EXPENSES, module: "expenses" },
  { intent: "loans", match: LOANS, module: "payroll" },
  { intent: "payroll", match: PAYROLL, module: "payroll" },
  { intent: "overtime", match: OVERTIME, module: "attendance" },
  { intent: "holidays", match: HOLIDAYS, module: "holidays" },
  { intent: "employee", match: EMPLOYEE_LOOKUP, module: "employees" },
  { intent: "attendance-month", match: /(?:absent|present|attendance).*(?:month)/i, module: "attendance" },
  { intent: "absent", match: ABSENT_TODAY, module: "attendance" },
  { intent: "late", match: LATE_TODAY, module: "attendance" },
  { intent: "present", match: PRESENT_TODAY, module: "attendance" },
  { intent: "headcount", match: TOTAL_EMPLOYEES, module: "employees" },
] as const;
const worked = new Set(["present", "late", "half_day", "permission"]);

export async function askAi(tenantId: string, rawQuestion: string): Promise<AiResult> {
  const q = rawQuestion.trim();
  const question = questions.find(({ match }) => match.test(q));
  const intent = question?.intent;
  const { modules } = await getTenantAccess(tenantId);
  if (question && (!modules.has(question.module) || (intent === "employee" && !modules.has("attendance")))) {
    return { tone: "warning", answer: "The data for this question is unavailable in your workspace's enabled modules." };
  }

  const now = new Date();
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { config: true } });
  const region = workspaceRegion(tenant?.config);
  const day = dateKeyInTimeZone(now, region.timeZone);
  const month = day.slice(0, 7);
  const { start: today, end: tomorrow } = dayRangeIST(day);
  const monthStart = dayRangeIST(`${month}-01`).start;
  const time = (value: Date | null) => formatWorkspaceTime(value, region);
  const employees = intent === "employee" || intent === "attendance-month" || intent === "present" || intent === "late" || intent === "absent"
    ? await prisma.employee.findMany({
      where: { tenantId, status: "active", loginOnly: false },
      select: { id: true, firstName: true, lastName: true, employeeNumber: true, position: true, department: { select: { name: true } }, shift: { select: { name: true } } },
      orderBy: { employeeNumber: "asc" },
    }) : [];

  // ── People & headcount ────────────────────────────────────────────────
  if (intent === "headcount") {
    const [employeeCount, departments] = await Promise.all([
      prisma.employee.count({ where: { tenantId, status: "active", loginOnly: false } }),
      prisma.department.findMany({ where: { tenantId }, select: { name: true } }),
    ]);
    return {
      tone: "info",
      answer: `You have **${employeeCount} active employees** across ${departments.length} departments.`,
      data: departments.map((d) => ({ department: d.name })),
      columns: ["department"],
    };
  }

  const empMatch = intent === "employee" ? q.match(EMPLOYEE_LOOKUP) : null;
  if (empMatch) {
    const name = empMatch[2].toLowerCase();
    const emp = employees.find((e) => e.firstName.toLowerCase() === name || e.lastName.toLowerCase() === name || `${e.firstName} ${e.lastName}`.toLowerCase().includes(name));
    if (!emp) {
      return { tone: "warning", answer: `I couldn't find an employee matching "**${empMatch[2]}**". Try a first name.` };
    }
    const punchWindow = timeZoneDayRange(day, region.timeZone);
    const [recs, punches] = await Promise.all([
      prisma.attendance.findMany({ where: { tenantId, employeeId: emp.id, date: { gte: monthStart, lt: tomorrow } }, orderBy: { date: "desc" } }),
      prisma.punch.count({ where: { tenantId, employeeId: emp.id, ...authorizedPunchDayFilter(punchWindow.start, punchWindow.end) } }),
    ]);
    const present = recs.filter((r) => r.status === "present" || r.status === "half_day").length;
    const late = recs.filter((r) => r.status === "late").length;
    const absent = recs.filter((r) => r.status === "absent").length;
    const last = recs[0];
    return {
      tone: "info",
      answer: `**${emp.firstName} ${emp.lastName}** (${emp.employeeNumber}, ${emp.department?.name ?? "no dept"}) — this month so far: ${present} present, ${late} late, ${absent} absent. ${punches > 0 ? `Today: ${punches} punch${punches > 1 ? "es" : ""} recorded.` : "No punches today yet."}${last ? ` Last day: **${formatDate(last.date)}** (${last.status}).` : ""}`,
      data: recs.slice(0, 10).map((r) => ({ date: formatDate(r.date), status: r.status, in: time(r.punchInTime), out: time(r.punchOutTime) })),
      columns: ["date", "status", "in", "out"],
    };
  }

  // ── Today's attendance ────────────────────────────────────────────────
  if (intent === "present" || intent === "late" || intent === "absent") {
    const [dayRows, holidays] = await Promise.all([
      prisma.attendance.findMany({
        where: { tenantId, employee: { status: "active", loginOnly: false }, date: { gte: today, lt: tomorrow } },
        include: { employee: { select: { firstName: true, lastName: true, employeeNumber: true } } },
      }),
      prisma.holiday.findMany({ where: { tenantId, OR: [{ date: { gte: today, lt: tomorrow } }, { isRecurring: true }] } }),
    ]);
    const [holidaysToday] = holidaysForAttendanceDay(holidays, day).filter((holiday) => !holiday.isHalfDay);
    const presentRows = dayRows.filter((record) => worked.has(record.status));
    const lateRows = dayRows.filter((record) => record.status === "late");
    const absentRows = dayRows.filter((record) => record.status === "absent");
    if (holidaysToday) {
      return { tone: "info", answer: `Today is a holiday — **${holidaysToday.name}**. No attendance expected.` };
    }
    if (intent === "late") {
      return {
        tone: lateRows.length ? "warning" : "success",
        answer: lateRows.length
          ? `**${lateRows.length} employee${lateRows.length > 1 ? "s" : ""}** came in late today: ${lateRows.map((r) => r.employee.firstName).join(", ")}.`
          : `No one was late today. 🎉`,
        data: lateRows.map((r) => ({ employee: `${r.employee.firstName} ${r.employee.lastName}`, in: time(r.punchInTime) })),
        columns: ["employee", "in"],
      };
    }
    if (intent === "absent") {
      return {
        tone: absentRows.length ? "warning" : "info",
        answer: absentRows.length ? `**${absentRows.length} employees** are marked absent today.` : "No employees are marked absent today.",
        data: absentRows.map(({ employee }) => ({ employee: `${employee.firstName} ${employee.lastName}`, number: employee.employeeNumber })),
        columns: ["employee", "number"],
      };
    }
    return {
      tone: "info",
      answer: `**${presentRows.length} of ${employees.length}** employees are recorded present today${lateRows.length ? `, ${lateRows.length} of them late` : ""}.`,
      data: presentRows.map((r) => ({ employee: `${r.employee.firstName} ${r.employee.lastName}`, status: r.status, in: time(r.punchInTime) })),
      columns: ["employee", "status", "in"],
    };
  }

  // ── Leaves ────────────────────────────────────────────────────────────
  if (intent === "pending-leave") {
    const [count, pending] = await Promise.all([prisma.leaveRequest.count({ where: { tenantId, status: "pending" } }), prisma.leaveRequest.findMany({
      where: { tenantId, status: "pending" },
      include: { employee: { select: { firstName: true, lastName: true } }, leaveType: true },
      orderBy: { appliedAt: "desc" },
      take: 20,
    })]);
    return {
      tone: count ? "warning" : "success",
      answer: count ? `**${count} leave request${count > 1 ? "s" : ""}** waiting for approval.` : "No pending leave requests.",
      data: pending.map((l) => ({ employee: `${l.employee.firstName} ${l.employee.lastName}`, type: l.leaveType.name, from: formatDate(l.fromDate), to: formatDate(l.toDate), days: l.days })),
      columns: ["employee", "type", "from", "to", "days"],
    };
  }
  if (intent === "leave-today") {
    const requests = await prisma.leaveRequest.findMany({
      where: { tenantId, status: "approved", fromDate: { lt: tomorrow }, toDate: { gte: today } },
      include: { employee: { select: { firstName: true, lastName: true } }, leaveType: true },
    });
    const onLeave = requests.filter((leave) => countsAsLeaveDay(leave.leavePolicySnapshot, day));
    const count = new Set(onLeave.map((leave) => leave.employeeId)).size;
    return {
      tone: "info",
      answer: count ? `**${count} employee${count > 1 ? "s" : ""}** on leave today: ${onLeave.map((l) => `${l.employee.firstName} (${l.leaveType.name})`).join(", ")}.` : "No one is on leave today.",
      data: onLeave.map((l) => ({ employee: `${l.employee.firstName} ${l.employee.lastName}`, type: l.leaveType.name })),
      columns: ["employee", "type"],
    };
  }

  // ── Expenses ──────────────────────────────────────────────────────────
  if (intent === "expenses") {
    const { totals, claims } = await prisma.$transaction(async (tx) => {
      const totals = await tx.expenseClaim.groupBy({ by: ["status"], where: { tenantId }, orderBy: { status: "asc" }, _count: { _all: true }, _sum: { amount: true } });
      const claims = await tx.expenseClaim.findMany({ where: { tenantId }, include: { employee: { select: { firstName: true, lastName: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 10 });
      return { totals, claims };
    }, { isolationLevel: "RepeatableRead" });
    const pending = totals.find((entry) => entry.status === "pending");
    const count = pending?._count._all ?? 0;
    const total = totals.find((entry) => entry.status === "settled")?._sum.amount ?? 0;
    return {
      tone: count ? "warning" : "success",
      answer: `**${count} expense claim${count === 1 ? "" : "s"} pending** (₹${(pending?._sum.amount ?? 0).toLocaleString("en-IN")}) and ₹${total.toLocaleString("en-IN")} settled in total.`,
      data: claims.map((c) => ({ employee: `${c.employee.firstName} ${c.employee.lastName}`, title: c.title, amount: `₹${c.amount}`, status: c.status })),
      columns: ["employee", "title", "amount", "status"],
    };
  }

  // ── Overtime ──────────────────────────────────────────────────────────
  if (intent === "overtime") {
    const recs = await prisma.attendance.findMany({
      where: { tenantId, date: { gte: monthStart, lt: tomorrow } },
      include: { employee: { select: { firstName: true, lastName: true } } },
    });
    const ot = recs.filter((r) => (r.overtimeMinutes ?? 0) > 0 && !attendanceRequiresReview(r));
    const totalHours = Math.round((ot.reduce((s, r) => s + (r.overtimeMinutes ?? 0), 0) / 60) * 10) / 10;
    return {
      tone: "info",
      answer: `**${totalHours} overtime hours** recorded this month across ${ot.length} employee-day${ot.length === 1 ? "" : "s"}.`,
      data: ot.slice(0, 10).map((r) => ({ employee: `${r.employee.firstName} ${r.employee.lastName}`, date: formatDate(r.date), ot: `${Math.round((r.overtimeMinutes ?? 0) / 6) / 10}h` })),
      columns: ["employee", "date", "ot"],
    };
  }

  // ── Holidays ──────────────────────────────────────────────────────────
  if (intent === "holidays") {
    const holidays = await prisma.holiday.findMany({
      where: { tenantId, date: { gte: today } },
      orderBy: { date: "asc" },
      take: 5,
    });
    return {
      tone: "info",
      answer: holidays.length
        ? `Next holidays: ${holidays.map((h) => `**${h.name}** (${formatDate(h.date)}${h.isHalfDay ? ", half day" : ""})`).join(", ")}.`
        : `No upcoming holidays scheduled.`,
      data: holidays.map((h) => ({ date: formatDate(h.date), name: h.name, type: h.isHalfDay ? "Half day" : "Full day" })),
      columns: ["date", "name", "type"],
    };
  }

  // ── Payroll ───────────────────────────────────────────────────────────
  if (intent === "payroll") {
    const payMonth = monthKeyIST(now);
    const slips = await prisma.payslip.findMany({
      where: { tenantId, month: payMonth, ...financialExportPayslipFilter() },
      include: { employee: { select: { firstName: true, lastName: true } } },
    });
    const total = slips.reduce((s, p) => s + p.netSalary, 0);
    return {
      tone: "info",
      answer: slips.length
        ? `**${slips.length} finalized or paid payslip${slips.length > 1 ? "s" : ""} for ${payMonth}** — net payroll ₹${total.toLocaleString("en-IN")}.`
        : `There are no finalized or paid payslips for ${payMonth}.`,
      data: slips.slice(0, 10).map((p) => ({ employee: `${p.employee.firstName} ${p.employee.lastName}`, gross: `₹${p.grossEarnings}`, net: `₹${p.netSalary}`, status: p.status })),
      columns: ["employee", "gross", "net", "status"],
    };
  }

  // ── Loans ─────────────────────────────────────────────────────────────
  if (intent === "loans") {
    const loans = await prisma.employeeLoan.findMany({
      where: { tenantId, status: "active" },
      include: { employee: { select: { firstName: true, lastName: true } } },
    });
    const outstanding = loans.reduce((s, l) => s + l.outstanding, 0);
    return {
      tone: "info",
      answer: `**${loans.length} active loan${loans.length === 1 ? "" : "s"}/advance${loans.length === 1 ? "" : "s"}** — ₹${outstanding.toLocaleString("en-IN")} outstanding.`,
      data: loans.map((l) => ({ employee: `${l.employee.firstName} ${l.employee.lastName}`, type: l.type, amount: `₹${l.amount}`, outstanding: `₹${l.outstanding}` })),
      columns: ["employee", "type", "amount", "outstanding"],
    };
  }

  // ── Monthly attendance ────────────────────────────────────────────────
  if (intent === "attendance-month") {
    const recs = await prisma.attendance.findMany({ where: { tenantId, date: { gte: monthStart, lt: tomorrow } } });
    const byEmp = new Map<string, { present: number; late: number; absent: number }>();
    for (const r of recs) {
      const e = byEmp.get(r.employeeId) ?? { present: 0, late: 0, absent: 0 };
      if (r.status === "late") e.late++;
      else if (worked.has(r.status)) e.present++;
      else if (r.status === "absent") e.absent++;
      byEmp.set(r.employeeId, e);
    }
    const rows = employees.map((e) => ({ employee: `${e.firstName} ${e.lastName}`, ...(byEmp.get(e.id) ?? { present: 0, late: 0, absent: 0 }) }));
    const totalPresent = rows.reduce((s, r) => s + r.present + r.late, 0);
    const worst = [...rows].sort((a, b) => b.absent - a.absent)[0];
    return {
      tone: "info",
      answer: `Attendance for ${month}: **${totalPresent} present/late days** across the team. ${worst && worst.absent > 0 ? `${worst.employee} has the most recorded absences (${worst.absent}).` : ""}`,
      data: rows,
      columns: ["employee", "present", "late", "absent"],
    };
  }

  return {
    tone: "info",
    answer:
      "I can answer questions about your **team, attendance, leaves, expenses, overtime, holidays, payroll and loans** — for example:",
    data: [
      { example: "How many employees do we have?" },
      { example: "Who is absent today?" },
      { example: "Who is late today?" },
      { example: "How many leave requests are pending?" },
      { example: "What are our upcoming holidays?" },
      { example: "How is Rahul doing this month?" },
    ],
    columns: ["example"],
  };
}
