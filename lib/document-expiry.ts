import { istStartOfDay } from "./ist";

const DAY_MS = 86_400_000;
export const DOCUMENT_EXPIRY_NOTICE_DAYS = 60;

export function documentExpiryWindow(now: Date) {
  const today = istStartOfDay(now);
  const noticeEnd = new Date(today.getTime() + (DOCUMENT_EXPIRY_NOTICE_DAYS + 1) * DAY_MS);
  return { today, noticeEnd };
}

export function expiryStatus(expiryDate: Date | null, now = new Date()): "none" | "expired" | "expiring" | "ok" {
  if (!expiryDate) return "none";
  const { today, noticeEnd } = documentExpiryWindow(now);
  if (expiryDate < today) return "expired";
  if (expiryDate < noticeEnd) return "expiring";
  return "ok";
}
