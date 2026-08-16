import Link from "next/link";
import { Lock } from "lucide-react";
import { moduleFor } from "@/lib/modules";

export const dynamic = "force-dynamic";

export default async function EmployeeModuleUnavailablePage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;
  const mod = m ? moduleFor(m) : undefined;

  return (
    <div className="card-surface mx-auto mt-10 flex max-w-md flex-col items-center gap-4 rounded-2xl px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-500/10 text-amber-300">
        <Lock className="h-6 w-6" />
      </div>
      <div>
        <h2 className="font-display text-lg font-bold">
          {mod ? `${mod.label} module` : "This module"} is not available
        </h2>
        <p className="mx-auto mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-muted-foreground">
          Your workspace doesn&apos;t have access to this feature right now. Contact your HR/administration team if you
          think this is a mistake.
        </p>
      </div>
      <Link
        href="/employee"
        className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-brand px-4 text-sm font-medium text-white transition-all hover:brightness-110"
      >
        Back to my dashboard
      </Link>
    </div>
  );
}
