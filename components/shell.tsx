"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  CalendarClock,
  Users,
  Building2,
  Clock3,
  MapPin,
  CalendarCheck2,
  BarChart3,
  PartyPopper,
  Banknote,
  HandCoins,
  Package,
  Fingerprint,
  Settings,
  Wrench,
  Receipt,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Sun,
  Route,
  Sparkles,
  FileText,
  ClipboardList,
  LifeBuoy,
  Megaphone,
  ScrollText,
  CalendarRange,
  Network,
  UserCheck,
  DoorOpen,
  Webhook,
  MonitorCheck,
  BadgePercent,
  MessageSquareText,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { relativeDay, toDateKey } from "@/lib/dates";
import { t, type Lang } from "@/lib/i18n";
import { useToast } from "@/components/ui/toast";
import { NotificationsBell } from "@/components/notifications-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  match?: string[];
  exact?: boolean;
  module?: string; // module key this item requires (see lib/modules.ts)
  section?: string;
}

const adminNav: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" />, exact: true, section: "Overview" },
  { href: "/admin/attendance", label: "Attendance", icon: <CalendarClock className="h-4 w-4" />, module: "attendance", section: "People & time" },
  { href: "/admin/regularization", label: "Regularization", icon: <Wrench className="h-4 w-4" />, module: "attendance", section: "People & time" },
  { href: "/admin/employees", label: "Employees", icon: <Users className="h-4 w-4" />, module: "employees", section: "People & time" },
  { href: "/admin/departments", label: "Departments", icon: <Building2 className="h-4 w-4" />, section: "People & time" },
  { href: "/admin/shifts", label: "Shifts", icon: <Clock3 className="h-4 w-4" />, module: "shifts", section: "People & time" },
  { href: "/admin/rosters", label: "Rosters", icon: <CalendarRange className="h-4 w-4" />, module: "rosters", section: "People & time" },
  { href: "/admin/org-chart", label: "Org Chart", icon: <Network className="h-4 w-4" />, module: "orgchart", section: "People & time" },
  { href: "/admin/onboarding", label: "Onboarding", icon: <UserCheck className="h-4 w-4" />, module: "onboarding", section: "People & time" },
  { href: "/admin/exits", label: "Exits", icon: <DoorOpen className="h-4 w-4" />, module: "exit", section: "People & time" },
  { href: "/admin/webhooks", label: "Webhooks", icon: <Webhook className="h-4 w-4" />, module: "platform" },
  { href: "/admin/device-health", label: "Device Health", icon: <MonitorCheck className="h-4 w-4" />, module: "platform" },
  { href: "/admin/branches", label: "Branches", icon: <MapPin className="h-4 w-4" />, module: "branches", section: "People & time" },
  { href: "/admin/leaves", label: "Leaves", icon: <CalendarCheck2 className="h-4 w-4" />, module: "leaves", section: "Time off" },
  { href: "/admin/holidays", label: "Holidays", icon: <PartyPopper className="h-4 w-4" />, module: "holidays", section: "Time off" },
  { href: "/admin/assets", label: "Assets", icon: <Package className="h-4 w-4" />, module: "assets", section: "Operations" },
  { href: "/admin/devices", label: "Devices", icon: <Fingerprint className="h-4 w-4" />, module: "devices", section: "Operations" },
  { href: "/admin/payroll", label: "Payroll", icon: <Banknote className="h-4 w-4" />, module: "payroll", section: "Pay & expenses" },
  { href: "/admin/loans", label: "Loans & Advances", icon: <HandCoins className="h-4 w-4" />, module: "payroll", section: "Pay & expenses" },
  { href: "/admin/tax", label: "Tax Declarations", icon: <BadgePercent className="h-4 w-4" />, module: "payroll", section: "Pay & expenses" },
  { href: "/admin/expenses", label: "Expenses", icon: <Receipt className="h-4 w-4" />, module: "expenses", section: "Pay & expenses" },
  { href: "/admin/journeys", label: "Journey Tracker", icon: <Route className="h-4 w-4" />, module: "journey", section: "Operations" },
  { href: "/admin/ai", label: "Ask AI", icon: <Sparkles className="h-4 w-4" />, module: "ai" },
  { href: "/admin/documents", label: "Documents", icon: <FileText className="h-4 w-4" />, module: "documents" },
  { href: "/admin/performance", label: "Performance", icon: <ClipboardList className="h-4 w-4" />, module: "performance" },
  { href: "/admin/helpdesk", label: "Helpdesk", icon: <LifeBuoy className="h-4 w-4" />, module: "helpdesk" },
  { href: "/admin/policies", label: "Policies", icon: <ScrollText className="h-4 w-4" />, module: "policies" },
  { href: "/employee/feed", label: "Org Feed", icon: <Megaphone className="h-4 w-4" />, module: "feed" },
  { href: "/admin/reports", label: "Reports", icon: <BarChart3 className="h-4 w-4" />, module: "reports", section: "Insights" },
  { href: "/admin/settings", label: "Settings", icon: <Settings className="h-4 w-4" />, section: "Workspace" },
  { href: "/admin/whatsapp", label: "WhatsApp", icon: <MessageSquareText className="h-4 w-4" />, module: "platform" },
];

