"use client";

export function WeekChart({ data }: { data: { day: string; label: string; present: number; late: number; absent: number }[] }) {
  const max = Math.max(...data.map((d) => d.present + d.late + d.absent), 1);
  return (
    <div>
      <div className="flex h-36 items-end gap-2">
        {data.map((d) => {
          const total = d.present + d.late + d.absent;
          return (
            <div key={d.day} className="group relative flex flex-1 flex-col items-center justify-end gap-1">
              <div className="flex w-full flex-col-reverse items-center gap-px" style={{ height: `${Math.max((total / max) * 100, 4)}%` }}>
                <div
                  className="w-full rounded-t-md bg-rose-400/70 transition-all"
                  style={{ height: `${d.absent ? Math.max((d.absent / max) * 100, 3) : 0}%` }}
                />
                <div
                  className="w-full rounded-t-md bg-amber-400/80 transition-all"
                  style={{ height: `${d.late ? Math.max((d.late / max) * 100, 3) : 0}%` }}
                />
                <div
                  className="w-full rounded-t-md bg-emerald-400/80 transition-all"
                  style={{ height: `${d.present ? Math.max((d.present / max) * 100, 3) : 0}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">{d.label}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-edge pt-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400/80" /> Present</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400/80" /> Late</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-400/70" /> Absent</span>
      </div>
    </div>
  );
}
