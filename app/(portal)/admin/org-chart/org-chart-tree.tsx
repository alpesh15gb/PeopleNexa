"use client";

import { useMemo, useState } from "react";
import { ChevronRight, ChevronDown, User } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Input } from "@/components/ui/input";

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
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();
  const matches = term ? employees.filter((employee) =>
    `${employee.firstName} ${employee.lastName} ${employee.employeeNumber} ${employee.department?.name ?? ""}`.toLowerCase().includes(term)
  ) : [];

  const childrenOf = useMemo(() => {
    const map = new Map<string, Node[]>();
    for (const e of employees) {
      const key = e.managerId ?? "__root__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [employees]);

  const rootNodes = childrenOf.get("__root__") ?? [];
  const employeeIds = useMemo(() => new Set(employees.map((e) => e.id)), [employees]);
  const orphans = useMemo(
    () => employees.filter((e) => e.managerId && !employeeIds.has(e.managerId)),
    [employees, employeeIds]
  );
  // Dangling-manager employees have no active manager node — show them top-level.
  const roots = useMemo(() => [...rootNodes, ...orphans], [rootNodes, orphans]);
  const orphanCount = orphans.length;

  // Nodes not reachable from any root (e.g. manager cycles like A→B→A) would
  // otherwise vanish. Track them so they can be listed separately.
  const reachable = useMemo(() => {
    const seen = new Set<string>();
    const stack = [...roots];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (seen.has(cur.id)) continue;
      seen.add(cur.id);
      for (const child of childrenOf.get(cur.id) ?? []) {
        if (!seen.has(child.id)) stack.push(child);
      }
    }
    return seen;
  }, [roots, childrenOf]);
  const unreachable = useMemo(
    () => employees.filter((e) => !reachable.has(e.id)),
    [employees, reachable]
  );

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderNode(e: Node, depth: number, ancestors: Set<string> = new Set()) {
    if (ancestors.has(e.id)) {
      return (
        <div key={`${e.id}-cycle`}>
          <div
            className="group flex items-center gap-2.5 rounded-xl border border-edge px-3 py-2.5"
            style={{ marginLeft: Math.min(5, depth) * 12 }}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-tint-strong text-muted-foreground">
              <User className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-semibold">
                {e.firstName} {e.lastName}
                <span className="ml-1.5 rounded-md bg-rose-500/15 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-rose-300">
                  cycle
                </span>
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {e.employeeNumber} · reporting loop detected
              </p>
            </div>
          </div>
        </div>
      );
    }
    const next = new Set(ancestors);
    next.add(e.id);
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
          style={{ marginLeft: Math.min(5, depth) * 12 }}
        >
          {hasTeam ? <button type="button" onClick={() => toggle(e.id)} aria-expanded={!isCollapsed} aria-label={`${isCollapsed ? "Expand" : "Collapse"} reports for ${e.firstName} ${e.lastName}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-tint-strong">
            {isCollapsed ? <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" /> : <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />}
          </button> : <span aria-hidden="true" className="w-9 shrink-0" />}
          <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", isAdmin ? "bg-gradient-brand text-white" : "bg-tint-strong text-muted-foreground")}>
            <User className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="break-words text-[13px] font-semibold">
              <Link href={`/admin/employee-master?employee=${encodeURIComponent(e.id)}#employee-record`} className="hover:text-primary hover:underline">{e.firstName} {e.lastName}</Link>
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
          <div className="mt-1.5 space-y-1.5">{direct.map((child) => renderNode(child, depth + 1, next))}</div>
        )}
      </div>
    );
  }

  return (
    <div className="p-5">
      {employees.length > 0 && <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input aria-label="Find an employee on the organization chart" className="max-w-sm" placeholder="Find employee, code or department" value={query} onChange={(event) => setQuery(event.target.value)} />
        {!term && roots.length > 0 && <button type="button" className="px-3 py-2 text-sm font-medium text-primary hover:underline" onClick={() => setCollapsed(collapsed.size ? new Set() : new Set(employees.filter((employee) => childrenOf.has(employee.id)).map((employee) => employee.id)))}>{collapsed.size ? "Expand all" : "Collapse all"}</button>}
      </div>}
      {term ? (
        matches.length ? <ul className="divide-y divide-edge">
          {matches.map((employee) => {
            const manager = employees.find((person) => person.id === employee.managerId);
            return <li key={employee.id} className="py-3">
              <Link href={`/admin/employee-master?employee=${encodeURIComponent(employee.id)}#employee-record`} className="font-medium hover:text-primary hover:underline">{employee.firstName} {employee.lastName}</Link>
              <p className="text-xs text-muted-foreground">{employee.employeeNumber}{employee.department ? ` · ${employee.department.name}` : ""}{manager ? ` · Reports to ${manager.firstName} ${manager.lastName}` : ""}</p>
            </li>;
          })}
        </ul> : <p className="py-6 text-sm text-muted-foreground">No employees match this search.</p>
      ) : roots.length === 0 ? (
        <>
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
          {unreachable.length > 0 && (
            <div className="mt-4 rounded-xl border border-edge bg-card-2 p-4">
              <p className="text-[12.5px] font-semibold">
                {unreachable.length} unreachable {unreachable.length === 1 ? "employee" : "employees"} (not
                connected to the chart above — likely a reporting loop)
              </p>
              <div className="mt-2 space-y-1.5">
                {unreachable.map((u) => (
                  <div key={u.id} className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <User className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {u.firstName} {u.lastName} · {u.employeeNumber}
                      {u.department ? ` · ${u.department.name}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {orphanCount > 0 && <p className="mb-4 rounded-xl border border-amber-400/20 bg-amber-500/5 px-4 py-3 text-sm text-warning">{orphanCount} employees appear at the top level because their assigned manager is inactive or unavailable.</p>}
          <div className="space-y-1.5">{roots.map((r) => renderNode(r, 0, new Set()))}</div>
          {unreachable.length > 0 && (
            <div className="mt-4 rounded-xl border border-edge bg-card-2 p-4">
              <p className="text-[12.5px] font-semibold">
                {unreachable.length} unreachable {unreachable.length === 1 ? "employee" : "employees"} (not
                connected to the chart above — likely a reporting loop)
              </p>
              <div className="mt-2 space-y-1.5">
                {unreachable.map((u) => (
                  <div key={u.id} className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <User className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {u.firstName} {u.lastName} · {u.employeeNumber}
                      {u.department ? ` · ${u.department.name}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
