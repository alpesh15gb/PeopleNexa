"use client";

export function DepartmentBars({ data }: { data: { name: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const summary = data.map((d) => `${d.name}: ${d.count}`).join("; ");
  return (
    <div>
      <div role="img" aria-label={`Headcount by department: ${summary}`} className="space-y-3">
        {data.map((d) => (
          <div key={d.name} title={`${d.name}: ${d.count} employee${d.count === 1 ? "" : "s"}`} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-[12.5px]">
              <span className="min-w-0 flex-1 truncate font-medium">{d.name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{d.count}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-tint-strong">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max((d.count / max) * 100, 6)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      {/* Screen-reader data table for the same breakdown */}
      <table className="sr-only">
        <caption>Headcount by department</caption>
        <thead>
          <tr>
            <th scope="col">Department</th>
            <th scope="col">Employees</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.name}>
              <th scope="row">{d.name}</th>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
