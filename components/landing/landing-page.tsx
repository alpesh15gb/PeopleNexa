"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Building2,
  CalendarCheck2,
  Check,
  Fingerprint,
  Lock,
  MapPin,
  Menu,
  MessageSquareText,
  PhoneCall,
  Plus,
  Route,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { MODULES, type PlanDef } from "@/lib/modules";

const FEATURES = [
  {
    icon: Fingerprint,
    title: "Geofenced attendance",
    desc: "Clock in/out from the mobile app with GPS + geofence, selfie verification, and automatic shift-based punch-out.",
  },
  {
    icon: CalendarCheck2,
    title: "Leaves & holidays",
    desc: "Leave types, auto accrual balances, half-days, approvals and a holiday calendar — with encashment on exit.",
  },
  {
    icon: Wallet,
    title: "Payroll & statutory",
    desc: "PF, ESIC, PT, TDS (old/new regime) and LWF built in. Bank CSV for bulk payments and Tally export.",
  },
  {
    icon: MapPin,
    title: "Field GPS tracking",
    desc: "Live journey maps and route replay for field teams — stops, distance and visit history per employee.",
  },
  {
    icon: Bot,
    title: "Ask AI",
    desc: "Ask questions in plain language — attendance trends, payroll figures, leave data — get answers instantly.",
  },
];

/* Trust band — headline proof points. White-on-accent CTA uses --accent (#C2410C light) per contrast spec. */
const TRUST_BAND = [
  { value: "80L+", label: "Attendance punches processed every month" },
  { value: "650+", label: "Branches, plants & field teams onboard" },
  { value: "10+", label: "Languages — EN · हिं · ગુ · मरा · தமிழ் + more" },
];

const PERSONAS = [
  {
    icon: Users,
    title: "Office teams",
    desc: "Geofenced clock-in, shift rosters, leaves and clean payslips — without the attendance spreadsheet.",
  },
  {
    icon: MapPin,
    title: "Field & sales force",
    desc: "Selfie check-ins, journey tracking with route replay, and expense claims approved from the field.",
  },
  {
    icon: Building2,
    title: "Multi-branch & manufacturing",
    desc: "Per-branch geofences, biometric device sync and one central payroll across every location.",
  },
];

const SECURITY = [
  {
    icon: Lock,
    title: "Private by design",
    desc: "Role-based access — employees only ever see their own data. HTTPS in transit, hosted in India, DPDP-ready practices.",
  },
  {
    icon: MapPin,
    title: "Location, only on the clock",
    desc: "GPS is recorded while clocked in or on an approved journey. When your team goes home, tracking stops — no 24×7 surveillance.",
  },
  {
    icon: ShieldCheck,
    title: "Compliance built in",
    desc: "PF, ESIC, PT, TDS (old & new regime) and LWF calculated per payslip, with ECR, Form 16 and Form 24Q draft exports.",
  },
  {
    icon: Smartphone,
    title: "Mobile-first, installable",
    desc: "A PWA that installs on any Android or iPhone and works from the browser — no Play Store approval needed for your team.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Create your workspace",
    desc: "Sign up in under a minute — your own subdomain like acme.peoplenexa.in, zero credit card.",
  },
  {
    n: "02",
    title: "Add your team & rules",
    desc: "Import employees, set branches with geofences, shifts, rosters, leave types and statutory config.",
  },
  {
    n: "03",
    title: "Track, pay & grow",
    desc: "Attendance flows in automatically. Generate payroll with statutory deductions and bank CSVs each month.",
  },
];

const FAQS = [
  {
    q: "How does the free trial work?",
    a: "Every new workspace gets a free trial with every module enabled. No credit card required — just pick a subdomain and go.",
  },
  {
    q: "Is payroll compliant with Indian statutory rules?",
    a: "PF, ESIC, Professional Tax, TDS (old & new regime) and Labour Welfare Fund are calculated per payslip, with ECR, Form 16 and Form 24Q draft exports for filing.",
  },
  {
    q: "Can I pay my employees in bulk?",
    a: "Yes — generate a bank CSV (beneficiary, account, IFSC, amount) and upload it directly to your bank's portal. Tally journal export is included too.",
  },
  {
    q: "Does the mobile app track employees after work hours?",
    a: "Location is only recorded while the employee is clocked in or running an approved journey. Admins can't see an employee's location when they're off the clock.",
  },
  {
    q: "Which languages are supported?",
    a: "English, Hindi, Gujarati, Marathi and Tamil today — with more coming. Employees can switch languages in one tap.",
  },
];

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* CTA accent: --accent token (AA 4.5:1). Primary blue: --primary token. */
const CTA_PRIMARY =
  "bg-accent text-white shadow-[0_8px_24px_-10px_rgba(194,65,12,0.75)] hover:bg-accent-hover active:translate-y-px cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:transform-none";
