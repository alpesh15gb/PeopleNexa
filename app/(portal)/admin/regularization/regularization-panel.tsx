"use client";

import { PunchPhoto, PunchLocation } from "@/components/punch-evidence";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, X, Clock3, FileQuestion } from "lucide-react";
import { GoogleMap, Marker } from "@react-google-maps/api";
import { GOOGLE_MAPS_API_KEY, useGoogleMapsLoader } from "@/components/maps/google-maps";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/stat";
import { useToast } from "@/components/ui/toast";
import { istDateKey } from "@/lib/ist";
import type { WorkspaceRegion } from "@/lib/workspace-region";
import { dateKeyInTimeZone, formatCalendarDate, formatWorkspaceTime } from "@/lib/workspace-time";

type Correction = {
  id: string;
  date: string;
  currentIn: string | null;
  currentOut: string | null;
  requestedIn: string | null;
  requestedOut: string | null;
  reason: string;
  status: string;
  reviewNote: string | null;
  reviewHref: string;
  createdAt: string;
  employee: { id: string; firstName: string; lastName: string; employeeNumber: string };
};

type FaceReview = {
  id: string;
  punchTime: string;
  inOutHint?: string;
  locationAccuracy?: number | null;
  locationStatus?: string | null;
  faceStatus: string;
  faceScore: number | null;
  selfie: string | null;
  lat: number | null;
  lng: number | null;
  authStatus: string;
  holdReason: string | null;
  employee: { id: string; firstName: string; lastName: string; employeeNumber: string };
};


// Tiny local loader for the punch-location mini maps. Renders nothing when the
// API key is missing (callers fall back to the link-only UI).
const FACE_MAPS_API_KEY = GOOGLE_MAPS_API_KEY;

function PunchMiniMap({ lat, lng }: { lat: number; lng: number }) {
  return (
    <GoogleMap
      mapContainerStyle={{ width: 208, height: 128 }}
      center={{ lat, lng }}
      zoom={16}
      options={{ disableDefaultUI: true, gestureHandling: "none", clickableIcons: false }}
    >
      <Marker position={{ lat, lng }} />
    </GoogleMap>
  );
}

