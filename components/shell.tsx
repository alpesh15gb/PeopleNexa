"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  CalendarClock,
  Users,
  Building2,
  BriefcaseBusiness,
  Clock3,
  MapPin,
  CalendarCheck2,
  BarChart3,
  PartyPopper,
  Banknote,
  HandCoins,
  Package,
  Fingerprint,
  ScanFace,
  Settings,
  Wrench,
  Receipt,
  LogOut,
  Menu,
  LayoutGrid,
  ArrowRight,
  X,
  ChevronDown,
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
  Wallet,
  IdCard,
  ListChecks,
  Plus,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { t, type Lang } from "@/lib/i18n";
import { useToast } from "@/components/ui/toast";
import { NotificationsBell } from "@/components/notifications-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { WorkspaceLauncher, type WorkspaceDestination } from "@/components/workspace-launcher";

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
  { href: "/admin", label: "Team overview", icon: <LayoutDashboard className="h-4 w-4" />, exact: true, section: "Overview" },
  { href: "/admin/approvals", label: "Approvals", icon: <ListChecks className="h-4 w-4" />, section: "Overview" },
  { href: "/admin/employee-master", label: "Employees", match: ["/admin/employee-master", "/admin/employees"], icon: <Users className="h-4 w-4" />, module: "employees", section: "People" },
  { href: "/admin/departments", label: "Departments", icon: <Building2 className="h-4 w-4" />, section: "People" },
  { href: "/admin/designations", label: "Designations", icon: <BriefcaseBusiness className="h-4 w-4" />, section: "People" },
  { href: "/admin/org-chart", label: "Org Chart", icon: <Network className="h-4 w-4" />, module: "orgchart", section: "People" },
  { href: "/admin/onboarding", label: "Onboarding", icon: <UserCheck className="h-4 w-4" />, module: "onboarding", section: "People" },
  { href: "/admin/exits", label: "Exits", icon: <DoorOpen className="h-4 w-4" />, module: "exit", section: "People" },
  { href: "/admin/documents", label: "Documents", icon: <FileText className="h-4 w-4" />, module: "documents", section: "People" },
  { href: "/admin/id-cards", label: "ID Cards", icon: <IdCard className="h-4 w-4" />, module: "employees", section: "People" },
  { href: "/admin/attendance", label: "Attendance", icon: <CalendarClock className="h-4 w-4" />, module: "attendance", section: "Time & leave" },
  { href: "/admin/regularization", label: "Attendance corrections", icon: <Wrench className="h-4 w-4" />, module: "attendance", section: "Time & leave" },
  { href: "/admin/leaves", label: "Leave", icon: <CalendarCheck2 className="h-4 w-4" />, module: "leaves", section: "Time & leave" },
  { href: "/admin/holidays", label: "Holidays", icon: <PartyPopper className="h-4 w-4" />, module: "holidays", section: "Time & leave" },
  { href: "/admin/shifts", label: "Shifts", icon: <Clock3 className="h-4 w-4" />, module: "shifts", section: "Time & leave" },
  { href: "/admin/rosters", label: "Rosters", icon: <CalendarRange className="h-4 w-4" />, module: "rosters", section: "Time & leave" },
  { href: "/admin/payroll", label: "Payroll", icon: <Banknote className="h-4 w-4" />, module: "payroll", section: "Compensation" },
  { href: "/admin/loans", label: "Loans & Advances", icon: <HandCoins className="h-4 w-4" />, module: "payroll", section: "Compensation" },
  { href: "/admin/tax", label: "Tax Declarations", icon: <BadgePercent className="h-4 w-4" />, module: "payroll", section: "Compensation" },
  { href: "/admin/expenses", label: "Expenses", icon: <Receipt className="h-4 w-4" />, module: "expenses", section: "Compensation" },
  { href: "/admin/cashbook", label: "Cashbook", icon: <Wallet className="h-4 w-4" />, module: "expenses", section: "Compensation" },
  { href: "/admin/branches", label: "Branches", icon: <MapPin className="h-4 w-4" />, module: "branches", section: "Workplace" },
  { href: "/admin/locations", label: "Locations", icon: <Building2 className="h-4 w-4" />, section: "Workplace" },
  { href: "/admin/performance", label: "Performance", icon: <ClipboardList className="h-4 w-4" />, module: "performance", section: "Workplace" },
  { href: "/admin/helpdesk", label: "Helpdesk", icon: <LifeBuoy className="h-4 w-4" />, module: "helpdesk", section: "Workplace" },
  { href: "/admin/policies", label: "Policies", icon: <ScrollText className="h-4 w-4" />, module: "policies", section: "Workplace" },
  { href: "/employee/feed", label: "Org Feed", icon: <Megaphone className="h-4 w-4" />, module: "feed", section: "Workplace" },
  { href: "/admin/assets", label: "Assets", icon: <Package className="h-4 w-4" />, module: "assets", section: "Workplace" },
  { href: "/admin/reports", label: "Reports", icon: <BarChart3 className="h-4 w-4" />, module: "reports", section: "Reports" },
  { href: "/admin/ai", label: "Ask AI", icon: <Sparkles className="h-4 w-4" />, module: "ai", section: "Reports" },
  { href: "/admin/devices", label: "Device inventory", icon: <Fingerprint className="h-4 w-4" />, module: "devices", section: "Devices" },
  { href: "/admin/device-health", label: "Device health", icon: <MonitorCheck className="h-4 w-4" />, module: "platform", section: "Devices" },
  { href: "/admin/configuration/company-settings", label: "Settings", match: ["/admin/settings", "/admin/configuration"], icon: <Settings className="h-4 w-4" />, section: "Settings & integrations" },
  { href: "/admin/webhooks", label: "Webhooks", icon: <Webhook className="h-4 w-4" />, module: "platform", section: "Settings & integrations" },
  { href: "/admin/whatsapp", label: "WhatsApp", icon: <MessageSquareText className="h-4 w-4" />, module: "platform", section: "Settings & integrations" },
  { href: "/admin/audit", label: "Audit Log", icon: <ScrollText className="h-4 w-4" />, section: "Settings & integrations" },
];

