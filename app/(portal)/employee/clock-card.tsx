"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, LogOut, MapPin, Camera, Loader2, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { formatTime, toDateKey } from "@/lib/dates";
import { t, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

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
}: {
  record: Record | null;
  shift: Shift | null;
  branch: Branch | null;
  employeeName: string;
  lang?: Lang;
}) {
  const router = useRouter();
  const toast = useToast();
  const [now, setNow] = useState(new Date());
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [selfie, setSelfie] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!cameraOpen) return;
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
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        toast("error", t(lang, "clock.cameraUnavailable"));
        setCameraOpen(false);
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [cameraOpen, toast]);

  const captureSelfie = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    setSelfie(dataUrl);
    setCameraOpen(false);
  };

  const punch = useCallback(
    async (action: "in" | "out") => {
      setLocating(true);
      try {
        if (!navigator.geolocation) {
          toast("error", t(lang, "clock.geoRequired"));
          return;
        }
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 12000 })
        );
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setLocating(false);
        setSubmitting(true);

        const res = await fetch("/api/attendance/clock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat, lng, selfie }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast("error", data.error ?? "Failed to clock " + action);
          return;
        }
        toast("success", data.action === "in" ? t(lang, "clock.clockedInMsg") : t(lang, "clock.clockedOutMsg"));
        setSelfie(null);
        router.refresh();
      } catch {
        setLocating(false);
        toast("error", t(lang, "clock.locError"));
      } finally {
        setSubmitting(false);
      }
    },
    [selfie, router, toast, lang]
  );

  const punchedIn = Boolean(record?.punchInTime);
  const punchedOut = Boolean(record?.punchOutTime);
  const geofenced = Boolean(branch?.latitude != null && branch?.longitude != null);
  const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="card-surface relative overflow-hidden rounded-2xl">
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, #6366f1 0%, transparent 65%)" }}
      />
      <div className="relative p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {toDateKey(now)} · {employeeName}
            </p>
            <p className="mt-2 font-display text-5xl font-bold tabular-nums tracking-tight sm:text-6xl">{time}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone={punchedOut ? "neutral" : punchedIn ? "success" : "warning"}>
                {punchedOut ? t(lang, "clock.dayComplete") : punchedIn ? t(lang, "clock.clockedIn") : t(lang, "clock.notClockedIn")}
              </Badge>
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
                <p className="font-display text-xl font-bold text-emerald-300">{formatTime(new Date(record.punchInTime!))}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t(lang, "clock.out")}</p>
                <p className="font-display text-xl font-bold text-rose-300">{record.punchOutTime ? formatTime(new Date(record.punchOutTime)) : "—"}</p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {!punchedIn && (
            <Button size="lg" loading={submitting || locating} onClick={() => punch("in")} className="min-w-44">
              {!submitting && !locating && <LogIn className="h-4 w-4" />}
              {locating ? t(lang, "clock.gettingLocation") : submitting ? t(lang, "clock.punchingIn") : t(lang, "clock.clockIn")}
            </Button>
          )}
          {punchedIn && !punchedOut && (
            <Button size="lg" variant="danger" loading={submitting || locating} onClick={() => punch("out")} className="min-w-44">
              {!submitting && !locating && <LogOut className="h-4 w-4" />}
              {locating ? t(lang, "clock.gettingLocation") : submitting ? t(lang, "clock.punchingOut") : t(lang, "clock.clockOut")}
            </Button>
          )}
          {punchedOut && (
            <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" /> {t(lang, "clock.allSet")}
            </span>
          )}

          {!punchedIn && (
            <Button variant="outline" size="lg" onClick={() => setCameraOpen(true)}>
              <Camera className="h-4 w-4" /> {selfie ? t(lang, "clock.retakeSelfie") : t(lang, "clock.addSelfie")}
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => router.refresh()} title="Refresh" aria-label="Refresh attendance status">
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>

        <p className="mt-4 flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />
          {geofenced
            ? t(lang, "clock.geofenceNote", { name: branch!.name })
            : t(lang, "clock.noGeofenceNote")}
        </p>
      </div>

      {/* Selfie capture modal */}
      {cameraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setCameraOpen(false)} />
          <div className="card-surface relative w-full max-w-md animate-scale-in rounded-2xl bg-card-2 p-5">
            <p className="font-display text-lg font-semibold">{t(lang, "clock.captureSelfie")}</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{t(lang, "clock.captureDesc")}</p>
            <div className="relative mt-4 overflow-hidden rounded-xl border border-edge-strong bg-black">
              <video ref={videoRef} className="aspect-[4/3] w-full object-cover" playsInline muted />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCameraOpen(false)}>{t(lang, "common.cancel")}</Button>
              <Button onClick={captureSelfie}><Camera className="h-4 w-4" /> {t(lang, "clock.capture")}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Selfie preview */}
      {selfie && !cameraOpen && (
        <div className="absolute bottom-4 right-4 flex items-center gap-2">
          <img src={selfie} alt="Selfie preview" className="h-16 w-16 rounded-xl border border-edge-strong object-cover" />
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">{t(lang, "clock.attached")}</span>
        </div>
      )}
    </div>
  );
}
