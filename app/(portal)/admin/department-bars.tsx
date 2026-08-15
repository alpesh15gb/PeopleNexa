"use client";

export function DepartmentBars({ data }: { data: { name: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="space-y-3">
      {data.map((d) => (
        <div key={d.name} className="space-y-1.5">
          <div className="flex items-center justify-between text-[12.5px]">
            <span className="font-medium">{d.name}</span>
            <span className="text-muted-foreground">{d.count}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-tint-strong">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
              style={{ width: `${Math.max((d.count / max) * 100, 6)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
