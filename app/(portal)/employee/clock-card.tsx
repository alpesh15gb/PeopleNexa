"use client";

import { PunchPhoto } from "@/components/punch-evidence";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, LogOut, MapPin, Camera, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { DEFAULT_WORKSPACE_REGION, type WorkspaceRegion } from "@/lib/workspace-region";
import { dateKeyInTimeZone, formatCalendarDate, formatWorkspaceTime } from "@/lib/workspace-time";
import { t, type Lang } from "@/lib/i18n";

interface Record {
  id: string;
  punchInTime: Date | null;
  punchOutTime: Date | null;
  punchInLat: number | null;
  punchInLng: number | null;
  status: string;
  lateMinutes: number;
}
interface Shift { name: string; startTime: string; endTime: string; graceMinutes: number; isNightShift: boolean }
interface Branch { name: string; geofenceRadius: number; latitude: number | null; longitude: number | null }

export function ClockCard({
  record,
  shift,
  branch,
  employeeName,
  lang = "en",
  pendingApproval = false,
  pendingIn = false,
  pendingOut = false,
  region = DEFAULT_WORKSPACE_REGION,
}: {
  record: Record | null;
  shift: Shift | null;
  branch: Branch | null;
  employeeName: string;
  lang?: Lang;
  /** A held (unenrolled) punch exists for today — attendance awaits admin. */
  pendingApproval?: boolean;
  pendingIn?: boolean;
  pendingOut?: boolean;
  region?: WorkspaceRegion;
}) {
  const router = useRouter();
  const toast = useToast();
  const [now, setNow] = useState(new Date());
  const [mounted, setMounted] = useState(false);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [clockError, setClockError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [selfie, setSelfie] = useState<string | null>(null);
  const selfieCapturedAtRef = useRef<string | null>(null);
  const requestPayloadRef = useRef<object | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const punchBusyRef = useRef(false);
  // On-device face gate (MediaPipe, lazy): Capture enabled only when exactly
  // 1 face ≥15% frame. Any load/detect failure → basic mode (capture allowed).
  const [faceOk, setFaceOk] = useState(false);
  const [faceHint, setFaceHint] = useState<string | null>(null);
  const [faceBasic, setFaceBasic] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Preserve an event identity through an uncertain network failure so a retry
  // cannot become a second mobile punch.
  const punchRequestIdRef = useRef<string | null>(null);

  useEffect(() => {
    setMounted(true);
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!pendingApproval) return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 30000);
    return () => clearInterval(timer);
  }, [pendingApproval, router]);

  useEffect(() => {
    if (!cameraOpen) return;
    setCameraReady(false);
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          if (!cancelled) setCameraReady(true);
        }
      } catch {
        setClockError(t(lang, "clock.cameraUnavailable"));
        setCameraOpen(false);
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [cameraOpen, lang]);

  // On-device MediaPipe gate: dynamic import inside the capture-modal flow
  // only (never top-level, initial bundle unaffected). Single-shot VIDEO
  // detect every ~800ms; interval cleared on close/unmount.
  useEffect(() => {
    if (!cameraOpen) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let detector: any = null;
    setFaceOk(false);
    setFaceBasic(false);
    setFaceHint("Checking camera…");
    (async () => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        if (cancelled) return;
        const fileset = await vision.FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm"
        );
        if (cancelled) return;
        detector = await vision.FaceDetector.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
          },
          runningMode: "VIDEO",
        });
        if (cancelled) {
          try {
            detector?.close?.();
          } catch {
            /* noop */
          }
          return;
        }
        const tick = async () => {
          const video = videoRef.current;
          if (!video || video.videoWidth === 0 || video.readyState < 2) return;
          try {
            const raw = await detector?.detectForVideo?.(video, performance.now());
            if (cancelled) return;
            const res = raw as {
              detections?: Array<{ boundingBox?: { width: number; height: number } | null } | null> | null;
            } | null;
            const dets = res?.detections ?? [];
            if (dets.length === 0) {
              setFaceOk(false);
              setFaceHint("Move closer");
            } else if (dets.length !== 1) {
              setFaceOk(false);
              setFaceHint("Only you in frame");
            } else {
              const box = dets[0]?.boundingBox;
              const vw = video.videoWidth || 1;
              const vh = video.videoHeight || 1;
              let ratio = 0;
              if (box) {
                // tasks-vision reports pixels; handle normalized fallback.
                if (box.width <= 1.5 && box.height <= 1.5) {
                  ratio = box.width * box.height;
                } else {
                  ratio = (box.width * box.height) / (vw * vh);
                }
              }
              if (ratio >= 0.15) {
                setFaceOk(true);
                setFaceHint(null);
              } else {
                setFaceOk(false);
                setFaceHint("Move closer");
              }
            }
          } catch {
            if (!cancelled) {
              setFaceBasic(true);
              setFaceOk(true);
              setFaceHint(null);
              if (interval) clearInterval(interval);
            }
          }
        };
        await tick();
        if (cancelled) return;
        interval = setInterval(() => {
          void tick();
        }, 800);
      } catch {
        if (!cancelled) {
          // Offline CDN / WASM / model failure → degrade to capture-allowed.
          setFaceBasic(true);
          setFaceOk(true);
          setFaceHint(null);
        }
      }
    })();
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      try {
        detector?.close?.();
      } catch {
        /* noop */
      }
      detector = null;
    };
  }, [cameraOpen]);

  const captureSelfie = () => {
    const video = videoRef.current;
    if (!video || !cameraReady || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    if (dataUrl.length > 500_000) { toast("error", "Photo is too large. Please capture it again."); return; }
    selfieCapturedAtRef.current = new Date().toISOString();
    punchRequestIdRef.current = null;
    requestPayloadRef.current = null;
    setSelfie(dataUrl);
    setCameraOpen(false);
  };

  const punch = useCallback(
    async (action: "in" | "out") => {
      if (punchBusyRef.current || submitting || locating) return;
      setClockError("");
      if (!selfie) { setCameraOpen(true); toast("info", "Capture a fresh selfie before clocking in or out."); return; }
      if (!requestPayloadRef.current && (!selfieCapturedAtRef.current || Date.now() - Date.parse(selfieCapturedAtRef.current) > 120_000)) { setSelfie(null); setCameraOpen(true); toast("info", "Selfie expired. Capture a fresh photo."); return; }
      punchBusyRef.current = true;
      setLocating(true);
      try {
        if (!navigator.geolocation) {
          setClockError(t(lang, "clock.geoRequired"));
          return;
        }
        if (!requestPayloadRef.current) {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 })
          );
          requestPayloadRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, action, selfie, selfieCapturedAt: selfieCapturedAtRef.current, idempotencyKey: punchRequestIdRef.current ?? (punchRequestIdRef.current = crypto.randomUUID()) };
        }
        setLocating(false);
        setSubmitting(true);

        const res = await fetch("/api/attendance/clock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestPayloadRef.current),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success !== true) {
          // A 5xx may have happened after persistence; retain the identity so
          // the next tap retries that event rather than creating another one.
          const uncertain = res.ok || res.status >= 500;
          if (!uncertain) {
            punchRequestIdRef.current = null;
            requestPayloadRef.current = null;
            setRetrying(false);
          } else {
            setRetrying(true);
          }
          setClockError(data.error ?? (uncertain ? "We couldn’t confirm this punch. Retry to send the same punch again." : "The punch was not accepted. Check your attendance and try again."));
          return;
        }
        punchRequestIdRef.current = null;
        requestPayloadRef.current = null;
        setRetrying(false);
        if (data.pendingApproval) {
          // Held for admin authorization (no Face ID enrolled): the punch is
          // recorded with selfie + location but counts only after approval.
          toast("info", t(lang, "clock.pendingMsg"));
          setSelfie(null);
          router.refresh();
          return;
        }
        toast("success", data.action === "in" ? t(lang, "clock.clockedInMsg") : t(lang, "clock.clockedOutMsg"));
        setSelfie(null);
        router.refresh();
      } catch {
        setLocating(false);
        setRetrying(Boolean(requestPayloadRef.current));
        setClockError(requestPayloadRef.current ? "We couldn’t confirm this punch. Retry to send the same punch again." : t(lang, "clock.locError"));
      } finally {
        setSubmitting(false);
        setLocating(false);
        punchBusyRef.current = false;
      }
    },
    [selfie, router, toast, lang, submitting, locating]
  );

  const punchedIn = Boolean(record?.punchInTime) || pendingIn;
  const punchedOut = Boolean(record?.punchOutTime) || pendingOut;
  // Held punch, no attendance yet: show the approval state instead of "not
  // clocked in" so the employee knows their punch wasn't lost.
  const awaitingApproval = pendingApproval;
  const statusTone = awaitingApproval ? "warning" : punchedOut ? "neutral" : punchedIn ? "success" : "warning";
  const missingIn = punchedOut && !punchedIn;
  const statusLabel = awaitingApproval
    ? t(lang, "clock.pendingApproval")
    : missingIn ? "Missing clock-in" : punchedOut
      ? t(lang, "clock.dayComplete")
      : punchedIn
        ? t(lang, "clock.clockedIn")
        : t(lang, "clock.notClockedIn");
  const geofenced = Boolean(branch?.latitude != null && branch?.longitude != null);
  // Ticking clock: server HTML and first client render must agree, so show a
  // static placeholder until mount (else React #418 every load).
  const time = mounted
    ? now.toLocaleTimeString(region.locale, { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZone: region.timeZone })
    : "--:--:--";
  const dateLabel = mounted ? formatCalendarDate(dateKeyInTimeZone(now, region.timeZone), region.locale) : "";

  return (
    <div className="card-surface relative overflow-hidden rounded-2xl">
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--primary) 0%, transparent 65%)" }}
      />
      <div className="relative p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {dateLabel ? `${dateLabel} · ${employeeName}` : employeeName}
            </p>
            <p className="mt-2 font-display text-5xl font-bold tabular-nums tracking-tight sm:text-6xl">{time}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone={statusTone}>{statusLabel}</Badge>
              {awaitingApproval && (
                <span className="text-[12px] text-muted-foreground">A manager will review the punch before it counts toward attendance.</span>
              )}
              {shift && <Badge tone="violet">{shift.name} · {shift.startTime}–{shift.endTime}</Badge>}
              {geofenced && (
                <Badge tone="info"><MapPin className="h-3 w-3" /> {branch!.name} · {branch!.geofenceRadius}m</Badge>
              )}
            </div>
          </div>

          {record && (
            <div className="flex flex-col gap-2 rounded-xl border border-edge bg-tint p-4 text-center">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t(lang, "clock.in")}</p>
                <p className="font-display text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{formatWorkspaceTime(record.punchInTime ? new Date(record.punchInTime) : null, region)}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t(lang, "clock.out")}</p>
                <p className="font-display text-xl font-bold tabular-nums text-rose-700 dark:text-rose-300">{record.punchOutTime ? formatWorkspaceTime(new Date(record.punchOutTime), region) : "—"}</p>
              </div>
            </div>
          )}
        </div>

        {clockError && <p role="alert" className="mt-5 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">{clockError}</p>}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {!punchedIn && !punchedOut && (
            <Button size="lg" loading={submitting || locating} onClick={() => punch("in")} className="min-w-44">
              {!submitting && !locating && <LogIn className="h-4 w-4" />}
              {locating ? t(lang, "clock.gettingLocation") : submitting ? t(lang, "clock.punchingIn") : retrying ? "Retry clock-in" : t(lang, "clock.clockIn")}
            </Button>
          )}
          {punchedIn && !punchedOut && (
            <Button size="lg" loading={submitting || locating} onClick={() => punch("out")} className="min-w-44">
              {!submitting && !locating && <LogOut className="h-4 w-4" />}
              {locating ? t(lang, "clock.gettingLocation") : submitting ? t(lang, "clock.punchingOut") : retrying ? "Retry clock-out" : t(lang, "clock.clockOut")}
            </Button>
          )}
          {punchedOut && !missingIn && !pendingApproval && (
            <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> {t(lang, "clock.allSet")}
            </span>
          )}

          {!punchedOut && (
            <Button variant="outline" size="lg" disabled={submitting || locating || retrying} onClick={() => setCameraOpen(true)}>
              <Camera className="h-4 w-4" /> {selfie ? t(lang, "clock.retakeSelfie") : t(lang, "clock.addSelfie")}
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => router.refresh()} title="Refresh" aria-label="Refresh attendance status" className="min-h-11 min-w-11">
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>

        <p className="mt-4 flex items-start gap-1.5 text-[12px] text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />
          {geofenced
            ? t(lang, "clock.geofenceNote", { name: branch!.name })
            : t(lang, "clock.noGeofenceNote")}
        </p>
      </div>

      <Modal open={cameraOpen} onClose={() => setCameraOpen(false)} title={t(lang, "clock.captureSelfie")} description={t(lang, "clock.captureDesc")} size="sm">
        <div className="overflow-hidden rounded-xl border border-edge-strong bg-black">
          <video ref={videoRef} className="aspect-[4/3] w-full object-cover" playsInline muted />
        </div>
        {faceBasic ? (
          <p className="mt-2 text-xs text-muted-foreground">Live face guidance is unavailable. You can still capture your photo.</p>
        ) : faceHint && <p className="mt-2 text-xs text-muted-foreground">{faceHint}</p>}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => setCameraOpen(false)} className="min-h-11">{t(lang, "common.cancel")}</Button>
          <Button onClick={captureSelfie} disabled={!faceOk || !cameraReady} className="min-h-11"><Camera className="h-4 w-4" /> {t(lang, "clock.capture")}</Button>
        </div>
      </Modal>

      {/* Selfie preview */}
      {selfie && !cameraOpen && (
        <div className="mx-6 mb-5 flex items-center gap-2 sm:mx-8">
          <PunchPhoto src={selfie} label="Your attendance selfie" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><img src={selfie} alt="Selfie preview" className="h-16 w-16 rounded-xl border border-edge-strong object-cover" /></PunchPhoto>
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300">{t(lang, "clock.attached")}</span>
        </div>
      )}
    </div>
  );
}
