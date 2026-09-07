import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export interface FaceMatchSettings {
  enabled: boolean;
  matchThreshold: number;
  reviewThreshold: number;
}

export const DEFAULT_FACE_MATCH_SETTINGS: FaceMatchSettings = {
  enabled: true,
  matchThreshold: 0.62,
  reviewThreshold: 0.5,
};

function getFaceMatchSettings(tenantConfig: unknown): FaceMatchSettings {
  const cfg = (tenantConfig ?? {}) as { faceMatch?: Partial<FaceMatchSettings> };
  const f = cfg.faceMatch ?? {};
  const matchThreshold =
    typeof f.matchThreshold === "number" && Number.isFinite(f.matchThreshold)
      ? f.matchThreshold
      : DEFAULT_FACE_MATCH_SETTINGS.matchThreshold;
  const reviewThreshold =
    typeof f.reviewThreshold === "number" && Number.isFinite(f.reviewThreshold)
      ? f.reviewThreshold
      : DEFAULT_FACE_MATCH_SETTINGS.reviewThreshold;
  return {
    enabled: f.enabled ?? DEFAULT_FACE_MATCH_SETTINGS.enabled,
    matchThreshold,
    reviewThreshold,
  };
}

export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (session?.role === "branch_manager") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } });
  const cfg = getFaceMatchSettings(tenant?.config ?? null);
  return NextResponse.json({ config: cfg });
}

export async function PUT(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (session?.role === "branch_manager") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));

  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId } });
  const cfg = (tenant?.config ?? {}) as Record<string, unknown>;
  const current = getFaceMatchSettings(cfg);

  const enabled = body.enabled === undefined ? current.enabled : body.enabled;
  const matchThreshold = body.matchThreshold === undefined ? current.matchThreshold : body.matchThreshold;
  const reviewThreshold = body.reviewThreshold === undefined ? current.reviewThreshold : body.reviewThreshold;

  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be a boolean." }, { status: 400 });
  }
  const match = Number(matchThreshold);
  const review = Number(reviewThreshold);
  if (!Number.isFinite(match) || !Number.isFinite(review)) {
    return NextResponse.json({ error: "matchThreshold and reviewThreshold must be numbers." }, { status: 400 });
  }
  if (!(0 < review && review < match && match < 1)) {
    return NextResponse.json(
      { error: "Must satisfy 0 < reviewThreshold < matchThreshold < 1." },
      { status: 400 }
    );
  }

  const next: FaceMatchSettings = { enabled, matchThreshold: match, reviewThreshold: review };
  await prisma.tenant.update({
    where: { id: session.tenantId },
    data: { config: { ...cfg, faceMatch: next } as unknown as object },
  });
  return NextResponse.json({ success: true, config: next });
}
