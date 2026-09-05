import { prisma } from "./prisma";
import { toDateKey, startOfDay, endOfDay, todayKey, monthKey } from "./dates";

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
const ACTIVE_EMPLOYEES = /(active|working|current).*(employee|staff|people)/i;
const PRESENT_TODAY = /(who|how many).*(present|clocked in|checked in|working).*(today|now)?/i;
const ABSENT_TODAY = /(who|how many).*(absent|missing|not here|didn'?t come).*(today)?/i;
const LATE_TODAY = /(who|how many).*(late|delayed).*(today)?/i;
const PENDING_LEAVES = /(pending|open|waiting).*(leave|request)|(leave|request).*(pending|open|waiting)/i;
const LEAVE_TODAY = /(who|how many).*(on leave|leave today|off today)/i;
const EXPENSES = /(expense|reimbursement|claim)/i;
const OVERTIME = /(overtime|ot hours|extra hours)/i;
const HOLIDAYS = /(holiday|holidays|public holiday|upcoming holiday)/i;
const PAYROLL = /(payroll|salary|payslip|paid|salaries)/i;
const LOANS = /(loan|advance|outstanding)/i;
const EMPLOYEE_LOOKUP = /(how is|status of|attendance of|report of|about)\s+([a-z]+)/i;
const ABSENT_MONTH = /(absent|present).*(month|this month)/i;
const OVERTIME_TOTAL = /(total|sum|hours of).*(overtime|ot)/i;

function firstMatch(re: RegExp, q: string): boolean {
  re.lastIndex = 0;
  return re.test(q);
}

export async function askAi(tenantId: string, rawQuestion: string): Promise<AiResult> {
  const q = rawQuestion.trim();
  const today = startOfDay(new Date());
  const todayStr = todayKey();

  const [employeeCount, employees, departments] = await Promise.all([
    prisma.employee.count({ where: { tenantId, status: "active" } }),
    prisma.employee.findMany({
      where: { tenantId, status: "active" },
      select: { id: true, firstName: true, lastName: true, employeeNumber: true, position: true, department: { select: { name: true } }, shift: { select: { name: true } } },
      orderBy: { employeeNumber: "asc" },
    }),
    prisma.department.findMany({ where: { tenantId }, select: { id: true, name: true } }),
  ]);

  // ── People & headcount ────────────────────────────────────────────────
  if (firstMatch(TOTAL_EMPLOYEES, q) || /how many.*people/.test(q)) {
    return {
      tone: "info",
      answer: `You have **${employeeCount} active employees** across ${departments.length} departments.`,
      data: departments.map((d) => ({ department: d.name })),
      columns: ["department"],
    };
  }

  const empMatch = q.match(EMPLOYEE_LOOKUP);
  if (empMatch) {
    const name = empMatch[2].toLowerCase();
    const emp = employees.find((e) => e.firstName.toLowerCase() === name || e.lastName.toLowerCase() === name || `${e.firstName} ${e.lastName}`.toLowerCase().includes(name));
    if (!emp) {
      return { tone: "warning", answer: `I couldn't find an employee matching "**${empMatch[2]}**". Try a first name.` };
    }
    const month = monthKey(today);
    const [recs, punches] = await Promise.all([
      prisma.attendance.findMany({ where: { employeeId: emp.id, date: { gte: startOfDay(new Date(`${month}-01`)), lte: today } }, orderBy: { date: "desc" }, take: 30 }),
      prisma.punch.count({ where: { employeeId: emp.id, tenantId, punchTime: { gte: startOfDay(today), lte: endOfDay(today) } } }),
    ]);
    const present = recs.filter((r) => r.status === "present" || r.status === "half_day").length;
    const late = recs.filter((r) => r.status === "late").length;
    const absent = recs.filter((r) => r.status === "absent").length;
    const last = recs[0];
    return {
      tone: "info",
      answer: `**${emp.firstName} ${emp.lastName}** (${emp.employeeNumber}, ${emp.department?.name ?? "no dept"}) — this month so far: ${present} present, ${late} late, ${absent} absent. ${punches > 0 ? `Today: ${punches} punch${punches > 1 ? "es" : ""} recorded.` : "No punches today yet."}${last ? ` Last day: **${toDateKey(last.date)}** (${last.status}).` : ""}`,
      data: recs.slice(0, 10).map((r) => ({ date: toDateKey(r.date), status: r.status, in: r.punchInTime ? new Date(r.punchInTime).toLocaleTimeString() : "—", out: r.punchOutTime ? new Date(r.punchOutTime).toLocaleTimeString() : "—" })),
      columns: ["date", "status", "in", "out"],
    };
  }

  // ── Today's attendance ────────────────────────────────────────────────
  const [dayRows, holidaysToday] = await Promise.all([
    prisma.attendance.findMany({
      where: { tenantId, date: { gte: startOfDay(today), lte: endOfDay(today) } },
      include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true, position: true } } },
    }),
    prisma.holiday.findFirst({ where: { tenantId, date: { gte: startOfDay(today), lte: endOfDay(today) } } }),
  ]);

  const presentRows = dayRows.filter((r) => r.status === "present" || r.status === "half_day");
  const lateRows = dayRows.filter((r) => r.status === "late");
  const absentNow = employees.filter((e) => !dayRows.some((r) => r.employeeId === e.id));

  if (firstMatch(PRESENT_TODAY, q) || firstMatch(LATE_TODAY, q) || firstMatch(ABSENT_TODAY, q)) {
    // Holiday short-circuit applies only to today-attendance queries — other
    // intents (payroll, leaves, holidays, …) must still be answered.
    if (holidaysToday) {
      return { tone: "info", answer: `Today is a holiday — **${holidaysToday.name}**. No attendance expected.` };
    }
    if (firstMatch(LATE_TODAY, q)) {
      return {
        tone: lateRows.length ? "warning" : "success",
        answer: lateRows.length
          ? `**${lateRows.length} employee${lateRows.length > 1 ? "s" : ""}** came in late today: ${lateRows.map((r) => r.employee.firstName).join(", ")}.`
          : `No one was late today. 🎉`,
        data: lateRows.map((r) => ({ employee: `${r.employee.firstName} ${r.employee.lastName}`, in: r.punchInTime ? new Date(r.punchInTime).toLocaleTimeString() : "—" })),
        columns: ["employee", "in"],
      };
    }
    if (firstMatch(ABSENT_TODAY, q)) {
      return {
        tone: absentNow.length ? "warning" : "success",
        answer: absentNow.length
          ? `**${absentNow.length} of ${employeeCount}** haven't marked attendance today: ${absentNow.slice(0, 8).map((e) => `${e.firstName} ${e.lastName}`).join(", ")}${absentNow.length > 8 ? "…" : ""}.`
          : `Everyone has marked attendance today. 🎉`,
        data: absentNow.map((e) => ({ employee: `${e.firstName} ${e.lastName}`, number: e.employeeNumber })),
        columns: ["employee", "number"],
      };
    }
    return {
      tone: "info",
      answer: `**${presentRows.length} of ${employeeCount}** employees are present today${lateRows.length ? `, ${lateRows.length} of them late` : ""}.`,
      data: dayRows.map((r) => ({ employee: `${r.employee.firstName} ${r.employee.lastName}`, status: r.status, in: r.punchInTime ? new Date(r.punchInTime).toLocaleTimeString() : "—" })),
      columns: ["employee", "status", "in"],
    };
  }

  // ── Leaves ────────────────────────────────────────────────────────────
  if (firstMatch(PENDING_LEAVES, q)) {
    const pending = await prisma.leaveRequest.findMany({
      where: { tenantId, status: "pending" },
      include: { employee: { select: { firstName: true, lastName: true } }, leaveType: true },
      orderBy: { appliedAt: "desc" },
      take: 20,
    });
    return {
      tone: pending.length ? "warning" : "success",
      answer: pending.length ? `**${pending.length} leave request${pending.length > 1 ? "s" : ""}** waiting for approval.` : `No pending leave requests.`,
      data: pending.map((l) => ({ employee: `${l.employee.firstName} ${l.employee.lastName}`, type: l.leaveType.name, from: toDateKey(l.fromDate), to: toDateKey(l.toDate), days: l.days })),
      columns: ["employee", "type", "from", "to", "days"],
    };
  }
  if (firstMatch(LEAVE_TODAY, q)) {
    const onLeave = await prisma.leaveRequest.findMany({
      where: { tenantId, status: "approved", fromDate: { lte: endOfDay(today) }, toDate: { gte: startOfDay(today) } },
      include: { employee: { select: { firstName: true, lastName: true } }, leaveType: true },
    });
    return {
      tone: "info",
      answer: onLeave.length ? `**${onLeave.length} employee${onLeave.length > 1 ? "s" : ""}** on leave today: ${onLeave.map((l) => `${l.employee.firstName} (${l.leaveType.name})`).join(", ")}.` : `No one is on leave today.`,
      data: onLeave.map((l) => ({ employee: `${l.employee.firstName} ${l.employee.lastName}`, type: l.leaveType.name })),
      columns: ["employee", "type"],
    };
  }

  // ── Expenses ──────────────────────────────────────────────────────────
  if (firstMatch(EXPENSES, q)) {
    const claims = await prisma.expenseClaim.findMany({
      where: { tenantId },
      include: { employee: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const pending = claims.filter((c) => c.status === "pending");
    const total = claims.filter((c) => c.status === "settled").reduce((s, c) => s + c.amount, 0);
    return {
      tone: pending.length ? "warning" : "success",
      answer: `**${pending.length} expense claim${pending.length > 1 ? "s" : ""} pending** (₹${pending.reduce((s, c) => s + c.amount, 0).toLocaleString("en-IN")}) and ₹${total.toLocaleString("en-IN")} settled in total.`,
      data: claims.slice(0, 10).map((c) => ({ employee: `${c.employee.firstName} ${c.employee.lastName}`, title: c.title, amount: `₹${c.amount}`, status: c.status })),
      columns: ["employee", "title", "amount", "status"],
    };
  }

  // ── Overtime ──────────────────────────────────────────────────────────
  if (firstMatch(OVERTIME, q)) {
    const monthStart = startOfDay(new Date(`${monthKey(today)}-01`));
    const recs = await prisma.attendance.findMany({
      where: { tenantId, date: { gte: monthStart, lte: endOfDay(today) } },
      include: { employee: { select: { firstName: true, lastName: true } } },
    });
    const ot = recs.filter((r) => (r.overtimeMinutes ?? 0) > 0);
    const totalHours = Math.round((ot.reduce((s, r) => s + (r.overtimeMinutes ?? 0), 0) / 60) * 10) / 10;
    return {
      tone: "info",
      answer: `**${totalHours} overtime hours** recorded this month across ${ot.length} employee-day${ot.length === 1 ? "" : "s"}.`,
      data: ot.slice(0, 10).map((r) => ({ employee: `${r.employee.firstName} ${r.employee.lastName}`, date: toDateKey(r.date), ot: `${Math.round((r.overtimeMinutes ?? 0) / 6) / 10}h` })),
      columns: ["employee", "date", "ot"],
    };
  }

  // ── Holidays ──────────────────────────────────────────────────────────
  if (firstMatch(HOLIDAYS, q)) {
    const holidays = await prisma.holiday.findMany({
      where: { tenantId, date: { gte: startOfDay(today) } },
      orderBy: { date: "asc" },
      take: 5,
    });
    return {
      tone: "info",
      answer: holidays.length
        ? `Next holidays: ${holidays.map((h) => `**${h.name}** (${toDateKey(h.date)}${h.isHalfDay ? ", half day" : ""})`).join(", ")}.`
        : `No upcoming holidays scheduled.`,
      data: holidays.map((h) => ({ date: toDateKey(h.date), name: h.name, type: h.isHalfDay ? "Half day" : "Full day" })),
      columns: ["date", "name", "type"],
    };
  }

  // ── Payroll ───────────────────────────────────────────────────────────
  if (firstMatch(PAYROLL, q)) {
    const month = monthKey(today);
    const slips = await prisma.payslip.findMany({ where: { tenantId, month }, include: { employee: { select: { firstName: true, lastName: true } } } });
    const total = slips.reduce((s, p) => s + p.netSalary, 0);
    return {
      tone: "info",
      answer: slips.length
        ? `**${slips.length} payslip${slips.length > 1 ? "s" : ""} generated for ${month}** — net payout ₹${total.toLocaleString("en-IN")}.`
        : `No payslips generated yet for ${month}. Run payroll to see figures.`,
      data: slips.slice(0, 10).map((p) => ({ employee: `${p.employee.firstName} ${p.employee.lastName}`, gross: `₹${p.grossEarnings}`, net: `₹${p.netSalary}`, status: p.status })),
      columns: ["employee", "gross", "net", "status"],
    };
  }

  // ── Loans ─────────────────────────────────────────────────────────────
  if (firstMatch(LOANS, q)) {
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
  if (firstMatch(ABSENT_MONTH, q) || /attendance.*month/.test(q)) {
    const monthStart = startOfDay(new Date(`${monthKey(today)}-01`));
    const recs = await prisma.attendance.findMany({ where: { tenantId, date: { gte: monthStart, lte: endOfDay(today) } } });
    const byEmp = new Map<string, { present: number; late: number; absent: number }>();
    for (const r of recs) {
      const e = byEmp.get(r.employeeId) ?? { present: 0, late: 0, absent: 0 };
      if (r.status === "present" || r.status === "half_day") e.present++;
      else if (r.status === "late") e.late++;
      else e.absent++;
      byEmp.set(r.employeeId, e);
    }
    const rows = employees.map((e) => ({ employee: `${e.firstName} ${e.lastName}`, ...(byEmp.get(e.id) ?? { present: 0, late: 0, absent: 0 }) }));
    const totalPresent = rows.reduce((s, r) => s + r.present + r.late, 0);
    const worst = [...rows].sort((a, b) => b.absent - a.absent)[0];
    return {
      tone: "info",
      answer: `Attendance for ${monthKey(today)}: **${totalPresent} present/late days** across the team. ${worst && worst.absent > 0 ? `${worst.employee} has the most absences (${worst.absent}).` : ""}`,
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