const payrollPages: NavItem[] = [
  { href: "/admin/payroll", label: "Monthly payroll", icon: <Banknote className="size-4" />, exact: true },
  { href: "/admin/payroll/queue", label: "Payroll work queue", icon: <ListChecks className="size-4" /> },
  { href: "/admin/payroll/variance", label: "Payroll history & reports", icon: <BarChart3 className="size-4" /> },
  { href: "/admin/payroll/salary-revisions", label: "Salary changes", icon: <HandCoins className="size-4" /> },
  { href: "/admin/payroll/configuration", label: "Payroll settings", icon: <Settings className="size-4" /> },
];

function employeeNav(lang: Lang): NavItem[] {
  return [
    { href: "/employee", label: t(lang, "nav.myDashboard"), icon: <LayoutDashboard className="h-4 w-4" />, exact: true, section: "Personal" },
    { href: "/employee/profile", label: t(lang, "nav.myProfile"), icon: <Users className="h-4 w-4" />, section: "Personal" },
    { href: "/employee/attendance", label: t(lang, "nav.attendance"), icon: <CalendarClock className="h-4 w-4" />, module: "attendance", section: "Time & leave" },
    { href: "/employee/face-id", label: "Face ID", icon: <ScanFace className="h-4 w-4" />, module: "attendance", section: "Time & leave" },
    { href: "/employee/onboarding", label: t(lang, "nav.onboarding"), icon: <UserCheck className="h-4 w-4" />, module: "onboarding", section: "Personal" },
    { href: "/employee/exits", label: t(lang, "nav.exits"), icon: <DoorOpen className="h-4 w-4" />, module: "exit", section: "Personal" },
    { href: "/employee/leaves", label: t(lang, "nav.leaves"), icon: <CalendarCheck2 className="h-4 w-4" />, module: "leaves", section: "Time & leave" },
    { href: "/employee/payslips", label: t(lang, "nav.payslips"), icon: <Banknote className="h-4 w-4" />, module: "payroll", section: "Pay & claims" },
    { href: "/employee/tax", label: t(lang, "nav.taxDeclarations"), icon: <BadgePercent className="h-4 w-4" />, module: "payroll", section: "Pay & claims" },
    { href: "/employee/expenses", label: t(lang, "nav.expenses"), icon: <Receipt className="h-4 w-4" />, module: "expenses", section: "Pay & claims" },
    { href: "/employee/documents", label: t(lang, "nav.documents"), icon: <FileText className="h-4 w-4" />, module: "documents", section: "Workplace" },
    { href: "/employee/performance", label: t(lang, "nav.performance"), icon: <ClipboardList className="h-4 w-4" />, module: "performance", section: "Personal" },
    { href: "/employee/helpdesk", label: t(lang, "nav.helpdesk"), icon: <LifeBuoy className="h-4 w-4" />, module: "helpdesk", section: "Workplace" },
    { href: "/employee/feed", label: t(lang, "nav.feed"), icon: <Megaphone className="h-4 w-4" />, module: "feed", section: "Workplace" },
    { href: "/employee/policies", label: t(lang, "nav.policies"), icon: <ScrollText className="h-4 w-4" />, module: "policies", section: "Workplace" },
  ];
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 items-center rounded-[10px] bg-card px-2.5 shadow-[0_4px_16px_-6px_rgba(0,0,0,0.18)] dark:bg-white">
        <img src="/logo.png" alt="PeopleNexa logo" width={110} height={22} className="h-[22px] w-auto" />
      </div>
    </div>
  );
}

