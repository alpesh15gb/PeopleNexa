"use client";

import { Button } from "@/components/ui/button";

export function TimeWorkspaceError({ label, retry }: { label: string; retry: () => void }) {
  return (
    <div role="alert" className="space-y-3 rounded-xl border border-edge bg-card p-5">
      <p className="font-semibold">Could not load {label}.</p>
      <Button onClick={retry} variant="outline">Try again</Button>
    </div>
  );
}
