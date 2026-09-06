import { prisma } from "./prisma";

/**
 * SMS fallback gateway (PagarBook parity for payslips/alerts).
 *
 * Pluggable by design: point it at any provider that accepts a JSON POST
 * ({ to, message }) with a bearer token — e.g. Twilio-style proxy, MSG91,
 * Textlocal, or a home-grown gateway. Delivery is best-effort and never
 * throws (same pattern as webhooks / WhatsApp).
 *
 * Configuration lives under tenant.config.sms (no schema changes):
 *   { enabled, apiUrl, apiToken, sender }
 */

export interface SmsConfig {
  enabled: boolean;
  apiUrl: string;
  apiToken: string;
  sender: string;
}

export const DEFAULT_SMS_CONFIG: SmsConfig = {
  enabled: false,
  apiUrl: "",
  apiToken: "",
  sender: "",
};

/** Accepts a tenant row ({ config }), a raw tenant.config object, or null. */
export function getSmsConfig(tenantOrConfig: unknown): SmsConfig {
  const raw =
    tenantOrConfig != null &&
    typeof tenantOrConfig === "object" &&
    "config" in (tenantOrConfig as Record<string, unknown>)
      ? (tenantOrConfig as { config: unknown }).config
      : tenantOrConfig;
  const cfg = (raw ?? {}) as { sms?: Partial<SmsConfig> };
  const s = cfg.sms ?? {};
  return {
    enabled: s.enabled ?? DEFAULT_SMS_CONFIG.enabled,
    apiUrl: s.apiUrl ?? DEFAULT_SMS_CONFIG.apiUrl,
    apiToken: s.apiToken ?? DEFAULT_SMS_CONFIG.apiToken,
    sender: s.sender ?? DEFAULT_SMS_CONFIG.sender,
  };
}

export async function saveSmsConfig(
  tenantId: string,
  patch: { enabled?: boolean; apiUrl?: string; apiToken?: string; sender?: string }
): Promise<SmsConfig> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const cfg = (tenant?.config ?? {}) as Record<string, unknown>;
  const current = getSmsConfig(cfg);
  const next: SmsConfig = {
    enabled: patch.enabled ?? current.enabled,
    apiUrl: patch.apiUrl !== undefined ? patch.apiUrl : current.apiUrl,
    // Blank token means "keep the existing one" (same as eBio password / WhatsApp).
    apiToken: patch.apiToken === "" || patch.apiToken == null ? current.apiToken : patch.apiToken,
    sender: patch.sender !== undefined ? patch.sender : current.sender,
  };
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { config: { ...cfg, sms: next } as unknown as object },
  });
  return next;
}

export interface SmsSendResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

/**
 * Best-effort SMS delivery of a plain-text message to one phone number.
 * Never throws — returns { ok: false } on any failure, { ok: false, skipped: true }
 * when the gateway is not configured/enabled.
 */
export async function sendSms(
  tenantId: string,
  phone: string | null | undefined,
  message: string
): Promise<SmsSendResult> {
  if (!phone) return { ok: false, skipped: true };
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return { ok: false, skipped: true };
  if (!message || !message.trim()) return { ok: false, skipped: true };

  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { config: true } });
    const cfg = getSmsConfig(tenant?.config ?? null);
    if (!cfg.enabled || !cfg.apiUrl) {
      console.warn(`[sms] skipped for tenant ${tenantId}: gateway not configured (enabled=${cfg.enabled}, apiUrl set=${Boolean(cfg.apiUrl)})`);
      return { ok: false, skipped: true };
    }
    if (!cfg.apiToken) {
      console.warn(`[sms] skipped for tenant ${tenantId}: apiToken not configured`);
      return { ok: false, skipped: true };
    }

    const to = digits.length === 10 ? `91${digits}` : digits;
    const res = await fetch(cfg.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.apiToken ? { Authorization: `Bearer ${cfg.apiToken}` } : {}),
      },
      body: JSON.stringify({ to, message, sender: cfg.sender || undefined }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false, error: `provider responded ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "send failed" }; // never throw — SMS is best-effort
  }
}
