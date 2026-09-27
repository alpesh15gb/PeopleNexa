import Link from "next/link";
import type { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkspaceTab = { label: string; href: string };

export function SettingsWorkspace({
  eyebrow = "PeopleNexa workspace",
  title,
  description,
  tabs,
  progress,
  children,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description: ReactNode;
  tabs?: WorkspaceTab[];
  progress?: { label: string; complete: number; total: number; detail: string };
  children: ReactNode;
  className?: string;
}) {
  const percentage = progress ? Math.round((progress.complete / progress.total) * 100) : 0;
  return (
    <main className={cn("settings-workspace animate-fade-up", className)}>
      <header className="settings-workspace__header">
        <p className="settings-workspace__eyebrow">{eyebrow}</p>
        <h1 className="settings-workspace__title">{title}</h1>
        <p className="settings-workspace__description">{description}</p>
        {progress && <section aria-label={progress.label} className="settings-workspace__progress">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold text-foreground">{progress.label}</span>
            <span className="font-medium text-primary">{progress.complete} of {progress.total}</span>
          </div>
          <div className="settings-workspace__track" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.complete} aria-label={progress.label}>
            <span style={{ width: `${percentage}%` }} />
          </div>
          <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-muted-foreground"><CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{progress.detail}</p>
        </section>}
      </header>
      {tabs && tabs.length > 0 && <nav aria-label="Workspace sections" className="settings-workspace__tabs">
        {tabs.map((tab) => <Link key={tab.href} href={tab.href}>{tab.label}</Link>)}
      </nav>}
      <div className="settings-workspace__body">{children}</div>
    </main>
  );
}
