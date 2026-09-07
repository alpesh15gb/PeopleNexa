/**
 * Face attendance helpers — SPIKE STUB (Phase 0).
 *
 * Pure functions only. Zero new dependencies. No ML SDK calls here.
 *
 * Phase 1 plugs a server-side verifier behind the `FaceMatcher`
 * interface below (e.g. InsightFace embedding + cosine match).
 * Phase 2 adds an on-device path that posts embeddings, not photos.
 */

import path from "node:path";

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

// ─── Face-match foundations (server-side verifier) ─────────────────────────
// Lazy singleton around @vladmandic/face-api. The ML library is only ever
// loaded via dynamic import() inside loadFaceBackend() so that `next build`
// never bundles TensorFlow eagerly into route chunks; routes that never call
// these helpers pay zero TF cost.
//
// Model weights are NOT in git. Place the .bin weights + manifests under:
//   FACE_MODEL_DIR ?? "./public/models/face"   (resolved against process.cwd())
// resolved by getFaceModelDir() and passed to nets' loadFromDisk(dir).
// Required files for the three nets used here
// (@vladmandic/face-api v1.7.15 naming, *.bin + manifest pairs):
//   tiny_face_detector_model-weights_manifest.json
//   tiny_face_detector_model.bin
//   face_landmark_68_model-weights_manifest.json
//   face_landmark_68_model.bin
//   face_recognition_model-weights_manifest.json
//   face_recognition_model.bin
// Download them from the upstream face-api weights release and copy the six
// files into the model dir; the loader throws a clear error at startup when
// they are missing. No Express/HTTP code lives in this module.

type FaceApiModule = typeof import("@vladmandic/face-api");

/** Resolve the on-disk face-model dir (env knob FACE_MODEL_DIR). */
export function getFaceModelDir(): string {
  const configured = process.env.FACE_MODEL_DIR?.trim();
  const dir = configured && configured.length > 0 ? configured : "./public/models/face";
  if (path.isAbsolute(dir)) return dir;
  const cwd = typeof process.cwd === "function" ? process.cwd() : ".";
  return path.resolve(cwd, dir);
}

let faceApiLoading: Promise<FaceApiModule> | null = null;

/**
 * Load (once) the face-api nets needed for enrollment/punch descriptors.
 * Attempts the optional native `@tensorflow/tfjs-node` backend first when it
 * is installed (faster + gives tf.node.decodeImage for JPEG decode); falls
 * back to the pure-JS backend bundled with @vladmandic/face-api otherwise.
 */
export async function loadFaceBackend(): Promise<FaceApiModule> {
  if (!faceApiLoading) {
    const run = async (): Promise<FaceApiModule> => {
      // Optional: indirect specifier (typed as string) so `tsc --noEmit`
      // passes whether or not @tensorflow/tfjs-node is installed.
      try {
        const specifier: string = "@tensorflow/tfjs-node";
        await import(specifier);
      } catch {
        // Pure-JS CPU backend fallback — decodeImage unavailable, callers degrade.
      }
      const faceapi = await import("@vladmandic/face-api");
      const modelDir = getFaceModelDir();
      await faceapi.nets.tinyFaceDetector.loadFromDisk(modelDir);
      await faceapi.nets.faceLandmark68Net.loadFromDisk(modelDir);
      await faceapi.nets.faceRecognitionNet.loadFromDisk(modelDir);
      return faceapi;
    };
    faceApiLoading = run().catch((err) => {
      // Reset so a later call retries (e.g. models placed after first boot).
      faceApiLoading = null;
      throw err;
    });
  }
  return faceApiLoading;
}

/** Cosine similarity of two equal-length vectors. Returns 0 on bad input. */
export function cosine(a: number[], b: number[]): number {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  const score = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  if (!Number.isFinite(score)) return 0;
  return Math.max(-1, Math.min(1, score));
}

/**
 * Detect a single face in a JPEG buffer and return its 128-d descriptor.
 * Never throws: returns null when there is no face, multiple faces, bad
 * input, a missing decode backend, or missing model files — the caller maps
 * null to review/reject per policy.
 */
export async function describeFace(jpegBuffer: Buffer | Uint8Array): Promise<number[] | null> {
  try {
    if (!jpegBuffer || jpegBuffer.length === 0) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const faceapi = (await loadFaceBackend()) as any;
    const decodeImage = faceapi?.tf?.node?.decodeImage as
      | ((bytes: Uint8Array, channels: number) => { dispose(): void })
      | undefined;
    // Without the native tfjs-node backend there is no JPEG decoder in Node.
    if (typeof decodeImage !== "function") return null;

    const bytes = jpegBuffer instanceof Uint8Array ? jpegBuffer : new Uint8Array(jpegBuffer);
    const imgTensor = decodeImage(bytes, 3) as unknown as { dispose(): void };
    try {
      const batch = faceapi.tf.tidy(() =>
        faceapi.tf.cast(faceapi.tf.expandDims(imgTensor, 0), "float32"),
      ) as { dispose(): void };
      try {
        const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 });
        const result = (await faceapi
          .detectSingleFace(batch, options)
          .withFaceLandmarks()
          .withFaceDescriptor()) as { descriptor?: ArrayLike<number> } | null;
        if (!result?.descriptor) return null;
        const descriptor = Array.from(result.descriptor);
        if (descriptor.length !== 128 || !descriptor.every((n) => Number.isFinite(n))) return null;
        return descriptor;
      } finally {
        batch.dispose();
      }
    } finally {
      imgTensor.dispose();
    }
  } catch {
    return null;
  }
}

export type FaceVerifyStatus = "matched" | "review" | "rejected";

/**
 * Best-of-samples cosine match of a probe descriptor against stored
 * enrollment samples. Pure function (no I/O); async for a stable caller
 * signature alongside describeFace().
 */
export async function verifyFace(
  stored: number[][],
  probe: number[],
  config: Pick<FaceMatchConfig, "matchThreshold" | "reviewThreshold"> = faceMatchConfig,
): Promise<{ score: number; status: FaceVerifyStatus }> {
  if (!Array.isArray(stored) || stored.length === 0) return { score: 0, status: "rejected" };
  if (!Array.isArray(probe) || probe.length === 0) return { score: 0, status: "rejected" };
  let best = -Infinity;
  for (const sample of stored) {
    if (!Array.isArray(sample) || sample.length !== probe.length) continue;
    const score = cosine(sample, probe);
    if (score > best) best = score;
  }
  if (!Number.isFinite(best)) return { score: 0, status: "rejected" };
  if (best >= config.matchThreshold) return { score: best, status: "matched" };
  if (best >= config.reviewThreshold) return { score: best, status: "review" };
  return { score: best, status: "rejected" };
}
