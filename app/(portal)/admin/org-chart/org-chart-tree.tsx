"use client";

import { useMemo, useState } from "react";
import { ChevronRight, ChevronDown, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface Node {
  id: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  role: string;
  managerId: string | null;
  department: { name: string } | null;
}

export function OrgChartTree({ employees }: { employees: Node[] }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const childrenOf = useMemo(() => {
    const map = new Map<string, Node[]>();
    for (const e of employees) {
      const key = e.managerId ?? "__root__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [employees]);

  const roots = childrenOf.get("__root__") ?? [];
  const orphanCount = employees.length - roots.length - (childrenOf.get("__root__")?.length ?? 0);

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderNode(e: Node, depth: number) {
    const direct = childrenOf.get(e.id) ?? [];
    const hasTeam = direct.length > 0;
    const isCollapsed = collapsed.has(e.id);
    const isAdmin = e.role === "admin";
    return (
      <div key={e.id}>
        <div
          className={cn(
            "group flex items-center gap-2.5 rounded-xl border border-edge px-3 py-2.5 transition-colors hover:border-edge-strong",
            isAdmin ? "bg-indigo-500/[0.08]" : "bg-card-2"
          )}
          style={{ marginLeft: depth * 28 }}
        >
          <button
            onClick={() => hasTeam && toggle(e.id)}
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg",
              hasTeam ? "text-muted-foreground hover:bg-tint-strong" : "pointer-events-none opacity-0"
            )}
          >
            {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", isAdmin ? "bg-gradient-brand text-white" : "bg-tint-strong text-muted-foreground")}>
            <User className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-semibold">
              {e.firstName} {e.lastName}
              {isAdmin && <span className="ml-1.5 rounded-md bg-indigo-500/15 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-indigo-300">Admin</span>}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {e.employeeNumber}
              {e.department ? ` · ${e.department.name}` : ""}
            </p>
          </div>
          {hasTeam && (
            <span className="rounded-md bg-tint-strong px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground">
              {direct.length}
            </span>
          )}
        </div>
        {hasTeam && !isCollapsed && (
          <div className="mt-1.5 space-y-1.5">{direct.map((child) => renderNode(child, depth + 1))}</div>
        )}
      </div>
    );
  }

  return (
    <div className="p-5">
      {roots.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-edge-strong bg-tint text-muted-foreground">
            <User className="h-5 w-5" />
          </div>
          <p className="font-display text-sm font-semibold">No reporting structure yet</p>
          <p className="max-w-sm text-[13px] text-muted-foreground">
            Set the <span className="font-medium text-foreground">Manager</span> field on employee profiles to build
            the org chart. Employees without a manager appear as top-level nodes here.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-500/5 px-4 py-3 text-[12.5px] text-amber-200/90">
            {roots.length} top-level {roots.length === 1 ? "manager" : "managers"} · {employees.length - roots.length} direct reports ·
            {orphanCount > 0 ? ` ${orphanCount} employees have a manager that isn't active — they appear as top-level` : " structure complete"}
          </div>
          <div className="space-y-1.5">{roots.map((r) => renderNode(r, 0))}</div>
        </>
      )}
    </div>
  );
}
