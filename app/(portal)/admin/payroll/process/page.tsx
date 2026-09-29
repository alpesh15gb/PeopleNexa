import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Legacy operational URL. The monthly workflow has one canonical route. */
export default async function ProcessPayrollPage({ searchParams }: { searchParams: Promise<{ month?: string; period?: string; location?: string; run?: string }> }) {
  const session = await requireSession();
  if (session.role !== "admin" && session.role !== "location_manager") return null;
  const params = await searchParams;
  const query = new URLSearchParams({
    ...(params.period || params.month ? { period: params.period || params.month! } : {}),
    ...(params.location ? { location: params.location } : {}),
    ...(params.run ? { run: params.run } : {}),
  });
  redirect(`/admin/payroll${query.size ? `?${query}` : ""}`);
}