function employeeNav(lang: Lang): NavItem[] {
  return [
    { href: "/employee", label: t(lang, "nav.myDashboard"), icon: <LayoutDashboard className="h-4 w-4" />, exact: true },
    { href: "/employee/attendance", label: t(lang, "nav.attendance"), icon: <CalendarClock className="h-4 w-4" />, module: "attendance" },
    { href: "/employee/onboarding", label: t(lang, "nav.onboarding"), icon: <UserCheck className="h-4 w-4" />, module: "onboarding" },
    { href: "/employee/exits", label: t(lang, "nav.exits"), icon: <DoorOpen className="h-4 w-4" />, module: "exit" },
    { href: "/employee/leaves", label: t(lang, "nav.leaves"), icon: <CalendarCheck2 className="h-4 w-4" />, module: "leaves" },
    { href: "/employee/payslips", label: t(lang, "nav.payslips"), icon: <Banknote className="h-4 w-4" />, module: "payroll" },
    { href: "/employee/tax", label: t(lang, "nav.taxDeclarations"), icon: <BadgePercent className="h-4 w-4" />, module: "payroll" },
    { href: "/employee/expenses", label: t(lang, "nav.expenses"), icon: <Receipt className="h-4 w-4" />, module: "expenses" },
    { href: "/employee/documents", label: t(lang, "nav.documents"), icon: <FileText className="h-4 w-4" />, module: "documents" },
    { href: "/employee/performance", label: t(lang, "nav.performance"), icon: <ClipboardList className="h-4 w-4" />, module: "performance" },
    { href: "/employee/helpdesk", label: t(lang, "nav.helpdesk"), icon: <LifeBuoy className="h-4 w-4" />, module: "helpdesk" },
    { href: "/employee/feed", label: t(lang, "nav.feed"), icon: <Megaphone className="h-4 w-4" />, module: "feed" },
    { href: "/employee/policies", label: t(lang, "nav.policies"), icon: <ScrollText className="h-4 w-4" />, module: "policies" },
  ];
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 items-center rounded-[10px] bg-white px-2.5 shadow-[0_4px_16px_-6px_rgba(0,0,0,0.18)]">
        <img src="/logo.png" alt="PeopleNexa logo" className="h-[22px] w-auto" />
      </div>
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">Workspace</span>
    </div>
  );
}

