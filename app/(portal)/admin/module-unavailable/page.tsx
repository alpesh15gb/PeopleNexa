import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { moduleFor } from "@/lib/modules";
import { PageHeader } from "@/components/ui/card";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminModuleUnavailablePage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const [{ m }, session] = await Promise.all([searchParams, requireSession()]);
  const mod = m ? moduleFor(m) : undefined;

  return (
    <div className="max-w-2xl rounded-2xl border border-edge bg-card p-6 sm:p-8">
      <span className="mb-4 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><Lock aria-hidden="true" className="size-5" /></span>
      <PageHeader title={mod ? `${mod.label} is unavailable` : "Service unavailable"} description="This service is disabled for your workspace. Ask your workspace administrator about access." />
      <div className="mt-6 flex flex-wrap gap-3">
        {session.role !== "supervisor" && <Link href="/admin" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-110">HR dashboard <ArrowRight aria-hidden="true" className="size-4" /></Link>}
        <Link href="/employee" className="inline-flex min-h-11 items-center rounded-lg border border-edge px-4 text-sm font-medium hover:bg-tint">Go to My work</Link>
      </div>
    </div>
  );
}
