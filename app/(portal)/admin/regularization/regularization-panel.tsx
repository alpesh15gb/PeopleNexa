"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Clock3, FileQuestion } from "lucide-react";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/stat";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { toDateKey, formatTime } from "@/lib/dates";

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
  createdAt: string;
  employee: { id: string; firstName: string; lastName: string; employeeNumber: string };
  // True when the employee's correction day has a face review/rejected punch
  // (computed server-side from Punch.faceStatus — see page.tsx).
  faceFlagged?: boolean;
};

type FaceReview = {
  id: string;
  punchTime: string;
  faceStatus: string;
  faceScore: number | null;
  selfie: string | null;
  lat: number | null;
  lng: number | null;
  authStatus: string;
  holdReason: string | null;
  employee: { id: string; firstName: string; lastName: string; employeeNumber: string };
};

const fmt = (iso: string | null) => (iso ? formatTime(new Date(iso)) : "—");

// Tiny local loader for the punch-location mini maps. Renders nothing when the
// API key is missing (callers fall back to the link-only UI).
const FACE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

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
}: {
  corrections: Correction[];
  faceReviews?: FaceReview[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [faceBusy, setFaceBusy] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});
  const { isLoaded: faceMapsLoaded } = useJsApiLoader({
    id: "peoplenexa-face-review",
    googleMapsApiKey: FACE_MAPS_API_KEY,
  });
  const showFaceMaps = FACE_MAPS_API_KEY.length > 0 && faceMapsLoaded;
  const faceMapsPending = FACE_MAPS_API_KEY.length > 0 && !faceMapsLoaded;

  async function review(id: string, status: "approved" | "rejected") {
    setBusy(id);
    try {
      const res = await fetch(`/api/attendance/corrections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reviewNote: reviewNote[id] || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to review");
      toast("success", status === "approved" ? "Correction approved — attendance updated." : "Correction rejected.");
      router.refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to review");
    } finally {
      setBusy(null);
    }
  }

  async function reviewFace(id: string, decision: "accept" | "reject") {
    setFaceBusy(id);
    try {
      const res = await fetch("/api/face/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ punchId: id, decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to review face");
      toast("success", decision === "accept" ? "Face accepted." : "Face rejected — punch removed.");
      router.refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to review face");
    } finally {
      setFaceBusy(null);
    }
  }

  if (corrections.length === 0 && faceReviews.length === 0) {
    return (
      <EmptyState
        icon={<FileQuestion className="h-5 w-5" />}
        title="No corrections yet"
        description="Employee-requested punch corrections will appear here for approval."
      />
    );
  }

  return (
    <div>
      {faceReviews.length > 0 && (
        <div className="border-b border-edge">
          <div className="px-5 pt-4">
            <p className="text-[13px] font-semibold">Face review</p>
            <p className="text-[12px] text-muted-foreground">
              {faceReviews.length} punch{faceReviews.length === 1 ? "" : "es"} need{faceReviews.length === 1 ? "s" : ""} verification
            </p>
          </div>
          <div className="divide-y divide-[color:var(--border)]">
            {faceReviews.map((r) => {
              const score =
                typeof r.faceScore === "number" && Number.isFinite(r.faceScore)
                  ? r.faceScore.toFixed(2)
                  : null;
              return (
                <div key={r.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start">
                  {r.selfie ? (
                    <img
                      src={r.selfie}
                      alt="Face capture needing review"
                      className="h-12 w-12 shrink-0 rounded-lg border border-edge object-cover"
                      loading="lazy"
                    />
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
                        {toDateKey(new Date(r.punchTime))} · {fmt(r.punchTime)}
                      </span>
                      <Badge tone={r.faceStatus === "rejected" && r.authStatus !== "pending" ? "danger" : "warning"}>
                        {r.authStatus === "pending"
                          ? r.holdReason === "location_mismatch"
                            ? "Outside geofence — needs approval"
                            : r.holdReason === "face_mismatch"
                              ? "Face mismatch — needs approval"
                              : "Awaiting approval — no Face ID"
                          : `Face ${score ?? "—"} — ${r.faceStatus}`}
                      </Badge>
                    </div>
                    {r.lat != null && r.lng != null && (
                      <div className="mt-1.5">
                        {showFaceMaps ? (
                          <div className="mb-1.5 w-[208px] overflow-hidden rounded-lg border border-edge">
                            <PunchMiniMap lat={Number(r.lat)} lng={Number(r.lng)} />
                          </div>
                        ) : faceMapsPending ? (
                          <div className="mb-1.5 h-[128px] w-[208px] animate-pulse rounded-lg border border-edge bg-tint" aria-hidden="true" />
                        ) : null}
                        <p className="text-[12px] text-muted-foreground">
                          Location {Number(r.lat).toFixed(5)}, {Number(r.lng).toFixed(5)} ·{" "}
                          <a
                            href={`https://www.google.com/maps?q=${r.lat},${r.lng}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-primary underline-offset-2 hover:underline"
                          >
                            Open map
                          </a>
                        </p>
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="success"
                        loading={faceBusy === r.id}
                        disabled={faceBusy !== null || busy !== null}
                        onClick={() => reviewFace(r.id, "accept")}
                      >
                        <Check className="h-3.5 w-3.5" /> Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        loading={faceBusy === r.id}
                        disabled={faceBusy !== null || busy !== null}
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
      {corrections.length === 0 ? (
        <p className="px-5 py-4 text-[12.5px] text-muted-foreground">No corrections yet.</p>
      ) : (
        <div className="divide-y divide-[color:var(--border)]">
      {corrections.map((c) => {
        const pending = c.status === "pending";
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
                <span className="font-mono text-[12px] text-muted-foreground">{toDateKey(new Date(c.date))}</span>
                <Badge tone={pending ? "warning" : c.status === "approved" ? "success" : "danger"}>{c.status}</Badge>
                {c.faceFlagged === true && (
                  <Badge tone="warning">Face flagged — see review queue</Badge>
                )}
              </div>

              <div className="mt-2 grid max-w-md grid-cols-2 gap-x-6 gap-y-1 text-[12.5px]">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock3 className="h-3.5 w-3.5" /> Current: {fmt(c.currentIn)} → {fmt(c.currentOut)}
                </div>
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <Check className="h-3.5 w-3.5 text-emerald-400" /> Requested: {fmt(c.requestedIn)} → {fmt(c.requestedOut)}
                </div>
              </div>

              <p className="mt-2 rounded-lg bg-tint px-3 py-2 text-[12.5px] leading-relaxed text-muted-foreground">
                “{c.reason}”
              </p>
              {c.reviewNote && (
                <p className="mt-1.5 text-[12px] text-muted-foreground/70">Note: {c.reviewNote}</p>
              )}

              {pending && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Input
                    placeholder="Note (optional)"
                    value={reviewNote[c.id] ?? ""}
                    onChange={(e) => setReviewNote((v) => ({ ...v, [c.id]: e.target.value }))}
                    className="h-9 w-56"
                  />
                  <Button size="sm" variant="success" loading={busy === c.id} disabled={busy !== null} onClick={() => review(c.id, "approved")}>
                    <Check className="h-3.5 w-3.5" /> Approve
                  </Button>
                  <Button size="sm" variant="danger" loading={busy === c.id} disabled={busy !== null} onClick={() => review(c.id, "rejected")}>
                    <X className="h-3.5 w-3.5" /> Reject
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })}
        </div>
      )}
    </div>
  );
}
