"use client";

export function WeekChart({ data }: { data: { day: string; label: string; present: number; late: number; absent: number }[] }) {
  const max = Math.max(...data.map((d) => d.present + d.late + d.absent), 1);
  const summary = data.map((d) => `${d.label}: ${d.present} present, ${d.late} late, ${d.absent} absent`).join("; ");
  return (
    <div>
      <div role="img" aria-label={`Weekly attendance: ${summary}`} className="flex h-36 items-end gap-2">
        {data.map((d) => {
          const total = d.present + d.late + d.absent;
          const tip = `${d.label}: ${d.present} present, ${d.late} late, ${d.absent} absent`;
          return (
            <div key={d.day} title={tip} className="group relative flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span aria-hidden="true" className="flex h-4 items-center rounded-md border border-edge bg-card px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-foreground shadow-sm motion-safe:opacity-0 motion-safe:group-hover:opacity-100">{total}</span>
              <div className="flex w-full flex-col-reverse items-center gap-px" style={{ height: `${Math.max((total / max) * 100, 4)}%` }}>
                <div
                  aria-hidden="true"
                  className="w-full rounded-t-md bg-rose-600 transition-all dark:bg-rose-400"
                  style={{ height: `${d.absent ? Math.max((d.absent / max) * 100, 3) : 0}%` }}
                />
                <div
                  aria-hidden="true"
                  className="w-full rounded-t-md bg-amber-600 transition-all dark:bg-amber-400"
                  style={{ height: `${d.late ? Math.max((d.late / max) * 100, 3) : 0}%` }}
                />
                <div
                  aria-hidden="true"
                  className="w-full rounded-t-md bg-emerald-600 transition-all dark:bg-emerald-400"
                  style={{ height: `${d.present ? Math.max((d.present / max) * 100, 3) : 0}%` }}
                />
              </div>
              <span className="max-w-full truncate text-[10px] text-muted-foreground">{d.label}</span>
            </div>
          );
        })}
      </div>
      {/* Screen-reader data table for the same week */}
      <table className="sr-only">
        <caption>Weekly attendance breakdown</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Present</th>
            <th scope="col">Late</th>
            <th scope="col">Absent</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}>
              <th scope="row">{d.label}</th>
              <td>{d.present}</td>
              <td>{d.late}</td>
              <td>{d.absent}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-edge pt-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-600 dark:bg-emerald-400" /> Present</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-600 dark:bg-amber-400" /> Late</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-600 dark:bg-rose-400" /> Absent</span>
      </div>
    </div>
  );
}