function NavLinks({
  items,
  onNavigate,
}: {
  items: NavItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const sections = items.reduce<{ label: string; items: NavItem[] }[]>((groups, item) => {
    const label = item.section ?? "More";
    const existing = groups.find((group) => group.label === label);
    if (existing) existing.items.push(item);
    else groups.push({ label, items: [item] });
    return groups;
  }, []);

  return (
    <nav className="space-y-4">
      {sections.map((section) => (
        <div key={section.label}>
          <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/55">
            {section.label}
          </p>
          <div className="space-y-0.5">
            {section.items.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : item.match
                  ? item.match.some((m) => pathname === m || pathname.startsWith(m + "/"))
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13px] font-medium transition-colors duration-150",
                    active
                      ? "bg-primary text-primary-foreground shadow-[0_5px_16px_-8px_rgba(79,70,229,0.8)]"
                      : "text-muted-foreground hover:bg-tint-strong hover:text-foreground"
                  )}
                >
                  <span className={cn(active ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground")}>
                    {item.icon}
                  </span>
                  {item.label}
                  {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-current/80" />}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function Shell({
  role,
  name,
  companyName,
  lang = "en",
  enabledModules,
  children,
}: {
  role: string;
  name: string;
  companyName: string;
  lang?: Lang;
  enabledModules?: string[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();

  const moduleSet = new Set(enabledModules ?? []);
  const allNav = role === "admin" ? adminNav : employeeNav(lang);
  const nav = allNav.filter((n) => !n.module || moduleSet.has(n.module));
  const isAdmin = role === "admin";

  const current = nav.find((n) =>
    n.exact ? pathname === n.href : n.match ? n.match.some((m) => pathname === m || pathname.startsWith(m + "/")) : pathname.startsWith(n.href)
  );

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // still redirect
    }
    router.push("/login");
    router.refresh();
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Brand />
      </div>
      <div className="px-3 pb-2">
        <div className="mb-4 rounded-xl border border-edge bg-tint px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
            {isAdmin ? "Admin workspace" : t(lang, "nav.employeePortal")}
          </p>
          <p className="mt-1 truncate text-[13px] font-semibold text-foreground">{companyName}</p>
        </div>
        <NavLinks items={nav} onNavigate={() => setOpen(false)} />
      </div>
      <div className="mt-auto p-3">
        <div className="card-surface rounded-xl p-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-brand text-[12px] font-bold text-white">
              {initials(name.split(" ")[0], name.split(" ")[1])}
            </div>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[13px] font-semibold">{name}</p>
              <p className="truncate text-[11px] text-muted-foreground">{companyName}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-edge bg-sidebar/92 backdrop-blur-xl lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 animate-fade-in border-r border-edge bg-sidebar">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-5 rounded-lg p-1.5 text-muted-foreground hover:bg-tint"
            >
              <X className="h-4 w-4" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-[68px] items-center gap-3 border-b border-edge bg-background/82 px-4 backdrop-blur-xl sm:px-7">
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg p-2 text-muted-foreground hover:bg-tint lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-[17px] font-bold tracking-[-0.015em]">
              {current?.label ?? "Dashboard"}
            </h1>
          </div>

          <NotificationsBell />

          <div className="hidden items-center gap-2 rounded-xl border border-edge bg-tint px-3 py-1.5 text-[12px] text-muted-foreground sm:flex">
            <Sun className="h-3.5 w-3.5 text-amber-400/80" />
            <span className="font-medium capitalize">{relativeDay(new Date())}</span>
            <span className="text-muted-foreground/50">•</span>
            <span>{toDateKey(new Date())}</span>
          </div>

          <ThemeToggle />
          <LanguageToggle lang={lang} />

          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-xl border border-edge bg-tint py-1.5 pl-1.5 pr-2.5 transition-colors hover:bg-tint-strong"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-brand text-[11px] font-bold text-white">
                {initials(name.split(" ")[0], name.split(" ")[1])}
              </span>
              <span className="hidden text-[13px] font-medium sm:block">{name.split(" ")[0]}</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                <div className="card-surface absolute right-0 z-40 mt-2 w-52 animate-scale-in rounded-xl bg-card-2 p-1.5 shadow-2xl">
                  <div className="border-b border-edge px-3 py-2.5">
                    <p className="text-[13px] font-semibold">{name}</p>
                    <p className="text-[11px] text-muted-foreground">{companyName}</p>
                  </div>
                  {!isAdmin && (
                    <Link
                      href="/employee/profile"
                      className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-tint hover:text-foreground"
                    >
                      <Users className="h-4 w-4" /> {t(lang, "nav.myProfile")}
                    </Link>
                  )}
                  <button
                    onClick={logout}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-rose-300 transition-colors hover:bg-rose-500/10"
                  >
                    <LogOut className="h-4 w-4" /> {t(lang, "nav.signOut")}
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] px-4 py-7 sm:px-7 lg:px-10 lg:py-9">{children}</main>
      </div>
    </div>
  );
}
