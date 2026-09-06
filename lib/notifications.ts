import { prisma } from "./prisma";

type NotifType = "info" | "success" | "warning" | "danger";

/** Notify all admins of a tenant. */
export async function notifyAdmins(tenantId: string, type: NotifType, title: string, message: string) {
  const admins = await prisma.employee.findMany({
    where: { tenantId, role: "admin" },
    select: { id: true },
  });
  if (admins.length === 0) return;
  await prisma.notification.createMany({
    data: admins.map((a) => ({ tenantId, employeeId: a.id, type, title, message })),
  });
}

/** Notify a single employee. */
export async function notifyEmployee(
  tenantId: string,
  employeeId: string,
  type: NotifType,
  title: string,
  message: string
) {
  await prisma.notification.create({
    data: { tenantId, employeeId, type, title, message },
  });

  // SMS fallback (PagarBook parity): best-effort text for actionable kinds.
  // Never throws and never blocks the caller — failures are swallowed.
  if (type === "success" || type === "warning" || type === "danger") {
    try {
      const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        select: { phone: true, tenantId: true },
      });
      if (employee && employee.tenantId === tenantId && employee.phone) {
        const { sendSms } = await import("./sms");
        await sendSms(tenantId, employee.phone, `${title}: ${message}`).catch(() => undefined);
      }
    } catch {
      // best-effort only — in-app notification above already persisted
    }
  }
}
