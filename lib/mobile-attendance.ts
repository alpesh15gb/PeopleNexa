import { decode } from "jpeg-js";

export const MOBILE_SELFIE_MAX_LENGTH = 500_000;
export function mobileCaptureTime(value: unknown, now = Date.now(), retry = false) {
  const date = typeof value === "string" ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime()) || (!retry && (now - date.getTime() > 120_000 || date.getTime() - now > 30_000))) throw new Error("Selfie expired. Capture a fresh photo before clocking in or out.");
  return date;
}
export function mobileSelfieBytes(value: unknown): Buffer {
  if (typeof value !== "string" || value.length > MOBILE_SELFIE_MAX_LENGTH || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error("Capture a JPEG selfie before clocking in or out.");
  const bytes = Buffer.from(value.slice(value.indexOf(",") + 1), "base64");
  try {
    const image = decode(bytes, { useTArray: true, maxResolutionInMP: 2, maxMemoryUsageInMB: 32 });
    if (image.width < 120 || image.height < 120) throw new Error("small");
  } catch { throw new Error("Selfie is invalid or too small. Please capture it again."); }
  return bytes;
}

export function mobileLocation(body: { lat?: unknown; lng?: unknown; accuracy?: unknown }) {
  if (typeof body.lat !== "number" || typeof body.lng !== "number" || !Number.isFinite(body.lat) || !Number.isFinite(body.lng) || Math.abs(body.lat) > 90 || Math.abs(body.lng) > 180) throw new Error("A current GPS location is required to clock in or out.");
  if (typeof body.accuracy !== "number" || !Number.isFinite(body.accuracy) || body.accuracy < 0) throw new Error("GPS accuracy is missing. Please fetch your location again.");
  return { lat: body.lat, lng: body.lng, accuracy: body.accuracy };
}

export function mobileHoldReason({ faceEnabled, enrolled, faceStatus, locationStatus }: { faceEnabled: boolean; enrolled: boolean; faceStatus: string; locationStatus: string }) {
  if (locationStatus === "outside") return "location_mismatch";
  if (locationStatus === "not_configured") return "location_not_configured";
  if (locationStatus === "low_accuracy") return "location_accuracy";
  if (!faceEnabled) return null;
  if (!enrolled) return "no_enrollment";
  if (faceStatus === "rejected") return "face_mismatch";
  return faceStatus === "matched" ? null : "face_review";
}
