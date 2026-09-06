import type { ReactNode } from "react";
import { MapPin, ShieldCheck, CalendarClock, BarChart3, ArrowUpRight } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

const proofPoints = [
  { icon: MapPin, title: "Verified attendance", text: "Location-aware punch-ins for distributed teams." },
  { icon: ShieldCheck, title: "Built for trust", text: "Role-based access keeps people data in the right hands." },
  { icon: CalendarClock, title: "Fewer follow-ups", text: "Leave, shifts, and regularisation stay in one place." },
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(420px,0.95fr)_1.05fr]"
      style={{ fontFamily: "'Plus Jakarta Sans', ui-sans-serif, system-ui, -apple-system, sans-serif" }}
    >
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
        rel="stylesheet"
      />
      <style>{`.font-display{font-family:'Plus Jakarta Sans',ui-sans-serif,system-ui,sans-serif !important}@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:0.01ms !important;animation-iteration-count:1 !important;transition-duration:0.01ms !important}html{scroll-behavior:auto !important}}`}</style>
      <aside className="relative hidden overflow-hidden border-r border-edge bg-sidebar lg:flex lg:flex-col lg:justify-between lg:p-10 xl:p-14">
        <div className="pointer-events-none absolute -left-32 -top-32 h-[440px] w-[440px] rounded-full bg-primary/10 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-48 -right-24 h-[520px] w-[520px] rounded-full bg-[#3B82F6]/10 blur-3xl" aria-hidden />
        <div className="relative flex items-center justify-between">
          <div className="flex h-11 items-center rounded-[11px] bg-white px-3 shadow-[0_8px_28px_-12px_rgba(16,24,40,0.35)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="PeopleNexa logo" className="h-6 w-auto" />
          </div>
          <span className="rounded-full border border-edge bg-tint px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            HR workspace
          </span>
        </div>

        <div className="relative max-w-xl py-16">
          <p className="mb-5 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.15em] text-primary dark:text-[#93C5FD]">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden /> People operations, made clear
          </p>
          <h1 className="max-w-lg font-display text-[clamp(2.6rem,4vw,4.5rem)] font-bold leading-[1.04] tracking-[-0.05em] text-foreground">
            Give every workday a better backbone.
          </h1>
          <p className="mt-6 max-w-lg text-[15px] leading-7 text-muted-foreground">
            PeopleNexa brings attendance, leave, payroll, and employee care into one dependable place — so your team can focus on the work, not the paperwork.
          </p>

          <div className="mt-10 grid gap-3">
            {proofPoints.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex items-start gap-3 rounded-2xl border border-white/20 bg-card/65 p-3.5 shadow-[0_10px_30px_-26px_rgba(16,24,40,0.35)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/70 dark:supports-[backdrop-filter]:bg-white/5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary dark:text-[#93C5FD]">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-foreground">{title}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{text}</p>
                </div>
                <ArrowUpRight className="ml-auto mt-1 h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden="true" />
              </div>
            ))}
          </div>

          <div className="mt-8 flex items-center gap-3 text-[12px] text-muted-foreground">
            <BarChart3 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
            <span>One view for the moments that need your attention.</span>
          </div>
        </div>

        <p className="relative text-[12px] text-muted-foreground/70">© {new Date().getFullYear()} PeopleNexa · Apex Integrations</p>
      </aside>

      <main className="relative flex min-h-screen items-center justify-center px-4 py-10 sm:px-8 lg:px-16">
        <div className="absolute right-5 top-5 flex items-center gap-3 sm:right-8 sm:top-8">
          <span className="hidden text-[12px] text-muted-foreground sm:block">Your team&apos;s workspace</span>
          <ThemeToggle />
        </div>
        <div className="w-full max-w-[430px]">{children}</div>
      </main>
    </div>
  );
}
