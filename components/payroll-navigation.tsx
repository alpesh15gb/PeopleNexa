import Link from "next/link";

export function PayrollNavigation({
  active,
  canManageSettings = false,
}: {
  active: "payroll" | "history" | "changes" | "settings";
  canManageSettings?: boolean;
}) {
  const links = [
    { key: "payroll", label: "Run payroll", href: "/admin/payroll" },
    {
      key: "history",
      label: "History & reports",
      href: "/admin/payroll/variance",
    },
    {
      key: "changes",
      label: "Salary changes",
      href: "/admin/payroll/salary-revisions",
    },
    ...(canManageSettings
      ? [
          {
            key: "settings",
            label: "Payroll settings",
            href: "/admin/payroll/configuration",
          },
        ]
      : []),
  ];
  return (
    <nav
      aria-label="Payroll workspace"
      className="flex flex-wrap gap-1 rounded-xl border border-edge bg-card p-1.5"
    >
      {links.map((link) => (
        <Link
          key={link.key}
          href={link.href}
          aria-current={active === link.key ? "page" : undefined}
          className={`inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring ${active === link.key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-tint"}`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
