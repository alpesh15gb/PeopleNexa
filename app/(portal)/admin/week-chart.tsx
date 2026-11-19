export function WeekChart({ data }: { data: { day: string; label: string; present: number; late: number; absent: number }[] }) {
  const max = Math.max(0, ...data.map((day) => day.present + day.late + day.absent));
  if (max === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No attendance activity this month.</p>;
  }

  return (
    <div>
      <div role="region" aria-label="Attendance chart" tabIndex={0} className="overflow-x-auto rounded-md pb-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
       <div aria-hidden="true" className="flex min-w-max items-end gap-1">
        {data.map((d) => {
          const total = d.present + d.late + d.absent;
          const tip = `${d.label} · ${d.present} present · ${d.late} late · ${d.absent} absent`;
          return (
            <div key={d.day} title={tip} className="flex min-w-9 flex-1 flex-col items-center justify-end gap-1 px-0.5">
              <span className="text-[10px] font-semibold tabular-nums text-foreground">{total || "\u00a0"}</span>
              <div className="flex w-full flex-col-reverse overflow-hidden rounded-t-md" style={{ height: (total / max) * 96 }}>
                <div className="bg-emerald-600 dark:bg-emerald-400" style={{ flex: d.present }} />
                <div className="bg-amber-600 dark:bg-amber-400" style={{ flex: d.late }} />
                <div className="bg-rose-600 dark:bg-rose-400" style={{ flex: d.absent }} />
              </div>
              <span className="text-[10px] text-muted-foreground">{d.label}</span>
            </div>
          );
        })}
       </div>
      </div>
      <table className="sr-only">
        <caption>Attendance by day this month</caption>
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
