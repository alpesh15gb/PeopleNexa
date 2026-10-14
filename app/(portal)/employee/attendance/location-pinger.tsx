"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Loader2, Radio } from "lucide-react";
import { formatTime } from "@/lib/dates";

const PING_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes while on duty

/**
 * While the employee has an open attendance session (clocked in, no out punch),
 * send a location ping every few minutes so admins can replay the day's route.
 * Purely opportunistic — never blocks the employee and never errors visibly.
 */
export function LocationPinger({ active }: { active: boolean }) {
  const [state, setState] = useState<"idle" | "starting" | "tracking" | "unsupported" | "blocked" | "retrying">(active ? "starting" : "idle");
  const [lastPing, setLastPing] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active) {
      setState("idle");
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    if (!("geolocation" in navigator)) {
      setState("unsupported");
      return;
    }
    setState("starting");
    setLastPing(null);
    let cancelled = false;
    let stopped = false;
    let sending = false;
    const controller = new AbortController();

    const sendPing = async () => {
      if (cancelled || stopped || sending || document.visibilityState !== "visible") return;
      sending = true;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
        );
        if (cancelled || stopped) return;
        const res = await fetch("/api/location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }),
        });
        if (cancelled) return;
        if (res.status === 403 || res.status === 401) {
          // Server says we're off duty (clocked out / outside work hours) —
          // stop tracking immediately so nothing is collected after work.
          setState("idle");
          stopped = true;
          if (timerRef.current) clearInterval(timerRef.current);
          return;
        }
        if (!res.ok) { setState("retrying"); return; }
        setState("tracking");
        setLastPing(formatTime(new Date()));
      } catch (error) {
        if (!cancelled) setState((error as { code?: number }).code === 1 ? "blocked" : "retrying");
      } finally {
        sending = false;
      }
    };

    void sendPing();
    timerRef.current = setInterval(sendPing, PING_INTERVAL_MS);
    const resume = () => { if (document.visibilityState === "visible") void sendPing(); };
    document.addEventListener("visibilitychange", resume);
    return () => {
      cancelled = true;
      controller.abort();
      document.removeEventListener("visibilitychange", resume);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [active]);

  if (state === "idle") return null;

  return (
    <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-[12px] text-emerald-300">
      {state === "starting" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Radio className="h-3.5 w-3.5 animate-pulse" />
      )}
      <MapPin className="h-3.5 w-3.5" />
      {state === "tracking" ? `Location sharing on · last saved ping ${lastPing ?? "—"}` : state === "blocked" ? "Allow location permission to share your work journey." : state === "retrying" ? "Location not saved yet · retrying while this page is open." : state === "unsupported" ? "Location sharing is unavailable in this browser." : "Starting location sharing…"}
    </div>
  );
}
