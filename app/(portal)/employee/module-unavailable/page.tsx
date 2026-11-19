import Link from "next/link";
import { Lock } from "lucide-react";
import { moduleFor } from "@/lib/modules";
import { requireActiveSession } from "@/lib/session";
import { getTenantAccess } from "@/lib/modules-server";

export const dynamic = "force-dynamic";

export default async function EmployeeModuleUnavailablePage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const [params, session] = await Promise.all([searchParams, requireActiveSession()]);
  const mod = typeof params.m === "string" ? moduleFor(params.m) : undefined;
  const { modules } = await getTenantAccess(session.tenantId);

  return (
    <div className="card-surface mx-auto mt-10 flex max-w-md flex-col items-center gap-4 rounded-2xl px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-500/10 text-amber-300">
        <Lock aria-hidden="true" className="h-6 w-6" />
      </div>
      <div>
        <h1 className="font-display text-lg font-bold">
          {mod ? `${mod.label} is unavailable` : "This feature is unavailable"}
        </h1>
        <p className="mx-auto mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-muted-foreground">
          This feature is currently unavailable in your workspace. Your HR team can confirm which services are enabled.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2"><Link
        href="/employee"
        className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-brand px-4 text-sm font-medium text-white transition-all hover:brightness-110"
      >
        Back to employee home
      </Link>
      {modules.has("helpdesk") && mod?.key !== "helpdesk" && <Link href="/employee/helpdesk" className="inline-flex h-10 items-center rounded-xl border border-edge px-4 text-sm font-medium hover:bg-tint">Contact Helpdesk</Link>}</div>
    </div>
  );
}
