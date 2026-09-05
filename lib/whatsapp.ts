import { prisma } from "./prisma";

/**
 * WhatsApp notification gateway.
 *
 * Pluggable by design: point it at any provider that accepts a JSON POST
 * ({ to, message }) with a bearer token — e.g. a WhatsApp Business API proxy,
 * Gupshup, or a home-grown gateway. Delivery is best-effort and never blocks
 * the triggering request (same pattern as webhooks).
 *
 * Configuration lives under tenant.config.whatsapp:
 *   { enabled, apiUrl, apiToken, sender }
 */

export interface WhatsAppConfig {
  enabled: boolean;
  apiUrl: string;
  apiToken: string;
  sender: string;
}

export const DEFAULT_WHATSAPP_CONFIG: WhatsAppConfig = {
  enabled: false,
  apiUrl: "",
  apiToken: "",
  sender: "",
};

export function getWhatsAppConfig(tenantConfig: unknown): WhatsAppConfig {
  const cfg = (tenantConfig ?? {}) as { whatsapp?: Partial<WhatsAppConfig> };
  const w = cfg.whatsapp ?? {};
  return {
    enabled: w.enabled ?? DEFAULT_WHATSAPP_CONFIG.enabled,
    apiUrl: w.apiUrl ?? DEFAULT_WHATSAPP_CONFIG.apiUrl,
    apiToken: w.apiToken ?? DEFAULT_WHATSAPP_CONFIG.apiToken,
    sender: w.sender ?? DEFAULT_WHATSAPP_CONFIG.sender,
  };
}

export async function saveWhatsAppConfig(
  tenantId: string,
  patch: { enabled?: boolean; apiUrl?: string; apiToken?: string; sender?: string }
): Promise<WhatsAppConfig> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const cfg = (tenant?.config ?? {}) as Record<string, unknown>;
  const current = getWhatsAppConfig(cfg);
  const next: WhatsAppConfig = {
    enabled: patch.enabled ?? current.enabled,
    apiUrl: patch.apiUrl !== undefined ? patch.apiUrl : current.apiUrl,
    // Blank token means "keep the existing one" (same as eBio password).
    apiToken: patch.apiToken === "" || patch.apiToken == null ? current.apiToken : patch.apiToken,
    sender: patch.sender !== undefined ? patch.sender : current.sender,
  };
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { config: { ...cfg, whatsapp: next } as unknown as object },
  });
  return next;
}

// ─── Templates ─────────────────────────────────────────────────────────────

export type WhatsappTemplateKey =
  | "leave.approved"
  | "leave.rejected"
  | "exit.approved"
  | "payslip.generated"
  | "punch.reminder";

const TEMPLATES: Record<WhatsappTemplateKey, string> = {
  "leave.approved": "✅ Your leave request from {from} to {to} has been APPROVED by {admin}.",
  "leave.rejected": "ℹ️ Your leave request from {from} to {to} was not approved. Reason: {reason}.",
  "exit.approved": "📋 Your resignation is approved. Last working day: {lwd}. Final settlement: ₹{amount}.",
  "payslip.generated": "🧾 Your payslip for {month} is ready. Net pay: ₹{amount}. Login to view the full statement.",
  "punch.reminder": "⏰ Reminder: you haven't clocked in yet today ({date}). Please punch in to record attendance.",
};

function render(templateKey: WhatsappTemplateKey, params: Record<string, string | number>): string {
  let s = TEMPLATES[templateKey] ?? templateKey;
  for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/**
 * Best-effort WhatsApp delivery to one employee's phone.
 * Returns true when the provider accepted the message.
 */
export async function sendWhatsApp(
  tenantId: string,
  phone: string | null | undefined,
  templateKey: WhatsappTemplateKey,
  params: Record<string, string | number>
): Promise<boolean> {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return false;

  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { config: true } });
    const cfg = getWhatsAppConfig(tenant?.config ?? null);
    if (!cfg.enabled || !cfg.apiUrl) return false;

    const message = render(templateKey, params);
    const to = digits.length === 10 ? `91${digits}` : digits;
    await fetch(cfg.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.apiToken ? { Authorization: `Bearer ${cfg.apiToken}` } : {}),
      },
      body: JSON.stringify({ to, message, sender: cfg.sender || undefined }),
      signal: AbortSignal.timeout(8000),
    });
    return true;
  } catch {
    return false; // never throw — WhatsApp is best-effort
  }
}

/** Send to every active employee in a tenant (e.g. punch reminders). */
export async function sendWhatsAppToAll(
  tenantId: string,
  templateKey: WhatsappTemplateKey,
  params: Record<string, string | number>
): Promise<number> {
  const cfg = getWhatsAppConfig((await prisma.tenant.findUnique({ where: { id: tenantId }, select: { config: true } }))?.config ?? null);
  if (!cfg.enabled || !cfg.apiUrl) return 0;
  const employees = await prisma.employee.findMany({
    where: { tenantId, status: "active" },
    select: { id: true, phone: true },
  });
  let sent = 0;
  for (const e of employees) {
    const ok = await sendWhatsApp(tenantId, e.phone, templateKey, params);
    if (ok) sent++;
  }
  return sent;
}
