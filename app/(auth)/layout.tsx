import type { ReactNode } from "react";
import { MapPin, ShieldCheck, CalendarClock, BarChart3 } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="bg-grid relative hidden overflow-hidden border-r border-edge bg-sidebar lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div
          className="pointer-events-none absolute -left-40 -top-40 h-[480px] w-[480px] rounded-full opacity-25 blur-3xl"
          style={{ background: "radial-gradient(circle, #6366f1 0%, transparent 65%)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-48 -right-24 h-[480px] w-[480px] rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(circle, #8b5cf6 0%, transparent 65%)" }}
        />

        <div className="relative">
          <div className="flex h-11 items-center rounded-xl bg-white px-3 shadow-[0_8px_30px_-10px_rgba(0,0,0,0.7)]">
            <img src="/logo.png" alt="PeopleNexa logo" className="h-6 w-auto" />
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="font-display text-4xl font-bold leading-[1.15] tracking-tight">
            Attendance that <span className="text-gradient">works for everyone.</span>
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
            GPS-verified clock-ins, smart late detection, leave management and instant reports — built for
            teams that move fast.
          </p>
          <div className="mt-8 space-y-3.5">
            {[
              { icon: <MapPin className="h-4 w-4" />, text: "Geofenced punch-in with location verification" },
              { icon: <ShieldCheck className="h-4 w-4" />, text: "Role-based admin & employee portals" },
              { icon: <CalendarClock className="h-4 w-4" />, text: "Shift grace periods & automatic late marking" },
              { icon: <BarChart3 className="h-4 w-4" />, text: "13+ report views with one click" },
            ].map((f) => (
              <div key={f.text} className="flex items-center gap-3 text-[13.5px] text-foreground/85">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-indigo-400/20 bg-indigo-500/10 text-indigo-300">
                  {f.icon}
                </span>
                {f.text}
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-[12px] text-muted-foreground/70">
          © {new Date().getFullYear()} PeopleNexa · Apex Integrations
        </p>
      </div>

      {/* Form panel */}
      <div className="relative flex items-center justify-center bg-background px-4 py-12 sm:px-8">
        <div className="absolute right-5 top-5">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
