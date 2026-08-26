import { NextRequest, NextResponse } from "next/server";
import { normalizeSlug, slugAvailable } from "@/lib/onboarding";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("slug") ?? "";
  const slug = normalizeSlug(raw);
  if (!slug || slug.length < 2) {
    return NextResponse.json({ available: false, slug, error: "Subdomain must be at least 2 characters." });
  }
  try {
    const available = await slugAvailable(slug);
    return NextResponse.json({ available, slug });
  } catch {
    return NextResponse.json(
      { available: false, slug, error: "Workspace availability is temporarily unavailable. Please try again." },
      { status: 503 }
    );
  }
}
