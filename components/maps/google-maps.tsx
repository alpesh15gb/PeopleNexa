"use client";

import { useJsApiLoader } from "@react-google-maps/api";

/**
 * Shared Google Maps loader for Journey Tracker (and future maps).
 *
 * - API key is read directly in this client module so server components
 *   (e.g. app/(portal)/admin/journeys/page.tsx) don't need to pass anything.
 * - When NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is missing, `enabled` is false and
 *   callers must render the Leaflet fallback instead (leaflet dep stays).
 * - A single loader id ("peoplenexa-google-maps") keeps useJsApiLoader a
 *   singleton across multiple <GoogleRouteMap /> instances on the page.
 */

export const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

export function useGoogleMapsLoader() {
  const { isLoaded, loadError } = useJsApiLoader({
    id: "peoplenexa-google-maps",
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  });
  return { isLoaded, loadError, enabled: GOOGLE_MAPS_API_KEY.length > 0 };
}

export function GoogleMapsSkeleton({ height = 420 }: { height?: number }) {
  return (
    <div
      className="w-full animate-pulse overflow-hidden rounded-xl border border-edge bg-tint"
      style={{ height }}
      aria-label="Loading map…"
    />
  );
}
