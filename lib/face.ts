/**
 * Face attendance helpers — SPIKE STUB (Phase 0).
 *
 * Pure functions only. Zero new dependencies. No ML SDK calls here.
 *
 * Phase 1 plugs a server-side verifier behind the `FaceMatcher`
 * interface below (e.g. InsightFace embedding + cosine match).
 * Phase 2 adds an on-device path that posts embeddings, not photos.
 */

export interface FaceMatchConfig {
  /** Cosine-similarity accept threshold (0..1). Higher = stricter. */
  matchThreshold: number;
  /** Gray-zone floor: scores in [reviewThreshold, matchThreshold) need human review. */
  reviewThreshold: number;
  /** Minimum enrollment samples per employee. */
  minEnrollmentImages: number;
  /** Max enrollment age before re-enrollment prompt. */
  enrollmentMaxAgeDays: number;
  /** Minimum per-sample quality score (0..100) to accept. */
  minQualityScore: number;
  /** Gate punches on liveness heuristics (blink/challenge delta). */
  requireLiveness: boolean;
  /** Consent receipt version captured at enrollment. */
  consentVersion: string;
}

/** Tunable defaults — Phase 1 pilot calibrates thresholds on real pairs. */
export const faceMatchConfig: FaceMatchConfig = {
  matchThreshold: 0.62,
  reviewThreshold: 0.5,
  minEnrollmentImages: 3,
  enrollmentMaxAgeDays: 180,
  minQualityScore: 60,
  requireLiveness: true,
  consentVersion: "dpdp-face-v1",
};

export interface FaceSampleMeta {
  /** ISO timestamp of capture. */
  capturedAt: string;
  /** Quality score 0..100 (sharpness + lighting composite). */
  qualityScore: number;
  /** True when exactly one face was detected in the frame. */
  hasSingleFace: boolean;
}

export interface FaceEnrollmentMeta {
  employeeId: string;
  samples: FaceSampleMeta[];
  /** Consent receipt version, must equal faceMatchConfig.consentVersion. */
  consentVersion: string;
  /** ISO timestamp of explicit DPDP consent. */
  consentedAt: string;
}

/**
 * Validate an enrollment set before it may be used for matching.
 * Rejects: wrong shape, too few samples, low quality, multi/no-face
 * frames, stale samples, or missing/old consent version.
 */
export function isFaceEnrollmentValid(meta: unknown): meta is FaceEnrollmentMeta {
  if (typeof meta !== "object" || meta === null) return false;
  const m = meta as Record<string, unknown>;
  if (typeof m.employeeId !== "string" || m.employeeId.length === 0) return false;
  if (!Array.isArray(m.samples)) return false;
  if (m.samples.length < faceMatchConfig.minEnrollmentImages) return false;
  if (m.consentVersion !== faceMatchConfig.consentVersion) return false;
  if (typeof m.consentedAt !== "string" || Number.isNaN(Date.parse(m.consentedAt))) return false;

  const cutoff = Date.now() - faceMatchConfig.enrollmentMaxAgeDays * 86_400_000;
  for (const s of m.samples) {
    if (typeof s !== "object" || s === null) return false;
    const sample = s as Record<string, unknown>;
    if (typeof sample.capturedAt !== "string" || Number.isNaN(Date.parse(sample.capturedAt))) {
      return false;
    }
    if (Date.parse(sample.capturedAt) < cutoff) return false;
    if (typeof sample.qualityScore !== "number" || sample.qualityScore < faceMatchConfig.minQualityScore) {
      return false;
    }
    if (sample.hasSingleFace !== true) return false;
  }
  return true;
}

export type FaceAuditAction = "enroll" | "punch" | "review" | "delete";

export interface FaceAuditParams {
  employeeId: string;
  action: FaceAuditAction;
  matched: boolean;
  /** Cosine similarity 0..1, when a match was attempted. */
  score?: number;
}

/**
 * Stable one-line audit string (no biometric payloads — scores only).
 * Example: [face] punch employee=emp_123 result=match score=0.71
 */
export function faceAuditEntry(params: FaceAuditParams): string {
  const result = params.matched ? "match" : "no-match";
  const score =
    typeof params.score === "number" && Number.isFinite(params.score)
      ? ` score=${params.score.toFixed(2)}`
      : "";
  return `[face] ${params.action} employee=${params.employeeId} result=${result}${score}`;
}

export interface FaceVerifyInput {
  employeeId: string;
  /** Punch selfie as data URL (Phase 1) or embedding bytes ref (Phase 2). */
  probe: string;
  livenessPassed: boolean;
}

export interface FaceVerifyResult {
  matched: boolean;
  /** True when score falls in the human-review gray zone. */
  needsReview: boolean;
  score: number;
  reason: string;
}

/**
 * TODO (Phase 1): implement server-side verifier behind this interface.
 * Proposed: InsightFace/ONNX embedding + cosine similarity against the
 * stored enrollment set, thresholded by `faceMatchConfig`.
 */
export interface FaceMatcher {
  verify(input: FaceVerifyInput): Promise<FaceVerifyResult>;
}
