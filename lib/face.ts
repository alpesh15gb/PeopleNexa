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
import { decode as decodeJpeg } from "jpeg-js";

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
 * Uses the pure-JS CPU backend bundled with @vladmandic/face-api. JPEG decode
 * is handled separately so the production Alpine image needs no native
 * TensorFlow binary.
 */
export async function loadFaceBackend(): Promise<FaceApiModule> {
  if (!faceApiLoading) {
    const run = async (): Promise<FaceApiModule> => {
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

/**
 * Head-yaw proxy from 68-point landmark positions (indices follow the
 * standard 68-point scheme: 30 = nose tip, 36-41 = left eye, 42-47 = right).
 * Returns null when landmarks are unusable. Scale: frontal ≈ 0 ± 0.03, a
 * ~30° turn ≈ ±0.15-0.25. Sign is mirror-dependent — use spread only.
 */
export function yawFromLandmarks(positions: ArrayLike<{ x: number; y: number }>): number | null {
  try {
    if (!positions || positions.length < 48) return null;
    let lx = 0;
    let ly = 0;
    for (let i = 36; i <= 41; i++) {
      lx += positions[i].x;
      ly += positions[i].y;
    }
    let rx = 0;
    let ry = 0;
    for (let i = 42; i <= 47; i++) {
      rx += positions[i].x;
      ry += positions[i].y;
    }
    lx /= 6;
    ly /= 6;
    rx /= 6;
    ry /= 6;
    const eyeDist = Math.hypot(rx - lx, ry - ly);
    if (!Number.isFinite(eyeDist) || eyeDist < 20) return null;
    const nose = positions[30];
    if (!nose || !Number.isFinite(nose.x)) return null;
    const yaw = (nose.x - (lx + rx) / 2) / eyeDist;
    return Number.isFinite(yaw) ? yaw : null;
  } catch {
    return null;
  }
}

/** Minimum per-side yaw spread (vs the frontal sample) to count as "turned". */
export const FACE_POSE_SPREAD_MIN = 0.1;

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

export type FaceDescribeErrorCode =
  | "empty"
  | "unsupported_format"
  | "too_small"
  | "backend_unavailable"
  | "multiple_faces"
  | "no_face"
  | "too_dark"
  | "descriptor_failed";

export interface FaceDescribeSuccess {
  ok: true;
  descriptor: number[];
  /** Measured quality 0..100 (lighting + contrast composite). */
  quality: number;
  /** Detector pass that succeeded (for ops tuning). */
  pass: string;
  /**
   * Head-yaw proxy from 68-point landmarks: (nose.x − eyeMid.x) / eyeDist.
   * ~0 frontal; sign depends on camera mirroring, so callers must only use
   * SPREAD between samples (direction-agnostic), never absolute direction.
   * Null when landmarks were unusable (pose gate must then reject).
   */
  yaw: number | null;
}

export interface FaceDescribeFailure {
  ok: false;
  code: FaceDescribeErrorCode;
  /** Operator/actionable hint for the UI. */
  hint: string;
}

export type FaceDescribeResult = FaceDescribeSuccess | FaceDescribeFailure;

/** Magic-byte sniff — jpeg-js only handles JPEG; anything else must be retaken, not misreported. */
function sniffImageFormat(bytes: Uint8Array): "jpeg" | "png" | "gif" | "webp" | "unknown" {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return "png";
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "gif";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  )
    return "webp";
  return "unknown";
}

/**
 * Detect a single face in an image buffer and return its 128-d descriptor,
 * with a machine-readable failure reason instead of a bare null.
 *
 * Worst-case hardening over the naive single-shot detector:
 * - multi-pass detection (416px@0.50, then 512px@0.35) for dim/small faces;
 * - largest-face selection when several people are in frame (enrollment then
 *   rejects with `multiple_faces` rather than a mystery failure);
 * - luminance diagnostics so dark frames report `too_dark`, not `no_face`;
 * - backend load failures surface as `backend_unavailable` (ops signal:
 *   model weights missing) instead of masquerading as a bad photo.
 */
export async function describeFaceDetailed(imageBuffer: Buffer | Uint8Array): Promise<FaceDescribeResult> {
  if (!imageBuffer || imageBuffer.length === 0) {
    return { ok: false, code: "empty", hint: "Photo is empty." };
  }
  const bytes = imageBuffer instanceof Uint8Array ? imageBuffer : new Uint8Array(imageBuffer);
  const format = sniffImageFormat(bytes);
  if (format !== "jpeg") {
    return {
      ok: false,
      code: "unsupported_format",
      hint: format === "unknown" ? "Photo is not a valid image." : `Photo is ${format.toUpperCase()}, JPEG is required.`,
    };
  }

  let faceapi: any;
  try {
    faceapi = await loadFaceBackend();
  } catch {
    return {
      ok: false,
      code: "backend_unavailable",
      hint: "Face service is not ready (model weights missing on the server).",
    };
  }

  let image: { width: number; height: number; data: Uint8Array | Uint16Array | Float64Array };
  try {
    image = decodeJpeg(Buffer.from(bytes), { useTArray: true, formatAsRGBA: true });
  } catch {
    return { ok: false, code: "unsupported_format", hint: "Photo could not be decoded." };
  }
  if (!image.width || !image.height || !image.data?.length) {
    return { ok: false, code: "unsupported_format", hint: "Photo could not be decoded." };
  }
  const minDim = Math.min(image.width, image.height);
  if (minDim < 120) {
    return { ok: false, code: "too_small", hint: "Photo is too small — move closer to the camera." };
  }

  const rgba = faceapi.tf.tensor3d(image.data, [image.height, image.width, 4], "int32");
  const imgTensor = faceapi.tf.slice(rgba, [0, 0, 0], [image.height, image.width, 3]);
  rgba.dispose();
  try {
    // Grayscale luminance stats for the darkness diagnostic (cheap, runs once).
    const luminance = faceapi.tf.tidy(() => {
      const f = faceapi.tf.cast(imgTensor, "float32");
      const r = faceapi.tf.slice(f, [0, 0, 0], [image.height, image.width, 1]);
      const g = faceapi.tf.slice(f, [0, 0, 1], [image.height, image.width, 1]);
      const b = faceapi.tf.slice(f, [0, 0, 2], [image.height, image.width, 1]);
      return faceapi.tf.add(faceapi.tf.add(faceapi.tf.mul(r, 0.299), faceapi.tf.mul(g, 0.587)), faceapi.tf.mul(b, 0.114));
    });
    const meanTensor = luminance.mean();
    const mean = ((await meanTensor.data())[0] as number) ?? 0;
    meanTensor.dispose();
    const moments = faceapi.tf.moments(luminance);
    const stdTensor = moments.variance.sqrt();
    const stdVal = ((await stdTensor.data())[0] as number) ?? 0;
    moments.mean.dispose();
    moments.variance.dispose();
    stdTensor.dispose();
    luminance.dispose();
    const quality = Math.max(0, Math.min(100, Math.round(((mean / 255) * 60 + Math.min(stdVal / 64, 1) * 40))));

    const batch = faceapi.tf.tidy(() =>
      faceapi.tf.cast(faceapi.tf.expandDims(imgTensor, 0), "float32"),
    );
    try {
      // Two passes: strict first (fewer false positives), lenient fallback
      // for dim rooms / budget phones / distant faces.
      const passes = [
        { inputSize: 416, scoreThreshold: 0.5 },
        { inputSize: 512, scoreThreshold: 0.35 },
      ];
      let detections: any[] | null = null;
      let passName = passes[0].inputSize + "@" + passes[0].scoreThreshold;
      for (const p of passes) {
        const options = new faceapi.TinyFaceDetectorOptions(p);
        // eslint-disable-next-line no-await-in-loop
        const found = (await faceapi.detectAllFaces(batch, options)) as any[];
        if (Array.isArray(found) && found.length > 0) {
          detections = found;
          passName = `${p.inputSize}@${p.scoreThreshold}`;
          break;
        }
      }
      if (!detections || detections.length === 0) {
        if (mean < 45) {
          return { ok: false, code: "too_dark", hint: "Photo is too dark — add light in front of the face." };
        }
        return { ok: false, code: "no_face", hint: "No face found — move closer, face the camera directly." };
      }
      if (detections.length > 1) {
        return { ok: false, code: "multiple_faces", hint: "More than one face — only you should be in frame." };
      }
      const box = detections[0]?.box ?? detections[0]?.detection?.box;
      const boxW = typeof box?.width === "number" ? box.width : 0;
      if (boxW > 0 && boxW < 60) {
        return { ok: false, code: "too_small", hint: "Face is too small in frame — move closer to the camera." };
      }
      const single = await faceapi
        .detectSingleFace(batch, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.35 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
      const descriptor = single?.descriptor ? Array.from(single.descriptor as ArrayLike<number>) : null;
      if (!descriptor || descriptor.length !== 128 || !descriptor.every((n: number) => Number.isFinite(n))) {
        return { ok: false, code: "descriptor_failed", hint: "Face found but unreadable — hold still and retake." };
      }
      const yaw = single?.landmarks?.positions ? yawFromLandmarks(single.landmarks.positions) : null;
      return { ok: true, descriptor, quality, pass: passName, yaw };
    } finally {
      batch.dispose();
    }
  } finally {
    imgTensor.dispose();
  }
}

/**
 * Detect a single face in a JPEG buffer and return its 128-d descriptor.
 * Never throws: returns null when there is no face, multiple faces, bad
 * input, a missing decode backend, or missing model files — the caller maps
 * null to review/reject per policy.
 */
export async function describeFace(jpegBuffer: Buffer | Uint8Array): Promise<number[] | null> {
  try {
    const result = await describeFaceDetailed(jpegBuffer);
    return result.ok ? result.descriptor : null;
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
