"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleMap, Marker, Polyline } from "@react-google-maps/api";
import {
  GOOGLE_MAPS_API_KEY,
  GoogleMapsSkeleton,
  useGoogleMapsLoader,
} from "@/components/maps/google-maps";

export type MapPoint = { lat: number; lng: number; at?: string; accuracy?: number | null };

type LeafletModule = typeof import("leaflet");

let leafletPromise: Promise<LeafletModule> | null = null;
function loadLeaflet(): Promise<LeafletModule> {
  if (!leafletPromise) leafletPromise = import("leaflet");
  return leafletPromise;
}

export type RouteInput = { label: string; points: MapPoint[]; color?: string };
export type MarkerInput = { label: string; point: MapPoint };

/**
 * Leaflet map that draws one or more routes (polylines) and/or markers.
 * Rendered client-side only (no SSR). The map initializes once and content
 * redraws whenever the routes/markers props change.
 *
 * Kept untouched as the fallback when no Google Maps key is configured.
 */
function LeafletRouteMap({
  routes,
  markers,
  height = 420,
}: {
  routes?: RouteInput[];
  markers?: MarkerInput[];
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [L, setL] = useState<LeafletModule | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const drawnKeyRef = useRef("");

  // Init the map once leaflet is loaded.
  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((mod) => {
      if (cancelled || !containerRef.current) return;
      const map = mod.map(containerRef.current, { zoomControl: true }).setView([20.5937, 78.9629], 5);
      mod.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
      layerRef.current = mod.layerGroup().addTo(map);
      mapRef.current = map;
      setL(mod);
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Redraw content when routes/markers change (after map + leaflet ready).
  useEffect(() => {
    if (!L || !mapRef.current || !layerRef.current) return;
    const key = JSON.stringify({ routes, markers });
    if (drawnKeyRef.current === key) return;
    drawnKeyRef.current = key;

    layerRef.current.clearLayers();
    const bounds: [number, number][] = [];

    for (const r of routes ?? []) {
      if (r.points.length === 0) continue;
      const latlngs = r.points.map((p) => [p.lat, p.lng] as [number, number]);
      L.polyline(latlngs, { color: r.color ?? "#6366f1", weight: 4, opacity: 0.85 }).addTo(layerRef.current!);
      const first = latlngs[0];
      const last = latlngs[latlngs.length - 1];
      L.circleMarker(first, { radius: 7, color: "#10b981", fillColor: "#10b981", fillOpacity: 1 }).addTo(layerRef.current!);
      L.circleMarker(last, { radius: 7, color: "#ef4444", fillColor: "#ef4444", fillOpacity: 1 }).addTo(layerRef.current!);
      // divIcon instead of the default marker image — no asset 404s, works offline.
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:18px;height:18px;border-radius:50%;background:#6366f1;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4)"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      L.marker(last, { icon }).bindPopup(`<b>${r.label}</b>`).addTo(layerRef.current!);
      bounds.push(...latlngs);
    }

    for (const m of markers ?? []) {
      L.circleMarker([m.point.lat, m.point.lng], {
        radius: 8,
        color: "#6366f1",
        fillColor: "#6366f1",
        fillOpacity: 0.9,
      })
        .bindPopup(`<b>${m.label}</b>${m.point.at ? `<br/>${new Date(m.point.at).toLocaleTimeString()}` : ""}`)
        .addTo(layerRef.current!);
      bounds.push([m.point.lat, m.point.lng]);
    }

    if (bounds.length > 0) {
      mapRef.current.fitBounds(L.latLngBounds(bounds), { padding: [40, 40] });
    }
  }, [L, routes, markers]);

  return <div ref={containerRef} className="z-0 w-full overflow-hidden rounded-xl border border-edge" style={{ height }} />;
}

const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 };

/**
 * Google Maps version — same props as the Leaflet component.
 * Roadmap type, route polylines + markers, fit-bounds to content.
 */
function GoogleRouteMap({
  routes,
  markers,
  height = 420,
}: {
  routes?: RouteInput[];
  markers?: MarkerInput[];
  height?: number;
}) {
  const { isLoaded, loadError } = useGoogleMapsLoader();
  const [map, setMap] = useState<google.maps.Map | null>(null);

  const onLoad = useCallback((m: google.maps.Map) => setMap(m), []);
  const onUnmount = useCallback(() => setMap(null), []);

  // Fit bounds whenever content (or the map instance) changes.
  useEffect(() => {
    if (!map) return;
    const bounds = new google.maps.LatLngBounds();
    let hasContent = false;
    for (const r of routes ?? []) {
      for (const p of r.points) {
        bounds.extend({ lat: p.lat, lng: p.lng });
        hasContent = true;
      }
    }
    for (const m of markers ?? []) {
      bounds.extend({ lat: m.point.lat, lng: m.point.lng });
      hasContent = true;
    }
    if (hasContent) map.fitBounds(bounds, 40);
    else {
      map.setCenter(DEFAULT_CENTER);
      map.setZoom(5);
    }
  }, [map, routes, markers]);

  if (loadError) return <LeafletRouteMap routes={routes} markers={markers} height={height} />;
  if (!isLoaded || !GOOGLE_MAPS_API_KEY) return <GoogleMapsSkeleton height={height} />;

  return (
    <GoogleMap
      mapContainerStyle={{ height, width: "100%" }}
      mapContainerClassName="z-0 w-full overflow-hidden rounded-xl border border-edge"
      center={DEFAULT_CENTER}
      zoom={5}
      options={{ mapTypeId: "roadmap", streetViewControl: false, mapTypeControl: false }}
      onLoad={onLoad}
      onUnmount={onUnmount}
    >
      {(routes ?? []).map((r, i) =>
        r.points.length > 0 ? (
          <Polyline
            key={`${r.label}-${i}`}
            path={r.points.map((p) => ({ lat: p.lat, lng: p.lng }))}
            options={{
              strokeColor: r.color ?? "#6366f1",
              strokeWeight: 4,
              strokeOpacity: 0.85,
            }}
          />
        ) : null
      )}
      {/* Start (green-ish first point) / end markers per route, mirroring Leaflet. */}
      {(routes ?? []).flatMap((r, i) => {
        if (r.points.length === 0) return [];
        const first = r.points[0];
        const last = r.points[r.points.length - 1];
        return [
          <Marker
            key={`start-${r.label}-${i}`}
            position={{ lat: first.lat, lng: first.lng }}
            title={`Start: ${r.label}`}
          />,
          <Marker
            key={`end-${r.label}-${i}`}
            position={{ lat: last.lat, lng: last.lng }}
            title={r.label}
          />,
        ];
      })}
      {(markers ?? []).map((m, i) => (
        <Marker
          key={`${m.label}-${i}`}
          position={{ lat: m.point.lat, lng: m.point.lng }}
          title={m.label}
        />
      ))}
    </GoogleMap>
  );
}

/**
 * Journey Tracker map — Google Maps when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is
 * set, otherwise the existing Leaflet implementation (OSM, offline-friendly).
 * Same props either way; no API changes. The key is read directly in this
 * client component so page.tsx doesn't need to pass anything.
 */
export function RouteMap({
  routes,
  markers,
  height = 420,
}: {
  routes?: RouteInput[];
  markers?: MarkerInput[];
  height?: number;
}) {
  if (!GOOGLE_MAPS_API_KEY) return <LeafletRouteMap routes={routes} markers={markers} height={height} />;
  return <GoogleRouteMap routes={routes} markers={markers} height={height} />;
}
