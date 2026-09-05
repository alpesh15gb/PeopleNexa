"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  { href: "/admin/branches", label: "Branches", icon: <MapPin className="h-4 w-4" />, module: "branches", section: "People & time" },
  { href: "/admin/leaves", label: "Leaves", icon: <CalendarCheck2 className="h-4 w-4" />, module: "leaves", section: "Time off" },
  { href: "/admin/holidays", label: "Holidays", icon: <PartyPopper className="h-4 w-4" />, module: "holidays", section: "Time off" },
  { href: "/admin/assets", label: "Assets", icon: <Package className="h-4 w-4" />, module: "assets", section: "Operations" },
  { href: "/admin/devices", label: "Devices", icon: <Fingerprint className="h-4 w-4" />, module: "devices", section: "Operations" },
  { href: "/admin/journeys", label: "Journey Tracker", icon: <Route className="h-4 w-4" />, module: "journey", section: "Operations" },
  { href: "/admin/payroll", label: "Payroll", icon: <Banknote className="h-4 w-4" />, module: "payroll", section: "Pay & expenses" },
  { href: "/admin/loans", label: "Loans & Advances", icon: <HandCoins className="h-4 w-4" />, module: "payroll", section: "Pay & expenses" },
  { href: "/admin/tax", label: "Tax Declarations", icon: <BadgePercent className="h-4 w-4" />, module: "payroll", section: "Pay & expenses" },
  { href: "/admin/expenses", label: "Expenses", icon: <Receipt className="h-4 w-4" />, module: "expenses", section: "Pay & expenses" },
  { href: "/admin/reports", label: "Reports", icon: <BarChart3 className="h-4 w-4" />, module: "reports", section: "Insights" },
  { href: "/admin/ai", label: "Ask AI", icon: <Sparkles className="h-4 w-4" />, module: "ai", section: "Insights" },
  { href: "/admin/documents", label: "Documents", icon: <FileText className="h-4 w-4" />, module: "documents", section: "Culture" },
  { href: "/admin/performance", label: "Performance", icon: <ClipboardList className="h-4 w-4" />, module: "performance", section: "Culture" },
  { href: "/admin/helpdesk", label: "Helpdesk", icon: <LifeBuoy className="h-4 w-4" />, module: "helpdesk", section: "Culture" },
  { href: "/admin/policies", label: "Policies", icon: <ScrollText className="h-4 w-4" />, module: "policies", section: "Culture" },
  { href: "/employee/feed", label: "Org Feed", icon: <Megaphone className="h-4 w-4" />, module: "feed", section: "Culture" },
  { href: "/admin/webhooks", label: "Webhooks", icon: <Webhook className="h-4 w-4" />, module: "platform", section: "Platform" },
  { href: "/admin/device-health", label: "Device Health", icon: <MonitorCheck className="h-4 w-4" />, module: "platform", section: "Platform" },
  { href: "/admin/whatsapp", label: "WhatsApp", icon: <MessageSquareText className="h-4 w-4" />, module: "platform", section: "Platform" },
  { href: "/admin/settings", label: "Settings", icon: <Settings className="h-4 w-4" />, section: "Workspace" },
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
      <div className="flex h-9 items-center rounded-[10px] bg-card px-2.5 shadow-[0_4px_16px_-6px_rgba(0,0,0,0.18)] dark:bg-white">
        <img src="/logo.png" alt="PeopleNexa logo" width={110} height={22} className="h-[22px] w-auto" />
      </div>
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">Workspace</span>
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
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("peoplenexa-nav-collapsed") : null;
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("peoplenexa-nav-collapsed", JSON.stringify(collapsed));
    } catch {
      // ignore storage errors
    }
  }, [collapsed]);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? items.filter((i) => i.label.toLowerCase().includes(q)) : items;
    return filtered.reduce<{ label: string; items: NavItem[] }[]>((groups, item) => {
      const label = item.section ?? "More";
      const existing = groups.find((group) => group.label === label);
      if (existing) existing.items.push(item);
      else groups.push({ label, items: [item] });
      return groups;
    }, []);
  }, [items, query]);

  // Auto-expand the section containing the active route so keyboard/scroll users can reach it.
  useEffect(() => {
    const activeSection = sections.find((s) =>
      s.items.some((item) =>
        item.exact
          ? pathname === item.href
          : item.match
            ? item.match.some((m) => pathname === m || pathname.startsWith(m + "/"))
            : pathname.startsWith(item.href)
      )
    );
    if (activeSection?.label && collapsed[activeSection.label]) {
      setCollapsed((prev) => ({ ...prev, [activeSection.label]: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const isActive = (item: NavItem) =>
    item.exact
      ? pathname === item.href
      : item.match
        ? item.match.some((m) => pathname === m || pathname.startsWith(m + "/"))
        : pathname.startsWith(item.href);

  return (
    <div>
      <div className="sticky top-0 z-10 bg-sidebar/95 pb-2 pt-1 backdrop-blur">
        <label htmlFor="sidebar-search" className="sr-only">
          Filter navigation
        </label>
        <input
          id="sidebar-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter…"
          className="h-9 w-full rounded-[10px] border border-input bg-card px-3 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-ring/20"
        />
      </div>
      <nav aria-label="Primary" className="space-y-3 pb-2">
        {sections.length === 0 && (
          <p role="status" className="px-3 py-4 text-[12.5px] text-muted-foreground">
            No matches for “{query}”.
          </p>
        )}
        {sections.map((section) => {
          const isCollapsed = Boolean(collapsed[section.label]) && !query.trim();
          const hasActive = section.items.some(isActive);
          return (
            <div key={section.label}>
              <button
                type="button"
                onClick={() => setCollapsed((prev) => ({ ...prev, [section.label]: !prev[section.label] }))}
                aria-expanded={!isCollapsed}
                className="mb-1 flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70 transition-colors hover:bg-tint hover:text-foreground"
              >
                <span className="truncate">
                  {section.label} <span className="ml-1 font-normal opacity-70">({section.items.length})</span>
                  {hasActive && <span className="sr-only"> — contains current page</span>}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", isCollapsed && "-rotate-90")}
                />
              </button>
              {!isCollapsed && (
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const active = isActive(item);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group relative flex min-h-[44px] items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary sm:min-h-0",
                          active
                            ? "bg-primary text-primary-foreground shadow-[0_5px_16px_-8px_rgba(79,70,229,0.8)]"
                            : "text-muted-foreground hover:bg-tint-strong hover:text-foreground"
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(active ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground")}
                        >
                          {item.icon}
                        </span>
                        {item.label}
                        {active && <span aria-hidden="true" className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-current" />}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </div>
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
    <div className="flex h-full max-h-screen min-h-0 flex-col overflow-hidden">
      <div className="flex h-16 shrink-0 items-center border-b border-edge/60 px-5">
        <Brand />
      </div>
      <div
        // Scroll region: must stay scrollable even with 30+ nav items.
        // min-h-0 + flex-1 + overflow-y-auto is load-bearing; do not change to overflow-hidden.
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 [scrollbar-color:var(--scrollbar-thumb)_transparent] [scrollbar-gutter:stable] [scrollbar-width:thin]"
        role="region"
        aria-label="Workspace navigation"
        tabIndex={0}
      >
        <div className="mb-3 mt-3 rounded-xl border border-edge bg-tint px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
            {isAdmin ? "Admin workspace" : t(lang, "nav.employeePortal")}
          </p>
          <p className="mt-1 truncate text-[13px] font-semibold text-foreground">{companyName}</p>
        </div>
        <NavLinks items={nav} onNavigate={() => setOpen(false)} />
      </div>
      <div className="shrink-0 border-t border-edge/60 p-3">
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open ]);

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar — fixed full-height flex column so inner nav can scroll */}
      <aside aria-label="Workspace sidebar" className="fixed inset-y-0 left-0 z-30 hidden h-screen w-64 flex-col border-r border-edge bg-sidebar/90 backdrop-blur-xl lg:flex">
        {sidebar}
      </aside>

      {/* Mobile drawer — proper dialog semantics */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden="true" />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Workspace navigation"
            className="absolute inset-y-0 left-0 flex h-full w-72 max-w-[85vw] animate-fade-in flex-col border-r border-edge bg-sidebar"
          >
            <button
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="absolute right-3 top-5 z-10 flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-tint hover:text-foreground"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="lg:pl-64">
        {/* Topbar — title is <p> on purpose: each page already renders a single <h1> via PageHeader */}
        <header className="sticky top-0 z-20 flex h-[68px] items-center gap-2 border-b border-edge bg-background/80 px-4 backdrop-blur-xl sm:gap-3 sm:px-7">
          <button
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-tint hover:text-foreground lg:hidden"
          >
            <Menu aria-hidden="true" className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
              <p aria-hidden="true" className="truncate font-display text-[17px] font-bold tracking-[-0.015em]">
              {current?.label ?? "Dashboard"}
            </p>
          </div>

          <NotificationsBell />

          <div className="hidden items-center gap-2 rounded-xl border border-edge bg-tint px-3 py-1.5 text-[12px] text-muted-foreground md:flex">
            <Sun aria-hidden="true" className="h-3.5 w-3.5 text-amber-400/80" />
            <span className="font-medium capitalize">{relativeDay(new Date())}</span>
            <span aria-hidden="true" className="text-muted-foreground/50">•</span>
            <span>{toDateKey(new Date())}</span>
          </div>

          <ThemeToggle />
          <div className="hidden sm:block">
            <LanguageToggle lang={lang} />
          </div>

          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Account menu"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="flex min-h-[44px] items-center gap-2 rounded-xl border border-edge bg-tint py-1.5 pl-1.5 pr-2.5 transition-colors hover:bg-tint-strong"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-brand text-[11px] font-bold text-white">
                {initials(name.split(" ")[0], name.split(" ")[1])}
              </span>
              <span className="hidden text-[13px] font-medium sm:block">{name.split(" ")[0]}</span>
              <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                <div role="menu" className="card-surface absolute right-0 z-40 mt-2 w-52 max-w-[calc(100vw-2rem)] animate-scale-in rounded-xl bg-card-2 p-1.5 shadow-2xl">
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
