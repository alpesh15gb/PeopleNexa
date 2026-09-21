import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(first?: string | null, last?: string | null) {
  return `${(first ?? "").charAt(0)}${(last ?? "").charAt(0)}`.toUpperCase() || "?";
}

export function formatMoney(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// Read-only views mask statutory identifiers; the edit form reveals them on
// demand. These fail closed: a malformed legacy value is still masked rather
// than displayed in full, so an unexpected shape can never leak the identifier.
export function maskAadhaar(value?: string | null) {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return "—";
  return digits.length > 4 ? `XXXX XXXX ${digits.slice(-4)}` : "XXXX";
}

export function maskPan(value?: string | null) {
  const pan = (value ?? "").trim().toUpperCase();
  if (!pan) return "—";
  if (pan.length < 6) return "*****";
  return `${pan.slice(0, 5)}***${pan.slice(-2)}`;
}