export function RegularizationPanel({
  corrections,
  faceReviews = [],
  view,
  reviewed,
  region,
}: {
  corrections: Correction[];
  faceReviews?: FaceReview[];
  view: "corrections" | "punches";
  reviewed: boolean;
  region: Pick<WorkspaceRegion, "timeZone" | "locale">;
}) {
  const router = useRouter();
  const toast = useToast();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [faceBusy, setFaceBusy] = useState<string | null>(null);
  const { isLoaded: faceMapsLoaded, loadError: faceMapsError } = useGoogleMapsLoader();
  const showFaceMaps = FACE_MAPS_API_KEY.length > 0 && faceMapsLoaded && !faceMapsError;
  const faceMapsPending = FACE_MAPS_API_KEY.length > 0 && !faceMapsLoaded && !faceMapsError;

  function fmt(iso: string | null, day?: string) {
    if (!iso) return "—";
    const instant = new Date(iso);
    const punchDay = dateKeyInTimeZone(instant, region.timeZone);
    const time = formatWorkspaceTime(instant, region);
    return day && punchDay !== day ? `${formatCalendarDate(punchDay, region.locale)} ${time}` : time;
  }

  async function reviewFace(id: string, decision: "accept" | "reject") {
    setFaceBusy(id);
    setErrors((current) => ({ ...current, [id]: "" }));
    try {
      const res = await fetch("/api/face/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ punchId: id, decision }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to review face");
      toast("success", decision === "accept" ? "Face accepted." : "Face rejected — evidence retained.");
      router.refresh();
    } catch (e) {
      setErrors((current) => ({ ...current, [id]: e instanceof Error && e.name !== "TypeError" ? e.message : "This decision couldn’t be confirmed. Refresh the queue before trying again." }));
    } finally {
      setFaceBusy(null);
    }
  }

  if (corrections.length === 0 && faceReviews.length === 0) {
    return (
      <EmptyState
        icon={<FileQuestion className="h-5 w-5" />}
        title={view === "punches" ? "No held punches" : reviewed ? "No reviewed corrections" : "No pending corrections"}
      />
    );
  }

  return (
    <div>
      {faceReviews.length > 0 && (
        <div className="border-b border-edge">
          <div className="divide-y divide-[color:var(--border)]">
            {faceReviews.map((r) => {
              const score =
                typeof r.faceScore === "number" && Number.isFinite(r.faceScore)
                  ? r.faceScore.toFixed(2)
                  : null;
              return (
                <div key={r.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start">
                  {r.selfie ? (
                    <PunchPhoto src={r.selfie} label={`${r.employee.firstName} ${r.employee.lastName} (${r.employee.employeeNumber}) — punch selfie`} className="shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <img
                      src={r.selfie}
                      alt="Face capture needing review"
                      className="h-12 w-12 shrink-0 rounded-lg border border-edge object-cover"
                      loading="lazy"
                    />
                    </PunchPhoto>
                  ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-brand text-[11px] font-bold text-white">
                      {(r.employee.firstName[0] ?? "") + (r.employee.lastName[0] ?? "")}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13.5px] font-medium">
                        {r.employee.firstName} {r.employee.lastName}
                        <span className="ml-1.5 text-[11.5px] text-muted-foreground">
                          ({r.employee.employeeNumber})
                        </span>
                      </p>
                      <span className="font-mono text-[12px] text-muted-foreground">
                        {formatCalendarDate(dateKeyInTimeZone(new Date(r.punchTime), region.timeZone), region.locale)} · {fmt(r.punchTime)}
                        {r.inOutHint && r.inOutHint !== "unknown" ? ` · Clock ${r.inOutHint}` : ""}
                      </span>
                      <Badge tone={r.faceStatus === "rejected" && r.authStatus !== "pending" ? "danger" : "warning"}>
                        {r.authStatus === "pending"
                          ? r.holdReason === "location_mismatch"
                            ? "Outside geofence — needs approval"
                            : r.holdReason === "face_mismatch"
                              ? "Face mismatch — needs approval"
                              : r.holdReason === "face_review" ? "Face uncertain — needs approval"
                              : r.holdReason === "location_accuracy" ? "GPS accuracy insufficient — needs approval"
                              : r.holdReason === "location_not_configured" ? "Geofence not configured — needs approval"
                              : "Awaiting approval — no Face ID"
                          : `Face ${score ?? "—"} — ${r.faceStatus}`}
                      </Badge>
                    </div>
                    {r.lat != null && r.lng != null && (
                      <div className="mt-1.5">
                        <p className="text-xs text-muted-foreground">{r.locationStatus?.replaceAll("_", " ") ?? "Location check not recorded"}{r.locationAccuracy == null ? "" : ` · GPS ±${Math.round(r.locationAccuracy)}m`}</p>
                        {showFaceMaps ? (
                          <div className="mb-1.5 w-[208px] overflow-hidden rounded-lg border border-edge">
                            <div className="relative">
                              <PunchMiniMap lat={Number(r.lat)} lng={Number(r.lng)} />
                              <PunchLocation lat={Number(r.lat)} lng={Number(r.lng)} accuracy={r.locationAccuracy} label={`${r.employee.firstName} ${r.employee.lastName} (${r.employee.employeeNumber}) — punch location`} className="absolute inset-0 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"><span className="sr-only">Open location map</span></PunchLocation>
                            </div>
                          </div>
                        ) : faceMapsPending ? (
                          <div className="mb-1.5 h-[128px] w-[208px] animate-pulse rounded-lg border border-edge bg-tint" aria-hidden="true" />
                        ) : null}
                        <p className="text-[12px] text-muted-foreground">
                          Location {Number(r.lat).toFixed(5)}, {Number(r.lng).toFixed(5)} ·{" "}
                          <PunchLocation lat={Number(r.lat)} lng={Number(r.lng)} accuracy={r.locationAccuracy} label={`${r.employee.firstName} ${r.employee.lastName} (${r.employee.employeeNumber}) — punch location`} className="font-medium text-primary underline-offset-2 hover:underline">Open map</PunchLocation>
                        </p>
                      </div>
                    )}
                    {errors[r.id] && <p role="alert" className="mt-2 text-sm text-destructive">{errors[r.id]}</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="success"
                        loading={faceBusy === r.id}
                        disabled={faceBusy !== null}
                        onClick={() => reviewFace(r.id, "accept")}
                      >
                        <Check className="h-3.5 w-3.5" /> Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        loading={faceBusy === r.id}
                        disabled={faceBusy !== null}
                        onClick={() => reviewFace(r.id, "reject")}
                      >
                        <X className="h-3.5 w-3.5" /> Reject
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {corrections.length > 0 && (
        <div className="divide-y divide-[color:var(--border)]">
      {corrections.map((c) => {
        const pending = c.status === "pending";
        const day = istDateKey(new Date(c.date));
        return (
          <div key={c.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-brand text-[11px] font-bold text-white">
              {(c.employee.firstName[0] ?? "") + (c.employee.lastName[0] ?? "")}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[13.5px] font-medium">
                  {c.employee.firstName} {c.employee.lastName}
                  <span className="ml-1.5 text-[11.5px] text-muted-foreground">({c.employee.employeeNumber})</span>
                </p>
                <span className="font-mono text-[12px] text-muted-foreground">{formatCalendarDate(day, region.locale)}</span>
                <Badge tone={pending ? "warning" : c.status === "approved" ? "success" : "danger"}>{c.status}</Badge>
              </div>

              <div className="mt-2 grid max-w-md grid-cols-2 gap-x-6 gap-y-1 text-[12.5px]">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock3 className="h-3.5 w-3.5" /> Current: {fmt(c.currentIn, day)} → {fmt(c.currentOut, day)}
                </div>
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <Check className="h-3.5 w-3.5 text-emerald-400" /> Requested: {fmt(c.requestedIn, day)} → {fmt(c.requestedOut, day)}
                </div>
              </div>

              {!pending && <p className="mt-2 break-words text-sm text-muted-foreground">{c.reason}</p>}
              {c.reviewNote && <p className="mt-1.5 break-words text-xs text-muted-foreground">Review note · {c.reviewNote}</p>}
            </div>
            {pending && <Link href={c.reviewHref} prefetch={false} scroll={false} aria-label={`Review correction for ${c.employee.firstName} ${c.employee.lastName}`} className="inline-flex min-h-10 shrink-0 items-center self-start rounded-lg border border-edge px-3 text-sm font-medium text-primary hover:bg-tint">Review correction</Link>}
          </div>
        );
      })}
        </div>
      )}
    </div>
  );
}
