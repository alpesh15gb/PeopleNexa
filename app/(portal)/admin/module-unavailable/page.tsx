import Link from "next/link";
import { Lock } from "lucide-react";
import { moduleFor } from "@/lib/modules";
import { PageHeader } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AdminModuleUnavailablePage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;
  const mod = m ? moduleFor(m) : undefined;

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title="Module not available" description="Your workspace plan does not include this module" />
      <div className="card-surface flex flex-col items-center gap-4 rounded-2xl px-6 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-500/10 text-amber-300">
          <Lock className="h-6 w-6" />
        </div>
        <div>
          <h2 className="font-display text-lg font-bold">{mod ? `${mod.label} module` : "This module"} is not enabled</h2>
          <p className="mx-auto mt-1.5 max-w-md text-[13.5px] leading-relaxed text-muted-foreground">
            {mod
              ? `Your current plan does not include ${mod.label.toLowerCase()}. Contact the workspace owner or your PeopleNexa account manager to upgrade.`
              : "Your current plan does not include this feature. Contact the workspace owner or your PeopleNexa account manager to upgrade."}
          </p>
        </div>
        <Link
          href="/admin"
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-brand px-4 text-sm font-medium text-white transition-all hover:brightness-110"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
