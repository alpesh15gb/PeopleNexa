"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banknote, ClipboardList, History, Settings2, TrendingUp } from "lucide-react";
import { payrollScopeHref } from "@/lib/payroll-work-queue";

export function PayrollNavigation({
  active,
  canManageSettings = false,
  locationId,
  period,
}: {
  active: "payroll" | "queue" | "history" | "changes" | "settings";
  canManageSettings?: boolean;
  locationId?: string | null;
  period?: string | null;
}) {
  const router = useRouter();
  const links = [
    { key: "payroll", label: "Monthly payroll", href: "/admin/payroll", icon: Banknote },
    { key: "queue", label: "Work queue", href: "/admin/payroll/queue", icon: ClipboardList },
    {
      key: "history",
      label: "History & reports",
      href: "/admin/payroll/variance",
      icon: History,
    },
    {
      key: "changes",
      label: "Salary changes",
      href: "/admin/payroll/salary-revisions",
      icon: TrendingUp,
    },
    ...(canManageSettings
      ? [
          {
            key: "settings",
            label: "Payroll settings",
            href: "/admin/payroll/configuration",
            icon: Settings2,
          },
        ]
      : []),
  ];
  return (
    <nav
      aria-label="Payroll workspace"
      className="flex flex-wrap gap-1 rounded-xl border border-edge bg-card p-1.5"
    >
      <label className="flex w-full items-center gap-3 px-2 text-sm sm:hidden">
        Payroll page
        <select className="min-w-0 flex-1 rounded-lg border border-edge bg-background px-2 py-2" value={active} onChange={event => {
          const selected = links.find(link => link.key === event.target.value);
          if (selected) router.push(payrollScopeHref(selected.href, { locationId, period }));
        }}>
          {links.map(link => <option key={link.key} value={link.key}>{link.label}</option>)}
        </select>
      </label>
      {links.map(({ icon: Icon, ...link }) => (
        <Link
          key={link.key}
          href={payrollScopeHref(link.href, { locationId, period })}
          aria-current={active === link.key ? "page" : undefined}
          className={`hidden sm:inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring ${active === link.key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-tint"}`}
        >
          <Icon aria-hidden="true" className="size-4" />
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
