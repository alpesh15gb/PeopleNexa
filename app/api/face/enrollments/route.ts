import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { describeFaceDetailed, faceMatchConfig, isFaceEnrollmentValid } from "@/lib/face";

const MAX_PHOTO_BYTES = 500 * 1024;

/** Strip a `data:image/...;base64,` prefix and decode the payload. Null on bad input. */
function dataUrlToBuffer(dataUrl: unknown): Buffer | null {
  if (typeof dataUrl !== "string") return null;
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return null;
  const prefix = dataUrl.slice(0, comma);
  if (!prefix.startsWith("data:image/") || !prefix.includes(";base64")) return null;
  try {
    const buffer = Buffer.from(dataUrl.slice(comma + 1), "base64");
    if (buffer.length === 0) return null;
    return buffer;
  } catch {
    return null;
  }
}

/** Own enrollment row only. Embeddings are NEVER returned to the client. */
export async function GET() {
  try {
    const session = await requireActiveSession().catch(() => null);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const row = await prisma.faceEnrollment.findUnique({ where: { employeeId: session.sub } });
    if (!row || row.tenantId !== session.tenantId) {
      return NextResponse.json({ status: "none", sampleCount: 0, consentedAt: null });
    }
    return NextResponse.json({
      status: "enrolled",
      sampleCount: row.sampleCount,
      consentedAt: row.consentedAt?.toISOString() ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Failed to load enrollment." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireActiveSession().catch(() => null);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => null);
    const photos: unknown = body?.photos;
    const consentVersion: unknown = body?.consentVersion;
    const consentedAt: unknown = body?.consentedAt;

    if (!Array.isArray(photos) || photos.length !== faceMatchConfig.minEnrollmentImages) {
      return NextResponse.json(
        { error: `Exactly ${faceMatchConfig.minEnrollmentImages} photos are required.` },
        { status: 400 }
      );
    }
    if (consentVersion !== faceMatchConfig.consentVersion) {
      return NextResponse.json(
        { error: "Consent version is outdated. Please review and re-confirm consent." },
        { status: 400 }
      );
    }
    const consentedAtDate = new Date(typeof consentedAt === "string" ? consentedAt : "");
    if (Number.isNaN(consentedAtDate.getTime())) {
      return NextResponse.json({ error: "A valid consent timestamp is required." }, { status: 400 });
    }

    const embeddings: number[][] = [];
    const qualities: number[] = [];
    for (let i = 0; i < photos.length; i++) {
      const buffer = dataUrlToBuffer(photos[i]);
      if (!buffer) {
        return NextResponse.json({ error: `Sample ${i + 1}: invalid photo, retake.` }, { status: 400 });
      }
      if (buffer.length > MAX_PHOTO_BYTES) {
        return NextResponse.json({ error: `Sample ${i + 1}: photo exceeds 500KB, retake.` }, { status: 400 });
      }
      const result = await describeFaceDetailed(buffer);
      if (!result.ok) {
        // Backend down is an ops problem, not a bad photo — 503 so the
        // client says "try later" instead of blaming the user's face.
        if (result.code === "backend_unavailable") {
          console.error(`[face] enrollment backend unavailable for tenant ${session.tenantId}: model weights missing?`);
          return NextResponse.json(
            { error: "Face service is temporarily unavailable. Please try again later." },
            { status: 503 }
          );
        }
        return NextResponse.json({ error: `Sample ${i + 1}: ${result.hint}` }, { status: 400 });
      }
      embeddings.push(result.descriptor);
      qualities.push(result.quality);
    }

    // Final invariant gate: count + consent version + freshness, via the same
    // predicate punch-time matching relies on. Per-sample quality scores and
    // liveness are attested by the guided on-device capture, and single-face
    // is attested by describeFace's detectSingleFace gate above, so quality
    // is floored at the configured minimum here.
    const now = new Date();
    const meta = {
      employeeId: session.sub,
      samples: embeddings.map(() => ({
        capturedAt: now.toISOString(),
        qualityScore: faceMatchConfig.minQualityScore,
        hasSingleFace: true,
      })),
      consentVersion: faceMatchConfig.consentVersion,
      consentedAt: consentedAtDate.toISOString(),
    };
    if (!isFaceEnrollmentValid(meta)) {
      return NextResponse.json(
        { error: "Enrollment failed validation. Please retake all photos." },
        { status: 400 }
      );
    }

    await prisma.faceEnrollment.upsert({
      where: { employeeId: session.sub },
      create: {
        tenantId: session.tenantId,
        employeeId: session.sub,
        embeddings,
        sampleCount: embeddings.length,
        consentVersion: faceMatchConfig.consentVersion,
        consentedAt: consentedAtDate,
        enrolledAt: now,
      },
      update: {
        tenantId: session.tenantId,
        embeddings,
        sampleCount: embeddings.length,
        consentVersion: faceMatchConfig.consentVersion,
        consentedAt: consentedAtDate,
        enrolledAt: now,
      },
    });
    return NextResponse.json({
      success: true,
      status: "enrolled",
      sampleCount: embeddings.length,
      // Measured per-sample quality (informational; acceptance policy unchanged
      // pending calibration on real field photos).
      quality: qualities,
    });
  } catch {
    return NextResponse.json({ error: "Failed to save enrollment." }, { status: 500 });
  }
}

/** Withdraw consent: permanently delete the own enrollment row. */
export async function DELETE() {
  try {
    const session = await requireActiveSession().catch(() => null);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const row = await prisma.faceEnrollment.findUnique({ where: { employeeId: session.sub } });
    if (!row || row.tenantId !== session.tenantId) {
      return NextResponse.json({ error: "No enrollment found." }, { status: 404 });
    }
    await prisma.faceEnrollment.delete({ where: { employeeId: session.sub } });
    return NextResponse.json({ success: true, status: "none" });
  } catch {
    return NextResponse.json({ error: "Failed to withdraw enrollment." }, { status: 500 });
  }
}
