"use client";

import { useEffect, useState } from "react";

type HealthDevice = { id: string; status: string; lastSeenAt: Date | null };

/** Shared status-only polling; attendance imports are never triggered here. */
export function useLiveEbioDevices<T extends HealthDevice>(devices: T[]) {
  const [currentDevices, setCurrentDevices] = useState(devices);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => { setCurrentDevices(devices); }, [devices]);
  useEffect(() => {
    let disposed = false;
    let refreshing = false;
    const controller = new AbortController();
    async function refresh() {
      if (refreshing || disposed) return;
      refreshing = true;
      try {
        const response = await fetch("/api/devices/ebio-health", {
          cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) return;
        const data = await response.json() as {
          devices?: Array<{ id: string; status: string; lastSeenAt: string | null }>;
        };
        if (disposed || !Array.isArray(data.devices)) return;
        const updates = new Map(data.devices.map((device) => [device.id, device]));
        setCurrentDevices((previous) => previous.map((device) => {
          const update = updates.get(device.id);
          if (!update) return device;
          const lastSeenAt = update.lastSeenAt ? new Date(update.lastSeenAt) : null;
          if (lastSeenAt && !Number.isFinite(lastSeenAt.getTime())) return device;
          return { ...device, status: update.status, lastSeenAt };
        }));
        setNow(Date.now());
      } catch {
        // Failed requests must not invent a new heartbeat. Existing ones still expire.
      } finally {
        refreshing = false;
      }
    }
    const onFocus = () => { setNow(Date.now()); void refresh(); };
    void refresh();
    const pollTimer = window.setInterval(() => void refresh(), 15_000);
    // Expire the last confirmed heartbeat even during slow/failed source requests.
    const clockTimer = window.setInterval(() => setNow(Date.now()), 1_000);
    window.addEventListener("focus", onFocus);
    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(pollTimer);
      window.clearInterval(clockTimer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return { devices: currentDevices, now };
}
