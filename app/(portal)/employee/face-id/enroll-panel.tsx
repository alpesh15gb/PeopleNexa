"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dates";

export interface EnrollmentStatus {
  status: "enrolled" | "none";
  sampleCount: number;
  consentedAt: string | null;
}

const TOTAL_STEPS = 3;

// Apple-style guided poses: frontal reference, then opposite sides. The
// server verifies the turn from landmarks (direction-agnostic, so mirrored
// front cameras don't matter) — photos 2 and 3 must tilt opposite ways.
const POSE_STEPS = [
  { title: "Face front", hint: "Look straight into the camera." },
  { title: "Turn to one side", hint: "Slowly turn your head left or right until your ear nears your shoulder." },
  { title: "Turn to the other side", hint: "Now turn fully the opposite way." },
];

export function EnrollPanel({
  initial,
  consentVersion,
  canEnroll,
}: {
  initial: EnrollmentStatus;
  consentVersion: string;
  canEnroll: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [error, setError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [enrollment, setEnrollment] = useState<EnrollmentStatus>(initial);
  const [photos, setPhotos] = useState<(string | null)[]>([null, null, null]);
  const [step, setStep] = useState(0);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [captureStep, setCaptureStep] = useState(0);
  const [consent, setConsent] = useState(false);
  const [frontOnly, setFrontOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const enrolled = enrollment.status === "enrolled";
  const complete = photos.every((p) => p !== null);

  // Same still-photo pattern as the attendance clock-card: front camera to a
  // <video>, snapshot to canvas on capture, always stop tracks on close.
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
        if (!cancelled) {
          setError("Camera is unavailable. Allow camera access in your browser settings and try again.");
          setCameraOpen(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [cameraOpen]);

  const openCamera = (index: number) => {
    setError("");
    setCaptureStep(index);
    setStep(index);
    setCameraOpen(true);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || !cameraReady || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    const merged = photos.map((p, i) => (i === captureStep ? dataUrl : p));
    setPhotos(merged);
    setCameraOpen(false);
    const next = merged.findIndex((p) => p === null);
    setStep(next === -1 ? captureStep : next);
  };

  const submit = async () => {
    if (!canEnroll || !complete || !consent || saving) return;
    setError("");
    // Worst-case guard: a near-black/empty frame (lens covered, capture fired
    // before the sensor adjusted) can never yield a face — fail fast with a
    // clear message instead of a round-trip and a cryptic server error.
    const MIN_PHOTO_BYTES = 6 * 1024;
    const badIndex = photos.findIndex((p) => {
      if (!p) return false;
      const comma = p.indexOf(",");
      const approx = comma === -1 ? 0 : Math.floor(((p.length - comma - 1) * 3) / 4);
      return approx < MIN_PHOTO_BYTES;
    });
    if (badIndex !== -1) {
      setError(`Photo ${badIndex + 1} looks blank. Retake it with light on your face.`);
      setStep(badIndex);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/face/enrollments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos, consentVersion, consentedAt: new Date().toISOString(), frontOnly }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 503 = server face backend down: retries won't help, say so plainly
        // and keep the captured photos so nothing is lost.
        if (res.status === 503) {
          setError("Face verification is temporarily unavailable. You can retry with these photos while this page stays open.");
          return;
        }
        setError(typeof data.error === "string" ? data.error : "Could not save enrollment.");
        return;
      }
      toast("success", enrolled ? "Face ID updated." : "Face ID enrolled.");
      setEnrollment({
        status: "enrolled",
        sampleCount: typeof data.sampleCount === "number" ? data.sampleCount : TOTAL_STEPS,
        consentedAt: new Date().toISOString(),
      });
      setPhotos([null, null, null]);
      setStep(0);
      setConsent(false);
      router.refresh();
    } catch {
      setError("Could not confirm the change. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const withdraw = async () => {
    if (withdrawing) return;
    setWithdrawing(true);
    try {
      const res = await fetch("/api/face/enrollments", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast("error", typeof data.error === "string" ? data.error : "Failed to withdraw consent.");
        return;
      }
      toast("success", "Face data deleted. Consent withdrawn.");
      setEnrollment({ status: "none", sampleCount: 0, consentedAt: null });
      setPhotos([null, null, null]);
      setStep(0);
      setConsent(false);
      setConfirmWithdraw(false);
      router.refresh();
    } catch {
      toast("error", "Network error. Please try again.");
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-xl border border-destructive/25 p-3 text-sm text-destructive">{error}</p>}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Enrollment status</CardTitle>
            <CardDescription>
              {enrolled
                ? `Enrolled · ${enrollment.sampleCount} samples` +
                  (enrollment.consentedAt
                    ? ` · consent given ${formatDate(new Date(enrollment.consentedAt))}`
                    : "")
                : "You have not enrolled Face ID yet."}
            </CardDescription>
          </div>
          <Badge tone={enrolled ? "success" : "neutral"} aria-label={enrolled ? "Face ID enrolled" : "Face ID not enrolled"}>
            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            {enrolled ? "Enrolled" : "Not enrolled"}
          </Badge>
        </CardHeader>
        <CardContent>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {enrolled
              ? "Re-enrolling replaces your current face templates. Withdrawing deletes them permanently."
              : "Capture three selfies — front, one side, then the other — following each step's instruction."}
          </p>
          {enrolled && (
            <div className="mt-4">
              <Button variant="danger" size="sm" onClick={() => setConfirmWithdraw(true)}>
                <Trash2 className="h-4 w-4" aria-hidden="true" /> Withdraw consent
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {canEnroll ? <Card>
        <CardHeader>
          <div>
            <CardTitle>{enrolled ? "Re-enroll Face ID" : "Enroll Face ID"}</CardTitle>
            <CardDescription>
              Step {Math.min(step + 1, TOTAL_STEPS)} of {TOTAL_STEPS} —{" "}
              {frontOnly ? "capture a front-facing selfie." : POSE_STEPS[Math.min(step, TOTAL_STEPS - 1)].hint}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <ol aria-label="Enrollment photos" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <li
                key={i}
                aria-current={step === i ? "step" : undefined}
                className={cn(
                  "rounded-xl border p-3",
                  step === i ? "border-primary/40 bg-primary/[0.04]" : "border-edge bg-tint"
                )}
              >
                {photos[i] ? (
                  <img
                    src={photos[i]!}
                    alt={`Enrollment photo ${i + 1} preview`}
                    className="aspect-[4/3] w-full rounded-lg border border-edge-strong object-cover"
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    className="flex aspect-[4/3] w-full items-center justify-center rounded-lg border border-dashed border-edge-strong bg-card font-display text-2xl font-bold text-muted-foreground/50"
                  >
                    {i + 1}
                  </div>
                )}
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <span className="text-[12px] font-medium text-muted-foreground">
                    Photo {i + 1} · {frontOnly ? "front" : POSE_STEPS[i].title}
                    {photos[i] ? " · captured" : step === i ? " · current" : ""}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openCamera(i)}
                    aria-label={photos[i] ? `Retake photo ${i + 1}` : `Capture photo ${i + 1}`}
                  >
                    {photos[i] ? <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> : <Camera className="h-3.5 w-3.5" aria-hidden="true" />}
                    {photos[i] ? "Retake" : "Capture"}
                  </Button>
                </div>
              </li>
            ))}
          </ol>

          <div className="rounded-xl border border-edge bg-tint p-4 text-[12.5px] leading-relaxed text-muted-foreground">
            <p className="font-medium text-foreground">If a photo keeps getting rejected:</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              <li>Face a window or tubelight — light must fall <span className="font-medium">on your face</span>, not behind you.</li>
              <li>Hold the phone at arm&apos;s length, face filling half the frame; look straight into the camera.</li>
              <li>Remove sunglasses/mask, tie hair back from the forehead, wipe a foggy front camera.</li>
              <li>Keep only yourself in frame and hold still for a second after tapping Capture.</li>
            </ul>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-edge bg-tint p-4">
            <input
              id="face-frontonly"
              type="checkbox"
              checked={frontOnly}
              onChange={(e) => setFrontOnly(e.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-primary"
            />
            <label htmlFor="face-frontonly" className="cursor-pointer text-[13px] font-medium leading-relaxed">
              I can&apos;t turn my head — use front-facing photos only.
              <span className="mt-1 block font-normal text-muted-foreground">
                For neck injury, stiffness, or any condition that prevents turning. Matching still works;
                uncertain punches go to human review instead of auto-match.
              </span>
            </label>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-edge bg-tint p-4">
            <input
              id="face-consent"
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-primary"
              aria-describedby="face-consent-text"
            />
            <label htmlFor="face-consent" className="cursor-pointer text-[13px] font-medium leading-relaxed">
              I consent to face-based attendance (consent {consentVersion}).
              <span id="face-consent-text" className="mt-1 block font-normal text-muted-foreground">
                Punch selfies are deleted after 90 days. Face embeddings are kept until you withdraw
                consent or exit the company. The on-device quality check uses the Google MediaPipe
                SDK, which may send performance metrics to Google.
              </span>
            </label>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              onClick={submit}
              loading={saving}
              disabled={!complete || !consent}
              aria-label={enrolled ? "Save new face enrollment" : "Save face enrollment"}
            >
              <Camera className="h-4 w-4" aria-hidden="true" />
              {enrolled ? "Replace enrollment" : "Save enrollment"}
            </Button>
          </div>
          {!complete && (
            <p role="status" className="text-[12px] text-muted-foreground">
              Capture all three photos and accept consent to continue.
            </p>
          )}
        </CardContent>
      </Card> : <p className="text-sm text-muted-foreground">Face matching is unavailable for this account. Use My attendance to follow your workspace’s clock-in process.</p>}

      <Modal open={cameraOpen} onClose={() => setCameraOpen(false)} title={`Capture photo ${captureStep + 1} of ${TOTAL_STEPS}`} description={frontOnly ? POSE_STEPS[0].hint : POSE_STEPS[captureStep].hint} size="sm">
        <div className="overflow-hidden rounded-xl border border-edge-strong bg-black">
          <video ref={videoRef} aria-label="Live camera preview" className="aspect-[4/3] w-full object-cover" playsInline muted />
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setCameraOpen(false)}>Cancel</Button>
          <Button type="button" disabled={!cameraReady} onClick={capturePhoto}><Camera className="h-4 w-4" aria-hidden="true" /> Capture</Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmWithdraw}
        title="Withdraw Face ID consent?"
        description="This permanently deletes your face embeddings. You will no longer be able to clock in with face match."
        confirmLabel="Withdraw"
        busy={withdrawing}
        onCancel={() => setConfirmWithdraw(false)}
        onConfirm={withdraw}
      />
    </div>
  );
}