function matchesPage(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return (item.match ?? [item.href]).some((path) => pathname === path || pathname.startsWith(path + "/"));
}

function Navigation({ primary, tools, path, onNavigate }: {
  primary: NavItem[];
  tools: NavItem[];
  path: string;
  onNavigate: () => void;
}) {
  const id = useId();
  const [selection, setSelection] = useState<{ path: string; group: string | null }>();
  const groups = new Map<string, NavItem[]>();
  for (const item of tools) {
    const group = item.section ?? "Other";
    const entries = groups.get(group) ?? [];
    entries.push(item);
    groups.set(group, entries);
  }
  const activeGroup = tools.find(item => matchesPage(path, item))?.section;
  const expanded = selection?.path === path ? selection.group : activeGroup;

  function renderItem(item: NavItem) {
    const active = matchesPage(path, item);
    return (
      <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
        className={cn("flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active ? "bg-primary/12 font-semibold text-primary" : "text-muted-foreground hover:bg-tint hover:text-foreground")}>
        <span aria-hidden="true" className="shrink-0">{item.icon}</span>
        <span className="min-w-0 break-words">{item.label}</span>
      </Link>
    );
  }

  return (
    <nav aria-label="Primary" className="space-y-5 pb-4">
      <div className="space-y-0.5">{primary.map(renderItem)}</div>
      {groups.size > 0 && <div className="border-t border-edge pt-3">
        <p className="mb-1 px-3 text-xs font-semibold text-muted-foreground">More tools</p>
        {[...groups].map(([group, items], index) => {
          const groupId = `${id}-${index}`;
          const isOpen = expanded === group;
          return <div key={group}>
            <button type="button" aria-expanded={isOpen} aria-controls={groupId}
              onClick={() => setSelection({ path, group: isOpen ? null : group })}
              className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-tint focus-visible:outline-2 focus-visible:outline-ring">
              {group}<ChevronDown aria-hidden="true" className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
            </button>
            <div id={groupId} hidden={!isOpen} className="mb-2 ml-3 space-y-0.5 border-l border-edge pl-1.5">
              {items.map(renderItem)}
            </div>
          </div>;
        })}
      </div>}
    </nav>
  );
}

export function Shell({
  role,
  name,
  companyName,
  lang = "en",
  enabledModules,
  loginOnly = false,
  children,
}: {
  role: string;
  name: string;
  companyName: string;
  lang?: Lang;
  enabledModules?: string[];
  loginOnly?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const accountButton = useRef<HTMLButtonElement>(null);
  const mobileNavigation = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();

  const moduleSet = new Set(enabledModules ?? []);
  const isAdmin = role === "admin";
  const canManage = isAdmin || role === "branch_manager" || role === "location_manager" || role === "supervisor";
  const isNotifications = pathname === "/notifications";
  const selfService = !canManage || pathname === "/employee" || pathname.startsWith("/employee/");
  const managementHome = role === "supervisor" ? "/admin/attendance" : "/admin";
  const branchRoutes = new Set(["/admin", "/admin/approvals", "/admin/attendance", "/admin/regularization", "/admin/employee-master", "/admin/leaves"]);
  const locationHidden = new Set(["/admin/org-chart", "/admin/tax", "/admin/ai", "/admin/webhooks", "/admin/device-health", "/admin/whatsapp", "/admin/configuration/company-settings", "/admin/audit"]);
  const supervisorRoutes = new Set(["/admin/approvals", "/admin/attendance", "/admin/regularization"]);
  const approvalModules = isAdmin || role === "location_manager" ? ["attendance", "leaves", "expenses", "exit"]
    : role === "branch_manager" ? ["attendance", "leaves"] : ["attendance"];
  const canSeeApprovals = canManage && approvalModules.some((module) => moduleSet.has(module));
  const managementNav = !canManage ? [] : adminNav.filter(({ href }) => {
    if (href === "/admin/locations" && !isAdmin) return false;
    if (href === "/admin/approvals" && !canSeeApprovals) return false;
    if (role === "branch_manager") return branchRoutes.has(href);
    if (role === "location_manager") return !locationHidden.has(href);
    if (role === "supervisor") return supervisorRoutes.has(href);
    return true;
  }).map((item) => role === "location_manager" && item.href === "/admin/policies" ? { ...item, href: "/employee/policies" } : item);
  const enabledNav = (items: NavItem[]) => items.filter((item) => !item.module || moduleSet.has(item.module));
  const personalNav = enabledNav(employeeNav(lang)).filter(item => !loginOnly || !item.module);
  const teamNav = enabledNav(managementNav);
  const nav = canManage && !selfService ? teamNav : personalNav;
  const hasPayroll = teamNav.some((item) => item.href === "/admin/payroll");
  const canManagePayrollPolicy = isAdmin && hasPayroll;
  const payrollDestinations = hasPayroll
    ? payrollPages.filter((item) => canManagePayrollPolicy || item.href !== "/admin/payroll/configuration").map((item) => ({ ...item, section: "Payroll" }))
    : [];
  const settingsDestinations = isAdmin
    ? [
        { href: "/admin/configuration?section=dashboard", label: "Dashboard layouts", icon: <LayoutDashboard className="size-4" />, section: "Settings & integrations" },
        { href: "/admin/settings", label: "Connections and notifications", icon: <Settings className="size-4" />, section: "Settings & integrations" },
      ]
    : [];
  const launcherPages = [...new Map([...nav, ...teamNav, ...personalNav, ...payrollDestinations, ...settingsDestinations].map((item) => [
    item.href, { ...item, group: item.section },
  ])).values()];
  const actions: WorkspaceDestination[] = [
    ...(canSeeApprovals ? [{ href: "/admin/approvals", label: "Review pending requests", description: "Team administration", icon: <ListChecks className="size-4" /> }] : []),
    ...(teamNav.some((item) => item.href === "/admin/regularization") ? [{ href: "/admin/regularization?view=corrections", label: "Review attendance corrections", description: "Team attendance", icon: <Wrench className="size-4" /> }] : []),
    ...(teamNav.some((item) => item.href === "/admin/leaves") ? [{ href: "/admin/leaves?review=approvals", label: "Review leave requests", description: "Team time off", icon: <CalendarCheck2 className="size-4" /> }] : []),
    ...(teamNav.some((item) => item.href === "/admin/devices") ? [{ href: "/admin/devices?service=direct&action=add", label: "Add a direct device", description: "Register an attendance terminal", icon: <Fingerprint className="size-4" /> }] : []),
    ...((isAdmin || role === "location_manager") && moduleSet.has("employees") ? [{ href: "/admin/employee-master?action=create", label: "Add an employee", description: "Employee directory", icon: <Users className="size-4" /> }] : []),
    ...(!loginOnly && moduleSet.has("leaves") ? [{ href: "/employee/leaves?action=apply", label: "Request leave", description: "Personal time off", icon: <CalendarCheck2 className="size-4" /> }] : []),
    ...(!loginOnly && moduleSet.has("attendance") ? [{ href: "/employee/attendance?view=today", label: "Clock in or out", description: "Today's attendance", icon: <Clock3 className="size-4" /> }] : []),
    ...(!loginOnly && moduleSet.has("attendance") ? [{ href: "/employee/attendance?view=corrections&action=request", label: "Request an attendance correction", description: "Personal attendance", icon: <CalendarClock className="size-4" /> }] : []),
    ...(!loginOnly && moduleSet.has("expenses") ? [{ href: "/employee/expenses?action=new", label: "Submit an expense claim", description: "Personal expenses", icon: <Plus className="size-4" /> }] : []),
    ...(!loginOnly && moduleSet.has("helpdesk") ? [{ href: "/employee/helpdesk?action=new", label: "Ask for help", description: "Personal support", icon: <LifeBuoy className="size-4" /> }] : []),
  ];

  const primaryPaths = selfService
    ? ["/employee", "/employee/attendance", "/employee/leaves", "/employee/payslips", "/employee/onboarding"]
    : [managementHome, "/admin/approvals", "/admin/employee-master", "/admin/attendance", "/admin/leaves", "/admin/payroll"];
  const primaryNav = [...new Set(primaryPaths)].flatMap(href => nav.filter(item => item.href === href));
  const tools = nav.filter(item => !primaryPaths.includes(item.href));
  const mobilePaths = selfService
    ? ["/employee", "/employee/attendance", "/employee/leaves", "/employee/payslips"]
    : [managementHome, "/admin/approvals", "/admin/employee-master", "/admin/payroll"];
  const mobileDestinations = primaryNav.filter(item => mobilePaths.includes(item.href));
  const current = [...payrollDestinations, ...nav].find(item => matchesPage(pathname, item));
  const isDockPage = mobileDestinations.some(item => matchesPage(pathname, item));

  const logout = async () => {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout failed");
    } catch {
      toast("error", "Could not sign out. Try again.");
      return;
    }
    setMenuOpen(false);
    router.replace("/login");
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
        <div className="mb-4 mt-3 rounded-xl border border-edge bg-card p-2.5">
          <p className="px-1 pb-2 pt-0.5 text-sm font-semibold text-foreground truncate">{companyName}</p>
          {canManage && (
            <nav aria-label="Workspace mode" className="grid grid-cols-2 gap-1 rounded-lg bg-tint p-1 text-xs font-medium">
              <Link href="/employee" onClick={() => setOpen(false)} aria-current={selfService ? "true" : undefined}
                className={cn("rounded-md px-2 py-2 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selfService ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>My work</Link>
              <Link href={managementHome} onClick={() => setOpen(false)} aria-current={!selfService ? "true" : undefined}
                className={cn("rounded-md px-2 py-2 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", !selfService ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>Manage</Link>
            </nav>
          )}
        </div>
        <Navigation key={selfService ? "self" : "management"} primary={primaryNav} tools={tools} path={pathname} onNavigate={() => setOpen(false)} />
      </div>
    </div>
  );

  useEffect(() => {
    if (!open) return;
    const dialog = mobileNavigation.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    if (dialog && !dialog.open) dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, [open]);

  return (
    <div className="portal-workspace min-h-screen">
      <a href="#workspace-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground">Skip to page content</a>
      {/* Desktop sidebar — fixed full-height flex column so inner nav can scroll */}
      <aside aria-label="Workspace sidebar" className="fixed inset-y-0 left-0 z-30 hidden h-screen w-60 flex-col border-r border-edge bg-[var(--workspace-sidebar)] lg:flex">
        {sidebar}
      </aside>

      {/* Mobile drawer — proper dialog semantics */}
      {open && (
        <dialog
          ref={mobileNavigation}
          id="mobile-workspace-navigation"
          aria-label="Workspace navigation"
          onCancel={(event) => { event.preventDefault(); setOpen(false); }}
          onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}
          className="fixed inset-y-0 left-0 right-auto m-0 h-dvh max-h-none w-72 max-w-[85vw] overflow-hidden border-r border-edge bg-[var(--workspace-sidebar)] p-0 text-foreground backdrop:bg-black/65"
        >
          <div className="relative h-full">
            <button
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="absolute right-3 top-5 z-10 flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-primary/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
            {sidebar}
          </div>
        </dialog>
      )}

      {/* Main column */}
      <div className="lg:pl-60">
        {/* Topbar — title is <p> on purpose: each page already renders a single <h1> via PageHeader */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-edge bg-card px-4 sm:gap-3 sm:px-7">
          <button
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls={open ? "mobile-workspace-navigation" : undefined}
            className="h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-primary/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 hidden md:flex lg:hidden"
          >
            <Menu aria-hidden="true" className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-muted-foreground">{selfService ? "My work" : "Team workspace"}</p>
            <p className="truncate text-sm font-semibold">{isNotifications ? "Notifications" : current?.label ?? companyName}</p>
          </div>

          <WorkspaceLauncher actions={actions} pages={launcherPages} />

          <NotificationsBell />

          <div className="relative" onKeyDown={(event) => {
            if (menuOpen && event.key === "Escape") {
              setMenuOpen(false);
              accountButton.current?.focus();
            }
          }} onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false);
          }}>
            <button
              ref={accountButton}
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Account menu"
              aria-expanded={menuOpen}
              className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-edge bg-tint py-1.5 pl-1.5 pr-2.5 transition-colors duration-200 hover:border-primary/25 hover:bg-primary/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/12 text-[11px] font-bold text-primary">
                {initials(name.split(" ")[0], name.split(" ")[1])}
              </span>
              <span className="hidden text-[13px] font-medium sm:block">{name.split(" ")[0]}</span>
              <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                <div role="group" aria-label="Account actions" className="card-surface absolute right-0 z-40 mt-2 w-52 max-w-[calc(100vw-2rem)] animate-scale-in rounded-xl bg-card-2 p-1.5 shadow-2xl">
                  <div className="border-b border-edge px-3 py-2.5">
                    <p className="text-[13px] font-semibold">{name}</p>
                    <p className="text-[11px] text-muted-foreground">{companyName}</p>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-b border-edge px-3 py-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Preferences</span>
                    <div className="flex"><LanguageToggle lang={lang} /><ThemeToggle /></div>
                  </div>
                  <Link
                      href="/employee/profile"
                      onClick={() => setMenuOpen(false)}
                      className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-muted-foreground transition-colors duration-200 hover:bg-primary/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                    >
                      <Users className="h-4 w-4" /> {t(lang, "nav.myProfile")}
                    </Link>
                  {canManage && <Link href={selfService ? managementHome : "/employee"} onClick={() => setMenuOpen(false)}
                    className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium hover:bg-tint">
                    <ArrowRight aria-hidden="true" className="size-4" />{selfService ? "Go to team workspace" : "Go to My work"}
                  </Link>}
                  <button
                    onClick={logout}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-rose-300 transition-colors duration-200 hover:bg-rose-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    <LogOut className="h-4 w-4" /> {t(lang, "nav.signOut")}
                  </button>
                </div>
              </>
            )}
          </div>
        </header>
        <main id="workspace-content" tabIndex={-1} className="mx-auto w-full max-w-[1440px] px-4 pt-6 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-7 md:pb-9 lg:px-9 lg:pt-8">{children}</main>
        <nav aria-label="Frequent destinations" className="fixed inset-x-0 bottom-0 z-20 flex border-t border-edge bg-card px-1 pb-[env(safe-area-inset-bottom)] md:hidden print:hidden">
          {mobileDestinations.map(item => <Link key={item.href} href={item.href} aria-current={matchesPage(pathname, item) ? "page" : undefined}
            className="flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring aria-[current=page]:bg-primary/8 aria-[current=page]:font-semibold aria-[current=page]:text-primary">
            {item.icon}<span className="max-w-full truncate">{item.href === managementHome || item.href === "/employee" ? "Home" : item.label}</span>
          </Link>)}
          <button type="button" aria-label="More destinations" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}
            className={cn("flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", isDockPage ? "text-muted-foreground" : "bg-primary/8 font-semibold text-primary")}>
            <LayoutGrid aria-hidden="true" className="size-4" />More
          </button>
        </nav>
      </div>
    </div>
  );
}