const CTA_SECONDARY =
  "border-primary/40 text-primary hover:bg-primary/5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none";
const EYEBROW = "text-primary dark:text-[#93C5FD]";
const ICON_TILE = "bg-primary";
const ICON_SOFT = "bg-primary/10 text-primary dark:text-[#93C5FD]";

function Logo() {
  return (
    <Link
      href="/"
      className="flex cursor-pointer items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.svg" alt="PeopleNexa logo" className="h-8 w-8" />
      <span className="font-display text-[17px] font-bold tracking-tight">PeopleNexa</span>
    </Link>
  );
}

export function LandingPage({ plans }: { plans: PlanDef[] }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div
      className="min-h-screen bg-background text-foreground selection:bg-primary/20"
      style={{ fontFamily: "'Plus Jakarta Sans', ui-sans-serif, system-ui, -apple-system, sans-serif" }}
    >
      {/* Jakarta + static reduced-motion fallback (hero has no parallax; animations collapse to final state). */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
        rel="stylesheet"
      />
      <style>{`.font-display{font-family:'Plus Jakarta Sans',ui-sans-serif,system-ui,sans-serif !important}.text-gradient{background:linear-gradient(135deg,#2563EB 0%,#3B82F6 60%,#60A5FA 100%)}@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:0.01ms !important;animation-iteration-count:1 !important;transition-duration:0.01ms !important}html{scroll-behavior:auto !important}}`}</style>

      {/* ── Nav (sticky CTA) ──────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-edge bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Logo />
          <div className="hidden items-center gap-7 text-[13.5px] font-medium text-muted-foreground md:flex">
            <a href="#features" className="cursor-pointer rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Features</a>
            <a href="#product" className="cursor-pointer rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Product</a>
            <a href="#pricing" className="cursor-pointer rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Pricing</a>
            <a href="#faq" className="cursor-pointer rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">FAQ</a>
          </div>
          <div className="hidden items-center gap-3 md:flex">
            <Link
              href="/login"
              className="cursor-pointer rounded-lg px-3.5 py-2 text-[13.5px] font-medium text-muted-foreground transition-colors duration-200 hover:bg-tint hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              Log in
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-accent px-4 py-2 text-[13.5px] font-semibold text-white shadow-[0_4px_14px_-8px_rgba(194,65,12,0.7)] transition-all duration-200 hover:bg-accent-hover active:translate-y-px cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:transform-none"
            >
              Start free trial
            </Link>
          </div>
          <button
            type="button"
            className="cursor-pointer rounded-lg p-2 text-muted-foreground transition-colors duration-200 hover:bg-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden motion-reduce:transition-none"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X aria-hidden="true" className="h-5 w-5" /> : <Menu aria-hidden="true" className="h-5 w-5" />}
          </button>
        </nav>
        {mobileOpen && (
          <div className="border-t border-edge bg-background px-5 py-4 md:hidden">
            <div className="flex flex-col gap-1">
              {[
                ["Features", "#features"],
                ["Product", "#product"],
                ["Pricing", "#pricing"],
                ["FAQ", "#faq"],
              ].map(([label, href]) => (
                <a
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className="cursor-pointer rounded-lg px-3 py-2.5 text-[14px] font-medium text-muted-foreground transition-colors duration-200 hover:bg-tint hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                >
                  {label}
                </a>
              ))}
              <div className="mt-2 flex gap-2 border-t border-edge pt-3">
                <Link
                  href="/login"
                  className="flex-1 cursor-pointer rounded-lg border border-edge px-3 py-2.5 text-center text-[14px] font-semibold transition-colors duration-200 hover:bg-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                >
                  Log in
                </Link>
                <Link
                  href="/register"
                  className="flex-1 rounded-lg bg-accent px-3 py-2.5 text-center text-[14px] font-semibold text-white transition-colors duration-200 hover:bg-accent-hover cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
                >
                  Start free trial
                </Link>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Aurora background: blue mesh blobs + grid. Static under reduced motion. */}
        <div className="pointer-events-none absolute inset-0 motion-reduce:animate-none" aria-hidden>
          <div className="absolute inset-0 bg-grid" />
          <div className="absolute -top-32 left-1/2 h-[520px] w-[min(820px,150vw)] -translate-x-1/2 rounded-full bg-primary/25 blur-[120px] motion-reduce:transform-none" />
          <div className="absolute -left-24 top-40 h-72 w-72 rounded-full bg-[#3B82F6]/10 blur-[100px]" />
          <div className="absolute -right-24 top-64 h-72 w-72 rounded-full bg-[#60A5FA]/10 blur-[100px]" />
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 60% 45% at 50% 0%, rgba(37,99,235,0.14), transparent 70%)",
            }}
          />
        </div>

        <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-20 sm:pt-28">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-edge bg-tint px-3.5 py-1.5 text-[12px] font-medium text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              HRMS · Attendance · Payroll · Field tracking — for Indian teams
            </span>
            <h1 className="mt-6 font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">
              Run your workforce on{" "}
              <span className="text-gradient">one simple platform</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-[15.5px] leading-relaxed text-muted-foreground sm:text-lg">
              Geofenced attendance, shift rosters, leaves, payroll with PF·ESIC·TDS·LWF, field GPS
              tracking and an AI assistant — everything in one workspace your team will actually use.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/register"
                className={cn("group inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-[15px] font-semibold transition-all duration-200", CTA_PRIMARY)}
              >
                Start free trial
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:transform-none" aria-hidden="true" />
              </Link>
              <a
                href="#pricing"
                className={cn("inline-flex items-center gap-2 rounded-xl border bg-card px-6 py-3.5 text-[15px] font-semibold transition-colors duration-200", CTA_SECONDARY)}
              >
                See pricing
              </a>
            </div>
            <p className="mt-4 text-[13px] text-muted-foreground">
              Prefer a walkthrough?{" "}
              <a
                href="mailto:sales@peoplenexa.in?subject=PeopleNexa demo"
                className="cursor-pointer font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Book a demo
              </a>{" "}
              — we’ll set up your workspace with you.
            </p>
            <p className="mt-4 text-[13px] text-muted-foreground">Free 30-day trial · No credit card · Hindi & regional languages</p>
          </div>

          {/* Product mockup — glass dashboard preview */}
          <div className="relative mx-auto mt-14 max-w-4xl">
            <div className="absolute inset-x-0 -top-6 h-40 rounded-full bg-primary/20 blur-3xl" aria-hidden />
            <div className="card-surface relative rounded-2xl border-white/20 bg-white/70 p-5 shadow-2xl backdrop-blur-xl dark:bg-white/5 sm:p-7">
              <div className="flex items-center justify-between border-b border-edge pb-4">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-white">PN</span>
                  <span className="truncate text-[13px] font-semibold">Apex Integrations</span>
                  <span className="rounded-md bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-300">live</span>
                </div>
                <div className="hidden gap-1.5 sm:flex">
                  <span className="rounded-md bg-tint px-2 py-1 text-[11px] text-muted-foreground">Today</span>
                  <span className="rounded-md bg-tint px-2 py-1 text-[11px] text-muted-foreground">Rosters</span>
                  <span className="rounded-md bg-tint px-2 py-1 text-[11px] text-muted-foreground">Payroll</span>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
                {[
                  { label: "Present", value: "42", tone: "text-emerald-300" },
                  { label: "On leave", value: "3", tone: "text-amber-300" },
                  { label: "Late today", value: "5", tone: "text-rose-300" },
                ].map((s) => (
                  <div key={s.label} className="min-w-0 rounded-xl border border-edge bg-tint p-3.5">
                    <p className="truncate text-[11px] text-muted-foreground">{s.label}</p>
                    <p className={cn("mt-1 font-display text-2xl font-bold", s.tone)}>{s.value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-edge bg-tint p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Live punches</p>
                  <div className="mt-3 space-y-2.5">
                    {[
                      { n: "Rahul S.", t: "In · 09:01", tag: "Main branch" },
                      { n: "Priya P.", t: "In · 09:04", tag: "Main branch" },
                      { n: "Neha G.", t: "In · 10:12", tag: "Vatva plant" },
                    ].map((p) => (
                      <div key={p.n} className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary dark:text-[#93C5FD]">
                            {p.n.split(" ").map((w) => w[0]).join("")}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[12.5px] font-medium">{p.n}</p>
                            <p className="truncate text-[11px] text-muted-foreground">{p.tag}</p>
                          </div>
                        </div>
                        <span className="flex shrink-0 items-center gap-1 text-[11.5px] font-medium text-emerald-300">
                          <MapPin className="h-3 w-3" aria-hidden="true" /> {p.t}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-edge bg-tint p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Geofence · Main branch</p>
                  <div className="mt-3 flex h-32 items-center justify-center rounded-lg bg-grid">
                    <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-primary/40 bg-primary/10">
                      <div className="absolute -inset-3 rounded-full border border-primary/20" />
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white">
                        <MapPin className="h-4 w-4" aria-hidden="true" />
                      </span>
                    </div>
                  </div>
                  <p className="mt-2.5 text-[11.5px] text-muted-foreground">200 m radius · auto punch-out at 18:30</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust band ─────────────────────────────────────────────────── */}
      <section aria-label="Trusted at scale" className="border-y border-edge bg-tint/50">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-5 py-8 sm:grid-cols-3">
          {TRUST_BAND.map((s) => (
            <div key={s.label} className="min-w-0 text-center">
              <p className="font-display text-2xl font-bold tracking-tight text-gradient sm:text-3xl">{s.value}</p>
              <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Value prop + key features ──────────────────────────────────── */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className={cn("text-[12px] font-semibold uppercase tracking-widest", EYEBROW)}>Everything in one place</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            One workspace. <span className="text-gradient">Every people task.</span>
          </h2>
          <p className="mt-4 text-[15px] text-muted-foreground">
            Twenty-three modules that talk to each other — so attendance, leaves and payroll never
            need re-typing anywhere.
          </p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="card-surface group rounded-2xl border-white/20 bg-white/70 p-5 backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_12px_40px_-16px_rgba(37,99,235,0.35)] motion-reduce:transition-none motion-reduce:transform-none dark:bg-white/5"
            >
              <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-[0_6px_20px_-6px_rgba(37,99,235,0.6)]", ICON_TILE)}>
                <f.icon className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 font-display text-[15.5px] font-bold tracking-tight">{f.title}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Field force (route replay mockup) ───────────────────────────── */}
      <section id="field" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="min-w-0">
            <p className={cn("text-[12px] font-semibold uppercase tracking-widest", EYEBROW)}>Field force</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Know your team is on site — <span className="text-gradient">not just “clocked in”</span>
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
              Field reps check in with a selfie at the customer site. Their route is recorded and can be
              replayed later — visits, distance and timestamps — so you can verify work without shadowing anyone.
            </p>
            <ul className="mt-6 space-y-3 text-[14px] text-muted-foreground">
              {[
                "Selfie + GPS check-in at each stop",
                "Route replay with visit timestamps",
                "Expense claims filed from the field, approved from HQ",
              ].map((li) => (
                <li key={li} className="flex items-center gap-2.5">
                  <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full", ICON_SOFT)}>
                    <Check className="h-3 w-3" aria-hidden="true" />
                  </span>
                  {li}
                </li>
              ))}
            </ul>
          </div>
          {/* Route-replay mockup */}
          <div className="relative min-w-0">
            <div className="absolute -inset-6 rounded-full bg-[#3B82F6]/10 blur-3xl" aria-hidden />
            <div className="card-surface relative rounded-2xl border-white/20 bg-white/70 p-5 shadow-2xl backdrop-blur-xl dark:bg-white/5">
              <div className="flex items-center justify-between border-b border-edge pb-3.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white", ICON_TILE)}>
                    <Route className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <span className="truncate text-[13px] font-semibold">Journey · Rahul S.</span>
                </div>
                <span className="shrink-0 rounded-md bg-tint px-2 py-1 text-[11px] text-muted-foreground">Replay</span>
              </div>
              <div className="relative mt-4 h-56 overflow-hidden rounded-xl bg-grid">
                <svg viewBox="0 0 400 220" className="absolute inset-0 h-full w-full" aria-hidden>
                  <path
                    d="M 40 180 L 120 140 L 190 165 L 260 100 L 330 60 L 370 40"
                    fill="none"
                    stroke="url(#routeGrad)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="6 6"
                  />
                  <defs>
                    <linearGradient id="routeGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#2563EB" />
                      <stop offset="100%" stopColor="#3B82F6" />
                    </linearGradient>
                  </defs>
                </svg>
                {[
                  { x: 40, y: 180, tag: "HQ" },
                  { x: 190, y: 165, tag: "10:20" },
                  { x: 260, y: 100, tag: "11:05" },
                  { x: 330, y: 60, tag: "12:40" },
                ].map((p) => (
                  <span key={p.tag} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${(p.x / 400) * 100}%`, top: `${(p.y / 220) * 100}%` }}>
                    <span className="block h-3 w-3 rounded-full border-2 border-white bg-primary shadow-[0_0_0_4px_rgba(37,99,235,0.25)]" />
                    <span className="mt-1 block rounded-md bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm">{p.tag}</span>
                  </span>
                ))}
              </div>
              <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
                <span>12 stops · 34 km</span>
                <span className="inline-flex items-center gap-1">
                  <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" /> Geofence verified
                </span>
                <span>Out 18:02</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Ask AI (chat mockup) ────────────────────────────────────────── */}
      <section id="product" className="scroll-mt-20 border-y border-edge bg-tint/40">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="order-2 min-w-0 lg:order-1">
              {/* Chat mockup */}
              <div className="card-surface rounded-2xl border-white/20 bg-white/70 p-5 shadow-2xl backdrop-blur-xl dark:bg-white/5">
                <div className="flex items-center gap-2.5 border-b border-edge pb-3.5">
                  <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white", ICON_TILE)}>
                    <Bot className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold">Ask AI</p>
                    <p className="text-[11px] text-muted-foreground">Answers over your live data</p>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-primary/10 px-4 py-2.5 text-[13px]">
                    Who was late last week?
                  </div>
                  <div className="max-w-[92%] rounded-2xl rounded-bl-sm border border-edge bg-tint px-4 py-3 text-[13px] leading-relaxed">
                    <span className="font-medium text-foreground">3 employees</span> were late across both
                    branches. <span className="font-medium text-foreground">Rahul S.</span> (2×),{" "}
                    <span className="font-medium text-foreground">Amit D.</span> (1×),{" "}
                    <span className="font-medium text-foreground">Vikram S.</span> (1×). Estimated late-fine
                    impact: <span className="font-medium text-emerald-300">₹150</span>. Want the payroll
                    impact for this month?
                  </div>
                  <div className="flex items-center gap-2 rounded-2xl border border-edge bg-card px-4 py-2.5 text-[12.5px] text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                    Try: “How many paid leaves did Sales take this quarter?”
                  </div>
                </div>
              </div>
            </div>
            <div className="order-1 min-w-0 lg:order-2">
              <p className={cn("text-[12px] font-semibold uppercase tracking-widest", EYEBROW)}>Ask AI</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Questions in plain language. <span className="text-gradient">Answers in seconds.</span>
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
                No dashboard digging. Ask about attendance trends, payroll figures, leave balances or
                anything in between — the AI reads your workspace data and answers in plain language.
              </p>
              <ul className="mt-6 space-y-3 text-[14px] text-muted-foreground">
                {[
                  "Works over your real attendance, payroll and leave data",
                  "Answers with numbers you can verify — not summaries",
                  "Available to admins and employees in their own language",
                ].map((li) => (
                  <li key={li} className="flex items-center gap-2.5">
                    <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full", ICON_SOFT)}>
                      <Check className="h-3 w-3" aria-hidden="true" />
                    </span>
                    {li}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Who it's for ────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className={cn("text-[12px] font-semibold uppercase tracking-widest", EYEBROW)}>Built for real teams</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">One tool, every kind of workforce</h2>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {PERSONAS.map((p) => (
            <div key={p.title} className="card-surface rounded-2xl border-white/20 bg-white/70 p-6 backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 motion-reduce:transition-none motion-reduce:transform-none dark:bg-white/5">
              <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl text-white", ICON_TILE)}>
                <p.icon className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 font-display text-[15.5px] font-bold tracking-tight">{p.title}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section className="scroll-mt-20 border-y border-edge bg-tint/40">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className={cn("text-[12px] font-semibold uppercase tracking-widest", EYEBROW)}>How it works</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">Live in 10 minutes</h2>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="relative rounded-2xl border border-edge bg-card p-6">
                <span className="font-display text-[44px] font-bold leading-none text-gradient">{s.n}</span>
                <h3 className="mt-4 font-display text-[16px] font-bold tracking-tight">{s.title}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── About PeopleNexa (E-E-A-T trust content) ───────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="min-w-0">
            <p className={cn("text-[12px] font-semibold uppercase tracking-widest", EYEBROW)}>About PeopleNexa</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Built in India, <span className="text-gradient">for Indian teams</span>
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
              PeopleNexa started with a simple problem: most HR software for Indian SMEs is either a
              global tool that doesn’t understand PF, ESIC and TDS, or a spreadsheet jungle that does
              nothing automatically. We built one platform where attendance, leaves, payroll and field
              tracking actually talk to each other — so a punch becomes a payslip without anyone
              re-typing a number.
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
              It’s the same tool for a 6-person office and a 200-seat multi-branch company, in 10+
              languages, with data hosted in India. If you run payroll for a team in this country,
              PeopleNexa was built for you.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="mailto:sales@peoplenexa.in"
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-edge-strong bg-card px-5 py-2.5 text-[13.5px] font-semibold transition-colors duration-200 hover:bg-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              >
                <MessageSquareText className="h-4 w-4 text-primary" aria-hidden="true" /> sales@peoplenexa.in
              </a>
              <a
                href="tel:+919100960692"
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-edge-strong bg-card px-5 py-2.5 text-[13.5px] font-semibold transition-colors duration-200 hover:bg-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              >
                <PhoneCall className="h-4 w-4 text-primary" aria-hidden="true" /> +91 91009 60692
              </a>
            </div>
          </div>
          <div className="card-surface rounded-2xl border-white/20 bg-white/70 p-6 backdrop-blur-xl dark:bg-white/5 sm:p-7">
            <p className="text-[12px] font-semibold uppercase tracking-widest text-muted-foreground/70">Company facts</p>
            <dl className="mt-4 space-y-4">
              {[
                ["Headquarters", "Hyderabad, Telangana, India"],
                ["Founded for", "Indian SMEs & field teams"],
                ["Workspaces", "One platform for office, field & multi-branch teams"],
                ["Languages", "10+ languages, incl. EN · हिं · ગુ · मरा · தமிழ்"],
                ["Statutory coverage", "PF · ESIC · PT · TDS · LWF"],
                ["Data hosting", "India"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-4 border-b border-edge pb-3.5 last:border-0 last:pb-0">
                  <dt className="shrink-0 text-[13px] font-medium text-muted-foreground">{k}</dt>
                  <dd className="min-w-0 text-right text-[13.5px] font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ── Security & privacy ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className={cn("text-[12px] font-semibold uppercase tracking-widest", EYEBROW)}>Security & privacy</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">Your data, and your team’s trust</h2>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SECURITY.map((s) => (
            <div key={s.title} className="card-surface rounded-2xl border-white/20 bg-white/70 p-5 backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 motion-reduce:transition-none motion-reduce:transform-none dark:bg-white/5">
              <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl text-white", ICON_TILE)}>
                <s.icon className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 font-display text-[15px] font-bold tracking-tight">{s.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <Pricing plans={plans} />
      <Faq />

      {/* ── Final CTA (deep CTA) ────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute left-1/2 top-1/2 h-80 w-[min(700px,140vw)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-[110px] motion-reduce:transform-none" />
        </div>
        <div className="relative mx-auto max-w-3xl px-5 py-24 text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-5xl">
            Ready to run payroll <span className="text-gradient">this month?</span>
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[15px] text-muted-foreground">
            Set up your workspace in minutes — attendance, rosters and statutory payroll, all in one place.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/register"
              className={cn("group inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-[15px] font-semibold transition-all duration-200 hover:brightness-100", CTA_PRIMARY, "shadow-[0_8px_32px_-8px_rgba(194,65,12,0.7)]")}
            >
              Create your workspace
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:transform-none" aria-hidden="true" />
            </Link>
            <Link
              href="/login"
              className={cn("inline-flex items-center gap-2 rounded-xl border bg-card px-7 py-3.5 text-[15px] font-semibold transition-colors duration-200", CTA_SECONDARY)}
            >
              I already have an account
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-edge bg-tint/40">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-5 py-10 sm:flex-row">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="PeopleNexa logo" className="h-7 w-7" />
            <div>
              <p className="font-display text-[14px] font-bold tracking-tight">PeopleNexa</p>
              <p className="text-[11.5px] text-muted-foreground">© {new Date().getFullYear()} PeopleNexa · Made in India</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] font-medium text-muted-foreground">
            <a href="#features" className="cursor-pointer transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Features</a>
            <a href="#pricing" className="cursor-pointer transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Pricing</a>
            <a href="#faq" className="cursor-pointer transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">FAQ</a>
            <Link href="/login" className="cursor-pointer transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Log in</Link>
            <Link href="/register" className="cursor-pointer transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Start free trial</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ── Pricing (monthly / annual toggle, live plan data) ──────────────────── */

function Pricing({ plans }: { plans: PlanDef[] }) {
  const [annual, setAnnual] = useState(false);

  const sorted = [...plans].sort((a, b) => {
    const order: Record<string, number> = { trial: 0, starter: 1, growth: 2, pro: 3, enterprise: 4 };
    return (order[a.key] ?? 5) - (order[b.key] ?? 5);
  });
  const featured = "pro";
  const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  return (
    <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <p className={cn("text-[12px] font-semibold uppercase tracking-widest", EYEBROW)}>Pricing</p>
        <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">Simple per-seat pricing</h2>
        <p className="mt-4 text-[15px] text-muted-foreground">
          Start free, upgrade when you grow. Every paid plan includes everything you need to run payroll.
        </p>

        <div className="mt-7 inline-flex max-w-full items-center gap-1 rounded-xl border border-edge bg-tint p-1">
          <button
            type="button"
            onClick={() => setAnnual(false)}
            aria-pressed={!annual}
            className={cn(
              "cursor-pointer rounded-lg px-4 py-1.5 text-[13px] font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
              !annual ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setAnnual(true)}
            aria-pressed={annual}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded-lg px-4 py-1.5 text-[13px] font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
              annual ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Annual
            <span className="rounded-md bg-emerald-400/10 px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-emerald-300">Save ~20%</span>
          </button>
        </div>
      </div>

      <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {sorted.map((p) => {
          const isFeatured = p.key === featured;
          const isTrial = p.key === "trial";
          const isEnterprise = p.key === "enterprise";
          const monthly = p.pricePerSeat;
          const annualEq = p.annualPricePerSeat > 0 ? p.annualPricePerSeat : p.pricePerSeat;
          const price = annual ? annualEq : monthly;
          const savings = monthly > 0 && annualEq > 0 && annualEq < monthly ? Math.round((1 - annualEq / monthly) * 100) : 0;

          return (
            <div
              key={p.key}
              className={cn(
                "card-surface relative flex min-w-0 flex-col rounded-2xl border-white/20 bg-white/70 p-6 backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:transform-none dark:bg-white/5",
                isFeatured && "border-primary/40 shadow-[0_16px_48px_-16px_rgba(37,99,235,0.5)]"
              )}
            >
              {isFeatured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent px-3 py-1 text-[10.5px] font-bold uppercase tracking-wider text-white shadow-lg">
                  Most popular
                </span>
              )}
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-[15px] font-bold capitalize tracking-tight">{p.label}</h3>
                {isTrial && <span className="rounded-md bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">Free</span>}
              </div>
              <p className="mt-1.5 min-h-10 text-[12.5px] leading-relaxed text-muted-foreground">{p.blurb}</p>

              <div className="mt-4 flex items-baseline gap-1">
                {isEnterprise ? (
                  <span className="font-display text-2xl font-bold tracking-tight">Custom</span>
                ) : (
                  <>
                    <span className="font-display text-3xl font-bold tracking-tight">{isTrial ? "₹0" : inr(price)}</span>
                    <span className="text-[12px] text-muted-foreground">/seat/mo</span>
                  </>
                )}
              </div>
              {!isTrial && !isEnterprise && (
                <p className="mt-1 text-[11.5px] text-muted-foreground">
                  {annual && savings > 0 ? (
                    <>
                      {inr(annualEq * 12)}/seat billed yearly · <span className="text-emerald-300">save {savings}%</span>
                    </>
                  ) : annual ? (
                    `${inr(annualEq * 12)}/seat billed yearly`
                  ) : (
                    `Billed monthly · ${inr(monthly * 12)}/year`
                  )}
                </p>
              )}

              <ul className="mt-5 space-y-2 border-t border-edge pt-4 text-[12.5px] text-muted-foreground">
                {isTrial ? (
                  <>
                    <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden="true" /> All {MODULES.length} modules enabled</li>
                    <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden="true" /> {p.seats} seats for {p.trialDays} days</li>
                    <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden="true" /> No credit card</li>
                  </>
                ) : isEnterprise ? (
                  <>
                    <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden="true" /> Everything in Pro</li>
                    <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden="true" /> Unlimited seats</li>
                    <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden="true" /> Dedicated onboarding</li>
                  </>
                ) : (
                  <>
                    <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden="true" /> {p.seats.toLocaleString("en-IN")} seats</li>
                    <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden="true" /> {p.modules.length} modules</li>
                    <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden="true" /> {p.trialDays > 0 ? `${p.trialDays}-day trial` : "No trial"}</li>
                  </>
                )}
              </ul>

              <div className="mt-auto pt-6">
                {isEnterprise ? (
                  <a
                    href="mailto:sales@peoplenexa.in?subject=PeopleNexa Enterprise"
                    className={cn(
                      "flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-edge-strong px-4 py-2.5 text-[13.5px] font-semibold transition-colors duration-200",
                      "hover:bg-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                    )}
                  >
                    <PhoneCall className="h-3.5 w-3.5" aria-hidden="true" /> Contact sales
                  </a>
                ) : (
                  <Link
                    href="/register"
                    className={cn(
                      "flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none",
                      isFeatured
                        ? "bg-accent text-white shadow-[0_8px_28px_-8px_rgba(194,65,12,0.7)] hover:bg-accent-hover"
                        : "border border-edge-strong hover:bg-tint"
                    )}
                  >
                    {isTrial ? "Start free trial" : "Start free trial"}
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-6 text-center text-[12.5px] text-muted-foreground">
        All prices in INR, per seat per month. Need something custom? <a href="mailto:sales@peoplenexa.in" className="cursor-pointer font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Talk to us</a>.
      </p>
    </section>
  );
}

/* ── FAQ ────────────────────────────────────────────────────────────────── */

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="scroll-mt-20 border-t border-edge bg-tint/40">
      <div className="mx-auto max-w-3xl px-5 py-20">
        <div className="text-center">
          <p className={cn("text-[12px] font-semibold uppercase tracking-widest", EYEBROW)}>FAQ</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Questions, answered</h2>
        </div>
        <div className="mt-10 space-y-3">
          {FAQS.map((f, i) => (
            <div key={f.q} className="card-surface overflow-hidden rounded-2xl border-white/20 bg-white/70 backdrop-blur-xl dark:bg-white/5">
              <button
                type="button"
                onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left transition-colors duration-200 hover:bg-tint/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none"
                aria-expanded={open === i}
              >
                <span className="text-[14.5px] font-semibold">{f.q}</span>
                <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform duration-200 motion-reduce:transition-none dark:text-[#93C5FD]", open === i && "rotate-45")}>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </button>
              {open === i && (
                <p className="border-t border-edge px-5 py-4 text-[13.5px] leading-relaxed text-muted-foreground">{f.a}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
