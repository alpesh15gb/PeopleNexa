export function TimeWorkspaceLoading({ label }: { label: string }) {
  return (
    <div role="status" className="space-y-4" aria-label={`Loading ${label}`}>
      <p className="text-sm text-muted-foreground">Loading {label}…</p>
      <div aria-hidden="true" className="space-y-3 rounded-xl border border-edge bg-card p-4 motion-safe:animate-pulse">
        <div className="h-8 w-2/5 rounded-lg bg-tint" />
        <div className="h-14 rounded-lg bg-tint" />
        <div className="h-14 rounded-lg bg-tint" />
        <div className="h-14 rounded-lg bg-tint" />
      </div>
    </div>
  );
}
