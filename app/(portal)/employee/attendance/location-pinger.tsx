"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Loader2, Radio } from "lucide-react";

const PING_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes while on duty

/**
 * While the employee has an open attendance session (clocked in, no out punch),
 * send a location ping every few minutes so admins can replay the day's route.
 * Purely opportunistic — never blocks the employee and never errors visibly.
 */
export function LocationPinger({ active }: { active: boolean }) {
  const [state, setState] = useState<"idle" | "starting" | "tracking" | "unsupported">(active ? "starting" : "idle");
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
    setState("tracking");
    setLastPing(new Date().toLocaleTimeString());

    const sendPing = async () => {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000 })
        );
        const res = await fetch("/api/location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }),
        });
        if (res.status === 403) {
          // Server says we're off duty (clocked out / outside work hours) —
          // stop tracking immediately so nothing is collected after work.
          setState("idle");
          if (timerRef.current) clearInterval(timerRef.current);
          return;
        }
        setLastPing(new Date().toLocaleTimeString());
      } catch {
        // Location denied / unavailable — skip silently (no location = no ping).
      }
    };

    void sendPing();
    timerRef.current = setInterval(sendPing, PING_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [active]);

  if (state === "idle" || state === "unsupported") return null;

  return (
    <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-[12px] text-emerald-300">
      {state === "starting" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Radio className="h-3.5 w-3.5 animate-pulse" />
      )}
      <MapPin className="h-3.5 w-3.5" />
      {state === "tracking" ? `Location sharing on · last ping ${lastPing ?? "—"}` : "Starting location sharing…"}
    </div>
  );
}
