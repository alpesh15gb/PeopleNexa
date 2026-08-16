"use client";

import { useMemo, useState } from "react";
import { MapPin, Route, Users, Radar, Shield } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/stat";
import { RouteMap } from "./route-map";

type Emp = { id: string; firstName: string; lastName: string; employeeNumber: string; position: string | null };
type Point = { lat: number; lng: number; at: string; accuracy: number | null };
type Journey = { employee: Emp; pingCount: number; distanceKm: number; startAt: string; endAt: string; points: Point[] };

const PALETTE = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#06b6d4", "#8b5cf6", "#ef4444", "#84cc16"];

export function JourneysPanel({
  date,
  journeys,
  locationOff,
  untracked,
  live,
  employees,
}: {
  date: string;
  journeys: Journey[];
  locationOff: Emp[];
  untracked: Emp[];
  live: { employee: Emp; lat: number; lng: number; at: string }[];
  employees: Emp[];
}) {
  const [tab, setTab] = useState<"replay" | "live">("replay");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = journeys.find((j) => j.employee.id === selectedId) ?? null;
  const totalDistance = journeys.reduce((s, j) => s + j.distanceKm, 0);

  const routes = useMemo(
    () =>
      selected
        ? [{ label: `${selected.employee.firstName} ${selected.employee.lastName}`, points: selected.points }]
        : journeys.map((j, i) => ({
            label: `${j.employee.firstName} ${j.employee.lastName}`,
            points: j.points,
            color: PALETTE[i % PALETTE.length],
          })),
    [selected, journeys]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Journey Tracker</h1>
          <p className="text-[13px] text-muted-foreground">Field GPS — route replay & distance for {date}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTab("replay")}
            className={`rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors ${tab === "replay" ? "bg-gradient-brand text-white" : "bg-tint text-muted-foreground hover:text-foreground"}`}
          >
            <Route className="mr-1.5 inline h-3.5 w-3.5" /> Route replay
          </button>
          <button
            onClick={() => setTab("live")}
            className={`rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors ${tab === "live" ? "bg-gradient-brand text-white" : "bg-tint text-muted-foreground hover:text-foreground"}`}
          >
            <Radar className="mr-1.5 inline h-3.5 w-3.5" /> Live ({live.length})
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-indigo-400/20 bg-indigo-500/5 px-4 py-3 text-[12.5px] text-indigo-200/90">
        <Shield className="mr-1.5 inline h-3.5 w-3.5" />
        Tracking is limited to <strong>work hours</strong> — pings are only collected from clock-in to clock-out (plus a short grace) and off-duty locations are rejected server-side. If an employee hasn't given location permission, their day is simply shown as “location not shared”.
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              <Users className="h-3.5 w-3.5" /> Tracked today
            </div>
            <p className="text-2xl font-bold">{journeys.length}<span className="text-sm font-normal text-muted-foreground"> / {employees.length} employees</span></p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              <Route className="h-3.5 w-3.5" /> Distance covered
            </div>
            <p className="text-2xl font-bold">{totalDistance.toLocaleString("en-IN", { maximumFractionDigits: 1 })}<span className="text-sm font-normal text-muted-foreground"> km</span></p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" /> Pings recorded
            </div>
            <p className="text-2xl font-bold">{journeys.reduce((s, j) => s + j.pingCount, 0)}</p>
          </CardHeader>
        </Card>
      </div>

      {tab === "replay" ? (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <div className="rounded-2xl border border-edge bg-card">
            <p className="border-b border-white/[0.06] px-4 py-3 text-[13px] font-medium">Employees on field</p>
            <div className="max-h-[460px] divide-y divide-white/[0.04] overflow-y-auto">
              {journeys.length === 0 && (
                <p className="px-4 py-6 text-[13px] text-muted-foreground">No location pings today yet.</p>
              )}
              {journeys.map((j, i) => (
                <button
                  key={j.employee.id}
                  onClick={() => setSelectedId(selectedId === j.employee.id ? null : j.employee.id)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-tint/60 ${selectedId === j.employee.id ? "bg-tint" : ""}`}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">{j.employee.firstName} {j.employee.lastName}</p>
                    <p className="text-[11.5px] text-muted-foreground">{j.employee.position ?? "—"}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-[12.5px] font-bold">{j.distanceKm} km</p>
                    <p className="text-[11px] text-muted-foreground">{j.pingCount} pings</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <RouteMap routes={routes} height={460} />
            {selected && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-edge bg-card px-4 py-3">
                <Badge tone="info">{selected.employee.employeeNumber}</Badge>
                <span className="font-mono text-[13px] font-bold">{selected.distanceKm} km</span>
                <span className="text-[12px] text-muted-foreground">
                  {selected.pingCount} pings · {new Date(selected.startAt).toLocaleTimeString()} → {new Date(selected.endAt).toLocaleTimeString()}
                </span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <RouteMap markers={live.map((m) => ({ label: `${m.employee.firstName} ${m.employee.lastName}`, point: m }))} height={440} />
          {live.length === 0 && (
            <EmptyState icon={<Radar className="h-5 w-5" />} title="No live locations" description="Pings from the employee app will appear here in real time." />
          )}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {live.map((m) => (
              <div key={m.employee.id} className="flex items-center gap-3 rounded-xl border border-edge bg-card px-4 py-3">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{m.employee.firstName} {m.employee.lastName}</p>
                  <p className="text-[11.5px] text-muted-foreground">{m.employee.position ?? "—"} · last seen {new Date(m.at).toLocaleTimeString()}</p>
                </div>
                <span className="font-mono text-[11.5px] text-muted-foreground">{m.lat.toFixed(4)}, {m.lng.toFixed(4)}</span>
              </div>
            ))}
          </div>
          {locationOff.length > 0 && (
            <p className="text-[12px] text-amber-300">
              Location not shared (permission off): {locationOff.map((e) => `${e.firstName} ${e.lastName}`).join(", ")}
            </p>
          )}
          {untracked.length > 0 && (
            <p className="text-[12px] text-muted-foreground">No attendance today: {untracked.map((e) => `${e.firstName} ${e.lastName}`).join(", ")}</p>
          )}
        </div>
      )}
    </div>
  );
}
